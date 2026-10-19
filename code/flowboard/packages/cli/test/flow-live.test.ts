/**
 * A live flow across both adapters: Claude Code writes, a shell check verifies, and OpenCode judges through
 * set_outcome. It spends Claude quota and OpenRouter credit, so it runs only with FLOWBOARD_LIVE=1 (`pnpm test:live`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FlowState } from '@flowboard/core';
import { runFlow } from '../src/flow-run.ts';

const live = { skip: !process.env.FLOWBOARD_LIVE, timeout: 300_000 };
const OPENCODE_MODEL = process.env.FLOWBOARD_OPENCODE_MODEL ?? 'openrouter/deepseek/deepseek-v4.1-flash';

test('a flow writes with Claude Code, checks in the shell and judges with OpenCode', live, async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-flow-live-'))); // macOS's temp folder is a link
  mkdirSync(join(base, 'proj'));
  writeFileSync(join(base, 'task.md'), 'Write the single word hello, in lowercase, into your output file. Nothing else.');
  writeFileSync(join(base, 'write.md'), 'Write the greeting now.');
  writeFileSync(join(base, 'judge.md'), 'Read the greeting file. Report pass if it contains the word hello, otherwise fail.');
  writeFileSync(
    join(base, 'flow.yaml'),
    `folder: proj
task: task.md
defaults: { limits: { max_turns: 6, budget_usd: 0.3 } }
steps:
  write: { adapter: claude-code, model: haiku, prompt: write.md, produces: [greeting] }
  check: { shell: 'grep -qi hello "$FLOWBOARD_ARTIFACTS/greeting.md"', produces: [check_output] }
  judge:
    adapter: opencode
    model: ${OPENCODE_MODEL}
    prompt: judge.md
    requires: [greeting]
edges:
  - { from: write, to: check }
  - { from: check, to: judge, condition: on_pass }
  - { from: check, to: write, condition: on_fail }
  - { from: judge, to: write, condition: on_fail }
`,
  );
  const out: string[] = [];
  const code = await runFlow(['flow.yaml'], { cwd: base, print: (l) => out.push(l), printErr: (l) => out.push(l), signals: new EventEmitter() });
  assert.equal(code, 0, out.join('\n'));
  const [run] = readdirSync(join(base, 'runs'));
  const state = JSON.parse(readFileSync(join(base, 'runs', run, 'state.json'), 'utf8')) as FlowState;
  assert.equal(state.status, 'done');
  const judge = state.runs.findLast((r) => r.step === 'judge');
  assert.equal(judge?.outcome, 'pass', out.join('\n'));
  // The file proves set_outcome reached the shim on OpenCode; a result's own outcome would not write it.
  const verdict = join(base, 'runs', run, `${String(judge.id).padStart(3, '0')}-judge.outcome.json`);
  assert.ok(existsSync(verdict), `no ${verdict}`);
});
