import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSpec, Usage } from '@flowboard/core';
import { ReplayProvider } from '../src/agent/replay/replay-provider.ts';

const spec: RunSpec = { prompt: { preamble: '', inputs: [], outputs: [], closing: '' }, model: 'default', cwd: '/tmp' };

test('replays a script', async () => {
  const usage: Usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, numTurns: 2, costUsd: 0.012 };
  const run = new ReplayProvider({
    events: [
      { type: 'system', sessionId: 'abc-123' },
      { type: 'assistant_text', text: 'hello' },
      { type: 'result', usage, outcome: 'pass' },
    ],
  }).launch(spec);

  const seen: string[] = [];
  for await (const ev of run.events) seen.push(ev.type);

  assert.deepEqual(seen, ['system', 'assistant_text', 'result']);
  assert.equal(await run.sessionId, 'abc-123');
  assert.equal(await run.pid, -1);
  const res = await run.result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.outcome, 'pass');
  assert.equal(res.usage.costUsd, 0.012);
});

test('stop() settles as stopped', async () => {
  const run = new ReplayProvider({
    events: [
      { type: 'system', sessionId: 's' },
      { type: 'assistant_text', text: 'a' },
    ],
  }).launch(spec);
  for await (const ev of run.events) {
    if (ev.type === 'system') run.stop();
  }
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.error, 'stopped');
});

test('a scripted error fails the run, as on a real provider', async () => {
  const run = new ReplayProvider({ events: [{ type: 'system', sessionId: 's' }, { type: 'error', message: 'boom' }] }).launch(spec);
  for await (const _ of run.events);
  const res = await run.result;
  assert.equal(res.exitCode, 1);
  assert.equal(res.error, 'boom');
});

test('sessionId rejects when the script has no session id', async () => {
  const run = new ReplayProvider({ events: [{ type: 'assistant_text', text: 'a' }] }).launch(spec);
  await assert.rejects(run.sessionId);
});

test('stop() keeps the usage reported so far', async () => {
  const usage: Usage = { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, numTurns: 1, costUsd: 0.002 };
  const run = new ReplayProvider({
    events: [{ type: 'system', sessionId: 's' }, { type: 'usage', usage }, { type: 'assistant_text', text: 'a' }],
  }).launch(spec);
  for await (const ev of run.events) if (ev.type === 'usage') run.stop();
  assert.deepEqual((await run.result).usage, usage);
});
