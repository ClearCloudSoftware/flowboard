---
tags: [flowboard, workspaces, open-questions]
module: Workspaces
---

# Workspaces Open Questions

Every place the sources disagree or leave a gap, plus every proposal and inference these notes make. Numbered for reference. Where a sibling set already raises the same question, it is linked.

## Creating

### 1. Promote or start?
PRD §11, §12, §14 M2, §16, backlog 2.1 and the monitor guide create the workspace on **promote**. Feature map §14 says *"created when the task starts"*, and §3 says starting *"gives it a clean, private copy of the code"*. Backlog D1 makes Start a separate action. → [[Creating A Workspace]], [[Execution Open Questions]] #2

### 2. Who runs `git worktree add`?
The drawio puts the Workspace manager in the worker; `apps/web` *"never spawns agents"* and only enqueues. No job kind creates a workspace. → [[Workspaces Runtime]]

### 3. What if `worktree add` fails?
Not a git repo, path exists, branch exists. No source says what the task does. → [[Creating A Workspace]]

### 4. A fresh scratch repo has no commit
Backlog 1.2 seeds an *"auto‑`git init`ed scratch repo"*. `git worktree add` needs a commit to branch from *(git behaviour, inferred)*. No source makes an initial commit. → [[Seed Scratch Repo]]

### 5. Which commit is the branch cut from?
The reference command names no start point, so it uses the repo's current `HEAD` *(inferred)*. The hooks protect *"the base branch"*, which no source defines. → [[Git Inside A Workspace]]

## Naming

### 6. Three path and branch schemes
PRD/backlog/`07`: `<repo>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`. Drawio: `<repo>/.flowboard/worktrees/task-<id>` on `fb/task-<id>`. Mockup: `~/.flowboard/ws/<slug>` on `flowboard/<slug>`. → [[Workspace Naming]], [[Task Detail Open Questions]] #20, [[Execution Open Questions]] #3, [[Monitor Open Questions]] #26

### 7. Exclude line for the drawio path, and on every promote
Backlog 2.1 excludes `.vibe-worktrees/`. The drawio path would need its own line. Appending on every promote repeats the line *(inferred)*. → [[Parent Repo Hygiene]]

## Demote and reuse

### 8. Re-promote has no reuse path
Backlog 2.1: *"re‑promote reuses it"*. The reference `create` always runs `worktree add -b`, which fails on an existing branch *(git behaviour)*. **Proposal:** skip `create()` when `tasks.worktree_path` is set and the folder exists. → [[Demote And Re-Promote]]

### 9. Demote vs Send to backlog
Demote is `todo → backlog` (backlog 2.1). **Send to backlog** works from any state (task-detail guide). Neither has an endpoint in PRD §12. What Send to backlog does to live runs is not stated. → [[Demote And Re-Promote]], [[Task Actions]]

### 10. Does re-promote re-pin the flow?
`flow_id` is *"pinned on promotion"*. A second promote may pin a newer version against the old workspace. → [[Version Pinning]]

## Cleanup

### 11. Allowed after `failed`?
PRD §11: `done`/`cancelled`. Backlog 2.1, `05` §11, `workspace.ts`: also `failed`. Mockup: only when every step is done. → [[Cleaning Up A Workspace]], [[Task Detail Open Questions]] #13, [[Execution Open Questions]] #60

### 12. Branch deleted or kept?
Guide: *"Removes the branch and the folder."* `07` `destroy` runs only `git worktree remove`. → [[Cleaning Up A Workspace]]

### 13. When is `--force` used?
`destroy` takes `force`. Git refuses to remove a worktree with uncommitted or untracked files *(git behaviour)*. No source says whether FlowBoard forces, warns, or refuses. → [[Cleaning Up A Workspace]]

### 14. Artifacts after cleanup
Artifacts live in the worktree; `artifacts.path` dangles afterwards. → [[Task Detail Open Questions]] #14, [[Task Storage On Disk]]

### 15. No record of cleanup
No column marks a workspace as removed; `worktree_path` keeps its value. → [[Workspaces Data Model]]

