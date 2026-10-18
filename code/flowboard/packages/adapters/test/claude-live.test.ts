/**
 * Live checks against the installed `claude` CLI and the owner's login. They
 * spend subscription quota, so they run only with FLOWBOARD_LIVE=1
 * (`pnpm test:live`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedEvent, RunSpec } from '@flowboard/core';
import { ClaudeCodeProvider } from '../src/agent/claude/provider.ts';

const live = { skip: !process.env.FLOWBOARD_LIVE, timeout: 180_000 };
const plugin = fileURLToPath(new URL('./fixtures/fbecho-plugin', import.meta.url));

async function run(spec: Omit<RunSpec, 'model' | 'cwd'> & { cwd?: string }) {
  const cwd = spec.cwd ?? mkdtempSync(join(tmpdir(), 'fb-live-'));
  const handle = new ClaudeCodeProvider().launch({ model: 'haiku', ...spec, cwd });
  const events: NormalizedEvent[] = [];
  for await (const ev of handle.events) events.push(ev);
  return { events, res: await handle.result, sessionId: await handle.sessionId };
}

const texts = (events: NormalizedEvent[]) =>
  events.flatMap((e) => (e.type === 'assistant_text' ? [e.text] : [])).join('\n');

test('hello on the installed CLI with the subscription login', live, async () => {
  const { events, res, sessionId } = await run({
    prompt: { preamble: 'Reply with the single word OK.', inputs: [], outputs: [], closing: 'Do not use any tools.' },
    limits: { maxTurns: 1 },
  });
  const system = events.find((e) => e.type === 'system');
  assert.equal((system?.raw as { apiKeySource: string }).apiKeySource, 'none');
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.ok(texts(events).length > 0);
  assert.equal(res.exitCode, 0);
  assert.equal(res.error, undefined);
  assert.ok(res.usage.output > 0);
  assert.ok((res.usage.costUsd ?? 0) > 0);
});

test('mounts a plugin and runs its skill headless', live, async () => {
  const { events, res } = await run({
    prompt: { preamble: '', inputs: [], outputs: [], invocation: '/fbecho:echo', closing: '' },
    capabilities: [{ id: 'fbecho', provider: 'claude-code', mount: { kind: 'plugin_dir', path: plugin } }],
    limits: { maxTurns: 2 },
  });
  assert.equal(res.error, undefined);
  assert.match(texts(events), /ECHO-OK/);
});

test('guard hook blocks a write outside the worktree under bypassPermissions', live, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fb-live-'));
  const target = join(tmpdir(), `fb-guard-${randomUUID()}.txt`);
  const { events } = await run({
    cwd,
    prompt: {
      preamble: `Use the Write tool to create ${target} containing hi. Do not use Bash.`,
      inputs: [],
      outputs: [],
      closing: 'If the write is refused, stop.',
    },
    permissionMode: 'bypassPermissions',
    guards: { writeRoots: [cwd] },
    limits: { maxTurns: 3 },
  });
  assert.equal(existsSync(target), false);
  const denied = events.find((e) => e.type === 'tool_result' && !e.ok);
  assert.match(JSON.stringify(denied && 'output' in denied ? denied.output : ''), /Write outside the worktree/);
});
