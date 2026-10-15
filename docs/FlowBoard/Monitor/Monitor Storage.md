---
tags: [flowboard, monitor, storage]
module: Monitor
---

# Monitor Storage

The monitor persists nothing of its own. Everything it shows lives in the places below.

| What | Where | Source |
|---|---|---|
| Tasks, steps, runs, questions, jobs, settings | `data/flowboard.db` (SQLite, *"better-sqlite3 + Drizzle · WAL · busy_timeout 5 s"*) | drawio *Harness architecture*; PRD §5 |
| Normalised events | `run_events` table, with the raw line in `raw` | PRD §5, §7 |
| Run snapshots | `data/runs/<id>/args.json` (*"Snapshot the final args"*, PRD §7); `data/runs/<id>/spec.json + raw stream, replayable at $0` (drawio *Run records*) | PRD §7, drawio |
| Artifacts | Files in the task's worktree, tracked in git (*"git tracks the files so they are diffable and reviewable"*). The `artifacts` table holds only type, path and metadata | PRD §6 |
| Worktrees | `<repo>/.flowboard/worktrees/task-<id>` on branch `fb/task-<id>` (drawio); `<repo>/.vibe-worktrees/task-<id>` on `vibe/task-<id>` (PRD §11, backlog 2.1). The two conflict: [[Monitor Open Questions]] #26 | drawio, PRD §11, backlog |
| Escalation threshold, draft mode, sandbox defaults | `settings` table | PRD §11.1 (sandbox profile), §13 (draft mode); `06` §15 and backlog 6.1, 8.3 (escalation threshold) |

> [!warning] Artifact paths differ in every source
> - PRD §6: `<worktree>/.vibe/task-<task-id>/01-research_brief.md`, `03-plan.md`, …
> - Drawio: `artifacts: .vibe/task-<id>/*.md | *.json, committed alongside the code`
> - Monitor row detail: `.flowboard/<task-id>/brief.md`
> - Monitor sample log: `› write .flowboard/artifacts/brief.md`
> - Task-detail mockup: workspace `~/.flowboard/ws/auth-refactor`
>
> See [[Monitor Open Questions]] #26.

## Client state

View state is held in memory only: view, filter, sort, open row, focused row, timeline window, the reason being typed. Nothing survives a reload. No source asks for it to.

## Related

- [[Monitor Data Model]]
- [[Event Stream And SSE]]
- [[Artifact Contract]]
