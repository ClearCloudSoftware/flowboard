---
tags: [flowboard, workspaces, sources]
module: Workspaces
---

# Workspaces Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `49c7d97` (2026-10-15), on `dev`.

> [!info] No mockup of its own
> Workspaces is a platform component with no screen. Its visible side was gathered from the task-detail, monitor and capability-library mockups and guides. The artifact-store half of architecture #11 is covered by the Task Detail set: [[Task Artifacts]], [[Task Storage On Disk]], [[Task Workspace]].

## Primary

| File | What it contributes |
|---|---|
| `docs/old/reference/core/ports/workspace.ts` | `TaskRef`, `WorkspaceHandle`, `Workspace` (`create`, `cwd`, `execHost`, `destroy({ force? })`); doc comment: cleanup *"explicit only — never automatic, and only when the task is done/cancelled/failed"*; container adapter removes the collision |
| `docs/old/reference/core/ports/exec-host.ts` | `ExecHost`, `IsolationTier`, `SandboxProfile` (`mounts` beyond the worktree, `nonRoot`), `ChildHandle`; *"any provider × any isolation tier, for free (2×N, not N×M)"* |
| `docs/old/architecture/01-ports.md` | *Workspace* section and sketch (`id` union, required `opts`); *ExecHost and sandboxing* section; the bypass gate; `egressAllow` *"no git remote"*; five ports |
| `docs/old/architecture/05-environment-and-registry.md` §11 | Two ports split; isolation ladder; *"`bypassPermissions` requires a sandbox tier"*; composes with the runner; worktree hygiene and explicit cleanup |
| `docs/old/architecture/07-ports-in-practice.md` | `worktreeWorkspace(repoPath)` reference adapter; `containerWorkspace` paragraph; runner composition with `cwd: deps.workspace.cwd(task)` |
| `docs/old/PRD.MD` | §3 ports list without Workspace, `adapters/exec/`; §4 flows *"version-pinned at task start"*; §5 `projects.repo_path`, `tasks.branch_name`, `tasks.worktree_path`, `tasks.flow_id`, `artifacts.path`, `jobs.kind`, the global `settings` key/value table; §6 artifacts in the worktree; §7 `cwd`, hooks (writes outside the worktree, `git push`, base branch), `{{worktree}}`, shell steps in the worktree, *"inside the task's container"*; **§11** the worktree command, store both paths, cleanup action, shared worktree; §11.1 bind mount, no git remote, one container per run, `sandbox_profile`, `runs.sandbox`, Docker probe, git plugins on the host; §12 promote, cancel; §13 board drag, sandbox settings; §14 M1, M2, M5; §15 seed flow, tester scope; §16 acceptance; §17 multi-machine and remote tier out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Intro items 3, 7 (Start, worker cleanup); 0.1 Docker probe; 0.2 fake-`claude` and Playwright lanes; 0.3 `.gitignore`, `.flowboard/skills/` exclude; 1.1 `runs.sandbox`, `step_defs.sandbox_profile`; 1.2 scratch repo; **2.1** promote steps, exclude, demote/re-promote, cleanup rule; 2.3 sheet actions incl. Cleanup; 3.2 worktree-cwd path alias FIX; **3.5** ExecHost seam, `containerWorkspace`, its *"(2.2)"* cross-reference, the container test; 7.3 import `cleanup`; 9.4 promote/demote keyboard; 10.1 acceptance; 10.2 known constraints; D1, D7, D8 |
| `docs/feature-map.md` | **§14 Workspaces** (all three features, empty ideas slot); §3 start gives a private copy, send back keeps the workspace, cancel *"tidies up"*; §4 parallel branches; §10 hooks; §15 artifacts in the workspace; Parking lot (cloud, shared tier); Appendix *Software developer* *"Merge and integrate"* |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: *"Git worktree per task"* card, *"Five ports"*, *"Workspace adapters / devcontainer, Docker sandbox, remote."*, ReplayProvider. *Logical components*: Workspace port, Git worktree and Container workspace adapters (dashed), Disk store, edges Run orchestrator → Workspace, Workspace → adapters, Git worktree → Disk. *Functional components*: *"Run a step / spawn headless session in its worktree"*, *"Isolate the workspace"* (dashed). *Harness architecture*: Project repo + git worktrees (`.flowboard/worktrees/`, `fb/`, *"committed alongside the code"*), Workspace manager, Mounts (`/work`), Tiers card, Permission gate (source of the *"docker run via ExecHost"* edge), PreToolUse hooks, SQLite card (`runs … sandbox`, `settings … sandbox_profile`), Job loop kinds, egress proxy *"no git remote"*, *"host-side push / fetch"* (dashed), *"bind mount /work"* (dashed), legend, code layout, concept 7, Test lane, life of one step E. *FlowBoard ideation* also: *Out of scope (v1)* card (*"Docker"*), ReplayProvider card |

