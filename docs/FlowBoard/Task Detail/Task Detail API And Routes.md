---
tags: [flowboard, task-detail, api, routes]
module: Task Detail
---

# Task Detail API And Routes

## Web route

| Source | Route |
|---|---|
| PRD §13, backlog Story 2.3, design brief | none: a **sheet** opened from a board card (*"Clicking a card opens a detail sheet"*) |
| Drawio *Harness architecture* | **`/t/[id]`**: *"step timeline, attempts, artifacts, plan vs built diff"* |
| Mockup | a standalone page with a `‹ Board` back link |

Entry points:

- the board card: click, or `Enter` on a focused card (PRD §13, backlog Story 2.2, design README)
- the inbox gate card's **Open the task** button (inbox mockup)
- the monitor: its `↵` expands a row in place and does not navigate. No source links the monitor to task detail.

## Endpoints in the PRD

From PRD §12, the ones task detail uses:

| Method | Path | Purpose | Used for |
|---|---|---|---|
| `GET` | `/api/tasks?project=&status=` | list tasks | — |
| `POST` | `/api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* | Promote |
| `POST` | `/api/tasks/:id/cancel` | — | Cancel task |
| `POST` | `/api/step-instances/:id/approve` | — | Approve |
| `POST` | `/api/step-instances/:id/reject` | takes a reason (backlog Story 2.3) | Send back |
| `POST` | `/api/step-instances/:id/retry` | one more attempt with a note (PRD §8) | Retry at an escalation gate |
| `GET` | `/api/runs/:id` | one run | a story row's detail |
| `GET` | `/api/runs/:id/stream` | SSE; *"replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`."* | a live running row |
| `GET` | `/api/costs?project=&from=&to=` | rollups | the recipe average |

Backlog Story 2.1 adds `GET /api/tasks/:id`, tagged **PRD** though PRD §12 does not list it (and re-lists `POST /api/tasks`). The backlog intro records an unlisted `POST /api/tasks/:id/start` that the first build added (item 3), reached from an uncommitted *"sheet Start button"* (item 7).

*"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12). *"Every port is called from `src/lib/`, **never from a route**"* (`06` §15).

## Gaps: proposed endpoints

> [!warning] Proposals
> Two paths below are in the backlog with no response shape or rules: `GET /api/tasks/:id` (Story 2.1) and `POST /api/tasks/:id/start` (intro, item 3). The rest are in no source. Together they are the smallest set that would back the screen's controls. Each is listed in [[Task Detail Open Questions]].

| Method | Path | For |
|---|---|---|
| `GET` | `/api/tasks/:id` | path from backlog 2.1; the shape is proposed. The whole screen: task, instances with their runs, artifacts, questions, pinned flow, totals (shape in [[Task Data Model]]) |
| `GET` | `/api/tasks/:id/stream` | SSE for state, cost and gate changes on one task |
| `POST` | `/api/tasks/:id/start` | Start, if backlog D1 keeps it separate from promote (path from the backlog intro) |
| `POST` | `/api/tasks/:id/demote` | Send to backlog |
| `POST` | `/api/tasks/:id/pause` | Pause (needs a status, see [[Task Actions]]) |
| `POST` | `/api/tasks/:id/fail` | Fail task at an escalation gate |
| `POST` | `/api/tasks/:id/cleanup` | Clean up workspace |
| `GET` | `/api/tasks/:id/artifacts/:artifactId` | the formatted viewer |
| `GET` | `/api/tasks/:id/diff` | the working-tree file list and hunks |
| `POST` | `/api/runs/:id/stop` | stop a lost run from its story row (the viewer's Stop has no listed endpoint either) |

The Workspaces set proposes the same cleanup and demote paths ([[Workspaces API And Routes]]). The Memory set proposes `GET /api/tasks/:id/memories` for the aside's *carried in from memory* block ([[Memory API And Routes]]). For **Fail task**, [[Human In The Loop API And Routes]] proposes `POST /api/step-instances/:id/fail-task` instead; the choice is [[Execution Open Questions]] #47.

## Related

- [[Task Detail Index]]
- [[Task Actions]]
- [[Deciding At A Gate]]
- [[Task Detail Runtime]]
