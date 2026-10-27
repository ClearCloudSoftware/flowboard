import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesOf, lineOf, totalsOf } from './log-lines.ts';

const at = '2026-10-27T10:42:05.123Z';
test('each kind of log line reads as one line of the drawer', () => {
  assert.equal(lineOf({ kind: 'pid', at, pid: 1 }), null);
  assert.deepEqual(lineOf({ kind: 'event', at, event: { type: 'tool_use', name: 'Read', input: {}, summary: 'Read src/a.ts' } }), { at: '10:42:05', type: 'tool', text: 'Read src/a.ts', tone: 'tool' });
  assert.deepEqual(lineOf({ kind: 'event', at, event: { type: 'tool_result', ok: false, output: 'boom\n  at x' } }), { at: '10:42:05', type: '✗ result', text: 'boom at x', tone: 'bad' });
  assert.equal(lineOf({ kind: 'event', at, event: { type: 'usage', usage: { input: 41200, output: 3200, numTurns: 7, costUsd: 0.384 } } })?.text, '41k in · 3.2k out · 7 turns · $0.38');
  assert.equal(lineOf({ kind: 'result', at, exitCode: 1, output: '' })?.tone, 'bad');
  assert.deepEqual(lineOf({ kind: 'result', at, result: { outcome: 'pass', exitCode: 0, usage: { costUsd: 0.04 } } }), { at: '10:42:05', type: '✓ end', text: 'pass · exit 0 · $0.04', tone: 'ok' });
  assert.equal(lineOf({ kind: 'mystery', at })?.type, 'mystery');
});

const ev = (event: object) => ({ kind: 'event', at, event });
test('tool calls pair with their results, and a run of them folds into one entry', () => {
  const tool = (n: number) => [ev({ type: 'tool_use', name: 'Read', input: { n }, summary: `Read f${n}` }), ev({ type: 'tool_result', ok: true, output: `${n}` })];
  const e = entriesOf([ev({ type: 'assistant_text', text: 'hi' }), ...tool(1), ...tool(2), ev({ type: 'thinking', text: 'hm' }), ...[1, 2, 3, 4].flatMap(tool)]);
  assert.deepEqual(e.map((x) => x.kind), ['line', 'tool', 'tool', 'line', 'fold']);
  assert.deepEqual(e[1], { kind: 'tool', at: '10:42:05', name: 'Read', summary: 'Read f1', input: { n: 1 }, ok: true, output: '1' });
  assert.equal(e[3].kind === 'line' && e[3].filter, 'thinking');
  assert.equal(e[4].kind === 'fold' && e[4].tools.length, 4);
});

test('the footer takes the result, else the last running totals', () => {
  const usage = ev({ type: 'usage', usage: { input: 1000, output: 10, numTurns: 2 } });
  assert.deepEqual(totalsOf([{ kind: 'start', at }, usage]), { startedAt: at, endedAt: undefined, turns: 2, input: 1000, output: 10, costUsd: undefined });
  const end = { kind: 'result', at: 'end', result: { usage: { input: 2000, output: 20, numTurns: 3, costUsd: 0.5 } } };
  assert.equal(totalsOf([{ kind: 'start', at }, usage, end]).costUsd, 0.5);
});