## Secondary

| File | What it contributes |
|---|---|
| `docs/mockups/task-detail.html` | `TASK` repo, branch, workspace path; aside *"its own copy of the repo — kept until you clean it up"*; **Open workspace** · **Clean up workspace** when done; Files tab *working tree* and closing note; plan vs built *"what landed in the workspace"*; status bar sandbox posture |
| `docs/mockups/task-detail-guide.html` | Lifecycle (*"no workspace yet"*, *"workspace kept"*), the paragraph on Pause / Send to backlog / Cancel, action table (Clean up *"Removes the branch and the folder"*), status table, *"committed on its own branch"* callout |
| `docs/mockups/monitor-guide.html` | Walkthrough beats 1, 2, 4, 8; done status *"Its artifacts are in the task workspace, tracked in git."* |
| `docs/mockups/capability-library.html`, `capability-library-guide.html` | Tools that *"reach outside the workspace"* |
| `docs/mockups/flow-designer.html` | *"Merge and integrate"* step name; *"it merges itself"*; per-step **Sandbox** field (`SANDBOX = ['none','container','sealed container']`) |
| `docs/mockups/flow-designer-guide.html` | Sandbox row: *"none, a container, or a sealed container with no network"* (its *branch* means a flow branch) |
| `docs/old/architecture/README.md` | Thesis (*"isolation is hardwired to git worktrees"*), *"a task pins its version at start"*, five-ports table, module layout `adapters/workspace/worktree/ container/`, dependency rule, component #11 |
| `docs/old/architecture/03-execution-substrate.md` §6 | Runner gets `ExecHost` from `workspace.execHost(task)`; the gate's *"(container/microVM)"*; shell steps through the same `ExecHost`; hooks: no writes outside the worktree |
| `docs/old/architecture/08-sandboxing.md` | *"One seam: `ExecHost`, owned by the Workspace."*; tier ladder; only writable mount is the worktree; one container per run; host does all git work; recommendation |
| `docs/old/reference/core/ports/agent-provider.ts` | `RunSpec.cwd`, `RunSpec.exec`, `ArtifactRef.path` |
| `docs/old/reference/core/ports/artifact-store.ts` | `TaskRef` shared with ArtifactStore |
| `docs/pitch.md` | *"The workspace and provider seams are the honest path to a shared or remote tier later"* |
| `docs/competitor-multica.md` | Multica's multi-tenant *workspaces* (overloaded word); *"Real files in the task's isolated git workspace"* |
| `.gitignore` | `data/*.db*`, `data/runs/`, `.vibe-worktrees/` |

## Checked, nothing added

`docs/mockups/inbox.html`, `inbox-guide.html`, `monitor.html` (sandbox posture only), `docs/mockups/README.md`, `docs/old/architecture/02-core-and-engine.md`, `04-hitl-and-notify.md`, `06-cost-and-platform.md`, `09-memory.md` (remote tier only), `docs/old/reference/core/ports/notifier.ts`, `task-source.ts`, `memory-store.ts`, `events.ts`, `docs/old/reference/core/hitl/question.ts`, the two reference adapters.

## Sibling vault notes

Linked rather than repeated: [[Task Workspace]], [[Task Storage On Disk]], [[Task Artifacts]], [[Starting A Task]], [[Stopping And Cancelling]], [[Fan-Out And Join]], [[Execution Storage]]. Overlapping sets on their own branches: Sandboxing ([[Sandboxing Index]], [[ExecHost Port]], [[Isolation Tiers]], [[Sandbox Mounts]], [[Sandboxed Run Lifecycle]]), Projects ([[Project Repository]], [[Projects Open Questions]]) and Intake And Import ([[Promoting A Task]], [[Intake And Import Open Questions]]).

## Related

- [[Workspaces Index]]
- [[Workspaces Open Questions]]
