import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerAsk, listRuns, readLogs, readRun, stopRun } from '../src/flow-logs.ts';

test('runs are listed newest first, and each step log is read line by line, a half-written line left out', () => {
  const runs = mkdtempSync(join(tmpdir(), 'fb-runs-'));
  for (const [name, status] of [['2026-10-27T10-00-00-delivery', 'done'], ['2026-10-27T11-00-00-delivery', undefined]] as const) {
    mkdirSync(join(runs, name));
    writeFileSync(join(runs, name, 'flow.json'), JSON.stringify({ version: 1, config: { name: 'delivery' } }));
    if (status) writeFileSync(join(runs, name, 'state.json'), JSON.stringify({ status }));
  }
  mkdirSync(join(runs, 'not-a-run'));
  assert.deepEqual(listRuns(runs), [
    { name: '2026-10-27T11-00-00-delivery', flow: 'delivery', status: 'paused' }, // no state, no host: it never got going
    { name: '2026-10-27T10-00-00-delivery', flow: 'delivery', status: 'done' },
  ]);

  const dir = join(runs, '2026-10-27T10-00-00-delivery');
  writeFileSync(join(dir, '002-implement.jsonl'), '{"kind":"start"}\n{"kind":"event","event":{"type":"assistant_text","text":"hi"}}\n{"kind":"ev');
  writeFileSync(join(dir, '001-plan.jsonl'), '{"kind":"start"}\n');
  writeFileSync(join(dir, 'flow.jsonl'), '{"event":{}}\n');
  assert.deepEqual(readLogs(runs, '2026-10-27T10-00-00-delivery'), [
    { run: 1, step: 'plan', lines: [{ kind: 'start' }] },
    { run: 2, step: 'implement', lines: [{ kind: 'start' }, { kind: 'event', event: { type: 'assistant_text', text: 'hi' } }] },
  ]);
  assert.equal(readLogs(runs, '..'), undefined);
  assert.equal(readLogs(runs, 'nope'), undefined);
});

test('a run as the page shows it: steps with their state, spend and waste, artifacts, the patch, and its open asks', () => {
  const runs = mkdtempSync(join(tmpdir(), 'fb-runs-'));
  const dir = join(runs, '2026-10-27T10-00-00-delivery');
  const arts = join(runs, 'arts');
  mkdirSync(join(dir, 'asks'), { recursive: true });
  mkdirSync(arts);
  writeFileSync(join(arts, 'plan.md'), 'the plan');
  const config = {
    name: 'delivery', folder: '/w', budgetUsd: 5, warnings: [],
    flow: { steps: [{ id: 'plan', requires: [], produces: ['plan'], approval: false, maxAttempts: 3 }, { id: 'tests', requires: ['plan'], produces: [], approval: true, maxAttempts: 3 }], edges: [] },
    steps: { plan: { kind: 'ai', verdict: false, run: { adapter: 'claude-code', spec: { model: 'opus', effort: 'high' } } }, tests: { kind: 'shell', command: 'pnpm test', timeoutMinutes: 30 } },
  };
  writeFileSync(join(dir, 'flow.json'), JSON.stringify({ version: 1, config, artifactsDir: arts }));
  writeFileSync(join(dir, 'state.json'), JSON.stringify({
    status: 'running',
    steps: { plan: { state: 'done', attempts: 2, outcome: 'pass', inputs: [] }, tests: { state: 'awaiting_approval', attempts: 1, inputs: [], gate: { kind: 'verdict', reason: 'approval needed', evidence: [], decisions: ['approve', 'reject'] } } },
    runs: [{ id: 1, step: 'plan', attempt: 1, live: false, costUsd: 0.3, wasted: true }, { id: 2, step: 'plan', attempt: 2, live: false, costUsd: 0.1, wasted: false }],
  }));
  writeFileSync(join(dir, '001-plan.jsonl'), '{"kind":"start","at":"2026-10-27T10:00:01.000Z"}\n{"kind":"result","at":"2026-10-27T10:00:09.000Z"}\n');
  writeFileSync(join(dir, 'changes.patch'), '--- a/x\n+++ b/x\n');
  writeFileSync(join(dir, 'host.json'), JSON.stringify({ pid: process.pid, page: true }));
  writeFileSync(join(dir, 'asks', '1-0.json'), JSON.stringify({ id: '1-0', heading: 'tests needs a decision', questions: [], at: '' }));

  const r = readRun(runs, '2026-10-27T10-00-00-delivery')!;
  assert.equal(r.status, 'waiting');
  assert.equal(r.page, true);
  assert.deepEqual(r.steps.map((s) => [s.name, s.kind, s.model ?? s.command, s.state, s.attempts]), [['plan', 'ai', 'opus', 'done', 2], ['tests', 'shell', 'pnpm test', 'awaiting_approval', 1]]);
  assert.equal(r.steps[1].gate?.reason, 'approval needed');
  assert.equal(r.spentUsd.toFixed(2), '0.40');
  assert.equal(r.wastedUsd, 0.3);
  assert.deepEqual([r.runs[0].startedAt, r.runs[0].endedAt], ['2026-10-27T10:00:01.000Z', '2026-10-27T10:00:09.000Z']);
  assert.deepEqual(r.artifacts.map((a) => [a.type, a.bytes, a.by]), [['plan', 8, 'plan']]);
  assert.equal(r.patch?.text, '--- a/x\n+++ b/x\n');
  assert.equal(r.asks[0].heading, 'tests needs a decision');
  assert.equal(r.sandbox, 'none · runs on this machine');

  writeFileSync(join(dir, 'host.json'), JSON.stringify({ pid: 999999, page: true }));
  assert.equal(readRun(runs, '2026-10-27T10-00-00-delivery')!.status, 'paused');
});

