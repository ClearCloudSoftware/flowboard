---
tags: [flowboard, workspaces, behaviour, cleanup]
module: Workspaces
---

# Cleaning Up A Workspace

The only way a workspace goes away. Always an explicit action by you.

## The rules

| Rule | Wording | Source |
|---|---|---|
| Never automatic | *"never remove it automatically."* | PRD §11 |
| Explicit only | *"Cleanup is explicit only — never automatic, and only when the task is done/cancelled/failed."* | `workspace.ts` |
| Explicit action | *"cleanup only via explicit action, only when done/cancelled/failed."* | `05` §11 |
| Explicit action | *"Cleanup worktree only via explicit action, only when done/cancelled/failed."* (**PRD**) | backlog 2.1 |
| Offered at the end | *"When a task reaches `done` or `cancelled`, offer a "clean up worktree" action"* | PRD §11 |
| Your terms | *"The workspace stays until you choose to clean it up (only once the task is finished or cancelled), never deleted from under you."* | feature map §14 |
| Known constraint | README must list *"manual cleanup"* | backlog 10.2 |

## When it is allowed

| Source | `done` | `cancelled` | `failed` |
|---|---|---|---|
| PRD §11 | ✓ | ✓ | — |
| Feature map §14, task-detail guide | ✓ (*"finished"*) | ✓ | — |
| Backlog 2.1, `05` §11, `workspace.ts` | ✓ | ✓ | ✓ |
| Task-detail mockup | ✓ (button shows only when every step is done) | — | — |

## What it removes

| Source | Worktree folder | Branch |
|---|---|---|
| Task-detail guide | ✓ *"Removes the branch and the folder."* | ✓ |
| Task-detail guide, status table | — | *"clean up the workspace when you no longer need the branch."* |
| `07` reference `destroy` | ✓ `git worktree remove [--force]` | not deleted |
| PRD §11 | *"clean up worktree"* | not mentioned |

## Force

`destroy(task, opts?: { force?: boolean })` passes `--force` to `git worktree remove`. No source says when FlowBoard uses it or whether the screen asks first. Git refuses to remove a worktree that has uncommitted or untracked changes unless forced *(git behaviour, inferred)*. Since artifacts are files inside the worktree, that case is likely whenever artifacts were not committed. See [[Git Inside A Workspace]].

## What is lost

Artifacts live in `<worktree>/.vibe/task-<id>/`. After cleanup, `artifacts.path` (*"absolute path on disk"*, PRD §5) points at nothing. Plan vs built and the artifact viewer have no files. The Task Detail set raises this: [[Task Storage On Disk]] and [[Task Detail Open Questions]] #14. If the branch is kept (the `07` behaviour) and the artifacts were committed, they survive on the branch.

## Where it is triggered

- Task detail, top actions, once the task is done: **Open workspace** · **Clean up workspace** (task-detail mockup `drawHeader`).
- Backlog 2.3 lists *"Retry, Cancel, Cleanup, Promote, Start, Demote"* as sheet actions (**PRD/GAP**).
- PRD §12 has no endpoint. See [[Workspaces API And Routes]].

## Related

- [[Workspaces Index]]
- [[Workspace Lifecycle]]
- [[Git Worktree Adapter]]
- [[Task Actions]]
- [[Workspaces Open Questions]]
