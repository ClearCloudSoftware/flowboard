import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineOf } from './log-lines.ts';

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
