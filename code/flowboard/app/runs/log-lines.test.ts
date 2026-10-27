import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesOf, estimateUsd, lineOf, totalsOf } from './log-lines.ts';

const at = '2026-10-27T10:42:05.123Z';
const p2 = (n: number) => String(n).padStart(2, '0');
const d = new Date(at);
/** `at` on this machine's clock, as the log shows it. */
const local = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
test('each kind of log line reads as one line of the drawer', () => {
  assert.equal(lineOf({ kind: 'pid', at, pid: 1 }), null);
  assert.deepEqual(lineOf({ kind: 'event', at, event: { type: 'tool_use', name: 'Read', input: {}, summary: 'Read src/a.ts' } }), { at: local, type: 'tool', text: 'Read src/a.ts', tone: 'tool' });
  assert.deepEqual(lineOf({ kind: 'event', at, event: { type: 'tool_result', ok: false, output: 'boom\n  at x' } }), { at: local, type: '✗ result', text: 'boom at x', tone: 'bad' });
  assert.equal(lineOf({ kind: 'event', at, event: { type: 'usage', usage: { input: 41200, output: 3200, numTurns: 7, costUsd: 0.384 } } })?.text, '41k in · 3.2k out · 7 turns · $0.38');
  assert.equal(lineOf({ kind: 'result', at, exitCode: 1, output: '' })?.tone, 'bad');
  assert.deepEqual(lineOf({ kind: 'result', at, result: { outcome: 'pass', exitCode: 0, usage: { costUsd: 0.04 } } }), { at: local, type: '✓ end', text: 'pass · exit 0 · $0.04', tone: 'ok' });
  assert.equal(lineOf({ kind: 'mystery', at })?.type, 'mystery');
  assert.equal(lineOf({ kind: 'result', at, result: { outcome: 'pass', exitCode: 0, usage: { costUsd: 0.0043 } } })?.text, 'pass · exit 0 · $0.004');
});

const ev = (event: object) => ({ kind: 'event', at, event });
test('tool calls pair with their results, and a run of them folds into one entry', () => {
  const tool = (n: number) => [ev({ type: 'tool_use', name: 'Read', input: { n }, summary: `Read f${n}` }), ev({ type: 'tool_result', ok: true, output: `${n}` })];
  const e = entriesOf([ev({ type: 'assistant_text', text: 'hi' }), ...tool(1), ...tool(2), ev({ type: 'thinking', text: 'hm' }), ...[1, 2, 3, 4].flatMap(tool)]);
  assert.deepEqual(e.map((x) => x.kind), ['line', 'tool', 'tool', 'line', 'fold']);
  assert.deepEqual(e[1], { kind: 'tool', at: local, name: 'Read', summary: 'Read f1', input: { n: 1 }, ok: true, output: '1' });
  assert.equal(e[3].kind === 'line' && e[3].filter, 'thinking');
  assert.equal(e[4].kind === 'fold' && e[4].tools.length, 4);
});

test('the footer takes the result, else the last running totals', () => {
  const usage = ev({ type: 'usage', usage: { input: 1000, output: 10, numTurns: 2 } });
  assert.deepEqual(totalsOf([{ kind: 'start', at }, usage]), { startedAt: at, endedAt: undefined, turns: 2, input: 1000, output: 10, cacheRead: 0, cacheWrite: 0, costUsd: undefined });
  const end = { kind: 'result', at: 'end', result: { usage: { input: 2000, output: 20, numTurns: 3, costUsd: 0.5 } } };
  assert.equal(totalsOf([{ kind: 'start', at }, usage, end]).costUsd, 0.5);
});

test('a Claude step is priced from its tokens until its result says; an unknown model is not', () => {
  assert.equal(estimateUsd('sonnet', { input: 1_000_000, output: 100_000, cacheRead: 1_000_000 })?.toFixed(2), '4.80');
  assert.equal(estimateUsd('deepseek/deepseek-v4.1-flash', { input: 1, output: 1 }), undefined);
});
