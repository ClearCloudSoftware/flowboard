---
tags: [flowboard, intake-and-import, data-model, schema]
module: Intake And Import
---

# Intake Data Model

The tables and types intake writes. Intake adds no table of its own: it writes `tasks` rows and `jobs` rows (PRD §5).

## `tasks`

From PRD §5, with what intake does to each column.

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id       TEXT REFERENCES flows(id),   -- null while in backlog, pinned on promotion
  title         TEXT NOT NULL,
  body          TEXT,
  acceptance_criteria TEXT,      -- the exact conditions that close the task; reviewed against
  non_goals     TEXT,            -- what the agents must not touch or attempt
  status        TEXT NOT NULL,   -- 'backlog'|'todo'|'running'|'blocked'|'done'|'failed'|'cancelled'
  import_key    TEXT,            -- stable key for idempotent md import
  branch_name   TEXT,
  worktree_path TEXT,
  capability_pins TEXT,          -- JSON {plugins:{id:commit_sha}, agents:{id:<agent row>}}, set when the task starts
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (project_id, import_key)
);
```

| Column | Create | Import | Promote |
|---|---|---|---|
| `title`, `body` | set by you | set; overwritten on re-import (`07`) | — |
| `acceptance_criteria`, `non_goals` | set by you | set by the agent path (PRD §15); not by the reference parser | — |
| `status` | `backlog` (*inferred*) | `backlog` (*inferred*) | → `todo` |
| `import_key` | null | the derived key | — |
| `flow_id` | null | null | pinned |
| `branch_name`, `worktree_path` | null | null | set (PRD §11) |
| `capability_pins` | null | null | *"set when the task starts"*; promote or Start is open |

The two *inferred* cells are [[Intake And Import Open Questions]] #6.

## `jobs`

```sql
CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- 'start_run'|'advance_task'|'escalate_question'|'import_backlog'
  payload    TEXT NOT NULL,
  run_after  INTEGER NOT NULL,
  state      TEXT NOT NULL,   -- 'queued'|'leased'|'done'|'failed'
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  leased_at  INTEGER,
  created_at INTEGER NOT NULL
);
```

An import is one `import_backlog` row. Backlog 7.3 adds a `cleanup` flag to its payload. No other payload field is given.

## Port types

From `docs/old/reference/core/ports/task-source.ts`:

| Type | Fields |
|---|---|
| `ParsedTask` | `import_key: string`, `title: string`, `body?: string` |
| `SourceInput` | `content?: string` (*"Inline content (browser paste / upload)"*), `path?: string` (*"Server-side file path"*) |
| `TaskSource` | `readonly id: string`, `fetch(input: SourceInput): Promise<ParsedTask[]>` |

The PRD's importer output adds `acceptance_criteria?` and `non_goals?` (PRD §15). The drawio *Harness architecture* card lists all five: *"{import_key, title, body, acceptance_criteria, non_goals}"*.

## Proposals

Not in any source; listed in [[Intake And Import Open Questions]].

| Proposal | Why |
|---|---|
| `ParsedTask` gains `acceptance_criteria?` and `non_goals?` | so the deterministic path carries what the agent path carries (#2) |
| `import_backlog` payload `{ projectId, path, cleanup }` | the route has no project in its path (#8, #9) |
| A result on the job, e.g. `{ created, updated, path: 'deterministic' \| 'agent' }` | *"6 created"* and *which path ran* need somewhere to live (#9) |

## Related

- [[Intake And Import Index]]
- [[Task Record]]
- [[Task Data Model]]
- [[Idempotent Upsert]]
- [[Job Queue]]
- [[Intake Storage]]
