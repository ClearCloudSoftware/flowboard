---
tags: [flowboard, workspaces, concept, adapters, git]
module: Workspaces
---

# Git Worktree Adapter

The v1 Workspace adapter: one git worktree per task, on its own branch, with processes run on the host (or, later, in a container that bind-mounts the worktree).

## Reference implementation

From `07-ports-in-practice.md` (*"Workspace — git worktree adapter"*):

```ts
export function worktreeWorkspace(repoPath: string): Workspace {
  const dir = (id: string) => `${repoPath}/.vibe-worktrees/task-${id}`;
  return {
    id: 'worktree',
    async create(task: TaskRef): Promise<WorkspaceHandle> {
      const path = dir(task.id);
      const branch = `vibe/task-${task.id}`;
      await run('git', ['-C', repoPath, 'worktree', 'add', path, '-b', branch]);
      return { path, branch };
    },
    cwd: (task) => dir(task.id),
    execHost: (task) => hostExecHost(dir(task.id)),  // container tier returns a docker ExecHost instead
    async destroy(task, opts) {
      const args = ['-C', repoPath, 'worktree', 'remove', ...(opts?.force ? ['--force'] : []), dir(task.id)];
      await run('git', args);
    },
  };
}
```

## The git commands

| Call | Command | Source |
|---|---|---|
| `create` | `git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>` | PRD §11, backlog 2.1, `07` |
| `destroy` | `git -C <repo_path> worktree remove [--force] <repo_path>/.vibe-worktrees/task-<id>` | `07` |

## What the reference sketch shows

- **One adapter per repo.** `worktreeWorkspace(repoPath)` is built for one project's repo (`projects.repo_path`). How the composition root picks it per project is not stated. See [[Projects Open Questions]] #24.
- **Path is derived, not looked up.** `cwd` recomputes the folder from the task id. It does not read `tasks.worktree_path`, which the PRD says to store (*"Store both paths on the task."*, PRD §11).
- **`destroy` removes the worktree, not the branch.** No `git branch -d`. The task-detail guide says cleanup *"Removes the branch and the folder."* See [[Cleaning Up A Workspace]].
- **No start point.** `worktree add … -b <branch>` names no base commit. With git's default, that branches from the repo's current `HEAD`. *(Inference from git's behaviour, not stated by a source.)*
- **No reuse path.** `create` always adds a new worktree with `-b`. Backlog 2.1 wants *"re‑promote reuses it"*. See [[Demote And Re-Promote]].
- **No error handling.** A failing `git` call rejects the promise. What the caller does then is not stated.

The bullets about start point and reuse are readings of the sketch. They are listed in [[Workspaces Open Questions]].

## Host side

On the drawio *Harness architecture* page the **Workspace manager** runs in the worker process (`apps/worker`) on the host: *"git worktree add / remove per task · ExecHost per tier: host · docker · gVisor"*. Its edge to the repo is labelled *"worktree add"*. The drawio shows a different path from the PRD's: *"<repo>/.flowboard/worktrees/task-<id> on branch fb/task-<id>"*. See [[Workspace Naming]].

The sketch's `execHost` comment, *"container tier returns a docker ExecHost instead"*, puts the tier choice inside this adapter. See [[Workspace Adapters]].

## Related

- [[Workspaces Index]]
- [[Workspace Adapters]]
- [[Creating A Workspace]]
- [[Cleaning Up A Workspace]]
- [[Workspace Naming]]
