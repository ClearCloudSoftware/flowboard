---
tags: [flowboard, workspaces, api]
module: Workspaces
---

# Workspaces API And Routes

There is no workspace API. Workspaces are made and removed as side effects of task endpoints and actions.

## Endpoints in the sources

| Endpoint | Workspace effect | Source |
|---|---|---|
| `POST /api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* | PRD §12 |
| `POST /api/tasks/:id/cancel` | none; the worktree is kept | PRD §12, task-detail guide |
| `POST /api/tasks/:id/start` | none stated; added by the first build | backlog intro item 3, 2.1 |

PRD §12 handlers are *"thin: validate with zod, call a function in `packages/core`, return JSON."*

## Actions with no endpoint

| Action | Where | Source |
|---|---|---|
| Clean up workspace | task-detail top actions when done; sheet action *"Cleanup"* | mockup, backlog 2.3 |
| Open workspace | task-detail top actions when done | mockup |
| Demote (todo → backlog) | board drag, sheet action | backlog 2.1, 2.3 |
| Send to backlog | task-detail top actions | mockup, guide |

> [!note] Proposal
> `POST /api/tasks/:id/cleanup`, allowed only in the end states, calling `workspace.destroy(task)`, and `POST /api/tasks/:id/demote`. These are these notes' suggestions, not in any source. Listed in [[Workspaces Open Questions]].

**Open workspace** is a button with no defined behaviour. Opening a folder on the host from a browser page needs something on the server side. *(Inference.)*

## Web routes

No route of its own. The workspace shows on the task-detail page (`/t/[id]` on the drawio *Harness* page; a sheet in PRD §13). See [[Workspaces In The UI]].

## Related

- [[Workspaces Index]]
- [[Creating A Workspace]]
- [[Cleaning Up A Workspace]]
- [[Task Detail API And Routes]]
- [[Execution API And Routes]]
