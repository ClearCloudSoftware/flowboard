---
tags: [flowboard, workspaces, behaviour, create]
module: Workspaces
---

# Creating A Workspace

## When

| Source | Moment |
|---|---|
| PRD §11 | *"On promotion from Backlog to Todo"* |
| PRD §12 | `POST /api/tasks/:id/promote` — *"backlog -> todo, pin flow, create worktree"* |
| PRD §14 M2 | *"Promote Backlog → Todo creates a worktree. No agents run yet."* |
| PRD §16 | *"Promoting a task creates a git worktree on its own branch"* |
| Backlog 2.1 | Promote runs `git worktree add` |
| Monitor guide, beat 2 *"You promote it"* | *"It has a private copy of the repo waiting for it, but no worker yet"* |
| Feature map §14 | *"Its own branch and folder, created when the task starts."* |
| Feature map §3 | *"Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow."* |

Most sources say **promote**. The feature map says **start**. Backlog D1 recommends Start as a separate action (*"Explicit Start button on card + sheet; promote stays cheap"*), so the two moments would differ. The mockup guides read the other way: the task-detail guide's *"you promote it"* arrow goes from backlog straight to running, and in the monitor guide's beat 2 the promoted task's first step is already queued. See [[Starting A Task]], [[Promoting A Task]] and [[Workspaces Open Questions]] #1.

## Steps

Backlog Story 2.1 (**PRD/FIX**):

> *"Promote: `git -C <repo> worktree add <repo>/.vibe-worktrees/task-<id> -b vibe/task-<id>`; store both paths; pre‑create `.vibe/task-<id>`; append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean."*

```mermaid
sequenceDiagram
  participant U as You
  participant A as Promote
  participant W as Workspace (worktree adapter)
  participant G as git (host)
  participant D as SQLite
  U->>A: promote task
  A->>D: pin tasks.flow_id
  A->>W: create(task)
  W->>G: worktree add <repo>/.vibe-worktrees/task-<id> -b vibe/task-<id>
  W-->>A: { path, branch }
  A->>D: tasks.worktree_path, tasks.branch_name
  A->>G: mkdir .vibe/task-<id>; append .vibe-worktrees/ to .git/info/exclude
```

1. **Add the worktree** on a new branch. See [[Git Worktree Adapter]].
2. **Store both on the task**: `tasks.worktree_path`, `tasks.branch_name` (PRD §5, §11).
3. **Pre-create the artifact folder** `.vibe/task-<id>` inside it. The backlog gives no reason. *(Inference: the [[Task Artifacts]] scan in `07` calls `readdir` on that folder, which would fail if it were missing.)*
4. **Exclude the worktree folder** from the parent repo. See [[Parent Repo Hygiene]].

The order of steps 2–4 and of pinning the flow is not specified. The diagram puts the pin first, as PRD §12's *"pin flow, create worktree"* does, and then follows the backlog sentence's order. *(These notes' ordering.)*

## Who runs it

The drawio puts the **Workspace manager** in the worker. It also says `apps/web` is *"thin: validates, calls core, enqueues; never spawns agents"*. The job kinds are `start_run`, `advance_task`, `escalate_question`, `import_backlog` (PRD §5 `jobs.kind`; drawio *Job loop*). There is no job for creating a workspace. So either the promote route runs `git` itself, or a job kind is missing. See [[Workspaces Open Questions]] #2, [[Intake And Import Open Questions]] #15 and [[Projects Open Questions]] #24.

## Failure

No source says what happens when `worktree add` fails: the repo is not a git repo, the path exists, or the branch exists (as it will on a re-promote, see [[Demote And Re-Promote]]). Whether the task stays in `backlog` is not stated.

## Related

- [[Workspaces Index]]
- [[Workspace Lifecycle]]
- [[Starting A Task]]
- [[Workspaces API And Routes]]
- [[Version Pinning]]
- [[Promoting A Task]]
