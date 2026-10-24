import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ExecHost } from '@flowboard/core';
import { terminate } from '../../exec/terminate.ts';

export interface StartedServer {
  url: string;
  /** The port it listens on, inside its box. */
  port: number;
  child: ChildProcessWithoutNullStreams;
  stderrTail: () => string;
}

/** A failure to start, carrying the server's exit code when it died. */
export class ServerStartError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Spawn `opencode serve` on loopback and resolve once it prints its URL. */
export function startServer(
  exec: ExecHost,
  opts: { opencodePath: string; cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number; killGraceMs?: number; port?: number },
): Promise<StartedServer> {
  const { timeoutMs = 30_000 } = opts;
  // In a sandbox the server must listen on every interface of its own box, on a port this machine can reach.
  const port = exec.id === 'host' ? 0 : (opts.port ?? 0);
  const hostname = exec.id === 'host' ? '127.0.0.1' : '0.0.0.0';
  // A box reached through exec.endpoint publishes nothing: its gateway reaches the port.
  const publish = port && !exec.endpoint ? { ports: [port] } : {};
  const child = exec.spawn(opts.opencodePath, ['serve', '--hostname', hostname, '--port', String(port)], { cwd: opts.cwd, env: opts.env, ...publish });
  let tail = '';
  child.stderr.on('data', (d) => (tail = (tail + d).slice(-4000)));

  return new Promise((resolve, reject) => {
    let out = '';
    const done = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('close', onClose);
      child.off('error', onError);
      child.stdout.resume(); // keep draining the pipe after the URL line
    };
    const onData = (d: Buffer) => {
      out += d;
      const m = /opencode server listening on (http:\/\/\S+)/.exec(out);
      if (m) {
        done();
        // Keep an error listener for the server's whole life: an unhandled 'error' (say, a failed kill) would throw.
        child.on('error', (e) => (tail = `${tail}\n${e.message}`.slice(-4000)));
        const url = m[1].replace('//0.0.0.0:', '//127.0.0.1:');
        resolve({ url, port: Number(new URL(url).port), child, stderrTail: () => tail });
      }
    };
    // 'close', not 'exit': stderr is fully read by then.
    const onClose = (code: number | null) => {
      done();
      reject(new ServerStartError(`opencode server exited with code ${code}: ${tail.trim()}`, code ?? 1));
    };
    const onError = (e: Error) => {
      done();
      reject(new ServerStartError(`opencode server failed to start: ${e.message}`, 127));
    };
    const timer = setTimeout(() => {
      done();
      terminate(child, opts.killGraceMs);
      reject(new ServerStartError(`opencode server did not start within ${timeoutMs} ms`, 1));
    }, timeoutMs);
    child.stdout.on('data', onData);
    child.once('close', onClose);
    child.once('error', onError);
  });
}
