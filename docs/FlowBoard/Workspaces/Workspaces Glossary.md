---
tags: [flowboard, workspaces, glossary]
module: Workspaces
---

# Workspaces Glossary

⚠ marks a word the sources use in more than one sense.

## Things

| Term | Meaning | Source |
|---|---|---|
| ⚠ **Workspace** | A task's private copy of the code: *"A private copy of the code for each task, so parallel tasks never trip over each other."* Also the name of the port | feature map §14, `01-ports.md` |
| **Worktree** | The v1 workspace: a `git worktree` under `<repo_path>/.vibe-worktrees/task-<id>` | PRD §11 |
| **Working tree** | The task-detail Files tab's label for the files in the worktree | `task-detail.html` |
| **Task branch** | The branch the worktree is created on: `vibe/task-<id>` | PRD §11 |
| ⚠ **Base branch** | The branch the hooks forbid `git checkout` of; not defined anywhere | PRD §7 |
| **Workspace port** | `create`, `cwd`, `execHost`, `destroy` | `workspace.ts` |
| **`TaskRef`** | *"A task's identity, enough to locate its isolated workspace. Shared with ArtifactStore."* | `workspace.ts` |
| **`WorkspaceHandle`** | `{ path, branch? }` returned by `create` | `workspace.ts` |
| **ExecHost** | *"WHERE a process runs, decoupled from WHICH agent runs it."* | `exec-host.ts` |
| **Isolation tier** | `host`, `container`, `gvisor`, `microvm`. Full treatment in the Sandboxing set's [[Isolation Tiers]] | `exec-host.ts`, `08` |
| **`sandbox_profile`** | The tier, image, egress allowlist and limits, kept in `settings` and overridable per step | PRD §11.1, backlog 1.1 |
| **Workspace adapter** | An implementation of the port: git worktree (v1); devcontainer, Docker sandbox, remote (later) | architecture README |
| **Container workspace** | The later adapter whose `execHost` runs processes in a container with the worktree bind-mounted | `07`, backlog 3.5 |
| **Workspace manager** | The drawio's name for the worker part that does *"git worktree add / remove per task"* | drawio *Harness* |
| **`/work`** | The worktree's mount point inside a run container | drawio *Mounts* |
| **`.git/info/exclude`** | The repo-local ignore file FlowBoard appends `.vibe-worktrees/` to | backlog 2.1 |
| **Scratch repo** | The *"auto‑`git init`ed"* repo the seed project points at, the first repo worktrees are cut from | PRD §14 M1, backlog 1.2 |

## Actions

| Term | Meaning | Source |
|---|---|---|
| **Promote** | Backlog → Todo; pins the flow and creates the worktree. Other sources put the pin (PRD §4, architecture README, drawio) or the worktree (feature map §14) on **Start** instead; see [[Workspaces Open Questions]] #1 and [[Execution Open Questions]] #2 | PRD §11, §12 |
| **Demote** | Todo → Backlog; keeps the worktree | backlog 2.1 |
| **Send to backlog** | Task-detail action, from any state; keeps the workspace | task-detail guide |
| ⚠ **Clean up** | Remove the workspace: *"Removes the branch and the folder."* | task-detail guide |
| ⚠ **Tidy up** | What **Cancel** does besides stopping agents; never defined. Not cleanup — *"The workspace survives until you clean it up."* | feature map §3, task-detail guide |
| **Open workspace** | Task-detail button when done; behaviour not defined | task-detail mockup |

## Overloaded words

| Word | Senses |
|---|---|
| **workspace** | (1) a task's copy of the repo; (2) a **pnpm workspace**, the monorepo layout (*"A pnpm workspace."*, PRD §3; *"one pnpm workspace"*, drawio); (3) a **Slack workspace** (*"run once against a real workspace"*, backlog 6.3); (4) Multica's multi-tenant **workspaces** (`competitor-multica.md`) |
| **branch** | (1) a git branch; (2) a parallel **flow branch** after a fan-out (*"Run branches in parallel"*, feature map §4). Parallel flow branches share one git branch |
| **cleanup** | (1) removing a workspace; (2) the first build's *"worker cleanup"* (backlog intro item 7); (3) `import_backlog`'s temp-file *"cleanup"* (backlog 7.3) |
| **container** | (1) the `container` isolation tier; (2) the **container workspace** adapter (and the `'container'` Workspace `id` in `01-ports.md`); (3) the per-run sandbox container; (4) half of the flow-designer's *sealed container* |
| **host** | (1) the `host` tier (no box); (2) the machine (*"the host does all git work"*); (3) a network host on the egress allowlist |
| **remote** | (1) a `remote` Workspace adapter (later); (2) the project's **git remote**, kept off the allowlist |

## Related

- [[Workspaces Index]]
- [[Workspaces Overview]]
- [[Task Detail Glossary]]
- [[Execution Glossary]]
- [[Sandboxing Glossary]]
