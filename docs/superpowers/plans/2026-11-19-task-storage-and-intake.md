# Task storage and intake — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Lamproom's first SQLite table (`tasks`), the idempotent upsert that lands a `ParsedTask[]` into it, the import history (`imports`), four API routes that drive the flow from the UI, and an "Import from Jira" button on the project detail page.

**Architecture:** SQLite via Drizzle ORM lives in `@lamproom/cli`. One file: `lamproom.db` under the data directory. The schema is TypeScript (`schema.ts`), migrations are SQL (`drizzle/<ts>_<name>.sql`), the DB singleton (`db.ts`) opens it with WAL + busy_timeout + FKs on. `storage.ts` is the only module that calls `.select()`/`.insert()`/`.update()`; API routes use it. `intake.ts` wraps the pagination loop. `@lamproom/adapters` is untouched — it still returns `ParsedTask[]` and the port's `SourceResult`; adapters remain unaware of SQL.

**Tech Stack:** TypeScript 5.9 run by Node 24 (no build step), `node:test`, `better-sqlite3@12.3.0`, `drizzle-orm@0.44.5`, `drizzle-kit@0.31.5` (devDep).

**Spec:** `docs/superpowers/specs/2026-11-19-task-storage-and-intake-design.md`. Trust-boundary carry-forward from `docs/superpowers/specs/2026-11-14-task-source-port-design.md` §Trust boundary.

## Global Constraints

- Work on branch `feature/task-storage-intake`, already branched from `feature/task-source-jira-mcp` and pushed.
- All commands from the repo root.
- Node 24, no build step; erasable TypeScript only; `import type` + `.ts` relative imports.
- `@lamproom/core` stays zero-dep.
- SQLite file path respects `LAMPROOM_DATA_DIR`; defaults to `data/lamproom.db` relative to the app cwd.
- Every API route uses `refused()` from `app/api/flows/local.ts` to gate on localhost + same-origin.
- Imports are in-process; a hard 5-minute wall clock stops a runaway. No background queue in this plan.
- Nothing in `@lamproom/adapters` imports anything SQL-shaped. The dependency rule stays: adapters produce `SourceResult`, intake consumes it, adapters never see storage.
- Out of scope for this plan: incremental sync (`?since=`), write-back to Jira/GitHub, FTS5 search, the board UI (plan 2), the agent-brief step (plan 3), CLI subcommand for import, token encryption.

## Port decisions this plan makes

| Decision | Why |
|---|---|
| `tasks` PK = `(project_id, source_id, import_key)` | Matches `deriveImportKey`'s per-source contract; a GitHub `github-42` and a Jira `kan-42` coexist without colliding |
| `tasks.body` is nullable | `SourceResult` already models "no body" as `undefined`; nullable in SQL preserves that distinction |
| `labels`, `assignees`, `extras`, `acceptance`, `non_goals`, `hint` stored as JSON strings | SQLite has no array type; `JSON1` is built in; `drizzle-orm` reads/writes JSON strings via a column transformer |
| `imports.state` enum: `running | done | failed | cancelled` | Mirrors the lifecycle the UI renders — a user can read every state |
| Second concurrent import for the same `(project, source)` returns the running one's id | Simplest sound behaviour: dedupe at kickoff instead of reconciling later |
| Hard 5-minute cap, soft 500-task budget per import | A runaway Rovo loop can't eat a demo; a "just preview" import doesn't become a day-long sync |
| Imports never store credentials or tokens; `imports.error` may include a Jira error message but token strings run through `redactJiraTokens` first | Trust-boundary carry-forward from the TaskSource plan |

## Review Focus

Five tests that would catch the hardest bugs. Named in the task list below.

