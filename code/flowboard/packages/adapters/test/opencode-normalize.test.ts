import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { NormalizedEvent, Usage } from '@flowboard/core';
import type { Event } from '@opencode-ai/sdk/v2';
import { createNormalizer } from '../src/agent/opencode/normalize.ts';

const ROOT = 'ses_root';
const ev = (type: string, properties: object) => ({ id: 'e', type, properties }) as unknown as Event;
const part = (p: object, sessionID = ROOT) => ev('message.part.updated', { sessionID, part: { sessionID, ...p }, time: 0 });
const strip = (events: NormalizedEvent[]) => events.map(({ raw: _raw, ...rest }) => rest);
const step = (sessionID: string) =>
  part(
    {
      id: `sf_${sessionID}`,
      messageID: 'm1',
      type: 'step-finish',
      reason: 'stop',
      cost: 0.01,
      tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 100, write: 7 } },
    },
    sessionID,
  );

test('normalizes the captured read run', () => {
  const lines = readFileSync(new URL('./fixtures/opencode-read.jsonl', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Event);
  const root = (lines.at(-1) as { properties: { sessionID: string } }).properties.sessionID;
  const events = lines.flatMap(createNormalizer(root));

  assert.ok(events.every((e) => e.raw));
  assert.equal(events.at(-1)!.type, 'result');
  assert.ok(events.some((e) => e.type === 'assistant_text' && /fixture-ok/.test(e.text)));
  assert.ok(events.some((e) => e.type === 'tool_use' && e.name === 'read'));
  assert.ok(events.some((e) => e.type === 'tool_result' && e.ok));
  assert.ok(!events.some((e) => e.type === 'assistant_text' && /Read hello\.txt/.test(e.text)));

  // Sum the capture's step-finish parts per the plan's Decisions table.
  const expected = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0, costUsd: 0 };
  for (const e of lines) {
    const p = (e as { properties: { part?: { type: string; cost: number; tokens: any } } }).properties.part;
    if (e.type !== 'message.part.updated' || p?.type !== 'step-finish') continue;
    expected.input += p.tokens.input;
    expected.output += p.tokens.output + p.tokens.reasoning;
    expected.cacheRead += p.tokens.cache.read;
    expected.cacheWrite += p.tokens.cache.write;
    expected.numTurns += 1;
    expected.costUsd += p.cost;
  }
  assert.deepEqual((events.at(-1) as { usage: Usage }).usage, expected);
});

test('skips user-message parts', () => {
  const norm = createNormalizer(ROOT);
  norm(ev('message.updated', { sessionID: ROOT, info: { id: 'm0', sessionID: ROOT, role: 'user' } }));
  assert.deepEqual(norm(part({ id: 'p0', messageID: 'm0', type: 'text', text: 'my prompt', time: { start: 1, end: 2 } })), []);
});

test('emits a text part once, when it ends', () => {
  const norm = createNormalizer(ROOT);
  const text = (t: string, end?: number) => part({ id: 'p1', messageID: 'm1', type: 'text', text: t, time: { start: 1, end } });
  assert.deepEqual(norm(text('hel')), []);
  assert.deepEqual(strip(norm(text('hello', 2))), [{ type: 'assistant_text', text: 'hello' }]);
  assert.deepEqual(norm(text('hello', 2)), []);
});

test('maps reasoning to thinking', () => {
  const out = createNormalizer(ROOT)(part({ id: 'r1', messageID: 'm1', type: 'reasoning', text: 'hmm', time: { start: 1, end: 2 } }));
  assert.deepEqual(strip(out), [{ type: 'thinking', text: 'hmm' }]);
});

test('maps tool parts to one tool_use and one tool_result', () => {
  const norm = createNormalizer(ROOT);
  const tool = (callID: string, state: object) => part({ id: `t_${callID}`, messageID: 'm1', type: 'tool', callID, tool: 'bash', state });
  const input = { command: 'pnpm test' };
  assert.deepEqual(norm(tool('c1', { status: 'pending', input: {}, raw: '' })), []);
  assert.deepEqual(strip(norm(tool('c1', { status: 'running', input, time: { start: 1 } }))), [
    { type: 'tool_use', name: 'bash', input, summary: 'bash: pnpm test' },
  ]);
  assert.deepEqual(norm(tool('c1', { status: 'running', input, time: { start: 1 } })), []);
  assert.deepEqual(strip(norm(tool('c1', { status: 'completed', input, output: 'ok', title: '', metadata: {}, time: { start: 1, end: 2 } }))), [
    { type: 'tool_result', ok: true, output: 'ok' },
  ]);
  assert.deepEqual(strip(norm(tool('c2', { status: 'error', input: {}, error: 'boom', time: { start: 1, end: 2 } }))), [
    { type: 'tool_use', name: 'bash', input: {}, summary: 'bash' },
    { type: 'tool_result', ok: false, output: 'boom' },
  ]);
});

test('sums step-finish usage across the root and child sessions', () => {
  const norm = createNormalizer(ROOT);
  norm(ev('session.created', { sessionID: 'ses_child', info: { id: 'ses_child', parentID: ROOT } }));
  norm(step(ROOT));
  const out = norm(step('ses_child'));
  assert.deepEqual(strip(out), [
    { type: 'usage', usage: { input: 20, output: 16, cacheRead: 200, cacheWrite: 14, numTurns: 2, costUsd: 0.02 } },
  ]);
});

test('ignores other sessions', () => {
  assert.deepEqual(createNormalizer(ROOT)(step('ses_other')), []);
});

test('reports assistant and session errors', () => {
  const norm = createNormalizer(ROOT);
  const failed = ev('message.updated', {
    sessionID: ROOT,
    info: { id: 'm1', sessionID: ROOT, role: 'assistant', error: { name: 'APIError', data: { message: '429' } } },
  });
  assert.deepEqual(strip(norm(failed)), [{ type: 'error', message: 'APIError: 429' }]);
  assert.deepEqual(norm(failed), []);
  const out = norm(ev('session.error', { sessionID: ROOT, error: { name: 'ProviderAuthError', data: { message: 'no key' } } }));
  assert.deepEqual(strip(out), [{ type: 'error', message: 'ProviderAuthError: no key' }]);
});

test('ends with result on root idle only', () => {
  const norm = createNormalizer(ROOT);
  norm(ev('session.created', { sessionID: 'ses_child', info: { id: 'ses_child', parentID: ROOT } }));
  assert.deepEqual(norm(ev('session.idle', { sessionID: 'ses_child' })), []);
  assert.deepEqual(strip(norm(ev('session.idle', { sessionID: ROOT }))), [
    { type: 'result', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0, costUsd: 0 } },
  ]);
});

test('a context overflow that OpenCode compacts is not a failure', () => {
  const out = createNormalizer(ROOT)(
    ev('session.error', { sessionID: ROOT, error: { name: 'ContextOverflowError', data: { message: 'too long' } } }),
  );
  assert.deepEqual(out, []);
});
