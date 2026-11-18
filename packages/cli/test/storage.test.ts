import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParsedTask } from '@lamproom/core';
import {
  deleteTasks,
  finishImport,
  findRunningImport,
  getImport,
  getTask,
  listTasks,
  openDb,
  recordImport,
  updateImportProgress,
  upsertTask,
  upsertTasks,
} from '../src/storage.ts';

function task(importKey: string, title: string, overrides: Partial<ParsedTask> = {}): ParsedTask {
  return { importKey, title, _hint: { titleSlug: importKey }, ...overrides };
}

async function freshDb() {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  return openDb(join(dir, 'test.db'));
}

test('upsertTask is idempotent on (project_id, source_id, import_key) (Review Focus #1)', async () => {
  const db = await freshDb();
  const t = task('kan-1', 'Original');

  const r1 = upsertTask(db, 'p', 'jira', t, new Date('2026-11-19T10:00:00Z'));
  const r2 = upsertTask(db, 'p', 'jira', t, new Date('2026-11-19T11:00:00Z'));
  const r3 = upsertTask(db, 'p', 'jira', { ...t, title: 'Edited' }, new Date('2026-11-19T12:00:00Z'));

  assert.equal(r1, 'created');
  assert.equal(r2, 'updated');
  assert.equal(r3, 'updated');

  const got = getTask(db, 'p', 'jira', 'kan-1');
  assert.equal(got?.title, 'Edited');
  assert.equal(got?.importedAt, '2026-11-19T10:00:00.000Z');
  assert.equal(got?.updatedAt, '2026-11-19T12:00:00.000Z');
  assert.equal(listTasks(db, 'p', {}).length, 1);
});

test('upsertTasks returns summed counts and persists all fields', async () => {
  const db = await freshDb();
  const now = new Date('2026-11-19T10:00:00Z');
  const r1 = upsertTasks(
    db,
    'p',
    'jira',
    [
      task('k1', 'A', { labels: ['bug'], assignees: ['alice'], acceptanceCriteria: ['does X'] }),
      task('k2', 'B', { body: 'hello', extras: { number: 2 } }),
    ],
    now,
  );
  assert.deepEqual(r1, { created: 2, updated: 0 });

  // Right after the first upsert, every field is persisted.
  const k1Before = getTask(db, 'p', 'jira', 'k1');
  assert.deepEqual(k1Before?.labels, ['bug']);
  assert.deepEqual(k1Before?.assignees, ['alice']);
  assert.deepEqual(k1Before?.acceptance, ['does X']);

  const k2 = getTask(db, 'p', 'jira', 'k2');
  assert.equal(k2?.body, 'hello');
  assert.deepEqual(k2?.extras, { number: 2 });

  // Re-import replaces fields with what the source now says. If Jira drops a
  // label from an issue, our stored row drops it too — same shape as the
  // acceptance test (re-import = upsert on the triple).
  const r2 = upsertTasks(db, 'p', 'jira', [task('k1', 'A-new'), task('k3', 'C')], now);
  assert.deepEqual(r2, { created: 1, updated: 1 });

  const k1After = getTask(db, 'p', 'jira', 'k1');
  assert.equal(k1After?.title, 'A-new');
  assert.deepEqual(k1After?.labels, []);
  assert.deepEqual(k1After?.assignees, []);
  assert.deepEqual(k1After?.acceptance, []);
});

test('listTasks filters by sourceId and paginates with limit/offset', async () => {
  const db = await freshDb();
  const now = new Date();
  upsertTasks(db, 'p', 'jira', [task('j1', 'J1'), task('j2', 'J2'), task('j3', 'J3')], now);
  upsertTasks(db, 'p', 'github', [task('g1', 'G1')], now);

  assert.equal(listTasks(db, 'p', {}).length, 4);
  assert.equal(listTasks(db, 'p', { sourceId: 'jira' }).length, 3);
  assert.equal(listTasks(db, 'p', { sourceId: 'github' }).length, 1);
  assert.equal(listTasks(db, 'p', { limit: 2 }).length, 2);
  assert.equal(listTasks(db, 'p', { limit: 2, offset: 2 }).length, 2);
});

