import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { encodeFrame, FrameReader } from '../src/exec/opensandbox/frames.ts';
import { relayExecHost } from '../src/exec/opensandbox/relay-host.ts';

const RELAY = fileURLToPath(new URL('../src/exec/opensandbox/relay.cjs', import.meta.url));
const TOKEN = 'test-token';
const PROFILE = { tier: 'container' as const, egressAllow: [] };
let relay: ChildProcess;
let url: string;

/** A port free on loopback now. */
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

before(async () => {
  const port = await freePort();
  relay = spawn(process.execPath, [RELAY], { env: { ...process.env, RELAY_PORT: String(port), RELAY_TOKEN: TOKEN }, stdio: 'ignore' });
  url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('relay did not start');
});
after(() => relay.kill());

const host = (token = TOKEN) => relayExecHost({ connect: async () => ({ url }), token, profile: PROFILE });
const read = (s: NodeJS.ReadableStream) => {
  const out = { text: '' };
  s.on('data', (d) => (out.text += d));
  return out;
};
const closed = (c: ChildProcessWithoutNullStreams) =>
  new Promise<{ code: number | null; signal: string | null; exit: [number | null, string | null] }>((resolve) => {
    let exit: [number | null, string | null] = [null, null];
    c.on('exit', (code, signal) => (exit = [code, signal]));
    c.on('close', (code, signal) => resolve({ code, signal, exit }));
  });
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test('frames round-trip across chunk boundaries', () => {
  const frames = [encodeFrame(1, Buffer.from('out')), encodeFrame(2, Buffer.alloc(0)), encodeFrame(3, Buffer.from('{"code":0}'))];
  const bytes = Buffer.concat(frames);
  const reader = new FrameReader();
  const got = [];
  for (const b of bytes) got.push(...reader.push(Buffer.from([b])));
  assert.deepEqual(got.map((f) => [f.type, f.payload.toString()]), [[1, 'out'], [2, ''], [3, '{"code":0}']]);
});

test('stdin reaches the process and stdout comes back live', async () => {
  // node, not `cat -n`: macOS's cat holds its output back when it writes to a pipe.
  const echo = "let n = 0; process.stdin.on('data', (d) => process.stdout.write(`${++n}\\t${d}`))";
  const c = host().spawn(process.execPath, ['-e', echo], { cwd: '/' });
  const out = read(c.stdout);
  c.stdin.write('first\n');
  await until(() => out.text.includes('first'));
  assert.equal(out.text.trim(), '1\tfirst');
  c.stdin.write('second\n');
  await until(() => out.text.includes('second'));
  c.stdin.end();
  await closed(c);
});

test('stderr and the exit code arrive separately', async () => {
  const c = host().spawn('sh', ['-c', 'echo out; echo err >&2; exit 3'], { cwd: '/' });
  const out = read(c.stdout);
  const err = read(c.stderr);
  const end = await closed(c);
  assert.equal(out.text.trim(), 'out');
  assert.equal(err.text.trim(), 'err');
  assert.deepEqual(end.exit, [3, null]);
  assert.deepEqual([end.code, end.signal], [3, null]);
  assert.equal(c.exitCode, 3);
});

test('kill() ends the remote process with its signal', async () => {
  const marker = `${30 + Math.floor(Math.random() * 1000) / 1000}`;
  const c = host().spawn('sleep', [marker], { cwd: '/' });
  await until(() => spawnSync('pgrep', ['-f', `sleep ${marker}`]).status === 0);
  const ended = closed(c);
  c.kill('SIGTERM');
  const end = await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no exit in 2 s')), 2000))]);
  assert.deepEqual(end.exit, [null, 'SIGTERM']);
  assert.notEqual(spawnSync('pgrep', ['-f', `sleep ${marker}`]).status, 0, 'the remote sleep is still running');
});

test('two children at once keep their streams apart', async () => {
  const loop = (l: string) => `for i in 1 2 3; do echo ${l}$i; sleep 0.1; done`;
  const a = host().spawn('sh', ['-c', loop('A')], { cwd: '/' });
  const b = host().spawn('sh', ['-c', loop('B')], { cwd: '/' });
  const [oa, ob] = [read(a.stdout), read(b.stdout)];
  await Promise.all([closed(a), closed(b)]);
  assert.deepEqual(oa.text.trim().split('\n'), ['A1', 'A2', 'A3']);
  assert.deepEqual(ob.text.trim().split('\n'), ['B1', 'B2', 'B3']);
});

test('a wrong token is refused', async () => {
  const c = host('wrong').spawn('true', [], { cwd: '/' });
  const e = await new Promise<Error>((resolve) => c.on('error', resolve));
  assert.match(e.message, /403/);
});

