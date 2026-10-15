---
tags: [flowboard, monitor, data-model, schema]
module: Monitor
---

# Monitor Data Model

The monitor writes nothing of its own. It reads the engine's tables (PRD §5) and derives everything else. These are the columns it needs.

## Tables read

| Table | Columns the monitor uses | For |
|---|---|---|
| `tasks` | `id`, `project_id`, `flow_id`, `title`, `status`, `created_at`, `updated_at` | Rows, status, flow version |
| `flows`, `step_defs`, `step_edges` | `name`, `version`; `key`, `name`, `model`, `advance_mode`, `board_order`, `max_attempts`; `from_step`, `to_step`, `condition` | Flow bar shape, gate marks, pipeline graph, *of N* attempts |
| `step_instances` | `task_id`, `step_def_id`, `state`, `attempts`, `outcome`, `updated_at` | Step states, where a task is, attempt counts |
| `runs` | `step_instance_id`, `attempt`, `state`, `cost_usd`, token columns, `num_turns`, `wasted`, `error`, `started_at`, `ended_at`, `pid` | Live cost, wasted, durations, timeline bars, the error line, stop |
| `run_events` | `run_id`, `seq`, `v`, `type`, `summary`, `raw`, `created_at` | The live log and the [[Live Run Viewer]] |
| `questions` | `task_id`, `step_instance_id`, `prompt`, `kind`, `options`, `state`, `created_at`, `escalated_at`, `answered_via` | Question cards, wait time, the escalated tag |
| `artifacts` | `task_id`, `step_instance_id`, `type`, `path`, `bytes` | The artifact list in [[Task Row Detail]] |
| `jobs` | `kind`, `state`, `payload`, `run_after` | The queue (queued `start_run` jobs) |
| `settings` | escalation threshold, draft mode, sandbox defaults | The escalated tag, the status bar |

The drawio *Harness architecture* SQLite card adds `runs.sandbox` and `step_defs.kind, command`; backlog 8.1 reads `runs.model/effort`, which PRD §5 does not list.

## The mockup's in-memory model

```js
TASK = { id, title, repo, runs: { [stepKey]: RUN }, finished?, rejectedFor?, allowed? }
RUN  = { step, state, start, end, ms, planned, cost, attempts, wasted, since?, ask?, opts?, answered?, err? }
// state: pending | queued | running | gate | asking | failed | done
```

One `RUN` per step per task: the mockup keeps no history of earlier attempts, only a count and a running `wasted` sum. The PRD keeps every attempt as its own `runs` row.

## Proposal: mapping PRD state to monitor marks

> [!info] Proposal
> No source maps the PRD states to the monitor's states. This mapping is inferred; it is [[Monitor Open Questions]] #7.

### Step state ([[Flow Bar And Step States]])

| Monitor | From |
|---|---|
| pending | No step instance yet, or `step_instances.state = 'pending'` with no queued `start_run` job |
| queued | `pending` with a queued or leased `start_run` job, or a run in `starting` |
| running | A run in `running` |
| asking | `awaiting_answers` |
| gate | `awaiting_approval` (approval mode, *no outcome reported*, or an escalation gate) |
| failed | `step_instances.state = 'failed'`, or the latest run `failed` while the task is `blocked` |
| done | `done` |
| (no mark) | `skipped` (backlog 5.2: downstream `done` → `skipped` on rework). Draw as pending |

### Task status ([[Task Status Icons]])

| Monitor | From `tasks.status` |
|---|---|
| failed | `failed`, or `blocked` because a run failed |
| waiting on you | `blocked` with a step in `awaiting_approval` or `awaiting_answers` |
| running | `running` with a run in flight |
| idle | `backlog`, `todo`, or `running` with only queued work |
| done | `done` |
| (no mark) | `cancelled` |

### Numbers

| Monitor | **Proposal** |
|---|---|
| Task cost | Σ `runs.cost_usd` for the task (live estimate while running) |
| Task wasted | Σ `runs.cost_usd` where `wasted = 1` |
| Attempt N of M | `step_instances.attempts` of `step_defs.max_attempts` |
| Waited since | `questions.created_at` for questions; for gates, `step_instances.updated_at` (no dedicated column) |
| Fork badge | Count of the task's runs in `running` |

## Related

- [[Monitor Runtime]]
- [[Monitor Storage]]
- [[Board Projection]]
- [[Monitor Open Questions]]
