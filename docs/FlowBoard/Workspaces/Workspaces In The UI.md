---
tags: [flowboard, workspaces, ui]
module: Workspaces
---

# Workspaces In The UI

The sections below come from the sources, which gave workspaces no screen of their own. The workspace appears on other screens; each section points to the notes that describe them.

> [!warning] The shipped code differs
> As built on `feature/workspace-impl` (2026-11-12), workspaces have three screens of their own, each after a mockup in `docs/mockups/`:
>
> - **`/workspaces?folder=<repo>`** (`workspaces.html`): every task worktree in the repo, from `.flowboard/worktrees/` and the `fb/task-*` branches. Each one has a state: *running* (a run-flow holds its lock, or its last run is live), *dirty*, *unmerged*, *merged*, *branch-only* (folder gone) or *broken* (a plain folder in the way, or a switched branch, with the command that fixes it). The dirty, unmerged and broken ones sit under one ochre "needs you" band. **Clean up** asks before throwing uncommitted files away, and keeps an unmerged branch. **Clean up merged** removes every merged, clean one.
> - **The New run sheet** (`new-run-workspace.html`): *Work in* the repo folder, or a task workspace named by id, suggested from the task text. A live preview says whether the workspace is new, picked up again, picked up with uncommitted files (Start waits for *run even with uncommitted changes*), checked out again from a kept branch, or refused (bad id, a run holding it, broken, or the repo folder's own lock).
> - **`/workspaces/land?folder=&id=`** (`land-workspace.html`): **Review** the branch against the base, commit by commit, with numbered diffs; **Land** it by merge commit, squash, or rebase then fast-forward, after a dry run (`git merge-tree`, in memory) that names conflicting files and offers *update the branch from the base* or *send back to the flow*; then **Clean up**. Landing runs in the repo's own checkout and needs it clean and on the base branch. A failed merge or rebase is undone in full.
>
> The host-side code is `code/flowboard/packages/cli/src/workspace-git.ts`. Every action shows the git or CLI command that does the same thing. This answers [[Git Inside A Workspace]]'s open question of who merges: you do, from the Land page.

## Task detail

The richest source. See [[Task Detail Screen]], [[Task Detail Controls]] and [[Task Workspace]].

| Place | What it shows | Source |
|---|---|---|
| Aside, *repo & branch* | `flowboard/api` / `flowboard/auth-refactor` | `task-detail.html` `asideHTML` |
| Aside, *workspace* | `~/.flowboard/ws/auth-refactor`, *"its own copy of the repo — kept until you clean it up"* | same |
| Status bar | *"sandbox container, egress default-deny"* | `task-detail.html`; see [[Sandboxing In The UI]] |
| Top actions, until the task is done | **Pause** · **Send to backlog** · **Cancel task** | `drawHeader` |
| Top actions, when done | **Open workspace** · **Clean up workspace** | `drawHeader` |
| Files tab, *working tree* | changed files with `+`/`−` counts *"on"* the task branch; closing note: *"The workspace stays until you clean it up, and only once the task is finished or cancelled."* | `task-detail.html` |
| Plan vs built | *"what the plan asked for"* against *"what landed in the workspace"* | `task-detail.html`; see [[Plan Versus Built]] |
| Lifecycle diagram | backlog *"no workspace yet"*, done *"workspace kept"*; *"you promote it"* leads from backlog to running | `task-detail-guide.html`; see [[Task Lifecycle]] |
| Walkthrough, done | *"The task is finished and its branch is still there until you clean it up."* | `task-detail-guide.html` |

## Monitor

Text only, in the guide's walkthrough and status table (see [[Life Of A Task]]):

- Beat 1, in the backlog: *"No workspace, no agent, no spend."*
- Beat 2, promoted: *"It has a private copy of the repo waiting for it, but no worker yet"*.
- Beat 4: *"`brief.md` is written to the task workspace."*
- Beat 8: *"Two agents on one task, in the same workspace, on independent work."*
- Done status: *"Its artifacts are in the task workspace, tracked in git."*

## Capability library

*"The ones that can reach outside the workspace are marked, because they interact with the sandbox"* (`capability-library-guide.html`). The amber tool note: *"Amber tools can reach outside the workspace."* See [[Capability Tools And Egress]].

## Board

PRD §13: drag *"is enabled only between Backlog and Todo"*, which is promote and demote, the two moves that create or keep a workspace. Backlog 9.4 wants *"keyboard equivalent for promote/demote"*.

## Words the UI uses

The UI says **workspace**. The PRD and backlog say **worktree**. The mockup's Files tab says **working tree**. See [[Workspaces Glossary]].

## Related

- [[Workspaces Index]]
- [[Task Workspace]]
- [[Task Actions]]
- [[Cleaning Up A Workspace]]
