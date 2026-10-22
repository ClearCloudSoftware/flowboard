import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedEvent, RunSpec } from '@flowboard/core';
import { OpencodeProvider } from '../src/agent/opencode/provider.ts';
import { startServer } from '../src/agent/opencode/server.ts';
import { hostExecHost } from '../src/exec/host.ts';

/** Temp folders made by this file's tests, removed once they are done. */
const temps: string[] = [];
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir(prefix: string) {
  const dir = mkdtempSync(prefix);
  temps.push(dir);
  return dir;
}

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FAKE = fixture('fake-opencode.mjs');

type Logged = { env?: Record<string, string | undefined>; method?: string; path?: string; body?: any };

/** A fake server scripted with `script`; `requests()` reads what it saw. */
function setup(script: object[], extraEnv: Record<string, string> = {}) {
  const dir = tempDir(join(tmpdir(), 'fbtest-'));
  writeFileSync(join(dir, 'script.json'), JSON.stringify(script));
  const log = join(dir, 'log.jsonl');
  writeFileSync(log, '');
  const env = { ...process.env, FAKE_OPENCODE_SCRIPT: join(dir, 'script.json'), FAKE_OPENCODE_LOG: log, ...extraEnv };
  const lines = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Logged);
  const spec: RunSpec = { prompt: { preamble: 'say hi', inputs: [], outputs: [], closing: 'stop' }, model: 'default', cwd: dir };
  return {
    spec,
    env,
    provider: (opencodePath = FAKE) => new OpencodeProvider({ models: { default: 'fake/m1' }, opencodePath, env }),
    requests: () => lines().filter((l) => l.method),
    envLine: () => lines().find((l) => l.env)!.env!,
    serverPid: () => (lines().find((l) => l.env) as { pid?: number } | undefined)?.pid,
  };
}

