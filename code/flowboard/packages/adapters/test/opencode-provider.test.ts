import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedEvent, RunSpec } from '@flowboard/core';
import { OpencodeProvider } from '../src/agent/opencode/provider.ts';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FAKE = fixture('fake-opencode.mjs');

type Logged = { env?: Record<string, string | undefined>; method?: string; path?: string; body?: any };

/** A fake server scripted with `script`; `requests()` reads what it saw. */
function setup(script: object[]) {
  const dir = mkdtempSync(join(tmpdir(), 'fbtest-'));
  writeFileSync(join(dir, 'script.json'), JSON.stringify(script));
  const log = join(dir, 'log.jsonl');
  writeFileSync(log, '');
  const env = { ...process.env, FAKE_OPENCODE_SCRIPT: join(dir, 'script.json'), FAKE_OPENCODE_LOG: log };
  const lines = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Logged);
  const spec: RunSpec = { prompt: { preamble: 'say hi', inputs: [], outputs: [], closing: 'stop' }, model: 'default', cwd: dir };
  return {
    spec,
    provider: (opencodePath = FAKE) => new OpencodeProvider({ models: { default: 'fake/m1' }, opencodePath, env }),
    requests: () => lines().filter((l) => l.method),
    envLine: () => lines().find((l) => l.env)!.env!,
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
const step = (cost: number, id = 'sf1') => ({
  type: 'message.part.updated',
  properties: {
    sessionID: '$SESSION',
    part: { id, sessionID: '$SESSION', messageID: 'm1', type: 'step-finish', reason: 'stop', cost, tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } },
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