test("the page's answer is written only when it fits the open question", () => {
  const runs = mkdtempSync(join(tmpdir(), 'fb-runs-'));
  const dir = join(runs, 'r1');
  mkdirSync(join(dir, 'asks'), { recursive: true });
  mkdirSync(join(dir, 'answers'));
  const config = { name: 'f', folder: '/w', budgetUsd: 0, warnings: [], flow: { steps: [], edges: [] }, steps: {} };
  writeFileSync(join(dir, 'flow.json'), JSON.stringify({ version: 1, config, artifactsDir: join(runs, 'none') }));
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ status: 'running', steps: {}, runs: [] }));
  writeFileSync(join(dir, 'host.json'), JSON.stringify({ pid: process.pid, page: true }));
  const questions = [
    { id: 'decision', kind: 'single_select', prompt: 'review', options: [{ value: 'approve', label: 'Approve' }] },
    { id: 'note', kind: 'text', prompt: 'Note', required: false },
  ];
  writeFileSync(join(dir, 'asks', 'a.json'), JSON.stringify({ id: 'a', heading: '', questions, at: '' }));
  assert.equal(answerAsk(runs, 'r1', 'a', { decision: 'merge' }), 'review: not one of its options');
  assert.equal(answerAsk(runs, 'r1', 'a', {}), 'review: needs an answer');
  assert.equal(answerAsk(runs, 'r1', 'b', { decision: 'approve' }), 'that question is no longer open');
  assert.equal(answerAsk(runs, 'r1', 'a', { decision: 'approve', note: '', extra: 1 }), undefined);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'answers', 'a.json'), 'utf8')), { decision: 'approve', note: null });

  assert.equal(stopRun(runs, 'r1'), undefined);
  assert.ok(existsSync(join(dir, 'stop')));
  writeFileSync(join(dir, 'host.json'), JSON.stringify({ pid: 999999, page: true }));
  assert.equal(answerAsk(runs, 'r1', 'a', { decision: 'approve' }), 'this run does not take answers from the page; start it with --page');
  assert.equal(stopRun(runs, 'r1'), 'the run is paused; nothing to stop');
});
