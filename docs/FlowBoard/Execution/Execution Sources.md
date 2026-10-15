---
tags: [flowboard, execution, sources]
module: Execution
---

# Execution Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `1787d20` (2026-10-15), on `dev`. They were corrected after an independent grounding pass on the same date.

> [!info] No mockup of its own
> Execution has no screen. The tracker lists its mockup as *"partial (via task detail)"*. Its visible behaviour was gathered from the mockups and guides listed below.

## Primary

| File | What it contributes |
|---|---|
| `docs/old/PRD.MD` | §0 CLI probe; §1 what FlowBoard is; §2 separate worker, routes never spawn; §3 repo layout, `packages/core` rule, only web and worker open SQLite; **§4** flow, step definition, step instance, run, loops guarded; **§5** `step_defs`, `step_edges`, `tasks`, `step_instances`, `runs`, `run_events`, `jobs`, `settings`; §6 artifact scan, `declare_artifact`; **§7** leasing, the `claude` command, `--plugin-dir`, allowed tools, hooks, prompt parts 1–7, events, cost, shell steps, completion, infra failure classes, sandboxed runs; **§8** advancement, `advance_task`, missing outcome, fan-out, join, rework, `max_attempts`, escalation, fingerprint; §9 broker, shim, `set_outcome`, park and resume; §10 `escalate_question` timer; §11 worktrees, shared worktree constraint; §11.1 permission gate, git plugins on the host, Docker probe; §11.2 recall and commit; §12 endpoints; §13 board, task detail, run viewer Stop, draft mode; §14 M2–M5, M8–M9; §15 seed flow, steps and edges, `/code-review` must call `set_outcome`; §16 acceptance; §17 out of scope |
| `docs/old/architecture/02-core-and-engine.md` | §1 `runs.model/effort/provider`, `step_instances.reason`, append-only journal; §2 `board_order` ignores `on_fail`; **§3** the engine: role, seam, task-done rule, guards, approve/reject, rework, no outcome, `max_attempts` escalation, stuck detection, `StepExecutor`; §4 incremental `num_turns`, materialised board |
| `docs/old/architecture/03-execution-substrate.md` | §5 Claude adapter fixes; **§6** the runner: prompt parts, artifact scan, no default outcome, shell steps as sensors, resume prompt, draft mode, sandbox gate, two gates, memory bracket, infra retries, spec snapshot idea; **§7** queue, leasing, generic executor host, spawn bug, restart re-attach, graceful shutdown; §8 SSE tail, Stop = SIGTERM, `cancelled` |
| `docs/old/REBUILD-BACKLOG.md` | Intro items 3–6 (no Start button, restart kills runs, hooks leak, port 3111); 0.2 test harness; 0.3 `.gitignore`; 1.1 `jobs.kind` `resume_step`, `step_instances.reason`, `runs.sandbox`; **2.1** promote, demote, Start, cancel; 2.2 drag, `a` shortcut, `num_turns`; 2.3 Reject asks for a reason, sheet actions; **3.1** job queue, spawn bug; **3.2** runner, resume prompt, completion, draft mode; **3.3** restart recovery, graceful shutdown; 3.4 Stop; 3.5 sandbox gate, limits, transformers; 4.2 park race; 4.1 `VIBE_ASK_TIMEOUT_MS`; 5.1 validation (*"exactly one entry"*); **5.2** advancement, join, rework, `max_attempts`, downstream attempts, task-done bug, guards, approve/reject; 5.3 engine tests; 6.1 `escalation_threshold_ms`, skip rule; 7.3 `import_backlog` with `cleanup`; 8.3 settings toggle; 10.1 acceptance; 10.2 *"approve overrides outcome"* as a deviation; decisions D1, D3, D5 |
| `docs/feature-map.md` | **§4 The engine**: decide next, pass/fail paths, *"Silence isn't success"*, parallel and wait, retry loops, three tries, stops early when stuck, hiccups don't count, *"Your call wins"*; ideas (route to a teammate, two sign-offs). **§7 The runner**: instructions, streaming, cost, wrap up, draft mode. **§8 The work queue**: hand off, cap, survive a restart. §2 check steps, branching, joining, loops; §3 start a task (*"locks in the recipe"*), *"Pause, send back, or cancel"*, the auto-start question; §9 Stop; *Across everything* (testing); parking lot |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Runner & live viewer card (job queue + worker, Stop), Flow engine card (step def → instance → run, advance modes, parallel + join, D3 *"Fail on the 4th"*, StepExecutor), D1, draft mode toggle. *Logical components*: Flow engine, Task & run state, Job queue, Run orchestrator and their edges (*"enqueue step"*, *"claim"*, *"step done → advance"*, *"events, cost"*). **FlowBoard ideation** also: D5 hook isolation card, engine-1 *"Tasks pin flow_id at start"*. **Functional components**: the Execution box (Start task, Run a step, Advance, Rework loop, Split & join, Stop, Isolate the workspace) and its edges to Intake, Flow design, Human in the loop, Observability, Cost & control, Memory. **Harness architecture**: processes, SQLite card, Job loop, Flow engine, Loop guard, Runner, Prompt builder, Permission gate, Shell executor, Infra-retry classifier, Stream parser, Artifact scanner, Workspace manager, Run records, Schedule trigger, Test lane, Check container, Mounts, API routes + server actions, worktree path, harness concepts 1–8, **Life of one step A–I** |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/architecture/README.md` | *"durable workflow engine"* framing; agentic graph; job queue → fleet; dependency rule and lint; module layout (`runner/`, `worker/`); component index #3, #6, #7; open decision 1 (StepExecutor) and 5 |
| `docs/old/architecture/01-ports.md` | `RunSpec`, `AgentRun`, `RunResult`, `AgentProvider`, `Capability` (with `tool_hooks`), `NormalizedEvent`, `Usage`, capability negotiation, logical model ids, ReplayProvider, ExecHost, the bypass gate |
| `docs/old/architecture/04-hitl-and-notify.md` | §9 park/resume primitive, the completion race, cancel questions on run failure |
| `docs/old/architecture/06-cost-and-platform.md` | §12 wasted spend, `runs.model/effort` keep rollups honest; §15 draft mode as a `SpecTransform`, thin routes; *Where a new provider touches the codebase* |
| `docs/old/architecture/07-ports-in-practice.md` | The illustrative `runStep` composing three ports |
| `docs/old/architecture/08-sandboxing.md` | One container per run, physical limits, the gate's *"or fails the step"* option, runner gets the ExecHost |
| `docs/old/architecture/09-memory.md` | Runner brokers recall and commit host-side; `task` scope for rework warm starts |
| `docs/old/reference/core/ports/agent-provider.ts` | `RunSpec` with `exec`, `PromptParts` comments (preamble, `kind='skill'`), `RunResult.outcome` *"Unset is NOT 'pass'"*, `Capability` without `tool_hooks` |
| `docs/old/reference/core/ports/exec-host.ts` | `IsolationTier`, `SandboxProfile`, `ChildHandle`, `ExecHost` |
| `docs/old/reference/core/ports/events.ts` | `Usage`, the seven `NormalizedEvent` kinds |
| `docs/old/reference/core/ports/workspace.ts` | `Workspace.execHost(task)`, cleanup explicit only |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | The replay adapter and its self-check; `stop()` → exit 130 |

