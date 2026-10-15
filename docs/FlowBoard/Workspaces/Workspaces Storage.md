---
tags: [flowboard, workspaces, storage]
module: Workspaces
---

# Workspaces Storage

Where workspaces sit on disk. The full task layout, including artifacts and run records, is in [[Task Storage On Disk]]; this note only adds the workspace view.

## Layout (PRD scheme)

```text
<repo_path>/                         # projects.repo_path, the project's own repo
  .git/
    info/exclude                     # gets ".vibe-worktrees/" (backlog 2.1)
    worktrees/task-<id>/             # git's own bookkeeping for each worktree (git, inferred)
  .vibe-worktrees/
    task-<id>/                       # tasks.worktree_path, branch vibe/task-<id>
      .vibe/task-<id>/               # artifacts (PRD §6), pre-created on promote
      <the project's files>
  .flowboard/skills/<plugin>/<commit>/   # capability store, also excluded (backlog 0.3)
```

The drawio uses `<repo>/.flowboard/worktrees/task-<id>`; the task-detail mockup uses `~/.flowboard/ws/<slug>`. See [[Workspace Naming]].

## Stores

The drawio *Logical components* page: **Disk** holds *"worktrees, artifacts, skills, session logs"*; **Database** holds *"flows, tasks, steps, runs, questions, costs"*. The Git worktree adapter and Filesystem artifacts both draw edges into Disk.

| Thing | Store | Lives until |
|---|---|---|
| Worktree folder | Disk, inside the repo | you clean up (PRD §11) |
| Task branch | the repo's refs | cleanup per the guide; kept per `07` |
| `branch_name`, `worktree_path` | SQLite `tasks` | the task row |
| Run container | Docker | the end of the run (`08`) |

## What never goes in

From PRD §11.1 and the drawio *Mounts* card: never mount `~/.ssh`, cloud credentials, `flowboard.db` or `docker.sock` into a run. The worktree is the only writable mount.

## Related

- [[Workspaces Index]]
- [[Task Storage On Disk]]
- [[Parent Repo Hygiene]]
- [[Execution Storage]]
- [[Capability Storage On Disk]]
