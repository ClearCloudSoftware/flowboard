/**
 * Live check against Ollama on this machine: free, as the model runs here. Runs only with FLOWBOARD_LIVE=1, and
 * skips when Ollama does not answer or has no tool-capable model. Part of `pnpm test:live` (Alex, 2026-11-16).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpencodeProvider } from '@flowboard/adapters';
import type { NormalizedEvent } from '@flowboard/core';
import { ollamaConfig, refreshOllama } from '../src/ollama.ts';

const state = process.env.FLOWBOARD_LIVE ? await refreshOllama(realpathSync(mkdtempSync(join(tmpdir(), 'fb-ollama-live-')))) : undefined;
const first = state?.models?.[0];
const live = { skip: !process.env.FLOWBOARD_LIVE ? 'FLOWBOARD_LIVE is not set' : !first ? (state?.error ?? 'no tool-capable model in Ollama') : false, timeout: 300_000 };

test("a step on Ollama's first tool-capable model writes a file, at $0", live, async () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'fb-ollama-live-')));
  const handle = new OpencodeProvider({ models: {} }).launch({
    model: first!.id,
    cwd,
    prompt: { preamble: 'Create a file hello.txt containing the word ok, then stop.', inputs: [], outputs: [], closing: '' },
    capabilities: [{ id: 'ollama', provider: 'opencode', mount: { kind: 'native', config: ollamaConfig(first!.id, state!.models) } }],
    guards: { writeRoots: [cwd] },
    permissionMode: 'acceptEdits',
    limits: { maxTurns: 6 },
  });
  const events: NormalizedEvent[] = [];
  for await (const ev of handle.events) events.push(ev);
  const res = await handle.result;
  assert.equal(res.error, undefined);
  assert.equal(res.exitCode, 0);
  assert.equal(res.usage.costUsd, 0);
  assert.ok(res.usage.input > 0);
  assert.ok(events.some((e) => e.type === 'tool_use'));
  assert.ok(existsSync(join(cwd, 'hello.txt')));
  assert.match(readFileSync(join(cwd, 'hello.txt'), 'utf8'), /ok/i);
});
