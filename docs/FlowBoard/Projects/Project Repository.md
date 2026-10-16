---
tags: [flowboard, projects, concept, repo, git]
module: Projects
---

# Project Repository

> **Connect a codebase** — *Point FlowBoard at a folder on your machine that holds a git repository. That's the code agents will read and change.* (feature map §1)

Each project names exactly one repository, by absolute path: `projects.repo_path`, *"absolute path to the git repo"* (PRD §5). The repo stays where it is. FlowBoard does not clone or copy it. It adds per-task worktrees and a capability store **inside** it.

## What FlowBoard puts in the repo

| Path | What | Source |
|---|---|---|
| `<repo_path>/.vibe-worktrees/task-<id>` | One git worktree per task, on branch `vibe/task-<id>`, created *"On promotion from Backlog to Todo"* (feature map §14: *"created when the task starts"*; [[Workspaces Open Questions]] #1) | PRD §11; backlog Story 2.1 |
| `<repo_path>/.flowboard/skills/<name>/<commit_sha>/` | Installed plugins, one directory per commit, gitignored | PRD §5 (comment on `plugins`), §13 |
| `<worktree>/.vibe/task-<task-id>/` | The task's artifacts, inside its worktree, tracked by git | PRD §6 |
| `<repo_path>/.git/info/exclude` | Gets `.vibe-worktrees/` and `.flowboard/skills/` appended *"so the parent repo stays clean"* | backlog Stories 0.3, 2.1; `05` §11 |

> [!warning] Three worktree schemes
> PRD and backlog: `<repo>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`. Drawio *Harness architecture*: `<repo>/.flowboard/worktrees/task-<id>` on `fb/task-<id>`. Task-detail mockup: `~/.flowboard/ws/auth-refactor` on `flowboard/auth-refactor`. See [[Workspace Naming]], [[Task Workspace]], [[Workspaces Open Questions]] #6 and [[Task Detail Open Questions]] #20.

FlowBoard's own `.gitignore` gets `.vibe-worktrees` too (backlog Story 0.3), but in a managed repo the sources use `.git/info/exclude`, which git reads and never commits.

## Git work happens on the host

| Rule | Source wording |
|---|---|
| The agent does not reach the remote | the egress allowlist covers *"the model endpoint and the package registries a build needs; **not** the project's git remote, because the host does all git work and the agent never needs to push or fetch"* (PRD §11.1) |
| The agent may not push or move the base branch | the in-agent hook denies *"any `git push`, `git reset --hard` or `git checkout` of the base branch"* (PRD §7) |
| Writes stay in the worktree | the hook denies *"writes outside the task's worktree"* (PRD §7) |
| The host may push and fetch, later | drawio edge from **Project repo + git worktrees** to **GitHub**: *"host-side push / fetch"*, drawn **dashed**, which the page legend reads as *"optional or later"*; the GitHub card reads *"skill install (git clone) · project remote"* |

No source says **when** the host pushes, to which remote or branch, or what the *base branch* is. The schema stores neither a remote nor a base branch. See [[Projects Open Questions]] #14 and #15, and [[Git Inside A Workspace]].

## One repo or many?

The schema allows one `repo_path` per project. The tracker's scope line says *"Projects, repos"*. The monitor mockup shows tasks from six repos on one screen (`flowboard/api`, `flowboard/core`, `flowboard/docs`, `flowboard/providers`, `flowboard/runner`, `flowboard/web`), and its task rows print `${t.repo}` in the detail block. The task-detail mockup labels its aside **repo & branch** and shows `flowboard/api` / `flowboard/auth-refactor`. Nothing says whether each of those repos is its own project, or whether one project can hold several. See [[Projects Open Questions]] #1 and #2, and [[Monitor Open Questions]] #2.

## What a repo must be

Only the PRD comment (*"absolute path to the git repo"*) and the feature map (*"a folder on your machine that holds a git repository"*) constrain it. The seed is the one case where FlowBoard makes the repo itself: *"Seed project pointing at an auto‑`git init`ed scratch repo"* (backlog Story 1.2).

**Proposal**, not in any source: on create, resolve the path to absolute, require it to exist, and require `git -C <path> rev-parse --show-toplevel` to succeed. Listed in [[Projects Open Questions]] #5.

## Related

- [[Project Record]]
- [[Repository Trust And Sandboxing]]
- [[Projects Storage]]
- [[Task Workspace]]
- [[Capability Storage On Disk]]
- [[Parent Repo Hygiene]]
