---
tags: [flowboard, task-detail, concept, workspace]
module: Task Detail
---

# Task Workspace

> **Workspaces** — *A private copy of the code for each task, so parallel tasks never trip over each other.* — feature map §14

The task-detail aside calls it *"its own copy of the repo — kept until you clean it up"*.

## The rules

| Rule | Source wording |
|---|---|
| One per task | *"Every task gets its own worktree so parallel steps cannot collide on the filesystem."* (PRD §11) |
| Own branch and folder | *"An isolated copy per task — Its own branch and folder, created when the task starts."* (feature map §14) |
| Every run uses it | *"All runs for that task use it as `cwd`."* (PRD §11) |
| Never auto-deleted | *"When a task reaches `done` or `cancelled`, offer a 'clean up worktree' action; never remove it automatically."* (PRD §11) |
| Your terms | *"The workspace stays until you choose to clean it up (only once the task is finished or cancelled), never deleted from under you."* (feature map §14) |
| Survives every task action | *"In every case the workspace survives until you clean it up yourself, and only once the task is finished or cancelled."* (task-detail guide) |
| Parent repo stays clean | *"append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog Story 2.1) |
| Demote keeps it | *"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* (backlog Story 2.1, **NEW**) |

## When it is created

PRD §11: *"On promotion from Backlog to Todo"*, with `git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>`. PRD §12: `POST /api/tasks/:id/promote -- backlog -> todo, pin flow, create worktree`. The feature map says *"created when the task starts"*. The task-detail guide's lifecycle labels backlog *"no workspace yet"*. See [[Task Lifecycle]] and [[Task Detail Open Questions]].

## Path and branch

| Source | Worktree path | Branch |
|---|---|---|
| PRD §11, backlog 2.1, `07` | `<repo>/.vibe-worktrees/task-<id>` | `vibe/task-<id>` |
| Drawio *Harness architecture* | `<repo>/.flowboard/worktrees/task-<id>` | `fb/task-<id>` |
| Task-detail mockup | `~/.flowboard/ws/auth-refactor` | `flowboard/auth-refactor` |

Three schemes. See [[Task Detail Open Questions]].

## When it can be cleaned up

| Source | Allowed when |
|---|---|
| PRD §11 | `done` or `cancelled` |
| Feature map §14, task-detail guide | *"finished or cancelled"* |
| Backlog Story 2.1, `05` §11, `workspace.ts` | *"done/cancelled/failed"* |
| Task-detail mockup | **Clean up workspace** shows only when every step is done |

The guide says the action *"Removes the branch and the folder."* The reference port `destroy(task, opts?: { force?: boolean })` runs `git worktree remove [--force]` (`07`). Only the guide says the branch is deleted; no backend source (PRD §11, `07`, `workspace.ts`) does.

## The Workspace port

The architecture splits storage into two ports, Workspace and ArtifactStore (`05` §11, component #11). The Workspace is *"create/destroy/cwd + `execHost`. Isolation lifecycle, and where processes run against it."* From `docs/old/reference/core/ports/workspace.ts` (abridged):

```ts
// … TaskRef and the doc comments elided
export interface WorkspaceHandle {
  /** Absolute path used as the run's cwd. */
  path: string;
  /** Branch created for the task, when the adapter is VCS-backed. */
  branch?: string;
}
export interface Workspace {
  readonly id: string;
  create(task: TaskRef): Promise<WorkspaceHandle>;
  cwd(task: TaskRef): string;
  execHost(task: TaskRef): ExecHost;
  destroy(task: TaskRef, opts?: { force?: boolean }): Promise<void>;
}
```

Its doc comment: *"Cleanup is explicit only — never automatic, and only when the task is done/cancelled/failed."* Adapters: git worktree in v1; devcontainer, Docker sandbox and remote later (architecture README ports table; drawio *Logical components*, *Container workspace* dashed).

## Shared by parallel steps

*"Parallel steps within one task share the task's worktree. If two concurrent steps both write code they will conflict"* (PRD §11). The seeded flow scopes the tester to `tests/`. A `containerWorkspace` adapter *"removes the shared-worktree collision (PRD §11) and needs no engine change"* (`07`).

## Sandbox posture

The status bar shows `sandbox container, egress default-deny`. A container is *"One container per run/attempt, destroyed on completion"* (`08-sandboxing.md`), and *"the only writable bind-mount is the task worktree"*. So the **worktree** lives for the task and a **container** lives for a run. `runs.sandbox` records the tier that actually ran (PRD §11.1). The screen shows one posture for the whole task, but the tier can be overridden per step (`step_defs.sandbox_profile`, backlog Story 1.1). See [[Step Guardrails]].

## Related

- [[Task Detail Index]]
- [[Task Artifacts]]
- [[Task Storage On Disk]]
- [[Task Actions]]
