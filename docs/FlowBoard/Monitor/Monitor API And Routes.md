---
tags: [flowboard, monitor, api, routes]
module: Monitor
---

# Monitor API And Routes

PRD §12: *"REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."*

## PRD endpoints the monitor uses

| Endpoint | For |
|---|---|
| `GET /api/projects/:id/board` | *"board projection: columns + cards"* |
| `GET /api/tasks?project=&status=` | Task lists |
| `POST /api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* (no control on the monitor) |
| `POST /api/tasks/:id/cancel` | Cancel a task (no control on the monitor) |
| `POST /api/step-instances/:id/approve` | **Approve** |
| `POST /api/step-instances/:id/reject` | **Send back** with a reason |
| `POST /api/step-instances/:id/retry` | **Retry as-is**; escalation-gate Retry |
| `GET /api/questions?state=pending` | Question cards |
| `POST /api/questions/:id/answer` | **Answer** |
| `GET /api/runs/:id` | One run |
| `GET /api/runs/:id/stream` | SSE, the live log and the [[Live Run Viewer]] |
| `GET /api/costs?project=&from=&to=` | Rollups (the `/costs` screen) |

Backlog 2.1 also lists `GET /api/tasks/:id` and a `POST /api/tasks/:id/start` that the code added (decision **D1**: explicit Start).

## Web routes

| Route | Screen | Source |
|---|---|---|
| `/p/[slug]` | The board | PRD §13 |
| `/runs/[id]` | Live session viewer | PRD §13 |
| `/t/[id]` | Task detail | drawio *Harness architecture* |
| `/inbox` | Questions | PRD §13 |
| `/costs` | Costs | PRD §13 |
| — | The monitor | No route given. The mockup brand is `flowboard/monitor` |

## Gaps

| Need on the monitor | Status |
|---|---|
| A cross-project view (tasks from six repos) | `board` is per project |
| **Stop** a run | No endpoint. Backlog 3.4: *"SIGTERM by pid from the route (same machine), finalise as cancelled"* |
| **Allow host & retry** | No endpoint for editing a step's egress allowlist |
| Worker slots, burn, today, wasted | No endpoint |
| A live stream of board changes | Only per-run SSE and the inbox stream |

## Proposal

> [!info] Proposal
> None of these endpoints is in any source. Listed in [[Monitor Open Questions]] #34.

```
GET  /api/monitor                       -- tasks + needs + workers + money, one snapshot
GET  /api/monitor/stream                -- SSE: snapshot, then deltas on job completion
POST /api/runs/:id/stop                 -- SIGTERM by pid, finalise the run
POST /api/step-instances/:id/retry      -- add { note?, allowHost? }
```

`GET /api/monitor` would take `?project=` to narrow to one project, so it can also serve `/p/[slug]`. The stream follows `02` §4's idea of a projection refreshed on job completion. `allowHost` would write the step's egress override, which is [[Flow Design Open Questions]] #14.

## Related

- [[Monitor Actions And Costs]]
- [[Event Stream And SSE]]
- [[Monitor Data Model]]
- [[Monitor Open Questions]]
