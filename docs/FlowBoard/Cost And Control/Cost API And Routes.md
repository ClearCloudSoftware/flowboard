---
tags: [flowboard, cost-and-control, api]
module: Cost And Control
---

# Cost API And Routes

## Specified

| Method | Path | What | Source |
|---|---|---|---|
| GET | `/api/costs?project=&from=&to=` | The rollups behind `/costs` | PRD §12 |
| GET | `/api/runs/:id` | One run; the PRD gives no response shape | PRD §12 |
| GET | `/api/runs/:id/stream` | SSE for the viewer; *"replays existing `run_events` for the run, then streams new ones"* | PRD §12 |
| GET | `/api/projects/:id/board` | Board projection, cards with live cost | PRD §12 |

Pages: `/costs` and the projects list `/` (*"this week's spend"*) (PRD §13).

All handlers are thin: *"validate with zod, call a function in `packages/core`, return JSON."* (PRD §12). `06` §15: *"keep every handler a three-liner (validate → lib → JSON) … If a route ever needs to know whether it's Claude or Codex, something leaked upward."*

Backlog 8.1: *"Add project filter and real `from`/`to` (API supports both, UI sends neither)."*

## Not specified

> [!question] No settings endpoint
> PRD §12 lists no route to read or change settings, so nothing toggles draft mode. Backlog 8.3 requires the toggle. **Proposal:** `GET /api/settings` and `PATCH /api/settings` with `{ draft_mode: boolean }`. See [[Cost And Control Open Questions]] #12.

> [!question] No response shape for `/api/costs`
> **Proposal**, one call that returns every rollup:
>
> ```json
> {
>   "range": { "from": 0, "to": 0 },
>   "total_usd": 0,
>   "wasted_usd": 0,
>   "by_project_day": [{ "project_id": "", "day": "2026-10-15", "usd": 0, "wasted_usd": 0 }],
>   "by_step_def": [{ "step_def_id": "", "key": "", "flow_version": 4, "usd": 0, "runs": 0 }],
>   "by_model_effort": [{ "model": "opus", "effort": "high", "usd": 0, "runs": 0 }],
>   "per_finished_task": [{ "flow_id": "", "flow_version": 4, "tasks": 0, "avg_usd": 0 }],
>   "memory_usd": 0
> }
> ```
>
> Field names, grouping and the `memory_usd` line are all inferred. See [[Cost And Control Open Questions]] #12.

## Summary poller

Backlog 9.2: *"running dot + spend today; one summary poller."* Backlog 4.3 lists three overlapping pollers (`/api/inbox/summary` twice and `/api/questions?state=pending`) to collapse into one. `02` §4 suggests *"a **materialized view refreshed on job completion** instead of client polling"*. A chrome *spend today* figure would ride on that summary. No source names the endpoint.

## Related

- [[Costs Page]]
- [[Spend Rollups]]
- [[Monitor API And Routes]]
- [[Task Detail API And Routes]]
