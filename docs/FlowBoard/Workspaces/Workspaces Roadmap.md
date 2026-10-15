---
tags: [flowboard, workspaces, roadmap]
module: Workspaces
---

# Workspaces Roadmap

## v1 scope (PRD)

| Item | Source |
|---|---|
| A git worktree per task on its own branch, made on promote | PRD §11, §12; M2 |
| Every run uses it as `cwd` | PRD §7, §11 |
| A *"clean up worktree"* action once `done` or `cancelled`; never automatic | PRD §11 |
| Shared worktree within a task, documented as a known constraint | PRD §11 |
| Optional sandboxed runs with the worktree bind-mounted | PRD §11.1, *"in scope but optional"* (§17) |
| `tasks.branch_name`, `tasks.worktree_path` | PRD §5 |
| Acceptance: *"Promoting a task creates a git worktree on its own branch"* | PRD §16 |

| Milestone | Workspace content |
|---|---|
| M1 | Seed project on a scratch git repo |
| M2 | *"Promote Backlog → Todo creates a worktree. No agents run yet."* |
| M3 | Runs spawn with the worktree as `cwd` |
| M5 | Fan-out branches share it; check steps run in it |

## Designed beyond the PRD

| Item | Where | Status |
|---|---|---|
| Workspace port with `execHost` | `01-ports.md`, `05` §11, `workspace.ts` | architecture; the PRD has an ExecHost port instead |
| Exclude `.vibe-worktrees/` in `.git/info/exclude` | backlog 2.1, `05` §11 | **PRD/FIX** |
| Pre-create `.vibe/task-<id>` on promote | backlog 2.1 | **PRD/FIX** |
| Demote keeps the worktree; re-promote reuses it | backlog 2.1 | **NEW** |
| Cleanup also after `failed` | backlog 2.1, `05` §11, `workspace.ts` | differs from PRD §11 |
| Cleanup removes the branch too | task-detail guide | differs from `07` |
| **Open workspace** button | task-detail mockup | no behaviour defined |
| `ExecHost` seam and `containerWorkspace` adapter | backlog 3.5 | **NEW** |
| `runs.sandbox`, `step_defs.sandbox_profile` | backlog 1.1 | **NEW** |
| `.flowboard/worktrees/` on `fb/` branches | drawio *Harness* | competing scheme |

## Later

From the architecture and drawio, all drawn dashed or marked later:

- **Container workspace** — devcontainer, Docker sandbox (`07`, drawio).
- **gVisor and microVM** tiers — *"opt-in for untrusted repos"* (`08`, backlog D8).
- **Remote workspace** — *"the later shared/remote tier"* (PRD §17), *"the honest path to a shared or remote tier later without a rewrite"* (pitch).
- **Host-side push / fetch** — dashed edge to GitHub on the drawio *Harness* page.

## Ideas

Feature map §14's *💡 Ideas* slot is empty (*"(add ideas)"*). Related ideas elsewhere:

- Parking lot: *"Run agents in the cloud, not just your laptop"* and *"A shared team tier … runs that happen on a shared server rather than one laptop."* Neither names workspaces; they would need the remote adapter. *(Connection drawn by these notes.)*
- Feature map appendix: a *"Merge and integrate"* step in the Software developer starter flow. See [[Git Inside A Workspace]].

## Out of scope

- *"multi-machine support"* (PRD §17).
- Deploying FlowBoard itself in a container: *"shipping or *deploying* FlowBoard itself in a container is out of scope."* (PRD §17).
- Automatic cleanup, by every source.

## Related

- [[Workspaces Index]]
- [[Workspaces Open Questions]]
- [[Workspace Adapters]]
- [[Execution Roadmap]]