1. **Idempotent re-import.** Two imports of the same JQL on the same project → `imports[0].created = N, imports[1].created = 0, imports[1].updated = N`. Table has exactly N rows for that (project, source). Test: Task 3, `upsertTask is idempotent on (project_id, source_id, import_key)`.
2. **Concurrent import dedup.** Two `POST /api/import/jira?project=X` requests fire in parallel; the second returns the same `importId`. No two `imports` rows have `state = 'running'` for the same (project, source). Test: Task 5, `concurrent start returns the running import id`.
3. **Progress visible mid-run.** During a 100-task import, `GET /api/imports/<id>` returns `{ state: 'running', created, updated, pages }` with increasing counters. Test: Task 5, `progress is visible during pagination`.
4. **Failure is loud.** A mocked adapter throws mid-second-page; `imports[id]` ends in `state: 'failed'` with the (redacted) error; already-upserted tasks remain. Test: Task 5, `failure state is persisted and error is redacted`.
5. **Delete-tasks keeps import history.** `DELETE /api/projects/<id>/tasks?source=jira` empties `tasks` for that pair but leaves `imports` rows intact. Test: Task 5, `delete clears tasks without clearing imports`.

---

### Task 1: Install Drizzle + better-sqlite3

**Files:**
- Modify: `packages/cli/package.json` (add deps)
- Modify: `drizzle.config.ts` (create)

**Interfaces:**
- Produces: a `drizzle.config.ts` pointing at `packages/cli/src/schema.ts` as the source; `packages/cli/drizzle/` as the output.

- [ ] **Step 1: Add deps**

```bash
cd packages/cli
pnpm add better-sqlite3@12.3.0 drizzle-orm@0.44.5
pnpm add -D drizzle-kit@0.31.5 @types/better-sqlite3
```

- [ ] **Step 2: Create drizzle.config.ts**

At `drizzle.config.ts`:
```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './packages/cli/src/schema.ts',
  out: './packages/cli/drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: 'file:data/lamproom.db' },
  strict: true,
  verbose: true,
} satisfies Config;
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(deps): drizzle-orm + better-sqlite3 for SQLite storage"
```

---

### Task 2: Schema + first migration

**Files:**
- Create: `packages/cli/src/schema.ts`
- Create: `packages/cli/drizzle/0000_initial.sql` (generated via `pnpm exec drizzle-kit generate`)
- Create: `packages/cli/drizzle/meta/_journal.json` (auto)

**Interfaces:**
- Produces:
  - `tasksTable` and `importsTable` in `schema.ts` (Drizzle table definitions).
  - Types: `TaskRow`, `ImportRow` via `$inferSelect`/`$inferInsert`.

- [ ] **Step 1: Author schema.ts**

Match the spec's SQL. JSON columns use Drizzle's `text({ mode: 'json' })` where appropriate. Example shape:

```ts
import { index, primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasksTable = sqliteTable('tasks', {
  projectId: text('project_id').notNull(),
  sourceId:  text('source_id').notNull(),
  importKey: text('import_key').notNull(),
  title:     text('title').notNull(),
  body:      text('body'),
  labels:    text('labels', { mode: 'json' }).$type<string[]>().notNull().default([]),
  assignees: text('assignees', { mode: 'json' }).$type<string[]>().notNull().default([]),
  extras:    text('extras', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  acceptance:text('acceptance', { mode: 'json' }).$type<string[]>().notNull().default([]),
  nonGoals:  text('non_goals', { mode: 'json' }).$type<string[]>().notNull().default([]),
  hint:      text('hint', { mode: 'json' }).$type<{ upstream?: string; titleSlug: string }>().notNull(),
  importedAt:text('imported_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.sourceId, t.importKey] }),
  index('tasks_by_project_updated').on(t.projectId, t.updatedAt),
  index('tasks_by_source').on(t.projectId, t.sourceId),
]);

export const importsTable = sqliteTable('imports', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceId:  text('source_id').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt:   text('ended_at'),
  state:     text('state', { enum: ['running', 'done', 'failed', 'cancelled'] }).notNull(),
  created:   integer('created').notNull().default(0),
  updated:   integer('updated').notNull().default(0),
  skipped:   integer('skipped').notNull().default(0),
  pages:     integer('pages').notNull().default(0),
  error:     text('error'),
}, (t) => [index('imports_by_project').on(t.projectId, t.startedAt)]);

export type TaskRow   = typeof tasksTable.$inferSelect;
export type NewTaskRow = typeof tasksTable.$inferInsert;
export type ImportRow = typeof importsTable.$inferSelect;
```

