import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import type { ExecHost, SandboxProfile } from '@flowboard/core';
import { encodeFrame, FRAME, FrameReader } from './frames.ts';

export interface RelayOptions {
  /** Where the relay is reached from this machine: the sandbox gateway's URL for its port, and headers it wants. */
  connect: () => Promise<{ url: string; headers?: Record<string, string> }>;
  token: string;
  profile: SandboxProfile;
  tmpDir?: string;
  mapPath?: (hostPath: string) => string;
  /** Names the sandbox in error messages. */
  name?: string;
  /** Awaited before each process starts: uploads what it must see. */
  beforeSpawn?: () => Promise<void>;
}

/** Headers the gateway passes an upgrade on (from the spike, t2-stdin.mjs). */
const UPGRADE = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' };

/** Opens one upgrade to the relay at `path` (with `query`); rejects with the HTTP status when it refuses. */
export async function upgrade(o: Pick<RelayOptions, 'connect' | 'token' | 'name'>, path: string, query: Record<string, string>): Promise<Socket> {
  const { url, headers } = await o.connect();
  const target = new URL(path.replace(/^\//, ''), url.endsWith('/') ? url : `${url}/`);
  for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
  return new Promise((resolve, reject) => {
    // The token in a header, not the URL, which gateways log.
    const req = request(target, { agent: false, headers: { ...headers, ...UPGRADE, 'x-relay-token': o.token } }); // never a kept-alive socket: each upgrade owns its connection
    req.on('upgrade', (_res, sock) => resolve(sock));
    req.on('response', (res) => {
      res.resume();
      reject(new Error(`the sandbox relay${o.name ? ` (${o.name})` : ''} refused: HTTP ${res.statusCode}`));
    });
    req.on('error', (e) => reject(new Error(`cannot reach the sandbox relay${o.name ? ` (${o.name})` : ''}: ${e.message}`)));
    req.end();
  });
}

/**
 * A process in the sandbox, shaped like a Node child process: providers and run-flow handle it unchanged.
 * Its stdio travels framed over one upgraded connection to the relay.
 */
class RelayChild extends EventEmitter {
  /** None on this machine: a host pid would name some other process here. */
  readonly pid: number | undefined = undefined;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin: Writable;
  private sock?: Socket;
  /** Frames written before the connection is up. */
  private pending: Buffer[] = [];
  private ended = false;

  private readonly name: string | undefined;

  constructor(start: Promise<Socket>, spec: Buffer, name?: string) {
    super();
    this.name = name;
    this.pending.push(encodeFrame(FRAME.spec, spec)); // first on the wire
    this.stdin = new Writable({
      write: (chunk: Buffer, _enc, cb) => this.send(encodeFrame(FRAME.stdin, chunk), cb),
      final: (cb) => this.send(encodeFrame(FRAME.stdinEnd, Buffer.alloc(0)), cb),
    });
    start.then(
      (sock) => this.attach(sock),
      (e: Error) => this.fail(e),
    );
  }

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    if (this.ended) return false;
    this.killed = true;
    this.send(encodeFrame(FRAME.kill, Buffer.from(String(signal))), () => {});
    return true;
  }

  private send(frame: Buffer, cb: (e?: Error | null) => void) {
    if (this.ended) return cb();
    if (this.sock) this.sock.write(frame, cb);
    else {
      this.pending.push(frame);
      cb();
    }
  }

  private attach(sock: Socket) {
    this.sock = sock;
    this.emit('spawn');
    for (const f of this.pending.splice(0)) sock.write(f);
    const reader = new FrameReader();
    sock.on('data', (chunk: Buffer) => {
      for (const f of reader.push(chunk)) {
        if (f.type === FRAME.stdout) this.stdout.write(f.payload);
        else if (f.type === FRAME.stderr) this.stderr.write(f.payload);
        else if (f.type === FRAME.exit) {
          const { code, signal } = JSON.parse(f.payload.toString()) as { code: number | null; signal: NodeJS.Signals | null };
          this.finish(code, signal);
        }
      }
    });
    sock.on('error', () => {}); // a dropped connection surfaces as 'close'
    sock.on('close', () => {
      if (!this.ended) this.fail(new Error(`the connection to the sandbox relay${this.name ? ` (${this.name})` : ''} closed before the process ended`));
    });
  }

  private fail(e: Error) {
    if (this.ended) return;
    this.emit('error', e);
    this.finish(null, 'SIGKILL');
  }

  private finish(code: number | null, signal: NodeJS.Signals | null) {
    if (this.ended) return;
    this.ended = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit('close', code, signal));
    this.sock?.end();
  }
}

/**
 * The `container` tier on a sandbox reached only through a relay (OpenSandbox): each spawn is one upgrade.
 * As with docker, only env the caller set on top of this process's env goes in, plus `profile.env`.
 */
export function relayExecHost(o: RelayOptions): ExecHost {
  return {
    id: 'container',
    profile: o.profile,
    ...(o.tmpDir && { tmpDir: o.tmpDir }),
    ...(o.mapPath && { mapPath: o.mapPath }),
    spawn(command, args, { cwd, env = process.env }) {
      const extra = { ...Object.fromEntries(Object.entries(env).filter(([k, v]) => process.env[k] !== v)), ...o.profile.env };
      const spec = Buffer.from(JSON.stringify({ command, args, cwd, env: extra }));
      const start = (async () => {
        await o.beforeSpawn?.();
        return upgrade(o, '/spawn', {});
      })();
      return new RelayChild(start, spec, o.name) as unknown as ChildProcessWithoutNullStreams;
    },
    async tunnel(boxSocket, hostSocket) {
      let closed = false;
      let waiting: Socket | undefined;
      // One upgrade always waits; the shim's first bytes pair it, and the next one opens.
      const wait = async (): Promise<void> => {
        if (closed) return;
        const sock = await upgrade(o, '/listen', { path: boxSocket });
        if (closed) return void sock.destroy();
        waiting = sock;
        sock.once('data', (first: Buffer) => {
          waiting = undefined;
          const local = createConnection(hostSocket);
          local.write(first);
          sock.pipe(local).pipe(sock);
          local.on('error', () => sock.destroy());
          local.on('close', () => sock.destroy());
          sock.on('close', () => local.destroy());
          wait().catch(() => {}); // the box is gone: the next shim connection fails inside it
        });
        sock.on('error', () => {});
      };
      await wait();
      return {
        close() {
          closed = true;
          waiting?.destroy();
        },
      };
    },
  };
}