test('listTasks orders by updatedAt descending', async () => {
  const db = await freshDb();
  upsertTask(db, 'p', 'jira', task('older', 'A'), new Date('2026-11-01T00:00:00Z'));
  upsertTask(db, 'p', 'jira', task('newer', 'B'), new Date('2026-11-02T00:00:00Z'));
  const rows = listTasks(db, 'p', {});
  assert.equal(rows[0]?.importKey, 'newer');
  assert.equal(rows[1]?.importKey, 'older');
});

test('deleteTasks clears a (project, source) pair but not others', async () => {
  const db = await freshDb();
  const now = new Date();
  upsertTasks(db, 'p', 'jira', [task('j1', 'J1'), task('j2', 'J2')], now);
  upsertTasks(db, 'p', 'github', [task('g1', 'G1')], now);
  const deleted = deleteTasks(db, 'p', 'jira');
  assert.equal(deleted, 2);
  assert.equal(listTasks(db, 'p', {}).length, 1);
  assert.equal(listTasks(db, 'p', { sourceId: 'github' })[0]?.title, 'G1');
});

test('recordImport and updateImportProgress tally counts', async () => {
  const db = await freshDb();
  const row = recordImport(db, 'p', 'jira', new Date('2026-11-19T10:00:00Z'));
  assert.equal(row.state, 'running');
  assert.equal(row.created, 0);

  updateImportProgress(db, row.id, { created: 3, updated: 1, pages: 1 });
  updateImportProgress(db, row.id, { created: 2, pages: 1, skipped: 1 });

  const after = getImport(db, row.id);
  assert.equal(after?.created, 5);
  assert.equal(after?.updated, 1);
  assert.equal(after?.skipped, 1);
  assert.equal(after?.pages, 2);
});

test('finishImport sets endedAt and state (done)', async () => {
  const db = await freshDb();
  const row = recordImport(db, 'p', 'jira', new Date('2026-11-19T10:00:00Z'));
  finishImport(db, row.id, 'done');
  const after = getImport(db, row.id);
  assert.equal(after?.state, 'done');
  assert.ok(after?.endedAt);
  assert.equal(after?.error, null);
});

test('finishImport state=failed carries the redacted error', async () => {
  const db = await freshDb();
  const row = recordImport(db, 'p', 'jira', new Date());
  finishImport(db, row.id, 'failed', { error: 'boom [redacted]' });
  const after = getImport(db, row.id);
  assert.equal(after?.state, 'failed');
  assert.equal(after?.error, 'boom [redacted]');
});

test('findRunningImport returns the single running row for a (project, source) pair', async () => {
  const db = await freshDb();
  assert.equal(findRunningImport(db, 'p', 'jira'), undefined);
  const r1 = recordImport(db, 'p', 'jira', new Date());
  assert.equal(findRunningImport(db, 'p', 'jira')?.id, r1.id);
  // other project / source do not collide
  assert.equal(findRunningImport(db, 'p', 'github'), undefined);
  assert.equal(findRunningImport(db, 'q', 'jira'), undefined);
  finishImport(db, r1.id, 'done');
  assert.equal(findRunningImport(db, 'p', 'jira'), undefined);
});

test('upsert refuses empty or whitespace importKey', async () => {
  const db = await freshDb();
  assert.throws(() => upsertTask(db, 'p', 'jira', task('', 'x'), new Date()), /importKey/);
  assert.throws(() => upsertTask(db, 'p', 'jira', task('   ', 'x'), new Date()), /importKey/);
});

test('openDb is idempotent for the same path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const p = join(dir, 'idemp.db');
  const a = openDb(p);
  const b = openDb(p);
  assert.equal(a, b);
});
