// Runs inside the sandbox with `node`: each HTTP upgrade to /spawn becomes one process, its stdio framed
// on the upgraded socket (see frames.ts); its first frame is the spec. RELAY_PORT and RELAY_TOKEN come from the
// environment; the sandbox gateway has no auth of its own, so every upgrade carries the token (x-relay-token).
'use strict';
const http = require('http');
const { spawn } = require('child_process');

const FRAME = { stdin: 0, stdout: 1, stderr: 2, exit: 3, kill: 4, stdinEnd: 5, spec: 6 };
/** How long output may still arrive after the process exits; what it left running is then stopped. */
const DRAIN_MS = 200;
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

function runProcess(sock) {
  sock.write(ACCEPT);
  const send = (type, payload) => sock.writable && sock.write(encode(type, payload));
  let child;
  let done = false;
  const early = []; // frames that came before the process started
  /** The process and everything it started: it leads its own group. */
  const group = (sig) => {
    try {
      process.kill(-child.pid, sig);
    } catch {
      // the group has gone
    }
  };
  const handle = (f) => {
    if (!child) return early.push(f);
    if (f.type === FRAME.stdin) child.stdin.write(f.payload);
    else if (f.type === FRAME.stdinEnd) child.stdin.end();
    else if (f.type === FRAME.kill) group(f.payload.toString() || 'SIGTERM');
  };
  const start = (spec) => {
    try {
      child = spawn(spec.command, spec.args || [], { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: 'pipe', detached: true });
    } catch (e) {
      send(FRAME.stderr, Buffer.from(String(e.message) + '\n'));
      send(FRAME.exit, Buffer.from(JSON.stringify({ code: 127, signal: null })));
      done = true;
      return sock.end();
    }
    child.stdout.on('data', (d) => send(FRAME.stdout, d));
    child.stderr.on('data', (d) => send(FRAME.stderr, d));
    child.stdin.on('error', () => {}); // a process that exits before reading its stdin
    child.on('error', (e) => {
      send(FRAME.stderr, Buffer.from(String(e.message) + '\n'));
      if (!child.pid) finish(127, null);
    });
    // Over when the process exits, not when its pipes close: what it started in the background may hold them.
    child.on('exit', (code, signal) => setTimeout(() => finish(signal ? null : code ?? 127, signal || null), DRAIN_MS));
    for (const f of early.splice(0)) handle(f);
  };
  const finish = (code, signal) => {
    if (done) return;
    done = true;
    if (child && child.pid) group('SIGKILL'); // its leftovers
    send(FRAME.exit, Buffer.from(JSON.stringify({ code, signal })));
    sock.end();
  };
  const read = reader();
  sock.on('data', (chunk) => {
    for (const f of read(chunk)) {
      if (f.type === FRAME.spec && !child && !done) start(JSON.parse(f.payload.toString()));
      else handle(f);
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => done || (child && child.pid && group('SIGKILL'))); // the host went away: nothing it started lives on
}

// /listen: a Unix socket in the box whose connections the host takes, one per waiting upgrade (ask_user's
// shim cannot dial out of the box). Raw bytes, no frames. The listener goes when the host stops waiting.
const listeners = new Map(); // path -> { server, waiting: socket[], queued: socket[] }
function pair(l) {
  while (l.waiting.length && l.queued.length) {
    const host = l.waiting.shift();
    const shim = l.queued.shift();
    host.removeAllListeners('close');
    host.pipe(shim).pipe(host);
    host.on('close', () => shim.destroy());
    shim.on('close', () => host.destroy());
  }
}
function listen(sock, path) {
  sock.on('error', () => {});
  sock.resume(); // a paused socket never sees the host hang up; the host sends nothing before it is paired
  let l = listeners.get(path);
  if (!l) {
    require('fs').mkdirSync(require('path').dirname(path), { recursive: true });
    try { require('fs').unlinkSync(path); } catch {}
    l = { waiting: [], queued: [] };
    l.server = require('net').createServer((shim) => {
      shim.on('error', () => {});
      shim.pause();
      l.queued.push(shim);
      pair(l);
      shim.resume();
    });
    l.ready = new Promise((resolve) => l.server.listen(path, resolve));
    listeners.set(path, l);
  }
  const entry = l;
  // Accepted only once the socket listens: the host may hand its path to a shim right away.
  entry.ready.then(() => sock.write(ACCEPT));
  entry.waiting.push(sock);
  sock.on('close', () => {
    entry.waiting = entry.waiting.filter((s) => s !== sock);
    if (!entry.waiting.length && listeners.get(path) === entry) {
      listeners.delete(path);
      entry.server.close();
      for (const q of entry.queued) q.destroy();
    }
  });
  pair(entry);
}

const server = http.createServer((req, res) => res.end('relay'));
server.on('upgrade', (req, sock) => {
  // HTTP server sockets are half-open: the host hanging up arrives only as 'end', never as 'close'.
  sock.on('end', () => sock.destroy());
  const url = new URL(req.url, 'http://relay');
  if (req.headers['x-relay-token'] !== TOKEN) return sock.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  if (url.pathname === '/listen') return listen(sock, url.searchParams.get('path'));
  if (url.pathname === '/spawn') return runProcess(sock);
  sock.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
server.listen(Number(process.env.RELAY_PORT || 7000), '0.0.0.0');
