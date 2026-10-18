/**
 * Live checks of run-agent on both adapters. They spend Claude quota and
 * OpenRouter credit, so they run only with FLOWBOARD_LIVE=1 (`pnpm test:live`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../src/run.ts';

const live = { skip: !process.env.FLOWBOARD_LIVE, timeout: 180_000 };

async function liveRun(adapter: string, model: string) {
  const base = mkdtempSync(join(tmpdir(), 'fb-cli-live-'));
  mkdirSync(join(base, 'proj'));
  writeFileSync(join(base, 'task.md'), 'Reply with the single word OK. Do not use any tools.');
  writeFileSync(
    join(base, 'task.yaml'),
    `adapter: ${adapter}\nmodel: ${model}\nfolder: proj\nprompt: task.md\nlimits:\n  max_turns: 1\n  budget_usd: 0.2\n`,
  );
  const out: string[] = [];
  const code = await runAgent(['task.yaml'], { cwd: base, print: (l) => out.push(l), signals: new EventEmitter() });
  const [log] = readdirSync(join(base, 'runs'));
  const lines = readFileSync(join(base, 'runs', log), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { code, lines, out };
}

for (const [adapter, model] of [
  ['claude-code', 'haiku'],
  ['opencode', process.env.FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash'],
]) {
  test(`${adapter}: YAML run replies and logs a result`, live, async () => {
    const { code, lines, out } = await liveRun(adapter, model);
    assert.equal(code, 0, out.join('\n'));
    const last = lines.at(-1);
    assert.equal(last.kind, 'result');
    assert.equal(last.result.exitCode, 0);
    assert.equal(last.result.error, undefined);
    assert.ok(lines.some((l) => l.kind === 'event' && l.event.type === 'assistant_text'));
  });
}
