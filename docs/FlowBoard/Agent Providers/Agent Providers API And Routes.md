---
tags: [flowboard, agent-providers, api]
module: Agent Providers
---

# Agent Providers API And Routes

> [!info] Design, not built
> None of the routes below exists on `dev` as of 2026-10-22, and neither does `/runs/[id]`: `code/flowboard/app/` is still the Next.js starter page. A run is started from a terminal with `pnpm run-agent`, which prints its events live, writes a log, and stops on Ctrl+C ([[Agent Providers Runtime]], [[Agent Providers Storage]]).

There are no provider routes, by design.

> *"the API surface (PRD §12) is already a clean provider-neutral boundary — keep every handler a three-liner (validate → lib → JSON) and the ports stay the only place provider knowledge exists. If a route ever needs to know whether it's Claude or Codex, something leaked upward."* — `06` §15

*"Every port is called from `src/lib/`, **never from a route**, so the whole system stays testable headless."* (`06` §15). PRD §12: *"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* The two name different layers (`src/lib/` vs `packages/core`): [[Execution Open Questions]] #63.

## Routes that carry the port's outputs

Routes from PRD §12. None names a provider. PRD §12 gives no response shapes, so the right-hand column is inferred from the schema ([[Agent Providers Open Questions]] #35).

| Route | What of the provider's output it serves |
|---|---|
| `GET /api/runs/:id` | The run row: session id, pid, exit code, usage, cost |
| `GET /api/runs/:id/stream` | SSE of `run_events` (normalized events). *"The SSE endpoint replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`."* |
| `GET /api/costs?project=&from=&to=` | Rollups including *"spend per model and effort combination"* (PRD §13) |
| `POST /api/flows/:id/validate` | Artifact contract check; the capability contract would join it (`02` §2) |
| `POST /api/step-instances/:id/retry` | Enqueues another launch |
| `POST /api/tasks/:id/cancel` | Stops running agents |

Web routes: `/runs/[id]`, the live session viewer (PRD §13). See [[Live Run Viewer]] and [[Execution API And Routes]].

## What is not there

- No route lists providers or their capabilities. The flow editor greys unsupported knobs (`01-ports.md`), which needs the capability set in the browser. The source of that data is open: [[Agent Providers Open Questions]] #26.
- No Stop route. PRD §13's viewer has *"A Stop button that kills the process"* and `03` §8 stops *"by pid from the route"*, but PRD §12 lists no endpoint for it ([[Execution Open Questions]] #47; [[Monitor Open Questions]] #36).
- Draft mode is a setting, not a provider route; no settings endpoint is listed in PRD §12 ([[Settings And Plumbing Open Questions]] #2).

## Related

- [[Provider Boundary Rules]]
- [[Execution API And Routes]]
- [[Event Stream And SSE]]
- [[Cost API And Routes]]
