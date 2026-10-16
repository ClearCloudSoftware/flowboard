---
tags: [flowboard, memory, api]
module: Memory
---

# Memory API And Routes

## In the sources

Nothing. PRD §12 lists no memory endpoint and no settings endpoint. That fits the design rather than contradicting it:

- *"The port is queried by the runner, never from a route"* (`01-ports.md`).
- Recall and commit are worker-side, so the web app never needs to call the store.

The only web surfaces that touch memory are the settings section (PRD §13), the task-detail aside (mockup), and `/costs` (drawio). Each needs data from somewhere.

## What the screens would need

| Surface | Needs | Existing route |
|---|---|---|
| Settings memory section | Read and save the memory block | none in PRD §12; see [[Settings And Plumbing Open Questions]] #2 |
| Task-detail aside | Memories recalled into this task's runs | none; the task-detail API notes are in [[Task Detail API And Routes]] |
| `/costs` | The memory bucket | `GET /api/costs?project=&from=&to=` (PRD §12), field not defined; see [[Cost API And Routes]] |

> [!example] Proposal (not in the sources)
> ```
> GET  /api/settings                 PATCH /api/settings      -- includes the memory block
> GET  /api/runs/:id/memories        -- run_memories joined to text: "why did it think that?"
> GET  /api/tasks/:id/memories       -- union over the task's runs, for the aside
> ```
> The settings pair is the shape the Cost And Control, Escalation And Notifications and Settings And Plumbing sets propose; the open question is [[Settings And Plumbing Open Questions]] #2. `PATCH` sends `{ memory: {...} }` and replaces the memory block whole ([[Settings And Plumbing API And Routes]]). All thin, per PRD §12: *"validate with zod, call a function in `packages/core`, return JSON."* The memories routes read `run_memories` and the adapter's text; under Mem0 that means the web process calling the store, which `01-ports.md` forbids for routes. Resolving that is part of [[Memory Open Questions]] #19.

No source proposes routes to list, edit or delete memories. See #18 and #19.

## Related

- [[Memory In The UI]]
- [[Memory Settings]]
- [[Memory Runtime]]
- [[Memory Index]]
