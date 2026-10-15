---
tags: [flowboard, workspaces, rule, git]
module: Workspaces
---

# Parent Repo Hygiene

The worktree folder lives inside the project's own repo (`<repo_path>/.vibe-worktrees/`). FlowBoard keeps it out of that repo's `git status`.

## The rule

> *"append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* — backlog 2.1 (**PRD/FIX**)

`05` §11 repeats it: *"Worktree hygiene: append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean; cleanup only via explicit action, only when done/cancelled/failed."*

`.git/info/exclude` is the repo-local ignore file. It is not committed *(git behaviour)*, so FlowBoard does not change the project's tracked `.gitignore`. See [[Project Repository]].

## Same rule for the capability store

Backlog 0.3 (**FIX**): *"Installed plugins live in each managed project's `.flowboard/skills/`, which FlowBoard adds to that repo's `.git/info/exclude`."* PRD §13 calls that folder *"gitignored"*. See [[Capability Storage On Disk]].

## FlowBoard's own repo

Backlog 0.3 (**FIX**) gives FlowBoard's own `.gitignore` *"`data/*.db*`, `data/runs`, `.vibe-worktrees`"*; the repo's actual `.gitignore` has `data/*.db*`, `data/runs/` and `.vibe-worktrees/`. *(Inference: this matters only if FlowBoard's own repo is ever the managed project. The seed points at a separate scratch repo, PRD §14 M1.)*

## Gaps

- **When to append.** Backlog 2.1 puts it in the promote step. Appending on every promote would repeat the line. *(Inference.)*
- **Drawio path.** The drawio's `<repo>/.flowboard/worktrees/` would need its own exclude line, or an exclude for all of `.flowboard/`. No source covers it.
- **Inside the worktree.** The artifact folder `.vibe/task-<id>/` is inside the worktree and is meant to be tracked (*"git tracks the files"*, PRD §6). It is not excluded.

See [[Workspaces Open Questions]].

## Related

- [[Workspaces Index]]
- [[Creating A Workspace]]
- [[Workspace Naming]]
- [[Workspaces Storage]]
