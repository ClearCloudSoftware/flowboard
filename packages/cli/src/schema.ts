/**
 * Lamproom's SQLite schema.
 *
 * Two tables: `tasks` (imported tickets) and `imports` (history of import
 * runs, counters, state). Everything else in Lamproom still lives in JSON
 * (projects.json, settings.json, flow YAMLs, runs/ folders).
 *
 * Primary key on tasks is `(project_id, source_id, import_key)` — matches
 * the port's acceptance test: re-importing is an upsert on that triple,
 * and so a GitHub `github-42` and a Jira `kan-42` coexist on the same
 * project without colliding.
 *
 * JSON columns (`labels`, `assignees`, `extras`, `acceptance`, `non_goals`,
 * `hint`) use Drizzle's `text({ mode: 'json' })` which serialises/deserialises
 * for us on write/read.
 *
 * See docs/superpowers/specs/2026-11-19-task-storage-and-intake-design.md.
 */

import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tasksTable = sqliteTable(
  'tasks',
  {
    projectId: text('project_id').notNull(),
    sourceId: text('source_id').notNull(),
    importKey: text('import_key').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    labels: text('labels', { mode: 'json' }).$type<string[]>().notNull().default([]),
    assignees: text('assignees', { mode: 'json' }).$type<string[]>().notNull().default([]),
    extras: text('extras', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    acceptance: text('acceptance', { mode: 'json' }).$type<string[]>().notNull().default([]),
    nonGoals: text('non_goals', { mode: 'json' }).$type<string[]>().notNull().default([]),
    hint: text('hint', { mode: 'json' }).$type<{ upstream?: string; titleSlug: string }>().notNull(),
    importedAt: text('imported_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.sourceId, t.importKey] }),
    index('tasks_by_project_updated').on(t.projectId, t.updatedAt),
    index('tasks_by_source').on(t.projectId, t.sourceId),
  ],
);

export const importsTable = sqliteTable(
  'imports',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sourceId: text('source_id').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    state: text('state', { enum: ['running', 'done', 'failed', 'cancelled'] }).notNull(),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    pages: integer('pages').notNull().default(0),
    error: text('error'),
  },
  (t) => [index('imports_by_project').on(t.projectId, t.startedAt)],
);

export type TaskRow = typeof tasksTable.$inferSelect;
export type NewTaskRow = typeof tasksTable.$inferInsert;
export type ImportRow = typeof importsTable.$inferSelect;
export type NewImportRow = typeof importsTable.$inferInsert;
export type ImportState = ImportRow['state'];
