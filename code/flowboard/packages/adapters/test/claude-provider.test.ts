import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { NormalizedEvent, RunSpec, Usage } from '@flowboard/core';
import { ClaudeCodeProvider } from '../src/agent/claude/provider.ts';
import type { QueryFn } from '../src/agent/claude/provider.ts';

const lines = readFileSync(new URL('./fixtures/claude-hello.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as SDKMessage);
const init = lines[10];

const spec: RunSpec = {
  prompt: { preamble: 'say hello', inputs: [], outputs: [], closing: 'stop' },
  model: 'haiku',
  cwd: tmpdir(),
};

const errorResult = {
  type: 'result',
  subtype: 'error_max_turns',
  is_error: true,
  errors: ['Reached max turns'],
  num_turns: 5,
  total_cost_usd: 0.1,
  usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  modelUsage: {},
} as unknown as SDKMessage;

/** Stands in for the SDK's query(): spawns a real child through the provider's spawn hook, then yields `messages`. */
function fakeQuery(
  messages: SDKMessage[],
  opts: { childScript?: string; throwAfter?: Error; waitForAbort?: boolean } = {},
): QueryFn {
  return ({ options }) =>
    (async function* () {
      const signal = options.abortController!.signal;
      options.spawnClaudeCodeProcess!({
        command: process.execPath,
        args: ['-e', opts.childScript ?? ''],
        env: process.env,
        signal,
      });
      for (const m of messages) yield m;
      if (opts.waitForAbort && !signal.aborted) {
        await new Promise((r) => signal.addEventListener('abort', r, { once: true }));
      }
      if (opts.throwAfter) throw opts.throwAfter;
    })();
}

async function drain(events: AsyncIterable<NormalizedEvent>) {
  const out: NormalizedEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

test('runs the recorded stream end to end', async () => {
  const run = new ClaudeCodeProvider({ query: fakeQuery(lines) }).launch(spec);
  const events = await drain(run.events);
  assert.deepEqual(
    events.map((e) => e.type),
    ['system', 'usage', 'assistant_text', 'usage', 'result'],
  );
  assert.equal(await run.sessionId, 'f16d1674-d449-45b3-a129-112d72e35d53');
  assert.ok((await run.pid) > 0);
  const res = await run.result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.error, undefined);
  assert.equal(res.usage.costUsd, 0.45876175);
});

test('settles result without reading events', async () => {
  const res = await new ClaudeCodeProvider({ query: fakeQuery(lines) }).launch(spec).result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.usage.output, 6);
});

test('keeps the result error when query throws after it', async () => {
  const run = new ClaudeCodeProvider({
    query: fakeQuery([init, errorResult], { throwAfter: new Error('Claude Code returned an error result') }),
  }).launch(spec);
  const errors = (await drain(run.events)).filter((e) => e.type === 'error');
  assert.equal(errors.length, 1);
  assert.equal((await run.result).error, 'error_max_turns: Reached max turns');
});

test('stop() kills the child and settles as stopped', async () => {
  const run = new ClaudeCodeProvider({
    query: fakeQuery([init], { childScript: 'setTimeout(() => {}, 60000)', waitForAbort: true }),
  }).launch(spec);
  for await (const ev of run.events) {
    if (ev.type === 'system') run.stop();
  }
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.error, 'stopped');
});

test('a run stopped before its result keeps the usage reported so far', async () => {
  const beforeResult = lines.filter((m) => m.type !== 'result');
  const run = new ClaudeCodeProvider({
    query: fakeQuery(beforeResult, { childScript: 'setTimeout(() => {}, 60000)', waitForAbort: true }),
  }).launch(spec);
  let last: Usage | undefined;
  for await (const ev of run.events) {
    if (ev.type === 'usage') last = ev.usage;
    if (ev.type === 'assistant_text') run.stop();
  }
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.ok(last && last.output > 0);
  assert.deepEqual(res.usage, last); // tokens only: Claude prices a run in its result
});

test('fails when a requested plugin is not loaded', async () => {
  const run = new ClaudeCodeProvider({
    query: fakeQuery([{ ...init, plugins: [] } as SDKMessage, ...lines.slice(11)]),
  }).launch({
    ...spec,
    capabilities: [{ id: 'p', provider: 'claude-code', mount: { kind: 'plugin_dir', path: '/nope' } }],
  });
  const events = await drain(run.events);
  assert.deepEqual(
    events.filter((e) => e.type === 'error').map((e) => (e as { message: string }).message),
    ['plugin not loaded: /nope'],
  );
  assert.equal((await run.result).error, 'plugin not loaded: /nope');
});

test('sessionId rejects when the run dies before init', async () => {
  const run = new ClaudeCodeProvider({ query: fakeQuery([], { throwAfter: new Error('spawn failed') }) }).launch(spec);
  await assert.rejects(run.sessionId);
  assert.equal((await run.result).error, 'spawn failed');
});

test('stop() after the result does not relabel a finished run', async () => {
  const run = new ClaudeCodeProvider({ query: fakeQuery(lines) }).launch(spec);
  for await (const ev of run.events) {
    if (ev.type === 'result') run.stop();
  }
  const res = await run.result;
  assert.equal(res.exitCode, 0);
  assert.equal(res.error, undefined);
});
