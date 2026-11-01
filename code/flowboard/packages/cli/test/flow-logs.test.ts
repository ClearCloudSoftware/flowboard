import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listRuns, readLogs } from '../src/flow-logs.ts';

test('runs are listed newest first, and each step log is read line by line, a half-written line left out', () => {
  const runs = mkdtempSync(join(tmpdir(), 'fb-runs-'));
  for (const [name, status] of [['2026-10-27T10-00-00-delivery', 'done'], ['2026-10-27T11-00-00-delivery', undefined]] as const) {
    mkdirSync(join(runs, name));
    writeFileSync(join(runs, name, 'flow.json'), JSON.stringify({ version: 1, config: { name: 'delivery' } }));
    if (status) writeFileSync(join(runs, name, 'state.json'), JSON.stringify({ status }));
  }
  mkdirSync(join(runs, 'not-a-run'));
  assert.deepEqual(listRuns(runs), [
    { name: '2026-10-27T11-00-00-delivery', flow: 'delivery', status: 'starting' },
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
