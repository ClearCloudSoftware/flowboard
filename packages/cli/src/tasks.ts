/**
 * A project's tasks: the `tasks` table (`db.ts`). Imported tasks carry the `importKey` their source derived
 * (`keyTasks`); a re-import upserts on project + key, so importing the same backlog twice creates nothing new.
 */
import type { ParsedTask } from '@lamproom/core';
import { db } from './db.ts';
import type { Task as Row } from './generated/prisma/client.ts';

export type TaskStatus = 'backlog' | 'todo' | 'running' | 'blocked' | 'done' | 'failed' | 'cancelled';

/** A task as the pages see it. `importKey`: null on a task made by hand, so no import ever matches it. */
export interface Task {
  id: string;
  projectId: string;
  title: string;
  body: string | null;
  acceptanceCriteria: string[];
  nonGoals: string[];
  status: TaskStatus;
  importKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `skipped`: in the file and already past the backlog, so left as it is. */
export type UpsertCounts = { created: number; updated: number; skipped: number };

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const view = (r: Row): Task => ({
  ...r,
  acceptanceCriteria: strings(r.acceptanceCriteria),
  nonGoals: strings(r.nonGoals),
  status: r.status as TaskStatus,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** The project's tasks, in the order they were made. */
export async function readTasks(dataDir: string, projectId: string): Promise<Task[]> {
  const rows = await db(dataDir).task.findMany({ where: { projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map(view);
}

/**
 * Writes `parsed` into the project's tasks, in one transaction: a new key is a new task in the backlog; a known key
 * still in the backlog takes the file's title, body, criteria and non-goals; one already promoted or run is skipped,
 * since runs read its text. Tasks no longer in the file stay as they are.
 */
export function upsertTasks(dataDir: string, projectId: string, parsed: ParsedTask[]): Promise<UpsertCounts> {
  return db(dataDir).$transaction(async (tx) => {
    const counts: UpsertCounts = { created: 0, updated: 0, skipped: 0 };
    for (const p of parsed) {
      const fields = { title: p.title, body: p.body ?? null, acceptanceCriteria: p.acceptance_criteria ?? [], nonGoals: p.non_goals ?? [] };
      const t = await tx.task.findUnique({ where: { projectId_importKey: { projectId, importKey: p.import_key } }, select: { id: true, status: true } });
      if (!t) {
        await tx.task.create({ data: { projectId, importKey: p.import_key, status: 'backlog', ...fields } });
        counts.created++;
      } else if (t.status !== 'backlog') counts.skipped++;
      else {
        await tx.task.update({ where: { id: t.id }, data: fields });
        counts.updated++;
      }
    }
    return counts;
  });
}
