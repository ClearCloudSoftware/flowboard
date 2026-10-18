import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { NormalizedEvent, Usage } from '@flowboard/core';
import { createNormalizer } from '../src/agent/claude/normalize.ts';

const lines = readFileSync(new URL('./fixtures/claude-hello.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as SDKMessage);

const msg = (m: object) => m as SDKMessage;
const lastUsage = (events: NormalizedEvent[]) =>
  (events.filter((e) => e.type === 'usage').at(-1) as { usage: Usage }).usage;

test('normalizes the recorded hello stream', () => {
  const events = lines.flatMap(createNormalizer());
  assert.deepEqual(
    events.map((e) => e.type),
    ['system', 'usage', 'assistant_text', 'usage', 'result'],
  );
  assert.ok(events.every((e) => e.raw));
  assert.deepEqual(events[0], { type: 'system', sessionId: 'f16d1674-d449-45b3-a129-112d72e35d53', raw: lines[10] });
  assert.equal((events[2] as { text: string }).text, 'Hello.');
  assert.deepEqual((events[4] as { usage: Usage }).usage, {
    input: 2,
    output: 6,
    cacheRead: 10007,
    cacheWrite: 22797,
    numTurns: 1,
    costUsd: 0.45876175,
  });
});

test('emits system only once', () => {
  const norm = createNormalizer();
  const events = [lines[10], lines[10]].flatMap(norm);
  assert.deepEqual(events.map((e) => e.type), ['system']);
});

test('resets per-message usage at message_start', () => {
  const ev = (event: object) => msg({ type: 'stream_event', event, parent_tool_use_id: null, uuid: 'u', session_id: 's' });
  const events = [
    ev({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } }),
    ev({ type: 'message_delta', usage: { input_tokens: 10, output_tokens: 5 } }),
    ev({ type: 'message_stop' }),
    ev({ type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 1 } } }),
    ev({ type: 'message_delta', usage: { input_tokens: 20, output_tokens: 7 } }),
  ].flatMap(createNormalizer());
  assert.deepEqual(lastUsage(events), { input: 30, output: 12, cacheRead: 0, cacheWrite: 0, numTurns: 0 });
});

test('maps tool_use and tool_result', () => {
  const norm = createNormalizer();
  const [use] = norm(
    msg({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm test' } }] },
      parent_tool_use_id: null,
      session_id: 's',
    }),
  );
  assert.equal(use.type, 'tool_use');
  assert.deepEqual({ ...use, raw: undefined }, {
    type: 'tool_use',
    name: 'Bash',
    input: { command: 'pnpm test' },
    summary: 'Bash: pnpm test',
    raw: undefined,
  });
  const [res] = norm(
    msg({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'boom', is_error: true }] },
      parent_tool_use_id: null,
    }),
  );
  assert.deepEqual({ ...res, raw: undefined }, { type: 'tool_result', ok: false, output: 'boom', raw: undefined });
});

test('maps thinking blocks', () => {
  const [ev] = createNormalizer()(
    msg({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] }, parent_tool_use_id: null }),
  );
  assert.deepEqual({ ...ev, raw: undefined }, { type: 'thinking', text: 'hmm', raw: undefined });
});

test('reports an error result', () => {
  const events = createNormalizer()(
    msg({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      errors: ['Reached max turns'],
      num_turns: 5,
      total_cost_usd: 0.1,
      usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      modelUsage: {},
    }),
  );
  assert.deepEqual(events.map((e) => e.type), ['result', 'error']);
  assert.equal((events[1] as { message: string }).message, 'error_max_turns: Reached max turns');
  assert.deepEqual((events[0] as { usage: Usage }).usage, {
    input: 1,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    numTurns: 5,
    costUsd: 0.1,
  });
});

test('keeps usage of interleaved subagent messages apart', () => {
  const ev = (parent: string | null, event: object) =>
    msg({ type: 'stream_event', event, parent_tool_use_id: parent, uuid: 'u', session_id: 's' });
  const events = [
    ev(null, { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } }),
    ev('t1', { type: 'message_start', message: { usage: { input_tokens: 50, output_tokens: 1 } } }),
    ev(null, { type: 'message_delta', usage: { output_tokens: 40 } }),
    ev('t1', { type: 'message_delta', usage: { output_tokens: 20 } }),
    ev('t1', { type: 'message_stop' }),
    ev(null, { type: 'message_stop' }),
  ].flatMap(createNormalizer());
  assert.deepEqual(lastUsage(events), { input: 150, output: 60, cacheRead: 0, cacheWrite: 0, numTurns: 0 });
});

test('reports the result text of an is_error success', () => {
  const events = createNormalizer()(
    msg({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'API Error: 401 authentication_error',
      num_turns: 1,
      total_cost_usd: 0,
      usage: {},
      modelUsage: {},
    }),
  );
  assert.equal((events[1] as { message: string }).message, 'API Error: 401 authentication_error');
});