- [ ] **Step 2: Generate migration**

```bash
cd the repo root
pnpm exec drizzle-kit generate
```

Expected: a `packages/cli/drizzle/0000_<name>.sql` file.

- [ ] **Step 3: Commit**

```bash
git add drizzle.config.ts packages/cli/src/schema.ts packages/cli/drizzle
git commit -m "feat(cli): tasks + imports schema (Drizzle)"
```

---

### Task 3: DB singleton + storage module

**Files:**
- Create: `packages/cli/src/db.ts`
- Create: `packages/cli/src/storage.ts`
- Test: `packages/cli/test/storage.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path?: string): LamproomDb` — opens with WAL/busy_timeout/FKs ON; runs any pending migrations; cached per `path`.
  - `upsertTask(db, projectId, sourceId, task: ParsedTask, now: Date): 'created' | 'updated'`
  - `upsertTasks(db, projectId, sourceId, tasks: ParsedTask[], now: Date): { created: number; updated: number }`
  - `listTasks(db, projectId, opts: { sourceId?: string; limit?: number; offset?: number }): TaskRow[]`
  - `getTask(db, projectId, sourceId, importKey): TaskRow | undefined`
  - `deleteTasks(db, projectId, sourceId): number` (returns rows deleted)
  - `recordImport(db, projectId, sourceId, startedAt): ImportRow`
  - `findRunningImport(db, projectId, sourceId): ImportRow | undefined`
  - `updateImportProgress(db, id, delta: { created?: number; updated?: number; skipped?: number; pages?: number }): void`
  - `finishImport(db, id, state: 'done' | 'failed' | 'cancelled', opts?: { error?: string }): void`
  - `getImport(db, id): ImportRow | undefined`

- [ ] **Step 1: Write failing storage test**

```ts
// packages/cli/test/storage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParsedTask } from '@lamproom/core';
import {
  deleteTasks, finishImport, getImport, getTask, listTasks, openDb,
  recordImport, updateImportProgress, upsertTask, upsertTasks, findRunningImport,
} from '../src/storage.ts';

function task(importKey: string, title: string, overrides: Partial<ParsedTask> = {}): ParsedTask {
  return { importKey, title, _hint: { titleSlug: importKey }, ...overrides };
}

test('upsertTask is idempotent on (project_id, source_id, import_key) (Review Focus #1)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const now = new Date('2026-11-19T10:00:00Z');
  const t = task('kan-1', 'Original');

  const r1 = upsertTask(db, 'p', 'jira', t, now);
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

test('upsertTasks returns summed counts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const now = new Date();
  const r1 = upsertTasks(db, 'p', 'jira', [task('k1', 'A'), task('k2', 'B')], now);
  assert.deepEqual(r1, { created: 2, updated: 0 });
  const r2 = upsertTasks(db, 'p', 'jira', [task('k1', 'A-new'), task('k3', 'C')], now);
  assert.deepEqual(r2, { created: 1, updated: 1 });
});

test('listTasks filters by sourceId and paginates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const now = new Date();
  upsertTasks(db, 'p', 'jira', [task('j1', 'J1'), task('j2', 'J2')], now);
  upsertTasks(db, 'p', 'github', [task('g1', 'G1')], now);
  assert.equal(listTasks(db, 'p', {}).length, 3);
  assert.equal(listTasks(db, 'p', { sourceId: 'jira' }).length, 2);
  assert.equal(listTasks(db, 'p', { sourceId: 'github' }).length, 1);
  assert.equal(listTasks(db, 'p', { limit: 1 }).length, 1);
});

test('deleteTasks clears a (project, source) pair but not others', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const now = new Date();
  upsertTasks(db, 'p', 'jira', [task('j1', 'J1'), task('j2', 'J2')], now);
  upsertTasks(db, 'p', 'github', [task('g1', 'G1')], now);
  const deleted = deleteTasks(db, 'p', 'jira');
  assert.equal(deleted, 2);
  assert.equal(listTasks(db, 'p', {}).length, 1);
  assert.equal(listTasks(db, 'p', { sourceId: 'github' })[0]?.title, 'G1');
});

test('recordImport and updateImportProgress tally counts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const row = recordImport(db, 'p', 'jira', new Date('2026-11-19T10:00:00Z'));
  assert.equal(row.state, 'running');
  updateImportProgress(db, row.id, { created: 3, updated: 1, pages: 1 });
  updateImportProgress(db, row.id, { created: 2, pages: 1 });
  const after = getImport(db, row.id);
  assert.equal(after?.created, 5);
  assert.equal(after?.updated, 1);
  assert.equal(after?.pages, 2);
});

test('finishImport sets the ended_at and state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const row = recordImport(db, 'p', 'jira', new Date('2026-11-19T10:00:00Z'));
  finishImport(db, row.id, 'done');
  const after = getImport(db, row.id);
  assert.equal(after?.state, 'done');
  assert.notEqual(after?.endedAt, null);
});

test('findRunningImport returns the single running row for a (project, source) pair', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const r1 = recordImport(db, 'p', 'jira', new Date());
  assert.equal(findRunningImport(db, 'p', 'jira')?.id, r1.id);
  finishImport(db, r1.id, 'done');
  assert.equal(findRunningImport(db, 'p', 'jira'), undefined);
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

`db.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const cache = new Map<string, ReturnType<typeof drizzle>>();

