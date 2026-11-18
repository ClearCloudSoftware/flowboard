/**
 * The task + import storage module.
 *
 * Only this module calls `.insert()` / `.select()` / `.update()` / `.delete()`
 * against the tasks and imports tables. API routes and the intake service
 * call these functions; no SQL leaks past this seam.
 *
 * Every mutation respects the trust-boundary rule from the TaskSource spec:
 * ParsedTask content is data, never instructions. Errors passed to
 * `finishImport({ error })` are expected to be already redacted — callers
 * run tokens through `redactJiraTokens` before passing the message in.
 *
 * See docs/superpowers/plans/2026-11-19-task-storage-and-intake.md Task 3.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ParsedTask } from '@lamproom/core';
import type { LamproomDb } from './db.ts';
import {
  importsTable,
  tasksTable,
  type ImportRow,
  type ImportState,
  type TaskRow,
} from './schema.ts';

export { openDb, type LamproomDb } from './db.ts';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function upsertTask(
  db: LamproomDb,
  projectId: string,
  sourceId: string,
  task: ParsedTask,
  now: Date,
): 'created' | 'updated' {
  assertImportKey(task.importKey);
  const nowIso = now.toISOString();
  const existing = getTask(db, projectId, sourceId, task.importKey);
  if (existing === undefined) {
    db.insert(tasksTable)
      .values({
        projectId,
        sourceId,
        importKey: task.importKey,
        title: task.title,
        body: task.body ?? null,
        labels: task.labels ?? [],
        assignees: task.assignees ?? [],
        extras: task.extras ?? {},
        acceptance: task.acceptanceCriteria ?? [],
        nonGoals: task.nonGoals ?? [],
        hint: task._hint,
        importedAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    return 'created';
  }
  db.update(tasksTable)
    .set({
      title: task.title,
      body: task.body ?? null,
      labels: task.labels ?? [],
      assignees: task.assignees ?? [],
      extras: task.extras ?? {},
      acceptance: task.acceptanceCriteria ?? [],
      nonGoals: task.nonGoals ?? [],
      hint: task._hint,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.sourceId, sourceId),
        eq(tasksTable.importKey, task.importKey),
      ),
    )
    .run();
  return 'updated';
}

export function upsertTasks(
  db: LamproomDb,
  projectId: string,
  sourceId: string,
  tasks: ParsedTask[],
  now: Date,
): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  db.transaction((tx) => {
    for (const task of tasks) {
      const result = upsertTask(tx, projectId, sourceId, task, now);
      if (result === 'created') created++;
      else updated++;
    }
  });
  return { created, updated };
}

export interface ListTasksOptions {
  sourceId?: string;
  limit?: number;
  offset?: number;
}

export function listTasks(db: LamproomDb, projectId: string, opts: ListTasksOptions): TaskRow[] {
  const q = db
    .select()
    .from(tasksTable)
    .where(
      opts.sourceId !== undefined
        ? and(eq(tasksTable.projectId, projectId), eq(tasksTable.sourceId, opts.sourceId))
        : eq(tasksTable.projectId, projectId),
    )
    .orderBy(desc(tasksTable.updatedAt))
    .$dynamic();
  if (opts.limit !== undefined) q.limit(opts.limit);
  if (opts.offset !== undefined) q.offset(opts.offset);
  return q.all();
}

export function getTask(
  db: LamproomDb,
  projectId: string,
  sourceId: string,
  importKey: string,
): TaskRow | undefined {
  return db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.sourceId, sourceId),
        eq(tasksTable.importKey, importKey),
      ),
    )
    .get();
}

export function deleteTasks(db: LamproomDb, projectId: string, sourceId: string): number {
  const rows = db
    .delete(tasksTable)
    .where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.sourceId, sourceId)))
    .run();
  return rows.changes;
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export function recordImport(
  db: LamproomDb,
  projectId: string,
  sourceId: string,
  startedAt: Date,
): ImportRow {
  const id = randomUUID();
  db.insert(importsTable)
    .values({
      id,
      projectId,
      sourceId,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      state: 'running',
      created: 0,
      updated: 0,
      skipped: 0,
      pages: 0,
      error: null,
    })
    .run();
  const row = getImport(db, id);
  if (row === undefined) throw new Error('recordImport: failed to read back the row just written');
  return row;
}

export interface ImportDelta {
  created?: number;
  updated?: number;
  skipped?: number;
  pages?: number;
}

export function updateImportProgress(db: LamproomDb, id: string, delta: ImportDelta): void {
  db.update(importsTable)
    .set({
      created: sql`${importsTable.created} + ${delta.created ?? 0}`,
      updated: sql`${importsTable.updated} + ${delta.updated ?? 0}`,
      skipped: sql`${importsTable.skipped} + ${delta.skipped ?? 0}`,
      pages: sql`${importsTable.pages} + ${delta.pages ?? 0}`,
    })
    .where(eq(importsTable.id, id))
    .run();
}

export function finishImport(
  db: LamproomDb,
  id: string,
  state: Exclude<ImportState, 'running'>,
  opts: { error?: string } = {},
): void {
  db.update(importsTable)
    .set({
      state,
      endedAt: new Date().toISOString(),
      error: opts.error ?? null,
    })
    .where(eq(importsTable.id, id))
    .run();
}

export function getImport(db: LamproomDb, id: string): ImportRow | undefined {
  return db.select().from(importsTable).where(eq(importsTable.id, id)).get();
}

export function findRunningImport(
  db: LamproomDb,
  projectId: string,
  sourceId: string,
): ImportRow | undefined {
  return db
    .select()
    .from(importsTable)
    .where(
      and(
        eq(importsTable.projectId, projectId),
        eq(importsTable.sourceId, sourceId),
        eq(importsTable.state, 'running'),
      ),
    )
    .get();
}

export function listImports(
  db: LamproomDb,
  projectId: string,
  opts: { limit?: number } = {},
): ImportRow[] {
  const q = db
    .select()
    .from(importsTable)
    .where(eq(importsTable.projectId, projectId))
    .orderBy(desc(importsTable.startedAt))
    .$dynamic();
  if (opts.limit !== undefined) q.limit(opts.limit);
  return q.all();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertImportKey(key: string): void {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('upsert: importKey must be a non-empty, non-whitespace string');
  }
  if (/\s/.test(key)) {
    throw new Error(`upsert: importKey must not contain whitespace (got '${key}')`);
  }
}
