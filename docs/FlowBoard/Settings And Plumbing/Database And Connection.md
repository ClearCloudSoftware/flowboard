---
tags: [flowboard, settings-and-plumbing, plumbing, database]
module: Settings And Plumbing
---

# Database And Connection

FlowBoard keeps all durable state in one SQLite file, shared by two processes. Architecture #1 (`02` §1): *"keep it the *only* shared-state coupling."*

## Stack

| Choice | Source |
|---|---|
| *"**SQLite** via `better-sqlite3`, with **Drizzle ORM** and drizzle-kit migrations"* | PRD §2 |
| Schema in `packages/db`: *"Drizzle schema, migrations, the db singleton"* | PRD §3 |
| *"Write this as Drizzle schema. SQL shown for precision."* | PRD §5 |
| File: `data/flowboard.db` | PRD §3 layout; drawio *"SQLite data/flowboard.db (better-sqlite3 + Drizzle · WAL · busy_timeout 5 s)"* |

## Connection rules

| Rule | Why | Source |
|---|---|---|
| `PRAGMA journal_mode = WAL` | *"so concurrent readers and writers do not block each other"* | PRD §3 |
| `PRAGMA busy_timeout = 5000` | a writer waits up to 5 s for the lock instead of failing | PRD §3, `02` §1 |
| `foreign_keys = ON` | the schema's `ON DELETE CASCADE` only works with it | `02` §1, backlog 1.1 |
| One singleton per process, *"cached on `globalThis` for HMR"* | Next.js hot reload would otherwise open a new handle on every edit | backlog 1.1 (**FIX**) |
| One path for every process, from env | *"`VIBE_ROOT`/`VIBE_DB_PATH` env so worker and MCP (spawned with a foreign cwd) open the same file"* | backlog 1.1, `02` §1 |
| Migrator runs on first open | the schema is current before any query | backlog 1.1 |

```ts
// Shape implied by backlog 1.1 — illustrative, not from a source file
const g = globalThis as { __fbdb?: Database };
export const db = (g.__fbdb ??= open(process.env.VIBE_DB_PATH!)); // WAL, busy_timeout 5000, foreign_keys ON, migrate
```

## Who may open it

PRD §3: *"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does."* Sandboxed agents never see it: *"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* (PRD §11.1). The drawio mount list: *"never: ~/.ssh, cloud credentials, flowboard.db, docker.sock"*.

## The database as a queue and a bus

- **Queue.** The `jobs` table, leased with *"`UPDATE … WHERE id=(SELECT … LIMIT 1) RETURNING`"* inside a transaction (backlog 3.1). See [[Job Queue]].
- **Bus.** SSE endpoints tail `run_events` by `seq` and read questions and task state ([[Live Updates]]).
- **Memory.** The `local` memory adapter adds *"a `memories` table with an FTS5 index in the same `flowboard.db`"* (PRD §11.2).

## Tests

*"`pnpm test` = `tsx --test --test-concurrency=1` on a throwaway `VIBE_DB_PATH`; concurrency 1 because tests share one SQLite file."* — **FIX** (backlog 0.2). The drawio test lane names vitest instead. See [[Execution Testing]].

> [!warning] Which file name?
> PRD §3 and the drawio say `data/flowboard.db`. The backlog's header cites *"the live `data/vibe.db"`*, and its env vars are `VIBE_*`. `.gitignore` covers both (`data/*.db*`). See [[Settings And Plumbing Open Questions]] #19.

## Related

- [[Domain Schema]]
- [[Migrations]]
- [[Settings And Plumbing Storage]]
- [[Process Topology]]
- [[Environment And Configuration]]