export type LamproomDb = ReturnType<typeof drizzle>;

export function openDb(path: string): LamproomDb {
  const abs = resolve(path);
  const hit = cache.get(abs);
  if (hit !== undefined) return hit;
  mkdirSync(dirname(abs), { recursive: true });
  const raw = new Database(abs);
  raw.pragma('journal_mode = WAL');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw);
  migrate(db, { migrationsFolder: resolve(__dirname, '..', 'drizzle') });
  cache.set(abs, db);
  return db;
}
```

(Workspace note: `__dirname` works only in CJS; for ESM, use `fileURLToPath(new URL('..', import.meta.url))`. Resolve during implementation.)

`storage.ts`: thin Drizzle calls per the interfaces above. Use `db.transaction()` around `upsertTasks` to make the create/update counts atomic. Compute counts by pre-reading which `(projectId, sourceId, importKey)` rows exist.

- [ ] **Step 4: Run → pass; typecheck**

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/db.ts packages/cli/src/storage.ts packages/cli/test/storage.test.ts
git commit -m "feat(cli): openDb and tasks + imports storage module"
```

---

### Task 4: Intake service (pagination loop)

**Files:**
- Create: `packages/cli/src/intake.ts`
- Test: `packages/cli/test/intake.test.ts`

**Interfaces:**
- Produces:
  - `runIntake(db, opts: { projectId: string; sourceId: string; source: TaskSource; input: SourceInput; budget?: { maxTasks: number; maxMs: number }; nowFn?: () => Date; redactFn?: (msg: string) => string }): Promise<{ importId: string; state: 'done' | 'failed'; created: number; updated: number; skipped: number; pages: number; error?: string }>`

- [ ] **Step 1: Write failing test**