const userMsg = { type: 'message.updated', properties: { sessionID: '$SESSION', info: { id: 'm0', sessionID: '$SESSION', role: 'user' } } };
const userText = {
  type: 'message.part.updated',
  properties: { sessionID: '$SESSION', part: { id: 'p0', sessionID: '$SESSION', messageID: 'm0', type: 'text', text: 'say hi', time: { start: 1, end: 2 } } },
};
const text = {
  type: 'message.part.updated',
  properties: { sessionID: '$SESSION', part: { id: 'p1', sessionID: '$SESSION', messageID: 'm1', type: 'text', text: 'hi', time: { start: 1, end: 2 } } },
};
const step = (cost: number, id = 'sf1', reason = 'stop') => ({
  type: 'message.part.updated',
  properties: {
    sessionID: '$SESSION',
    part: { id, sessionID: '$SESSION', messageID: 'm1', type: 'step-finish', reason, cost, tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
  },
});
const idle = { type: 'session.idle', properties: { sessionID: '$SESSION' } };
const asked = (id: string, sessionID: string, permission: string) => ({
  type: 'permission.asked',
  properties: { id, sessionID, permission, patterns: ['*'], metadata: {}, always: [] },
});

async function drain(events: AsyncIterable<NormalizedEvent>) {
  const out: NormalizedEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

test('runs a scripted session end to end', async () => {
  const { spec, provider, requests } = setup([userMsg, userText, text, step(0.01), idle]);
  const run = provider().launch(spec);
  const events = await drain(run.events);
  assert.deepEqual(
    events.map((e) => e.type),
    ['system', 'assistant_text', 'usage', 'result'],
  );
  assert.equal(await run.sessionId, 'ses_fake1');
  assert.ok((await run.pid) > 0);
  const res = await run.result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.error, undefined);
  assert.equal(res.usage.costUsd, 0.01);
  const reqs = requests();
  assert.ok(Array.isArray(reqs.find((r) => r.method === 'POST' && r.path === '/session')!.body.permission));
  const prompt = reqs.find((r) => r.path === '/session/ses_fake1/prompt_async')!.body;
  assert.deepEqual(prompt.model, { providerID: 'fake', modelID: 'm1' });
  assert.equal(prompt.agent, 'build');
});

test('passes effort as a variant the model has', async () => {
  const { spec, provider, requests } = setup([idle]);
  await provider().launch({ ...spec, effort: 'high' }).result;
  assert.equal(requests().find((r) => r.path === '/session/ses_fake1/prompt_async')!.body.variant, 'high');
});

test('answers permission requests per mode', async () => {
  const child = { type: 'session.created', properties: { sessionID: 'ses_child', info: { id: 'ses_child', parentID: '$SESSION' } } };
  const script = [child, asked('per_1', '$SESSION', 'bash'), asked('per_2', 'ses_child', 'edit'), idle];

  const strict = setup(script);
  assert.equal((await strict.provider().launch(strict.spec).result).error, undefined);
  const rejected = strict.requests().filter((r) => r.path?.startsWith('/permission/'));
  assert.deepEqual(
    rejected.map((r) => [r.path, r.body]),
    [
      ['/permission/per_1/reply', { reply: 'reject', message: 'Not permitted in this headless run.' }],
      ['/permission/per_2/reply', { reply: 'reject', message: 'Not permitted in this headless run.' }],
    ],
  );

  const bypass = setup(script);
  await bypass.provider().launch({ ...bypass.spec, permissionMode: 'bypassPermissions' }).result;
  assert.deepEqual(
    bypass.requests().filter((r) => r.path?.startsWith('/permission/')).map((r) => r.body),
    [{ reply: 'once' }, { reply: 'once' }],
  );
});

test('resume with fork forks and re-applies permissions', async () => {
  const { spec, provider, requests } = setup([idle]);
  const run = provider().launch({ ...spec, resume: { sessionId: 'ses_old', fork: true } });
  assert.equal(await run.sessionId, 'ses_fork1');
  await run.result;
  const reqs = requests();
  assert.ok(reqs.some((r) => r.method === 'POST' && r.path === '/session/ses_old/fork'));
  assert.ok(Array.isArray(reqs.find((r) => r.method === 'PATCH' && r.path === '/session/ses_fork1')!.body.permission));
  assert.ok(!reqs.some((r) => r.method === 'POST' && r.path === '/session'));
});

test('budget cap aborts the session', async () => {
  const { spec, provider, requests } = setup([step(0.5, 'a'), step(0.5, 'b'), { hold: true }]);
  const res = await provider().launch({ ...spec, limits: { maxBudgetUsd: 0.6 } }).result;
  assert.equal(res.error, 'max_budget: spent $1.00 of $0.60');
  assert.ok(requests().some((r) => r.path === '/session/ses_fake1/abort'));
});

test('reaching the step limit fails the run', async () => {
  // The agent still wanted tools after step 1; OpenCode made step 2 its last.
  const { spec, provider } = setup([step(0.01, 'a', 'tool-calls'), step(0.01, 'b'), idle]);
  const run = provider().launch({ ...spec, limits: { maxTurns: 2 } });
  const events = await drain(run.events);
  const res = await run.result;
  assert.equal(res.error, 'max_turns: reached the limit of 2 steps');
  assert.equal(res.exitCode, 1);
  const types = events.map((e) => e.type);
  assert.ok(types.indexOf('error') < types.indexOf('result'), 'error comes before the result');
});

test('a run that ends under the step limit succeeds', async () => {
  const { spec, provider } = setup([step(0.01, 'a'), idle]);
  const res = await provider().launch({ ...spec, limits: { maxTurns: 2 } }).result;
  assert.equal(res.error, undefined);
  assert.equal(res.exitCode, 0);
});

test('a run that finishes on exactly its last step succeeds', async () => {
  const { spec, provider } = setup([step(0.01, 'a'), idle]);
  const res = await provider().launch({ ...spec, limits: { maxTurns: 1 } }).result;
  assert.equal(res.error, undefined);
});

test('subagent steps do not count toward the step limit', async () => {
  const child = { type: 'session.created', properties: { sessionID: 'ses_child', info: { id: 'ses_child', parentID: '$SESSION' } } };
  const childStep = (id: string) => {
    const s = step(0.01, id);
    return { ...s, properties: { sessionID: 'ses_child', part: { ...s.properties.part, sessionID: 'ses_child' } } };
  };
  const { spec, provider } = setup([child, childStep('c1'), childStep('c2'), step(0.01, 'a', 'tool-calls'), idle]);
  const res = await provider().launch({ ...spec, limits: { maxTurns: 2 } }).result;
  assert.equal(res.error, undefined);
});

test('stop() aborts the session and settles as stopped', { timeout: 10_000 }, async () => {
  const { spec, provider, requests } = setup([{ hold: true }]);
  const run = provider().launch(spec);
  await run.sessionId;
  run.stop();
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.error, 'stopped');
  assert.ok(requests().some((r) => r.path === '/session/ses_fake1/abort'));
});

test('a stopped run keeps the usage reported so far', { timeout: 10_000 }, async () => {
  const { spec, provider } = setup([step(0.25, 'a'), { hold: true }]);
  const run = provider().launch(spec);
  for await (const ev of run.events) if (ev.type === 'usage') run.stop();
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.usage.costUsd, 0.25);
  assert.equal(res.usage.input, 10);
});

test('isolates the server from personal config', async () => {
  const { spec, provider, envLine } = setup([idle]);
  await provider().launch({ ...spec, guards: { writeRoots: [spec.cwd] } }).result;
  const env = envLine();
  assert.ok(env.XDG_CONFIG_HOME!.startsWith(join(tmpdir(), 'fb-oc-')));
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  assert.equal(env.OPENCODE_DISABLE_CLAUDE_CODE, '1');
  assert.ok(env.FLOWBOARD_GUARDS);
  assert.match(JSON.parse(env.OPENCODE_CONFIG_CONTENT!).plugin[0], /guard-plugin\.ts$/);
  assert.equal(existsSync(env.XDG_CONFIG_HOME!), false);
});

