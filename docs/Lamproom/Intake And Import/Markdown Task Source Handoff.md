---
tags: [lamproom, intake-and-import, handoff]
module: Intake And Import
---

# Markdown Task Source Handoff

The **Markdown backlog** task provider is built. The [[Backlog Importer Agent]] is the main path: it reads an existing backlog and maps each piece of work in it to a task as [[Task Record]] defines one. The [[Markdown Task Source]] parser is the fallback when the agent fails (backlog 7.3: *"fall back to the parser on any failure and **report which path ran**"*). Both go through the [[TaskSource Port]]'s key function and the [[Idempotent Upsert]]. Before this branch, *Settings → Connections → Task providers* listed it as *coming soon*, and nothing ran the `backlog-importer` internal step.

This note describes branch `feature/markdown-task-source` on 2026-11-17, cut from `dev` at `b4aaf76`. It is not merged or pushed. Leftovers are in [[Deferred Work#Markdown backlog import]].

## How it works

- **The port** (`packages/core/src/ports/task-source.ts`): `TaskSource.fetch(SourceInput) → ParsedTask[]`. `ParsedTask` is `{ import_key, title, body?, acceptance_criteria?, non_goals? }`. `keyTasks()` is the one place a key is derived: an explicit id if it is a valid key, else `slugify(title)`, else `task`. A repeated key gets `-2`, `-3` and so on. Every adapter's output goes through it.
- **The parser** (`packages/adapters/src/source/markdown.ts`): the reference `markdown-source.ts`, with two additions. A `###`/`####` heading named *Acceptance criteria*, *AC*, *Done when*, *Non-goals* or *Out of scope* fills that field on the task above it. It no longer becomes a task of its own. A front matter `id:` keys a file that has exactly one task.
- **The database** (`packages/cli/src/db.ts`, Alex's call 2026-11-17: *"sqlite for now, with prisma orm so we could change db later"*): SQLite at `<data>/lamproom.db`, through Prisma 7.10.1 with the `better-sqlite3` driver adapter. The schema is `packages/cli/prisma/schema.prisma`, with tables and columns named as in PRD §5 (`tasks`, `project_id`, `import_key`, …), plus `backlog_imports`. Projects, settings and memory are still JSON files, so `project_id` has no foreign key yet.
  - **Migrations:** `pnpm db:migrate --name <what>` writes one into `packages/cli/prisma/migrations/` (against a scratch `prisma/dev.db`). `db()` applies the ones a data folder's database hasn't had the first time it opens it, each in a transaction, recorded in `_lamproom_migrations`. So the app needs neither Prisma's CLI nor its schema engine at run time. That runner is SQLite-only, like the migration SQL itself.
  - **The client** is generated into `packages/cli/src/generated/prisma/` (git-ignored) by `pnpm install` (the package's `postinstall`) or `pnpm db:generate`. It is TypeScript that Node 24 runs directly.
- **The store** (`packages/cli/src/tasks.ts`): the `tasks` table, seen by the pages as `Task { id, projectId, title, body, acceptanceCriteria, nonGoals, status, importKey, createdAt, updatedAt }` (criteria and non-goals are JSON arrays). `upsertTasks()` runs in one transaction and matches on project + `importKey`:
  - a new key becomes a new task in `backlog`;
  - a known key whose task is still in `backlog` takes the file's title, body, criteria and non-goals;
  - a known key whose task is past `backlog` is counted as `skipped` and left alone.
- **The import** (`packages/cli/src/backlog-import.ts`): `importBacklog()` takes `{ content }` or `{ path }`, exactly one. A path must be a file in the project's repo (checked on its real path, so a symlink can't lead out), and at most 256 KB.
  - Every import starts the `backlog-importer` internal step as a run of the project, the way the repo analyst does, with the backlog's text as its task. Its agent CLI, model and budget come from *Settings → Internal steps*.
  - **The skill** (`internal/backlog-importer/SKILL.md`) maps each piece of work to the Task Record's fields: `title`, `body`, `acceptance_criteria`, `non_goals`, and `import_key` only when the backlog gives an explicit id. A grouping heading (an epic or category) is not a task, a story's sub-items go into its body, and finished items are left out. It never writes criteria or non-goals itself.
  - `agentImport()` is polled. Once the run ends, it reads the run's `tasks` artifact (from the first `[` to the last `]`), puts the tasks through `keyTasks` and the same upsert, and keeps the result in the `backlog_imports` row, so a second poll repeats the counts instead of importing again. The poll that moves the row from `running` to `applying` saves the tasks; one arriving at the same time is told it is still running.
  - **Fallback:** the parser reads the same text when the run can't start (the folder lock, the monthly cap), fails, pauses, is gone, or writes no task list that can be read. An empty list counts as a failure too. The result says `by: 'parser'` and why (`fallback`). If the parser finds no task either, the import fails.
- **Routes:**
  - `GET /api/projects/:id/tasks` lists the project's tasks.
  - `POST /api/projects/:id/tasks/import` returns `{ run }`, the importer reading the backlog, or `{ imported: { created, updated, skipped, by, fallback } }` when the run couldn't start and the parser read it.
  - `GET /api/projects/:id/tasks/import/:run` returns the import: running, done with the counts and which path ran, or failed with the reason.
  - All three are behind `refused()`, which allows localhost only and refuses cross-site writes.
- **Screens:**
  - The project page has a **Backlog** card that lists the tasks still in the backlog. Its **Import** dialog takes pasted text, a file picked from disk, or a path in the repo. It follows the importer's run, then shows *"3 created · 0 updated, read by the importer agent"*, or *"… read by the parser, because the importer agent failed"*.
  - *Task providers* in settings lists Markdown backlog as available.

## What was checked

- `pnpm test:packages`: 723 pass. The new tests are `adapters/test/markdown-source.test.ts`, `cli/test/backlog-import.test.ts` and `cli/test/db.test.ts`. They include the acceptance test (an import done twice gives 0 created and N updated) for the agent path, with a stand-in run output, and for the parser in each file shape, plus each fallback case, two polls at once, and the migration runner. Under the full run's load, one older test timed out each time (`opensandbox-relay.test.ts` once, `clone.test.ts`'s *a failed clone says why* once); both pass alone, on this branch and on `dev`.
- With SQLite, through `next dev` and `curl` with a temporary data folder whose importer was set to an OpenCode model that isn't approved: the first request created and migrated `lamproom.db`; the import fell back to the parser and said why; importing twice gave 2 created, then 0 created and 2 updated; `sqlite3` showed the rows.
- The earlier curl checks below were made with the JSON store, when the parser went first; the routes are unchanged.
- `pnpm test:app` passes. `tsc` passes for the packages and for the app. The new files lint clean; the other lint errors were already on `dev`.
- I drove the API with `next dev` and `curl`, with a temporary data folder:
  - The first import gave 3 created, the second 0 created and 3 updated.
  - A path in the repo imported.
  - `/etc/hosts` and a cross-site `Origin` were refused.
  - `/p/scratch` and `/settings/connections/tasks` returned 200.
- **Not checked:** the dialog was not used in a browser, and the agent path was not run with a real `claude`. It is tested with a fake `startRun` only.

## Decisions open to your review

| # | Decision | Why | If wrong |
|---|---|---|---|
| 1 | Routes sit under `/api/projects/:id/tasks/…`, not `POST /api/import/backlog` with a `projectId` in the body ([[Intake And Import Open Questions]] #8) | Every other project route has the id in its path | Add the PRD's route as an alias |
| 2 | There is no `jobs` table. The parser runs inside the request, and the agent path is a run that the page polls (#9) | The parser spawns nothing and takes milliseconds. Runs are the codebase's only background work | Move both into a job if a queue arrives |
| 3 | The agent reads every import, and the parser takes over on any failure (#3) | Alex, 2026-11-17: the importer is the main step, mapping an existing backlog to tasks. Backlog 7.3's fallback order. Every import costs one importer run (haiku, $0.25 budget by default) | — |
| 4 | Acceptance criteria and non-goals come from sub-section headings in the parser too, and are stored as lists (#2, #7) | So both paths carry the same fields | Change the heading names in `SUBSECTIONS` |
| 5 | Explicit ids are `{#slug}` per task, and front matter `id:` only in a one-task file (#1) | The proposal in #1 | — |
| 6 | Re-import updates only tasks still in `backlog`, overwriting all four text fields; tasks gone from the file stay (#5, #6) | Runs read a moving task's text | Archive or flag removed tasks |
| 7 | The agent's `import_key` is kept only if it appears word for word in the file; otherwise the key is the title's slug | The skill copies explicit ids such as `AUTH-12`; a key the agent invents is the drift bug | Ignore agent keys entirely |
| 8 | The agent's run is a run of the project: it uses the repo folder, counts against the monthly cap, takes the folder lock, and is allowed on a dirty tree | Same as the repo analyst | Run it outside the project |
| 9 | Backlog shows on the project page, not on a board (#24) | There is no board yet; the Kanban mockup is not reviewed | Move it to the board when there is one |

## Rulings made on your behalf

- A repeated explicit id `{#k}` gives `k` and then `k-2`. The reference gave `k` and then the second title's slug plus `-2`. Proposal #10, rejecting the file, was not taken.
- A title with nothing left to slug, such as `日本語`, gets the key `task` instead of an empty key.
- The skill leaves finished items out (a ticked `- [x]`, or anything under *Done* or *Shipped*), since every imported task starts in the backlog. The parser, as the fallback, still imports them.
- An agent output of `[]` falls back to the parser, rather than being read as a backlog with no tasks.
- An agent `import_key` such as `AUTH-12` is lowercased to `auth-12`. The parser's `{#…}` still accepts lowercase only, as in the reference, so `{#Upper}` stays in the title.

## Related

- [[Intake And Import Index]]
- [[Deferred Work#Markdown backlog import]]
- [[Intake And Import Open Questions]]