### 16. No cleanup or demote endpoint
**Proposal:** `POST /api/tasks/:id/cleanup` (end states only, calls `destroy`) and `POST /api/tasks/:id/demote`. → [[Workspaces API And Routes]]

### 17. What does Open workspace do?
A button in the mockup, with no behaviour anywhere. → [[Workspaces API And Routes]]

### 18. Deleting or cancelling a task with no workspace
Deleting cascades DB rows (PRD §5) but says nothing of the worktree; PRD §12 has no delete. Cancel from the backlog has no workspace to keep. → [[Workspace Lifecycle]]

### 19. No limit on kept worktrees
Workspaces are kept until you clean up, and no source caps or reports how many are kept. *(Observation.)*

## Git

### 20. Who commits?
*"committed alongside the code"* (drawio), *"committed on its own branch"* (mockup, guide), *"git tracks the files"* (PRD §6). Nobody says who runs `git commit`, or when. → [[Git Inside A Workspace]], [[Task Detail Tabs]]

### 21. How does the work get back?
No merge or PR mechanism. The feature map appendix and flow-designer mockup imagine a *"Merge and integrate"* step. Hooks deny `git push` and checkout of the base branch, and the git remote is off the allowlist, so such a step would need to run on the host *(inferred)*. → [[Git Inside A Workspace]]

## Runs and isolation

### 22. Does a container workspace remove the collision?
Five sources say so. The same sources make the container per run with the same worktree bind-mounted read-write. **Proposal:** a worktree per parallel branch, merged at the join. → [[Shared Worktree Within A Task]], [[Execution Open Questions]] #48

### 23. Container per task or per run
PRD §7 *"inside the task's container"*; PRD §11.1, `08`: one per run. → [[Isolation Tiers]], [[Execution Open Questions]] #61

### 24. Host path or `/work`?
`cwd(task)` returns the host path; the container sees `/work`. The prompt's absolute artifact paths and `{{worktree}}` are not said to be rewritten. → [[Workspace In A Run]]

### 25. Per-step tier through a per-task call
`execHost(task)` sees no step, but the profile is *"overridable per step"* (PRD §11.1) via `step_defs.sandbox_profile` (backlog 1.1). → [[ExecHost Seam]]

## The port

### 26. Workspace or ExecHost as the port?
PRD §3 and the drawio list ExecHost as a port and `exec/` adapters, with no Workspace port. The architecture makes Workspace the port. → [[Workspace Port]], [[Workspaces Runtime]]

### 27. Port shape differences
`id` is a union in `01-ports.md`, `string` in `workspace.ts`; `destroy` options required vs optional; the Workspace `id` union (`worktree`, `container`, `microvm`, `remote`) is not the `IsolationTier` union (`host`, `container`, `gvisor`, `microvm`). → [[Workspace Port]]

### 28. Adapter list vs tier ladder
Adapters: devcontainer, Docker sandbox, remote. Tiers: host, container, gVisor, microVM. `05` §11 merges them into one ladder. → [[Workspace Adapters]]

### 29. `cwd` ignores the stored path
The reference adapter recomputes the folder from the task id and never reads `tasks.worktree_path`. If the scheme changes, old tasks break *(inferred)*. → [[Git Worktree Adapter]]

### 30. No fake workspace for tests
`ReplayProvider` replaces the agent. No source names a test Workspace adapter. **Proposal:** add acceptance checks for reuse, exclude, and cleanup refusal. → [[Workspaces Acceptance Checks]]

## Proposals and labels made by these notes

| Item | Note |
|---|---|
| Phase names `none`, `active`, `kept_in_backlog`, `kept`, `removed` | [[Workspace Lifecycle]] |
| Reuse check on re-promote (#8) | [[Demote And Re-Promote]] |
| Cleanup and demote endpoints (#16) | [[Workspaces API And Routes]] |
| Worktree per parallel branch (#22) | [[Shared Worktree Within A Task]] |
| Extra acceptance checks (#30) | [[Workspaces Acceptance Checks]] |
| Diagram ordering of promote steps | [[Creating A Workspace]] |

## Related

- [[Workspaces Index]]
- [[Workspaces Roadmap]]
- [[Workspaces Sources]]
- [[Task Detail Open Questions]]
- [[Execution Open Questions]]
