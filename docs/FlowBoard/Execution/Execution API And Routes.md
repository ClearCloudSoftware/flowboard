---
tags: [flowboard, execution, api, routes]
module: Execution
---

# Execution API And Routes

*"REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12) For execution, *thin* means: write rows, enqueue a job, return. The drawio *API routes + server actions* card: *"zod-validated input → write rows → enqueue a job → return"*.

## In the PRD

| Method | Path | Execution effect |
|---|---|---|
| `POST` | `/api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* |
| `POST` | `/api/tasks/:id/cancel` | stop runs, cancel questions, skip instances (backlog 2.1) |
| `POST` | `/api/step-instances/:id/approve` | outcome pass; enqueue `advance_task` |
| `POST` | `/api/step-instances/:id/reject` | outcome fail + reason; *"reject with no `on_fail` edge fails the task"* (`02` §3, backlog 5.2). Backlog 2.3: the UI must send the reason. |
| `POST` | `/api/step-instances/:id/retry` | one more attempt with a note (PRD §8) |
| `POST` | `/api/questions/:id/answer` | may enqueue a resume `start_run` (PRD §9) |
| `GET` | `/api/runs/:id` | one run |
| `GET` | `/api/runs/:id/stream` | SSE: *"replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`."* |
| `GET` | `/api/projects/:id/board` | *"board projection: columns + cards"* |

(PRD §12)

## Named elsewhere

| Path | Source |
|---|---|
| `POST /api/tasks/:id/start` | backlog intro: *"the code added `POST /api/tasks/:id/start` with no button"* |
| Stop | `03` §8: *"Stop = SIGTERM by pid from the route"*, path not named |

## Proposed

> [!note] Proposals
> Not in any source. The task-level paths match [[Task Detail API And Routes]]; the retry body follows [[Monitor API And Routes]]. Each is listed in [[Execution Open Questions]].

| Method | Path | For |
|---|---|---|
| `POST` | `/api/tasks/:id/start` | Start, if D1 keeps it separate from promote |
| `POST` | `/api/tasks/:id/demote` | Send to backlog |
| `POST` | `/api/tasks/:id/pause` | Pause (named in feature map §3, defined in the task-detail guide) |
| `POST` | `/api/tasks/:id/fail` | **Fail task** at an escalation gate |
| `POST` | `/api/runs/:id/stop` | Stop a run |
| `POST` | `/api/step-instances/:id/retry` with `{ note?, allowHost? }` | PRD §8's Retry *"carries my note"*; the mockups' **Retry as-is** (no host) and **Allow host & retry** |

Three sibling sets propose different shapes for the same actions; pick one ([[Execution Open Questions]] #47):

| Action | [[Task Detail API And Routes]] | [[Monitor API And Routes]] | [[Human In The Loop API And Routes]] |
|---|---|---|---|
| Fail task | `POST /api/tasks/:id/fail` | — | `POST /api/step-instances/:id/fail-task` (or `reject` with `{ failTask: true }`) |
| Allow host & retry | — | `retry` with `{ note?, allowHost? }` | `POST /api/step-instances/:id/allow-host` `{ host }` |

## What a route does, step by step

*Illustrative* for Approve:

```mermaid
sequenceDiagram
  participant UI
  participant Route as POST /approve
  participant Core as packages/core
  participant DB as SQLite
  UI->>Route: approve
  Route->>Route: zod validate
  Route->>Core: approve(stepInstanceId)
  Core->>DB: outcome = pass, state = done
  Core->>DB: insert job advance_task
  Route-->>UI: 200 JSON
```

## Rules for every execution route

- *"Every port is called from `src/lib/`, **never from a route**"* (`06` §15). `06` uses the first build's layout (`src/app/api/`, `src/lib/`); in the PRD's layout that is `apps/web/app/api/` calling `packages/core` (PRD §3, §12).
- *"If a route ever needs to know whether it's Claude or Codex, something leaked upward."* (`06` §15)
- Stop is the one route that touches a process (by pid).

## Related

- [[Execution Index]]
- [[Execution Controls]]
- [[Job Queue]]
- [[Task Detail API And Routes]]
- [[Monitor API And Routes]]
