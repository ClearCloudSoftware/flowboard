/**
 * The provider against the real SDK `query()`, with fake `claude` scripts in
 * place of the CLI. No model calls, no quota. These cover the process paths a
 * fake query() skips: the SDK's own spawn arguments, its forwarded abort
 * signal, and the errors it throws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RunSpec } from '@flowboard/core';
import { ClaudeCodeProvider } from '../src/agent/claude/provider.ts';

const fake = (name: string) => fileURLToPath(new URL(`./fixtures/fake-claude/${name}`, import.meta.url));
const spec: RunSpec = {
  prompt: { preamble: 'say hello', inputs: [], outputs: [], closing: 'stop' },
  model: 'haiku',
  cwd: tmpdir(),
};

test('a CLI that dies at startup reports its stderr', async () => {
  const res = await new ClaudeCodeProvider({ claudePath: fake('exit3.sh') }).launch(spec).result;
  assert.equal(res.exitCode, 3);
  assert.match(res.error ?? '', /boom from stderr/);
});

test('a missing CLI binary fails the run', async () => {
  const res = await new ClaudeCodeProvider({ claudePath: '/nonexistent/claude' }).launch(spec).result;
  assert.equal(res.exitCode, 127);
  assert.ok(res.error);
});

test('stop() kills a hung CLI', { timeout: 10_000 }, async () => {
  const run = new ClaudeCodeProvider({ claudePath: fake('hang.sh') }).launch(spec);
  assert.ok((await run.pid) > 0);
  run.stop();
  const res = await run.result;
  assert.equal(res.exitCode, 130);
  assert.equal(res.error, 'stopped');
});

test('stop() kills a CLI that ignores SIGTERM', { timeout: 5_000 }, async () => {
  const run = new ClaudeCodeProvider({ claudePath: fake('ignore-term.sh'), killGraceMs: 200 }).launch(spec);
  assert.ok((await run.pid) > 0);
  await new Promise((r) => setTimeout(r, 100));
  run.stop();
  assert.equal((await run.result).error, 'stopped');
});