test('stdin end closes the process stdin', async () => {
  const c = host().spawn('wc', ['-l'], { cwd: '/' });
  const out = read(c.stdout);
  c.stdin.write('a\nb\n');
  c.stdin.end();
  await closed(c);
  assert.equal(out.text.trim(), '2');
});

// Task 2: the reverse tunnel. The relay runs on this machine here, so "the box's" socket is a local path.
import { mkdtempSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { startBroker } from '../../cli/src/ask/broker.ts';
import { askBroker } from '../../ask-user/src/broker-client.ts';

const quiet = { onQuestion() {}, onAnswer() {}, onWithdrawn() {}, onDone() {}, onInterrupt() {} };
/** Short and real: a Unix socket path is limited to about 104 characters, and /tmp is a link on macOS. */
const sockDir = () => realpathSync(mkdtempSync('/tmp/fb-t-'));
const q = { id: 'a', prompt: 'a?', kind: 'text' as const };

async function tunnelled() {
  const dir = sockDir();
  const hostSock = join(dir, 'host.sock');
  const boxSock = join(dir, 'box', 'ask.sock');
  let n = 0;
  const broker = await startBroker(hostSock, async () => ({ a: `yes ${++n}` }), quiet);
  const tunnel = await host().tunnel!(boxSock, hostSock);
  return { boxSock, broker, tunnel };
}

test('a shim connection in the box reaches the host broker', async () => {
  const { boxSock, broker, tunnel } = await tunnelled();
  try {
    assert.deepEqual(await askBroker(boxSock, { questions: [q] }), { answers: { a: 'yes 1' } });
  } finally {
    tunnel.close();
    await broker.close();
  }
});

test('three requests in a row each get their answer', async () => {
  const { boxSock, broker, tunnel } = await tunnelled();
  try {
    const got = [];
    for (let i = 0; i < 3; i++) got.push(await askBroker(boxSock, { questions: [q] }));
    assert.deepEqual(got, [{ answers: { a: 'yes 1' } }, { answers: { a: 'yes 2' } }, { answers: { a: 'yes 3' } }]);
  } finally {
    tunnel.close();
    await broker.close();
  }
});

test('close() stops listening', async () => {
  const { boxSock, broker, tunnel } = await tunnelled();
  tunnel.close();
  await new Promise((r) => setTimeout(r, 200));
  try {
    await assert.rejects(askBroker(boxSock, { questions: [q] }), /cannot reach the question broker/);
  } finally {
    await broker.close();
  }
});

test('a process whose host hangs up is killed in the box', async () => {
  const marker = `${40 + Math.floor(Math.random() * 1000) / 1000}`;
  const c = host().spawn('sleep', [marker], { cwd: '/' });
  c.on('error', () => {});
  await until(() => spawnSync('pgrep', ['-f', `sleep ${marker}`]).status === 0);
  (c as unknown as { sock: { destroy(): void } }).sock.destroy(); // the host side vanishes, as when run-flow dies
  await until(() => spawnSync('pgrep', ['-f', `sleep ${marker}`]).status !== 0);
});

// Fix pass (final review).
const marker = (base: number) => `${base + Math.floor(Math.random() * 1000) / 1000}`;
const running = (m: string) => spawnSync('pgrep', ['-f', `sleep ${m}`]).status === 0;

test('stopping a process stops what it started, and the stop does not wait for them', async () => {
  const m = marker(50);
  const c = host().spawn('sh', ['-c', `sleep ${m} & sleep ${m}`], { cwd: '/' });
  await until(() => running(m));
  const ended = closed(c);
  c.kill('SIGTERM');
  await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no exit in 3 s')), 3000))]);
  await until(() => !running(m));
});

test('a host that hangs up takes the whole process group with it', async () => {
  const m = marker(60);
  const c = host().spawn('sh', ['-c', `sleep ${m} & sleep ${m}`], { cwd: '/' });
  c.on('error', () => {});
  await until(() => running(m));
  (c as unknown as { sock: { destroy(): void } }).sock.destroy();
  await until(() => !running(m));
});

test('a long command line starts: the spec does not travel in the URL', async () => {
  const big = 'x'.repeat(100_000);
  const c = host().spawn(process.execPath, ['-e', 'console.log(process.argv[1].length)', big], { cwd: '/' });
  const out = read(c.stdout);
  const end = await closed(c);
  assert.equal(end.code, 0);
  assert.equal(out.text.trim(), '100000');
});

test('a relayed child has no pid on this machine', async () => {
  const c = host().spawn('true', [], { cwd: '/' });
  assert.equal(c.pid, undefined);
  await closed(c);
});
