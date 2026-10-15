---
tags: [flowboard, workspaces, behaviour, demote]
module: Workspaces
---

# Demote And Re-Promote

Sending a task back to the backlog keeps its workspace, and promoting it again reuses it.

## The rule

| Source | Wording |
|---|---|
| Backlog 2.1 (**NEW**) | *"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* |
| Feature map §3 | *"Send a task back to the backlog (keeping its workspace)"* |
| Task-detail guide, action table | Send to backlog: *"Returns the task to the backlog, keeping its workspace and everything it produced."* |
| Task-detail guide, lifecycle | *"Pausing and sending back to the backlog both keep the workspace"* |

## Two different actions

| | Demote | Send to backlog |
|---|---|---|
| From | `todo` | any state, incl. a running task (the guide: *"they can happen from anywhere"*) |
| Source | backlog 2.1 | task-detail mockup and guide |
| Control | board drag Backlog ↔ Todo (PRD §13); backlog 9.4 wants *"keyboard equivalent for promote/demote"* | **Send to backlog** button in task detail |
| Endpoint | none in PRD §12 | none in PRD §12 |

Both keep the workspace. What Send to backlog does with live runs, pending questions or the pinned flow is not stated. See [[Task Actions]].

## Re-promote

*"re‑promote reuses it"* means the second promote must **not** call `git worktree add … -b vibe/task-<id>` again. The branch already exists, and git refuses to create a branch that exists *(git behaviour, inferred)*. The reference adapter has no reuse path: `create` always runs `worktree add -b` ([[Git Worktree Adapter]]).

> [!note] Proposal
> Promote checks `tasks.worktree_path`. If it is set and the folder still exists, skip `create()`. These notes' suggestion, listed in [[Workspaces Open Questions]].

Also open: does re-promote re-pin the flow? `tasks.flow_id` is *"null while in backlog, pinned on promotion"* (PRD §5). A re-promote may pin a newer flow version against a workspace made under the old one. See [[Version Pinning]].

## Related

- [[Workspaces Index]]
- [[Workspace Lifecycle]]
- [[Creating A Workspace]]
- [[Starting A Task]]
