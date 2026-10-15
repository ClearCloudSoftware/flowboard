---
tags: [flowboard, flow-design, data-model]
module: Flow Design
---

# Flow Data Model

Three layers exist in the sources: the **v1 PRD schema**, the **architecture's changes**, and the **record shape the mockup implies**. They are not yet reconciled.

## v1 PRD schema (SQLite)

```sql
CREATE TABLE flows (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE (project_id, name, version)
);

CREATE TABLE step_defs (
  id             TEXT PRIMARY KEY,
  flow_id        TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,          -- stable slug, e.g. "code_review"
  name           TEXT NOT NULL,          -- column header, e.g. "Code review"
  kind           TEXT NOT NULL,          -- 'skill' | 'agent' | 'shell' | 'manual'
  command        TEXT,                   -- kind='shell' only; null = the project's check_command
  skill_id       TEXT REFERENCES skills(id),
  agent_id       TEXT REFERENCES agents(id),
  prompt_template TEXT,                  -- appended to the invocation, supports {{placeholders}}
  model          TEXT NOT NULL DEFAULT 'sonnet',   -- passed to --model
  effort         TEXT NOT NULL DEFAULT 'medium',   -- low|medium|high|xhigh|max
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  allowed_tools  TEXT,                   -- JSON array, null = unrestricted
  max_turns      INTEGER,
  max_budget_usd REAL,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  advance_mode   TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'approval'
  requires       TEXT NOT NULL DEFAULT '[]',    -- JSON array of artifact type keys
  produces       TEXT NOT NULL DEFAULT '[]',    -- JSON array of artifact type keys
  board_order    INTEGER NOT NULL,
  is_entry       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (flow_id, key)
);

CREATE TABLE step_edges (
  id          TEXT PRIMARY KEY,
  flow_id     TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  from_step   TEXT NOT NULL REFERENCES step_defs(id) ON DELETE CASCADE,
  to_step     TEXT NOT NULL REFERENCES step_defs(id) ON DELETE CASCADE,
  condition   TEXT NOT NULL DEFAULT 'always'  -- 'always' | 'on_pass' | 'on_fail'
);
```

From PRD §5. The tables that point *at* a flow:

| Column | Meaning |
|---|---|
| `projects.default_flow_id` | The adopted flow version for new tasks |
| `projects.check_command` | *"e.g. 'pnpm lint && pnpm test'; what a shell check step runs"* |
| `tasks.flow_id` | *"null while in backlog, pinned on promotion"* |
| `step_instances.step_def_id` | A task's occupancy of a step definition |
| `artifacts.type` | *"artifact type key, e.g. 'research_brief'"* |

```mermaid
erDiagram
  projects ||--o{ flows : has
  projects }o--|| flows : "default_flow_id"
  flows ||--o{ step_defs : contains
  flows ||--o{ step_edges : contains
  step_defs ||--o{ step_edges : "from / to"
  step_defs }o--o| skills : skill_id
  step_defs }o--o| agents : agent_id
  tasks }o--o| flows : "flow_id (pinned)"
  step_defs ||--o{ step_instances : "occupied by"
```

## Changes from the architecture and backlog

| Change | Source |
|---|---|
| Step `model` holds a **logical id** (`reasoning-high`, `fast-cheap`, `default`) | `01-ports.md` |
| Optional `step_defs.sandbox_profile` override | backlog Story 1.1 |
| `runs.model`, `runs.effort` so draft mode can't corrupt cost views; `step_instances.reason` | backlog Story 1.1; `02` §1 |
| Persisting positions *"needs a layout column"* | backlog Story 8.2 (**DEC**) |
| Stable edge ids, not array index | backlog Story 8.2 (BUG) |
| Flows are *"immutable JSON"*, exportable, keys uniquified on import | `02` §2; architecture README |

`02` §1 lists *"flow immutability, version pinning, guarded loops"* as the schema's invariants.

## Shape implied by the mockup

The mockup's library entry and step records (field names from `flow-designer.html`):

```js
// library entry
{ name, author, ver, domain, desc, shape, steps, gates, cost, runs, last,
  open, golden, forkOf, diff }
// open flow
{ name, author, ver, domain, adopted, running, steps: [...], edges: [[from, to, cond]] }
// step
{ id, label, agent, model, effort, budget, gate, needs, produces, x, y, retries, sandbox }
```

### Proposal: where the mockup's fields would live

| Mockup field | Proposed home | Stored or derived |
|---|---|---|
| `name`, `ver` | `flows.name`, `flows.version` | stored |
| `author` | new `flows.author` | stored — needs identities ([[Flow Design Open Questions]] #2) |
| `domain`, `desc` | new `flows.domain`, `flows.description` | stored |
| `golden` | new `flows.is_default` or a per-name pointer | stored |
| `forkOf`, `diff` | new `flows.forked_from_id`, `flows.difference` | stored |
| `shape`, `steps`, `gates` | — | derived from the graph |
| `runs`, `last` | — | derived from `tasks` |
| `cost` (~$/task) | — | derived from the cost ledger |
| `adopted` | `projects.default_flow_id` plus a timestamp | stored |
| `running` | — | count of active tasks with `flow_id` = this version |
| step `id`, `label` | `key`, `name` | stored |
| step `agent` | `agent_id` / `skill_id` | stored |
| step `budget` | `max_budget_usd` | stored |
| step `gate` | `advance_mode = 'approval'` | stored |
| step `needs` | `requires` | stored |
| step `retries` | `max_attempts − 1` | stored |
| step `sandbox` | `sandbox_profile` override | stored |
| step `x`, `y` | layout column, if positions persist | open |
| edge `pass` / `fail` | `on_pass` / `on_fail` | stored |

Every **new** column above is a proposal. See [[Flow Design Open Questions]] #3.

## Related

- [[Flows And Flow Versions]]
- [[Step Definitions]]
- [[Flow Storage]]
- [[Capability Data Model]]
