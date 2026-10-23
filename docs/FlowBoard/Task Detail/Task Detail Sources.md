---
tags: [flowboard, task-detail, sources]
module: Task Detail
---

# Task Detail Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `49c7d97` (2026-10-15), on `dev`. The only source change since the first pass (`0a60ef0`) is in `inbox.html` (queue order, the number-answer check, the **Retry as-is** handler), none of it on this component.

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/task-detail.html` | The screen: topbar, header numbers, spine, gate banner, four tabs, aside, status bar. The sample task `auth-refactor` (6 steps, logs, costs, attempts, artifacts), `PLAN[]` with four verdicts and hunks, `MEMORY[]`. Derived totals, `approve()` / `sendBack()` / `startSummarize()`, `RATE` per model, keyboard handler, responsive and reduced-motion CSS, verdict and mark colours. |
| `docs/mockups/task-detail-guide.html` | Field guide: the screen's purpose; anatomy (6 regions); *Three alphabets* (spine, story icons, status pill tables); the four tabs; the four verdicts and *"Deviated is the verdict to fear"*; lifecycle diagram; the 7 + 2 beat walkthrough with both branches; *Every control* tables with money; *"Stopping never refunds"*; *The numbers, and what they don't say*; kept/wasted/bill; keyboard |
| `docs/feature-map.md` §3, §15 | §3 tasks: create and track, acceptance criteria and non-goals, start (*"locks in the recipe it will follow"*), pause/send back/cancel, *"A detail view per task"*, the D1 question; ideas (owner, @mention, separation of duties). §15 artifacts: real files, tidy hand-off, formatted viewer, compare two; idea (discuss an artifact) |
| `docs/feature-map.md` §2, §4, §5, §9, §14, §18, §20, §21, *Across everything*, parking lot | §2 *recipe*; §4 retries, three tries, hiccups, *"Your call wins"*, ideas; §5 *"Click to dive in"*, owner idea; §9 live viewer and Stop; §14 workspaces; §18 wasted spend, cost per finished task, ideas; §20 live updates; §21 memory scopes and recall; teams foundation; keyboard/screen reader; replay, injection scan, trends |
| `docs/old/PRD.MD` | §2 no user table; §4 step instance and run; §5 `tasks`, `step_instances`, `runs`, `run_events`, `artifacts`, `questions`; §6 artifacts on disk, scan, `declare_artifact`, types; §7 prompt parts, hooks and non-goals, cost, infra failure classes; §8 gates, rework, `max_attempts`, escalation, Retry / Fail task; §9 park and resume; §10 session link; §11 worktrees, cleanup; §11.1 sandbox, `runs.sandbox`; §11.2 memory scopes, `run_memories`; §12 endpoints; §13 task detail sheet, `/runs/[id]`, `/costs`; §14 M2; §15 seed flow, `/code-review`; §16 acceptance; §17 out of scope |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Task detail sheet card, D1, D3 (*"Fail on the 4th"*), D10 (memory hosting), Flow = versioned DAG (*"Tasks pin flow_id at start"*), Git worktree per task, Step def → step instance → run, wasted spend, Seed data (*"sample tasks"*), the inbox card's *"link to the live session"*. *Logical components*: Task & run state, Workspace and ArtifactStore ports, Git worktree and Filesystem artifacts adapters, Container workspace (dashed), Database and Disk stores. *Functional components*: Observability (Read the step timeline, Open artifacts), Execution (Start task *"pin flow version"*, Stop, Isolate the workspace dashed), Approve / reject a step, Wasted spend. *Harness architecture*: `Task detail /t/[id]`, API routes, SSE endpoints, Read models, SQLite node, Project repo + git worktrees (`.flowboard/worktrees/task-<id>`, `fb/task-<id>`), Run records, Loop guard, Infra-retry classifier, Artifact scanner, Workspace manager, Cost ledger, concept 1 *Bounded contract*, *Life of one step* |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/REBUILD-BACKLOG.md` | Intro (items 1, 3 and 7: $0 running cost, the unlisted Start route, the uncommitted sheet Start button); Story 1.1 `step_instances.reason`, `runs.model/effort`, `runs.sandbox`, `step_defs.sandbox_profile`, artifact types (*"the nine PRD types"*); 2.1 task lifecycle, promote, demote, Start, cancel, cleanup; 2.2 `Enter` opens the sheet, board keys; **2.3 Task detail sheet**; 3.2 artifact scan, completion (*"task blocked"*); 3.3 restart, graceful shutdown; 3.4 viewer, Stop; 4.2 park sets task blocked; 5.2 rework, downstream attempts (**DEC**), approve/reject, task-done bug; 9.1 markdown theme bug; 10.1 acceptance; decisions D1–D9 (D1, D3 and D5 used here) |
| `docs/old/architecture/README.md` | Ports table (Workspace, ArtifactStore adapters); component index #11; *"a task pins its version at start"*; open decision 5 |
| `docs/old/architecture/01-ports.md` | `Workspace` and `ArtifactStore` (variants that disagree with the reference); `NormalizedEvent`, `Usage`, `RunResult` (match the reference) |
| `docs/old/architecture/02-core-and-engine.md` | §1 `runs` as an append-only journal, `step_instances.reason`, `runs.provider`; §3 rework, escalation, task-done rule, approve/reject |
| `docs/old/architecture/03-execution-substrate.md` | §6 artifact scan, infra retries, actual model/effort; §7 restart and graceful shutdown; §8 viewer, Stop, running cost estimate |
| `docs/old/architecture/04-hitl-and-notify.md` | §9 park/resume with `questions` and `answers` artifacts, cancel pending questions on failure |
| `docs/old/architecture/05-environment-and-registry.md` | **§11 Artifact store & workspace → two ports**: role, seam, isolation ladder, worktree hygiene, cleanup states, artifacts vs memory |
| `docs/old/architecture/06-cost-and-platform.md` | §12 cost ledger, wasted spend, pricing at `started_at`, memory cost tagged apart; §15 thin routes |
| `docs/old/architecture/07-ports-in-practice.md` | Git worktree adapter (path, branch, `worktree remove --force`); disk ArtifactStore (scan, resolve, register); the runner composing them |
| `docs/old/architecture/08-sandboxing.md` | One container per run; only the worktree is writable; `runs.sandbox` |
| `docs/old/architecture/09-memory.md` | Task scope, recall per run, `run_memories` |
| `docs/old/reference/core/ports/workspace.ts` | `Workspace`, `WorkspaceHandle`, *"Cleanup is explicit only"* |
| `docs/old/reference/core/ports/artifact-store.ts` | `ArtifactStore`, `FileMeta`, `ArtifactMeta` |
| `docs/old/reference/core/ports/events.ts` | `Usage`, `NormalizedEvent` |
| `docs/old/reference/core/ports/agent-provider.ts` | `RunResult`, `AgentRun` |
| `docs/old/reference/core/ports/task-source.ts` | `ParsedTask` |
| `docs/old/design/brief.md` | §3 Task detail (a sheet): timeline, the approval gate as focus, *"The plan-versus-built diff … This is the screen I'll show people."* |
| `docs/old/design/README.md` | *"Not in this bundle (designed later): task detail sheet"*; `Enter` opens the sheet; `StepRun` state shape; looped-back card meta |
| `docs/pitch.md` | Background only: *"Wasted spend is a number on a dashboard"*; approval gates and questions *"are the design, not a bug"*. Nothing specific to the task detail screen |