```ts
// packages/cli/test/intake.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TaskSource, SourceInput, SourceResult } from '@lamproom/core';
import { openDb } from '../src/db.ts';
import { runIntake } from '../src/intake.ts';
import { getImport, listTasks } from '../src/storage.ts';

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

function makePage(keys: string[], next?: string): SourceResult {
  return {
    tasks: keys.map((k) => ({ importKey: k, title: k, _hint: { titleSlug: k } })),
    usage: { requests: 1 },
    ...(next !== undefined ? { nextCursor: next } : {}),
  };
}

test('drains all pages, upserts each task, sets state=done', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const source = fakeSource([makePage(['k1', 'k2'], 'c1'), makePage(['k3'])]);
  const r = await runIntake(db, { projectId: 'p', sourceId: 'jira', source, input: {} });
  assert.equal(r.state, 'done');
  assert.equal(r.created, 3);
  assert.equal(r.updated, 0);
  assert.equal(r.pages, 2);
  assert.equal(listTasks(db, 'p', {}).length, 3);
  const row = getImport(db, r.importId);
  assert.equal(row?.state, 'done');
});

test('re-running is idempotent: updates existing (Review Focus #1 extended)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const first = fakeSource([makePage(['k1', 'k2'])]);
  const second = fakeSource([makePage(['k1', 'k2'])]);
  const r1 = await runIntake(db, { projectId: 'p', sourceId: 'jira', source: first, input: {} });
  const r2 = await runIntake(db, { projectId: 'p', sourceId: 'jira', source: second, input: {} });
  assert.deepEqual([r1.created, r1.updated], [2, 0]);
  assert.deepEqual([r2.created, r2.updated], [0, 2]);
  assert.equal(listTasks(db, 'p', {}).length, 2);
});

test('failure persists state=failed and keeps upserts up to that point', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const source: TaskSource = {
    id: 'jira',
    capabilities: new Set(['pull']),
    async fetch() {
      // first call works, second blows up
      if (listTasks(db, 'p', {}).length === 0) return makePage(['k1'], 'c1');
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
  assert.equal(r.error?.includes('kaboom'), true);
  assert.equal(r.error?.includes('secret-token-leaks'), false);
  assert.equal(listTasks(db, 'p', {}).length, 1);
});

test('budget caps the number of tasks pulled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lr-'));
  const db = openDb(join(dir, 'test.db'));
  const source = fakeSource([makePage(['k1', 'k2'], 'c1'), makePage(['k3', 'k4'], 'c2'), makePage(['k5'])]);
  const r = await runIntake(db, { projectId: 'p', sourceId: 'jira', source, input: {}, budget: { maxTasks: 3, maxMs: 60000 } });
  assert.equal(r.state, 'done');
  assert.equal(r.created, 4);  // 2 + next page of 2 lands before we stop
  assert.equal(r.pages, 2);
});
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement**

Pseudocode:
```
startedAt = nowFn()
importRow = recordImport(db, projectId, sourceId, startedAt)
try:
  cursor = input.cursor
  totalCreated = totalUpdated = totalSkipped = pages = 0
  while true:
    if elapsed > maxMs: break
    result = await source.fetch({ ...input, cursor })
    pages++
    const { created, updated } = upsertTasks(db, projectId, sourceId, result.tasks, nowFn())
    totalCreated += created; totalUpdated += updated
    updateImportProgress(db, importRow.id, { created, updated, pages: 1 })
    if result.nextCursor === undefined: break
    if totalCreated + totalUpdated >= maxTasks: break
    cursor = result.nextCursor
  finishImport(db, importRow.id, 'done')
  return { importId, state: 'done', ... }
catch (err):
  const msg = redactFn(err.message)
  finishImport(db, importRow.id, 'failed', { error: msg })
  return { importId, state: 'failed', error: msg, ... }
```

- [ ] **Step 4: Run → pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(cli): runIntake drains a TaskSource into SQLite storage"
```

---

### Task 5: API routes + concurrency guard

**Files:**
- Create: `app/api/import/jira/route.ts`
- Create: `app/api/imports/[id]/route.ts`
- Create: `app/api/projects/[id]/tasks/route.ts`
- Modify: `app/api/jira/local.ts` (add a running-imports Map shared across routes)
- Test: `app/api/import/jira/local.test.ts`

**Interfaces:**
- `POST /api/import/jira?project=<slug>` →
  - `{ importId }` when kicked off or a running import is reused
  - `{ error }` with 400/401 for bad input / missing credentials
- `GET /api/imports/<id>` → full `ImportRow` as JSON
- `GET /api/projects/<id>/tasks?source=<id>&limit=<n>&offset=<n>` → `{ tasks: TaskRow[]; total: number }`
- `DELETE /api/projects/<id>/tasks?source=<id>` → `{ deleted: number }`

- [ ] **Step 1: Write failing route-handler tests**

Each test constructs a `Request` and calls the exported handler. The import handler is tested with a fake `TaskSource` injection (route accepts an internal hook used in tests).

Named tests from the Review Focus:
- `concurrent start returns the running import id` — spawn two POSTs in parallel; inspect that they return the same id.
- `progress is visible during pagination` — kick off a slow fake source, poll `GET /api/imports/<id>` and assert monotonically increasing counters.
- `failure state is persisted and error is redacted` — throw with a token in the message.
- `delete clears tasks without clearing imports` — upsert, delete, then show that the `imports` row for the previous import is still readable.

