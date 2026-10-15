---
tags: [flowboard, flow-design, api, routes]
module: Flow Design
---

# Flow Design API And Routes

## Web routes

| Route | Screen | Source |
|---|---|---|
| `/p/[slug]/flow` | Flow editor / designer | PRD §13; backlog Story 8.2; drawio |
| `/p/[slug]` | The board, whose columns come from the flow | PRD §13 |
| `flowboard/flows` | The mockup's brand path. No source maps it to a URL. | `flow-designer.html` |

A library shared across projects (see [[Flow Library]]) does not fit under `/p/[slug]`. See [[Flow Design Open Questions]] #1.

## Endpoints in the PRD

From PRD §12. *"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."*

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/flows/:id` | Read a flow version |
| `PUT` | `/api/flows/:id` | Save — *"creates a new version"* |
| `POST` | `/api/flows/:id/validate` | *"artifact contract check"*; returns *"readable errors"* (backlog 5.1) |

Flow-adjacent endpoints:

| Method | Path | Flow role |
|---|---|---|
| `POST` | `/api/projects` | Backlog Story 1.3: *"New‑project dialog with flow‑type select ("Empty" allowed); choosing one creates flow v1."* Story 1.3 names no endpoint; tying it to this one is an inference. |
| `GET` | `/api/projects/:id/board` | *"board projection: columns + cards"* — columns from `board_order` |
| `POST` | `/api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* |
| `GET` | `/api/projects/:id/library` | *"plugins + skills + agents, with used-by"*. The step editor's agent and skill pickers would read it (inference; PRD §13 says only *"from defined agents and installed skills"*). See [[Capability Library API And Routes]] |
| `GET` | `/api/costs?project=&from=&to=` | Spend per step definition and per flow version (PRD §13) |

## Proposal: endpoints the mockup needs

None of these are in any source. They are inferred from the flow-designer mockup's actions.

| Method | Path | For |
|---|---|---|
| `GET` | `/api/flows?domain=&q=` | The library rail: grouped entries with steps, gates, ~$/task, runs, last used |
| `GET` | `/api/flows/:id/preview` | A version's graph for the ghosted preview (or reuse `GET /api/flows/:id`) |
| `POST` | `/api/flows/:id/adopt` | **Use this flow**: copy or fork into the project |
| `PUT` | `/api/projects/:id/flow` | Point a project at a version (if not implied by save) |
| `GET` | `/api/flows/:id/running` | *N tasks still running on vN* (or a field on `GET /api/flows/:id`) |
| `GET` | `/api/flows/:id/export`, `POST /api/flows/import` | `02` §2 idea: export across projects, keys uniquified on import |

Listed in [[Flow Design Open Questions]] #30.

## Server actions

The drawio *Harness architecture* page, *API routes + server actions*: *"zod-validated input → write rows → enqueue a job → return"*. No source says which job, if any, saving a flow enqueues.

## Related

- [[Flow Definition Internals]]
- [[Flow Storage]]
- [[Capability Library API And Routes]]
