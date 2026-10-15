---
tags: [flowboard, cost-and-control, storage]
module: Cost And Control
---

# Cost Storage

What cost data is persisted, and where.

| What | Where | Source |
|---|---|---|
| A run's cost, tokens, turns, wasted flag | `runs` in `data/flowboard.db` (SQLite, WAL, `busy_timeout` 5 s) | PRD §5, drawio *SQLite* card |
| The raw provider line for every event | `run_events.raw` | PRD §5, `01-ports.md` |
| Step limits, model, effort | `step_defs` | PRD §5 |
| Draft mode | `settings` | PRD §13, `06` §15 |
| The CLI args a run used | `data/runs/<id>/args.json` | PRD §7 |
| The resolved `RunSpec` (idea) | `data/runs/<id>/spec.json` | `03` §6 |
| Run records, *"replayable at $0"* | `data/runs/<id>/spec.json + raw stream` | drawio *Harness architecture* |
| The rate table | **Not specified** | `06` §12 |
| The memory bucket | **Not specified** | `06` §12, PRD §11.2 |

## No separate ledger store

The ledger is a read model over `runs`. The drawio *Read models* card: *"board projection (furthest-advanced step, split badges) · cost rollups incl. wasted spend"*. The rollups are computed, not stored. `02` §4's materialized-view idea is for the board projection. No source extends it to cost rollups.

## Retention

No source sets a retention period for `runs` or `run_events`. Cost history is meant to be permanent: *"an honest, unchangeable log of what every agent did and what it cost"* (feature map, *A clear record*). `ON DELETE CASCADE` from `tasks` to `step_instances` to `runs` means deleting a task deletes its cost history. No source says whether tasks are ever deleted.

## Who writes

| Writer | Writes |
|---|---|
| Worker (runner) | `runs` cost and tokens, `run_events`, `wasted` on infra retry |
| Worker (engine) | `wasted` on rework |
| Web (settings) | `settings` draft mode |

*"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"* (drawio *SQLite* card).

## Related

- [[Cost Data Model]]
- [[Cost Ledger]]
- [[Monitor Storage]]
- [[Task Storage On Disk]]