- [ ] **Step 2–4: Implement**

Key bits:
- `app/api/jira/local.ts` adds a module-scope `runningImports: Map<string, string>` keyed by `${projectId}:${sourceId}` → `importId`. Add on start, remove on finish. This is the dedup gate.
- The POST handler resolves the Jira credential via the same path as the preview route (reusing the `buildTransport` helper exported from `app/api/jira/preview/route.ts` — or extracting it into a shared `app/api/jira/_lib.ts` module in this task). Then calls `runIntake` without awaiting the full completion; returns `{ importId }` immediately; the loop keeps writing to the DB in the background.
- Progress is read directly from the DB, not from in-memory state. The UI polls `/api/imports/<id>`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): /api/import/jira + /api/imports/[id] + /api/projects/[id]/tasks"
```

---

### Task 6: Import button on the project page

**Files:**
- Modify: `app/p/[slug]/project.tsx` (or equivalent project detail client component) — add the button
- Create: `app/p/[slug]/ImportJiraButton.tsx` (client component with progress toast)

**Interfaces:**
- Button labelled **"Import from Jira"**; disabled when no Jira credential configured; hover text explaining.
- On click: POST `/api/import/jira?project=<slug>`, store returned `importId` in local state, open a toast.
- Toast polls `GET /api/imports/<id>` every 1.5s. Shows `created / updated / pages`. On `done` → "Imported N tasks" + link to the (not-built-yet) `/p/<slug>/tasks` route. On `failed` → red toast with error.

- [ ] **Step 1: Build the button + toast**

Use TanStack Query's `useMutation` to kick off, then `useQuery` with `refetchInterval` to poll. Stop polling when `state !== 'running'`.

- [ ] **Step 2–3: Wire in**

Add to the project detail screen near where other actions live.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): 'Import from Jira' button with progress toast on the project page"
```

---

### Task 7: Live round-trip + operator guide

**Files:**
- Create: `packages/cli/test/intake-live.test.ts` (skip unless `LAMPROOM_LIVE=1` + a prepared DB/project)
- Modify: `README.task-sources.md` — add "Importing tasks" section
- Modify: `docs/Lamproom/Intake And Import/Intake And Import Open Questions.md` — mark relevant OQs resolved

- [ ] **Step 1: Write live test**

Use the same env-file resolver and real Jira; run `runIntake` end-to-end against a demo project; assert row counts.

- [ ] **Step 2: Update operator guide**

Short section with the three HTTP endpoints, the "Import from Jira" button screenshot pointer, and the lifecycle.

- [ ] **Step 3: Vault update**

Add 2026-11-19 banner to `Intake And Import Open Questions.md` noting that:
- #5 (what happens to removed tasks on re-import) — **still open** v1 keeps them; a follow-up adds a `missingMode` option
- #6 (initial status) — **resolved** rows always go in `status='backlog'` style via `extras`, no separate column
- #9 (where progress lives) — **resolved** in `imports` table with `state + counters`

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(task-storage): live test, operator guide, vault decisions"
```

---

## When done

- [ ] `pnpm typecheck:packages` clean.
- [ ] `node --test packages/*/test/*.test.ts` — every new test passes.
- [ ] `grep -r 'process.env.ATLASSIAN_CLIENT_SECRET' packages/` returns nothing (it's a route concern, not an adapter one).
- [ ] From the UI: Click **Import from Jira** on a project with Jira configured → toast shows progress → ends in "Imported N tasks". Re-click → ends in "0 created, N updated".
- [ ] Open a PR against `dev` (when ready; the user has asked us not to push yet).

## What this plan does **not** finish

- **Board view** at `/p/[slug]/tasks` — Plan 2.
- **Agent brief** step kind — Plan 3.
- Incremental sync via `?since=`.
- CLI `lr import` subcommand.
- Writes back to Jira / GitHub.
- OS-keychain storage of OAuth refresh tokens.
- FTS5 search over tasks.