test('two concurrent runs get separate servers', async () => {
  const a = setup([text, idle]);
  const b = setup([text, idle]);
  const [ra, rb] = [a.provider().launch(a.spec), b.provider().launch(b.spec)];
  const [resA, resB] = await Promise.all([ra.result, rb.result]);
  assert.equal(resA.exitCode, 0);
  assert.equal(resB.exitCode, 0);
  assert.notEqual(await ra.pid, await rb.pid);
  assert.notEqual(a.envLine().XDG_CONFIG_HOME, b.envLine().XDG_CONFIG_HOME);
});

test('cleans up the config dir on failure', async () => {
  const ours = () => new Set(readdirSync(tmpdir()).filter((d) => d.startsWith('fb-oc-')));
  const before = ours();

  const crash = setup([]);
  const res = await crash.provider(fixture('fake-opencode-crash.sh')).launch(crash.spec).result;
  assert.equal(res.exitCode, 2);
  assert.match(res.error ?? '', /bad config/);

  const unknown = setup([]);
  const res2 = await unknown.provider().launch({ ...unknown.spec, model: 'unknown-model' }).result;
  assert.equal(res2.error, "no OpenCode model for logical id 'unknown-model'");

  assert.deepEqual([...ours()].filter((d) => !before.has(d)), []);
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('stop() before the server is up still kills it', { timeout: 10_000 }, async () => {
  const { spec, provider, serverPid } = setup([idle]);
  const run = provider().launch(spec);
  run.stop();
  const res = await run.result;
  assert.equal(res.error, 'stopped');
  const pid = serverPid();
  if (pid) assert.equal(alive(pid), false);
});

test('a forked session does not replay its history', async () => {
  const { spec, provider } = setup([text, step(0.01), idle]);
  const run = provider().launch({ ...spec, resume: { sessionId: 'ses_old', fork: true } });
  const events = await drain(run.events);
  assert.ok(!events.some((e) => e.type === 'assistant_text' && e.text === 'old reply'));
  assert.equal((await run.result).usage.costUsd, 0.01);
});

test('a reply to an already-settled permission request does not fail the run', async () => {
  const { spec, provider } = setup([asked('per_1', '$SESSION', 'edit'), asked('gone_2', '$SESSION', 'edit'), idle]);
  const res = await provider().launch(spec).result;
  assert.equal(res.error, undefined);
  assert.equal(res.exitCode, 0);
});

test('fails when the guard plugin does not load', async () => {
  const { spec, provider, requests } = setup([idle], { FAKE_SKIP_PLUGIN: '1' });
  const res = await provider().launch({ ...spec, guards: { writeRoots: [spec.cwd] } }).result;
  assert.equal(res.error, 'guard plugin not loaded');
  assert.ok(!requests().some((r) => r.path?.endsWith('/prompt_async')));
});

test('a server error after start-up does not throw', async () => {
  const { spec, env } = setup([]);
  const server = await startServer(hostExecHost, { opencodePath: FAKE, cwd: spec.cwd, env });
  try {
    assert.doesNotThrow(() => server.child.emit('error', new Error('late')));
    assert.match(server.stderrTail(), /late/);
  } finally {
    server.child.kill('SIGKILL');
  }
});

test('a server that ignores SIGTERM is killed after the grace period', { timeout: 5_000 }, async () => {
  const { spec, env, serverPid } = setup([step(0.01), idle], { FAKE_IGNORE_TERM: '1' });
  const provider = new OpencodeProvider({ models: { default: 'fake/m1' }, opencodePath: FAKE, env, killGraceMs: 200 });
  const res = await provider.launch(spec).result;
  assert.equal(res.exitCode, 0);
  assert.throws(() => process.kill(serverPid()!, 0), 'the server is gone');
});

test('a server that exits on SIGTERM is not sent SIGKILL', async () => {
  const { spec, env } = setup([step(0.01), idle]);
  // A short grace, so a stray SIGKILL would land inside the wait below.
  const provider = () => new OpencodeProvider({ models: { default: 'fake/m1' }, opencodePath: FAKE, env, killGraceMs: 100 });
  const kills: (NodeJS.Signals | number | undefined)[] = [];
  const exec = {
    ...hostExecHost,
    spawn: (...a: Parameters<typeof hostExecHost.spawn>) => {
      const child = hostExecHost.spawn(...a);
      const kill = child.kill.bind(child);
      child.kill = (sig) => (kills.push(sig), kill(sig));
      return child;
    },
  };
  await provider().launch({ ...spec, exec }).result;
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(kills, ['SIGTERM']);
});
