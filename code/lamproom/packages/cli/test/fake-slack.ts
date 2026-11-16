/**
 * A fake Slack for tests: the Web API methods Lamproom calls, on node:http, and a Socket Mode endpoint speaking just
 * enough RFC 6455 (handshake, text frames out unmasked, masked frames in, close, ping) for Node's own `WebSocket`.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

export interface Call { method: string; token: string; body: any }
export interface Conn { send(value: unknown): void; received: any[]; close(): void; closed: boolean }
type Reply = (body: any, n: number) => object;

/** Polls `fn` until it gives a truthy value; fails after `ms`. */
export async function until<T>(fn: () => T, ms = 5000, what = 'a condition'): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const frame = (opcode: number, payload: Buffer) => {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, payload]);
};

function accept(req: IncomingMessage, socket: Socket, conns: Conn[]) {
  const key = String(req.headers['sec-websocket-key']);
  const hash = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${hash}\r\n\r\n`);
  const conn: Conn = {
    received: [],
    closed: false,
    send: (v) => socket.write(frame(1, Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)))),
    close: () => {
      if (conn.closed) return;
      conn.closed = true;
      socket.end(frame(8, Buffer.from([0x03, 0xe8])));
    },
  };
  conns.push(conn);
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) (len = buf.readUInt16BE(2)), (at = 4);
      else if (len === 127) (len = Number(buf.readBigUInt64BE(2))), (at = 10);
      const masked = buf[1] & 0x80;
      const mask = masked ? buf.subarray(at, at + 4) : undefined;
      if (masked) at += 4;
      if (buf.length < at + len) return;
      const payload = Buffer.from(buf.subarray(at, at + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(at + len);
      if (opcode === 1) {
        try {
          conn.received.push(JSON.parse(payload.toString('utf8')));
        } catch {
          conn.received.push(payload.toString('utf8'));
        }
      } else if (opcode === 8) conn.close();
      else if (opcode === 9) socket.write(frame(10, payload));
    }
  });
  socket.on('close', () => (conn.closed = true));
  socket.on('error', () => (conn.closed = true));
}

export async function fakeSlack() {
  const calls: Call[] = [];
  const conns: Conn[] = [];
  let ts = 0;
  let port = 0;
  const reply: Record<string, Reply> = {
    'auth.test': () => ({ ok: true, team: 'Acme', team_id: 'T1', user: 'lamproom', user_id: 'U0' }),
    'apps.connections.open': () => ({ ok: true, url: `ws://127.0.0.1:${port}/socket` }),
    'chat.postMessage': () => ({ ok: true, channel: 'C1', ts: `1700000000.${String(++ts).padStart(6, '0')}` }),
    'chat.update': (b) => ({ ok: true, channel: b.channel, ts: b.ts }),
    'views.open': () => ({ ok: true }),
  };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const method = (req.url ?? '').replace(/^\/api\//, '').split('?')[0];
      let body: any = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = raw;
      }
      calls.push({ method, token: String(req.headers.authorization ?? '').replace(/^Bearer /, ''), body });
      const r = reply[method];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(r ? r(body, calls.filter((c) => c.method === method).length) : { ok: false, error: 'unknown_method' }));
    });
  });
  const sockets = new Set<Socket>();
  server.on('connection', (s) => (sockets.add(s), s.on('close', () => sockets.delete(s))));
  server.on('upgrade', (req, socket) => accept(req, socket as Socket, conns));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}/api`,
    calls,
    conns,
    reply,
    of: (method: string) => calls.filter((c) => c.method === method),
    close: () =>
      new Promise<void>((r) => {
        for (const c of conns) c.close();
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}
export type FakeSlack = Awaited<ReturnType<typeof fakeSlack>>;
