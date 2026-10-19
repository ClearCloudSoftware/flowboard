/**
 * Live checks against the installed `opencode` and its own credentials. They
 * spend real money (OpenRouter), so they run only with FLOWBOARD_LIVE=1 and
 * FLOWBOARD_OPENCODE_MODEL=<providerID/modelID>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedEvent, RunSpec } from '@flowboard/core';
import { OpencodeProvider } from '../src/agent/opencode/provider.ts';

const model = process.env.FLOWBOARD_OPENCODE_MODEL;
const live = { skip: !process.env.FLOWBOARD_LIVE || !model, timeout: 240_000 };
const plugin = fileURLToPath(new URL('./fixtures/fbecho-plugin', import.meta.url));

async function run(spec: Omit<RunSpec, 'model' | 'cwd'> & { cwd?: string }) {
  const cwd = spec.cwd ?? mkdtempSync(join(tmpdir(), 'fb-oc-live-'));
  const handle = new OpencodeProvider({ models: { default: model! } }).launch({
    model: 'default',
    limits: { maxTurns: 4 },
    ...spec,
    cwd,
  });
  const events: NormalizedEvent[] = [];
  for await (const ev of handle.events) events.push(ev);
  return { events, res: await handle.result };
}

const texts = (events: NormalizedEvent[]) =>
  events.flatMap((e) => (e.type === 'assistant_text' ? [e.text] : [])).join('\n');

test('reads a file and replies on the real server', live, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fb-oc-live-'));
  writeFileSync(join(cwd, 'hello.txt'), 'live-ok\n');
  const { events, res } = await run({
    cwd,
    prompt: { preamble: 'Read hello.txt and reply with its exact contents.', inputs: [], outputs: [], closing: '' },
  });
  assert.equal(res.error, undefined);
  assert.match(texts(events), /live-ok/);
  assert.ok(events.some((e) => e.type === 'tool_use' && e.name === 'read'));
  assert.ok(res.usage.output > 0);
});

test('mounts a plugin skill', live, async () => {
  const { events, res } = await run({
    prompt: { preamble: '', inputs: [], outputs: [], invocation: '/fbecho:echo', closing: '' },
    capabilities: [{ id: 'fbecho', provider: 'opencode', mount: { kind: 'plugin_dir', path: plugin } }],
  });
  assert.equal(res.error, undefined);
  assert.match(texts(events), /ECHO-OK/);
});

test('guard plugin blocks a write outside the worktree', live, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fb-oc-live-'));
  const target = join(tmpdir(), `fb-oc-guard-${randomUUID()}.txt`);
  const { events } = await run({
    cwd,
    prompt: {
      preamble: `Use the write tool to create ${target} containing hi. Do not use bash.`,
      inputs: [],
      outputs: [],
      closing: 'If the write is refused, stop.',
    },
    permissionMode: 'bypassPermissions',
    guards: { writeRoots: [cwd] },
  });
  assert.equal(existsSync(target), false);
  const denied = events.find((e) => e.type === 'tool_result' && !e.ok);
  assert.match(JSON.stringify(denied && 'output' in denied ? denied.output : ''), /Write outside the worktree/);
});
