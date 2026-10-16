---
tags: [flowboard, settings-and-plumbing, api]
module: Settings And Plumbing
---

# Settings And Plumbing API And Routes

The whole API surface in one place. Each functional set documents its own endpoints in detail; this note is the map, plus the settings endpoints nobody else owns.

## The PRD surface (§12)

*"REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* Grouped by the set that documents each route:

| Route | Purpose (PRD wording where given) | Documented in |
|---|---|---|
| `GET /api/projects`, `POST /api/projects` | List and create projects | [[Projects API And Routes]] |
| `GET /api/projects/:id/board` | *"board projection: columns + cards"* | [[Monitor API And Routes]] |
| `GET /api/flows/:id`, `PUT /api/flows/:id` | Read; *"creates a new version"* | [[Flow Design API And Routes]] |
| `POST /api/flows/:id/validate` | *"artifact contract check"* | [[Flow Design API And Routes]] |
| `GET /api/tasks?project=&status=`, `POST /api/tasks` | List and create tasks | [[Intake API And Routes]], [[Task Detail API And Routes]] |
| `POST /api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* | [[Intake API And Routes]], [[Execution API And Routes]], [[Workspaces API And Routes]] |
| `POST /api/tasks/:id/cancel` | Cancel | [[Execution API And Routes]] |
| `POST /api/step-instances/:id/approve`, `…/reject`, `…/retry` | Gates and escalated loops | [[Human In The Loop API And Routes]] |
| `GET /api/questions?state=pending`, `POST /api/questions/:id/answer` | The inbox feed and answers | [[Human In The Loop API And Routes]] |
| `GET /api/runs/:id`, `GET /api/runs/:id/stream` | One run; SSE | [[Monitor API And Routes]], [[Live Updates]] |
| `GET /api/projects/:id/library` and the plugin and agent routes | The capability library | [[Capability Library API And Routes]] |
| `POST /api/import/backlog` | *"md file -> tasks"* | [[Intake API And Routes]] |
| `GET /api/costs?project=&from=&to=` | Rollups | [[Cost API And Routes]] |
| `POST /api/slack/interactions` | Inbound Slack. The drawio uses Socket Mode instead (*"so no public URL"*); see [[Escalation And Notifications Open Questions]] #6 | [[Escalation API And Routes]] |

*"The SSE endpoint replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`."* (PRD §12)

## Routes the first build added

From the backlog, not PRD §12:

| Route | Source |
|---|---|
| `GET /api/tasks/:id` | backlog 2.1 (tagged **PRD**, though PRD §12 does not list it) |
| `POST /api/tasks/:id/start` | backlog intro, item 3: *"the code added `POST /api/tasks/:id/start` with no button"* |
| `/api/inbox/summary` | backlog 4.3: *"Collapse the three overlapping pollers (`/api/inbox/summary` ×2 + `/api/questions?state=pending`) into one"* — **BUG (perf)** |
| `POST /api/questions/:id/unanswer` | backlog 4.4, only if the undo window is kept |

## Settings endpoints

> [!question] PRD §12 has no settings route
> Nothing in §12 reads or writes `settings`, so nothing can toggle draft mode, change the threshold, or pick a theme. [[Cost API And Routes]] and [[Escalation API And Routes]] each raise the gap ([[Escalation And Notifications Open Questions]] #17).

> [!example] Proposal — shared with Cost And Control and Escalation And Notifications
> ```
> GET   /api/settings          -- every setting, defaults filled in
> PATCH /api/settings          -- partial update; zod-validated against the one Settings schema
> ```
> `PATCH` merges at the top-level key, so sending `{ memory: {...} }` replaces the memory block whole. Secrets never travel through it: the memory block holds a *key ref*, not a key. A server action can call the same core function instead of the route. Listed in [[Settings And Plumbing Open Questions]] #2.
>
> [[Memory API And Routes]] and [[Sandboxing API And Routes]] propose the same pair, with `memory` and `sandbox_profile` as keys of the one settings object, so all five sets agree. It is still a proposal: no source defines a settings route.

## Web routes

| Route | Screen | Source |
|---|---|---|
| `/` | Projects list | PRD §13 |
| `/p/[slug]` | Board | PRD §13 |
| `/p/[slug]/flow` | Flow editor | PRD §13 |
| `/p/[slug]/library` | Skills and agents | PRD §13; the drawio *FlowBoard ideation* card says `/skills /agents` |
| `/inbox` | Questions | PRD §10, §13 |
| `/runs/[id]` | Live session viewer | PRD §13 |
| `/t/[id]` | Task detail | drawio *Harness architecture* only; PRD §13 makes task detail a sheet |
| `/costs` | Costs | PRD §13 |
| `/settings` | — | **none**; see [[Settings Surfaces]] |

Two shortcuts navigate: *"`g i` / `g b` navigate"* (old handoff, backlog 4.3).

## Gaps across sets

Each sibling set proposes endpoints for actions the PRD lists no route for (Start, Fail task, Stop, Allow host, the monitor snapshot, the inbox stream). They are collected in [[Execution Open Questions]] #47 and [[Monitor Open Questions]] #34. This set adds only the settings pair above.

## Related

- [[Thin Route Handlers]]
- [[Live Updates]]
- [[Settings Surfaces]]
- [[Settings And Plumbing Open Questions]]
