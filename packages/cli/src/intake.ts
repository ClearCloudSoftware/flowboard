/**
 * runIntake — drain a TaskSource into SQLite storage.
 *
 * Owns the pagination loop. One `imports` row per call: 'running' at start,
 * 'done' on normal completion, 'failed' with a redacted error on any thrown
 * error from the source or the storage layer.
 *
 * Why it lives in @lamproom/cli (not in the API route): the loop is also
 * useful for a future `lr import` CLI subcommand, and the plumbing (storage,
 * timing, budget) has no HTTP in it. The route is a thin wrapper that reads
 * credentials, builds a TaskSource, kicks this off, returns the importId.
 *
 * The budget caps are soft lower bounds: the loop finishes the current page
 * before stopping, so `maxTasks` of 100 may land 110 if the last page has
 * 10. Rationale: the alternative — dropping already-fetched rows — spends
 * API quota we're not using. Keep what we pulled.
 *
 * See docs/superpowers/plans/2026-11-19-task-storage-and-intake.md Task 4.
 */

import type { SourceInput, SourceResult, TaskSource } from '@lamproom/core';
import type { LamproomDb } from './db.ts';
import {
  finishImport,
  recordImport,
  updateImportProgress,
  upsertTasks,
} from './storage.ts';

export interface IntakeBudget {
  /** Stop after we've processed at least this many tasks. Default 500. */
  maxTasks: number;
  /** Stop after this many wall-clock milliseconds. Default 5 minutes. */
  maxMs: number;
}

export interface RunIntakeOptions {
  projectId: string;
  sourceId: string;
  source: TaskSource;
  input: SourceInput;
  budget?: IntakeBudget;
  /** Clock. Tests override to walk through a budget deterministically. */
  nowFn?: () => Date;
  /** Error-message redactor. The route passes `(m) => redactJiraTokens(m, ...)`. */
  redactFn?: (message: string) => string;
}

export interface RunIntakeResult {
  importId: string;
  state: 'done' | 'failed';
  created: number;
  updated: number;
  skipped: number;
  pages: number;
  error?: string;
}

const DEFAULT_BUDGET: IntakeBudget = { maxTasks: 500, maxMs: 5 * 60 * 1000 };

export async function runIntake(db: LamproomDb, opts: RunIntakeOptions): Promise<RunIntakeResult> {
  const { importId, finished } = startIntake(db, opts);
  return finished;
}

/**
 * Same loop as `runIntake`, but returns the recorded importId synchronously
 * (before the first page is fetched) plus a promise for the eventual
 * RunIntakeResult. API routes use this to return the id immediately so the
 * UI can start polling.
 */
export function startIntake(
  db: LamproomDb,
  opts: RunIntakeOptions,
): { importId: string; finished: Promise<RunIntakeResult> } {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const nowFn = opts.nowFn ?? (() => new Date());
  const redactFn = opts.redactFn ?? ((m) => m);

  if (opts.source.fetch === undefined) {
    throw new Error(`runIntake: source '${opts.source.id}' has no fetch() method`);
  }

  const startedAt = nowFn();
  const importRow = recordImport(db, opts.projectId, opts.sourceId, startedAt);
  const finished = driveLoop(db, opts, importRow.id, startedAt, budget, nowFn, redactFn);
  return { importId: importRow.id, finished };
}

async function driveLoop(
  db: LamproomDb,
  opts: RunIntakeOptions,
  importId: string,
  startedAt: Date,
  budget: IntakeBudget,
  nowFn: () => Date,
  redactFn: (m: string) => string,
): Promise<RunIntakeResult> {

  let totalCreated = 0;
  let totalUpdated = 0;
  const totalSkipped = 0;
  let pages = 0;
  let cursor: string | undefined = opts.input.cursor;

  try {
    while (true) {
      // One clock read per iteration so a mocked nowFn advances predictably
      // and the test budget stays easy to reason about.
      const now = nowFn();
      if (now.getTime() - startedAt.getTime() >= budget.maxMs) break;

      const pageInput: SourceInput = { ...opts.input, ...(cursor !== undefined ? { cursor } : {}) };
      const result: SourceResult = await opts.source.fetch!(pageInput);
      pages++;

      const { created, updated } = upsertTasks(
        db,
        opts.projectId,
        opts.sourceId,
        result.tasks,
        now,
      );
      totalCreated += created;
      totalUpdated += updated;
      updateImportProgress(db, importId, { created, updated, pages: 1 });

      if (result.nextCursor === undefined) break;
      if (totalCreated + totalUpdated >= budget.maxTasks) break;
      cursor = result.nextCursor;
    }

    finishImport(db, importId, 'done');
    return {
      importId,
      state: 'done',
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
      pages,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const redacted = redactFn(message);
    finishImport(db, importId, 'failed', { error: redacted });
    return {
      importId,
      state: 'failed',
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
      pages,
      error: redacted,
    };
  }
}
