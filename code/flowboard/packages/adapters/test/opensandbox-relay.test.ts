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
