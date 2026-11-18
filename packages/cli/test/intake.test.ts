import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParsedTask, SourceInput, SourceResult, TaskSource } from '@lamproom/core';
import { runIntake } from '../src/intake.ts';
import { getImport, listTasks, openDb } from '../src/storage.ts';

function parsed(key: string, overrides: Partial<ParsedTask> = {}): ParsedTask {
  return { importKey: key, title: key, _hint: { titleSlug: key }, ...overrides };
}

function makePage(keys: string[], next?: string): SourceResult {
  return {
    tasks: keys.map((k) => parsed(k)),
    usage: { requests: 1 },
    ...(next !== undefined ? { nextCursor: next } : {}),
  };
}

function fakeSource(pages: SourceResult[]): TaskSource {
  let i = 0;
  return {
    id: 'jira',
    capabilities: new Set(['pull', 'pagination']),
    async fetch(_input: SourceInput): Promise<SourceResult> {
      if (i >= pages.length) throw new Error('fake source: exhausted');
      return pages[i++]!;
    },
  };
}

async function freshDb() {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  return openDb(join(dir, 'intake.db'));
}

test('drains all pages, upserts each task, sets state=done', async () => {
  const db = await freshDb();
  const source = fakeSource([makePage(['k1', 'k2'], 'c1'), makePage(['k3'])]);
  const r = await runIntake(db, { projectId: 'p', sourceId: 'jira', source, input: {} });
  assert.equal(r.state, 'done');
  assert.equal(r.created, 3);
  assert.equal(r.updated, 0);
  assert.equal(r.pages, 2);
  assert.equal(listTasks(db, 'p', {}).length, 3);
  const row = getImport(db, r.importId);
  assert.equal(row?.state, 'done');
  assert.equal(row?.created, 3);
  assert.ok(row?.endedAt);
});

test('re-running is idempotent: updates existing (Review Focus #1 extended)', async () => {
  const db = await freshDb();
  const first = fakeSource([makePage(['k1', 'k2'])]);
  const second = fakeSource([makePage(['k1', 'k2'])]);

  const r1 = await runIntake(db, { projectId: 'p', sourceId: 'jira', source: first, input: {} });
  const r2 = await runIntake(db, { projectId: 'p', sourceId: 'jira', source: second, input: {} });

  assert.deepEqual([r1.created, r1.updated], [2, 0]);
  assert.deepEqual([r2.created, r2.updated], [0, 2]);
  assert.equal(listTasks(db, 'p', {}).length, 2);
});

test('failure persists state=failed and keeps upserts up to that point', async () => {
  const db = await freshDb();
  let call = 0;
  const source: TaskSource = {
    id: 'jira',
    capabilities: new Set(['pull', 'pagination']),
    async fetch(): Promise<SourceResult> {
      if (call++ === 0) return makePage(['k1'], 'c1');
      throw new Error('kaboom secret-token-leaks');
    },
  };
  const r = await runIntake(db, {
    projectId: 'p',
    sourceId: 'jira',
    source,
    input: {},
    redactFn: (msg) => msg.replace('secret-token-leaks', '[redacted]'),
  });
  assert.equal(r.state, 'failed');
  assert.ok(r.error?.includes('kaboom'));
  assert.ok(!r.error?.includes('secret-token-leaks'));
  assert.ok(r.error?.includes('[redacted]'));
  assert.equal(listTasks(db, 'p', {}).length, 1);

  const row = getImport(db, r.importId);
  assert.equal(row?.state, 'failed');
  assert.ok(row?.error?.includes('[redacted]'));
});

test('budget caps pulled tasks: stops pagination once maxTasks is reached', async () => {
  const db = await freshDb();
  const source = fakeSource([
    makePage(['k1', 'k2'], 'c1'),
    makePage(['k3', 'k4'], 'c2'),
    makePage(['k5']),
  ]);
  const r = await runIntake(db, {
    projectId: 'p',
    sourceId: 'jira',
    source,
    input: {},
    budget: { maxTasks: 3, maxMs: 60_000 },
  });
  // After page 1 we have 2 tasks; after page 2 we have 4 (>=3) — stop.
  assert.equal(r.state, 'done');
  assert.equal(r.created, 4);
  assert.equal(r.pages, 2);
});

test('maxMs budget stops the loop even when nextCursor remains', async () => {
  const db = await freshDb();
  let call = 0;
  let now = 1_000_000;
  const source: TaskSource = {
    id: 'jira',
    capabilities: new Set(['pull', 'pagination']),
    async fetch(): Promise<SourceResult> {
      // Every page advances the clock by 400ms via the nowFn hook below.
      return call++ < 10 ? makePage([`k${call}`], 'c') : makePage([`k${call}`]);
    },
  };
  const r = await runIntake(db, {
    projectId: 'p',
    sourceId: 'jira',
    source,
    input: {},
    budget: { maxTasks: 1000, maxMs: 1000 },
    nowFn: () => {
      const d = new Date(now);
      now += 400;
      return d;
    },
  });
  // After 3 ticks (1000, 1400, 1800) the elapsed is 800ms < 1000; 4th tick
  // at 2200ms stops us with 3 pages pulled.
  assert.equal(r.state, 'done');
  assert.ok(r.pages >= 2 && r.pages <= 4, `expected 2–4 pages, got ${r.pages}`);
});

test('passes input.query through to the source', async () => {
  const db = await freshDb();
  let seenQuery: string | undefined;
  const source: TaskSource = {
    id: 'jira',
    capabilities: new Set(['pull']),
    async fetch(input) {
      seenQuery = input.query;
      return makePage(['k1']);
    },
  };
  await runIntake(db, {
    projectId: 'p',
    sourceId: 'jira',
    source,
    input: { query: 'project = KAN' },
  });
  assert.equal(seenQuery, 'project = KAN');
});

test('result.importId matches the recorded import row', async () => {
  const db = await freshDb();
  const r = await runIntake(db, {
    projectId: 'p',
    sourceId: 'jira',
    source: fakeSource([makePage(['k1'])]),
    input: {},
  });
  const row = getImport(db, r.importId);
  assert.ok(row);
  assert.equal(row.projectId, 'p');
  assert.equal(row.sourceId, 'jira');
});
