// Runs inside the sandbox with `node`: each HTTP upgrade to /spawn becomes one process, its stdio framed
// on the upgraded socket (see frames.ts). RELAY_PORT and RELAY_TOKEN come from the environment; the
// sandbox gateway has no auth of its own, so every upgrade must carry the token.
'use strict';
const http = require('http');
const { spawn } = require('child_process');

const FRAME = { stdin: 0, stdout: 1, stderr: 2, exit: 3, kill: 4, stdinEnd: 5 };
const encode = (type, payload) => {
  const head = Buffer.alloc(5);
  head.writeUInt8(type, 0);
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
};
function reader() {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const out = [];
    while (buf.length >= 5) {
      const len = buf.readUInt32BE(1);
      if (buf.length < 5 + len) break;
      out.push({ type: buf.readUInt8(0), payload: buf.subarray(5, 5 + len) });
      buf = buf.subarray(5 + len);
    }
    return out;
  };
}

const TOKEN = process.env.RELAY_TOKEN;
const ACCEPT = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: x\r\n\r\n';

function runProcess(sock, spec) {
  sock.write(ACCEPT);
  const send = (type, payload) => sock.writable && sock.write(encode(type, payload));
  let child;
  try {
    child = spawn(spec.command, spec.args || [], { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: 'pipe' });
  } catch (e) {
    send(FRAME.stderr, Buffer.from(String(e.message) + '\n'));
    send(FRAME.exit, Buffer.from(JSON.stringify({ code: 127, signal: null })));
    return sock.end();
  }
  let done = false;
  child.stdout.on('data', (d) => send(FRAME.stdout, d));
  child.stderr.on('data', (d) => send(FRAME.stderr, d));
  child.stdin.on('error', () => {}); // a process that exits before reading its stdin
  child.on('error', (e) => send(FRAME.stderr, Buffer.from(String(e.message) + '\n')));
  child.on('close', (code, signal) => {
    done = true;
    send(FRAME.exit, Buffer.from(JSON.stringify({ code: signal ? null : code ?? 127, signal: signal || null })));
    sock.end();
  });
  const read = reader();
  sock.on('data', (chunk) => {
    for (const f of read(chunk)) {
      if (f.type === FRAME.stdin) child.stdin.write(f.payload);
      else if (f.type === FRAME.stdinEnd) child.stdin.end();
      else if (f.type === FRAME.kill) child.kill(f.payload.toString() || 'SIGTERM');
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => done || child.kill('SIGKILL')); // the host went away: its process must not live on
}

const server = http.createServer((req, res) => res.end('relay'));
server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://relay');
  if (url.searchParams.get('token') !== TOKEN) return sock.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  if (url.pathname === '/spawn') return runProcess(sock, JSON.parse(Buffer.from(url.searchParams.get('spec') || '', 'base64').toString()));
  sock.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
server.listen(Number(process.env.RELAY_PORT || 7000), '0.0.0.0');
