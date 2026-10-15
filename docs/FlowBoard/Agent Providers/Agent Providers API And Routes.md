---
tags: [flowboard, agent-providers, api]
module: Agent Providers
---

# Agent Providers API And Routes

There are no provider routes, by design.

> *"the API surface (PRD §12) is already a clean provider-neutral boundary — keep every handler a three-liner (validate → lib → JSON) and the ports stay the only place provider knowledge exists. If a route ever needs to know whether it's Claude or Codex, something leaked upward."* — `06` §15

*"Every port is called from `src/lib/`, **never from a route**, so the whole system stays testable headless."* (`06` §15). PRD §12: *"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."*

## Routes that carry the port's outputs

From PRD §12. None names a provider; each serves normalized data.

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
- Draft mode is a setting, not a provider route; no settings endpoint is listed in PRD §12.

## Related

- [[Provider Boundary Rules]]
- [[Execution API And Routes]]
- [[Event Stream And SSE]]
- [[Cost API And Routes]]