## Sibling mockups

| File | What it contributes |
|---|---|
| `docs/mockups/README.md` | Descriptions of task-detail and its guide; house design rules; the monitor's shrinking-total bug |
| `docs/mockups/monitor.html` | `auth-refactor` seeded at the review gate with `run(step, state, startMin, durMin)`, Build ∥ Tests; `↵` expands a row in place; `j`/`k` |
| `docs/mockups/monitor-guide.html` | `auth-refactor` walkthrough: beat 2 *"You promote it"* queues the first step; the plan question; send back to attempt 2, tests untouched; *"Retries are capped, then the task fails"*; $1.98 at done; the `done,done,done:done` bar strings; stop *"recorded as failed"*; **Allow host & retry** re-queues *"as the next attempt"*; wasted spend counts *"a review you sent back"* |
| `docs/mockups/flow-designer-guide.html` | The *Retries* setting: *"How many attempts before the step gives up and fails the task."* |
| `docs/mockups/flow-designer.html` | The flow identity `Software delivery @core v4` (name + author + version), and its $2.14 a task over 182 runs |
| `docs/mockups/inbox.html` | The `auth-refactor` gate card with **Open the task**; send-back hint; **Allow host & retry** for an egress failure, and its hint (*"The failed attempt's spend stays wasted either way."*) |
| `docs/mockups/inbox-guide.html` | Links to the task-detail guide; `auth-refactor` as one card in the opening beat; **Allow host & retry** *"adds the blocked host to that step's allowlist, then re-queues the run"* |
| `docs/mockups/capability-library-guide.html` | *"the failure that burned $0.48 on the build in the task detail screen"* |

## Vault notes relied on

[[Version Pinning]], [[Approval Gates]], [[Branching Joining And Loops]], [[Artifact Contract]], [[Seeded Flows]], [[Step Guardrails]], [[Flow Data Model]], [[Flow Design Open Questions]], [[Capability Library Decisions]], [[Capability Storage On Disk]], [[Execution Open Questions]], [[Monitor Open Questions]], [[Cost And Control Open Questions]].

Overlapping notes in the sets written since (their links resolve once those branches merge): [[Workspace Naming]], [[Cleaning Up A Workspace]], [[Demote And Re-Promote]], [[Git Inside A Workspace]], [[Workspaces Open Questions]], [[Promoting A Task]], [[Seed Data]], [[Intake And Import Open Questions]], [[Memory In The UI]], [[Task Memory Scope]], [[Memory Open Questions]], [[Sandboxing In The UI]], [[Egress Denials]], [[Sandboxing Open Questions]].

> [!warning] Decision numbers collide
> The backlog numbers its decisions D1–D9 (D1 = Start, D3 = attempt cap, D5 = hook isolation). The drawio cards carry D1–D6 on the same topics (drawio D3's content differs, see [[Task Detail Open Questions]] #11), plus **D10** (memory hosting), which has no backlog row. [[Capability Library Decisions]] reuses D1–D31 for different decisions (D1 = Claude-only, D5 = skills store, D10 = tasks pin capabilities). D1 has since been overtaken by the build: OpenCode was built on 2026-10-18 as a second provider ([[Agent Providers Open Questions]] #38). These notes prefix every id with its source: *backlog D3*, *drawio D10*, *Capability Library D10*.

## Related

- [[Task Detail Index]]
- [[Task Detail Open Questions]]
- [[Component Documentation Tracker]]