## Mockups and guides

| File | What it contributes |
|---|---|
| `docs/mockups/monitor-guide.html` | *The life of a single step* (states and transitions), the four human decisions, fan-out and loop-back beats, Send back, Allow host & retry, Retry as-is, stop (*"recorded as failed"*), worker slots, *"Retries are capped, then the task fails"* |
| `docs/mockups/monitor.html` | `CAP = 4`, `schedule()`, queued vs pending, workers strip |
| `docs/mockups/task-detail-guide.html` | Pause (*"Stops after the current run"*), Send to backlog, Cancel task, Clean up, Approve, Send back, keys; egress denial counted as attempt 1; *"engine gives up and fails the task"*; queued vs pending |
| `docs/mockups/task-detail.html` | `sendBack()` re-queues build, `retries` = Σ(attempts − 1) |
| `docs/mockups/inbox-guide.html`, `docs/mockups/inbox.html` | Failure card *"Attempt 3 of 3 failed — egress denied"*, Allow host & retry, Retry as-is; Approve and Send back keys; `Enter` approves a gate or runs Allow host & retry; *"escalation after 10m"* |
| `docs/mockups/flow-designer-guide.html`, `docs/mockups/flow-designer.html` | Fan-out takes a worker each; *Retries* field *"gives up and fails the task"*, default `retries = 2`; draft mode (*"Not an edit — makes no version"*, haiku, `$0.05` ceiling) |
| `docs/mockups/capability-library-guide.html` | An execution rule for a skill that needs the network: *"add the advisory host to that step's egress allowlist, or the first run fails closed"* (used in [[Run Guardrails At Launch]]) |
| `docs/mockups/README.md` | The monitor *"runs a small flow engine"*; `w` workers key |

## Sibling vault notes used for consistency

Not sources of fact, but cross-checked so the vault agrees: [[Monitor Open Questions]], [[Monitor API And Routes]], [[Task Detail API And Routes]], [[Human In The Loop API And Routes]], [[Attempts And Send Back]], [[Worker Slots]], [[Flow Data Model]], [[Flow Design Open Questions]].

## Related

- [[Execution Index]]
- [[Execution Open Questions]]
- [[Component Documentation Tracker]]
