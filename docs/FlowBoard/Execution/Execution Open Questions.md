---
tags: [flowboard, execution, open-questions]
module: Execution
---

# Execution Open Questions

Every place the sources disagree or leave a gap, plus every proposal these notes make. Numbered for reference.

Callouts mark the questions the code has since answered. *Answered by run-flow* means `run-flow`, the terminal command that runs a flow file on the built engine ([[Run Flow Reference]]); the worker may still answer differently.

## Starting

### 1. Auto-start or an explicit Start?
Feature map §3 asks; backlog D1 and the drawio default to *"Explicit Start button on card + sheet; promote stays cheap"*. PRD §12 has no start endpoint; the first build added `POST /api/tasks/:id/start`. No mockup draws Start, and the mockup guides draw promote as the start: the task-detail guide's *"you promote it"* goes from `backlog` to `running`, and the monitor guide's beat 2 has the first step queued at once. Same as [[Monitor Open Questions]] #24, [[Task Detail Open Questions]] #10 and [[Intake And Import Open Questions]] #14. → [[Starting A Task]]

### 2. What Start does, and what it pins
No source lists Start's steps. **Proposal:** status `running`, one `pending` instance per entry step, one `start_run` each. The sources also split on when the flow is pinned and the worktree made: at **promotion** (PRD §5 *"pinned on promotion"*, PRD §11–§12, backlog 2.1) or at **start** (PRD §4 *"version-pinned at task start"*, drawio *"Start task / pin flow version"* and *"Tasks pin flow_id at start"*, feature map §3). `capability_pins` is *"set when the task starts"* (PRD §5). Once D1 separates promote from Start, these readings differ. Feature map §14 (*"created when the task starts"*) and the architecture README (*"a task pins its version at start"*) also say start; PRD §14 M2 (*"Promote Backlog → Todo creates a worktree"*) and §16 say promote. Same as [[Workspaces Open Questions]] #1. → [[Starting A Task]]

> [!check] Answered by run-flow, 2026-10-23
> run-flow has no promote: the command itself starts the flow, which runs its one entry step at attempt 1, and the flow it loaded is pinned in the run folder's `flow.json` before that (the run-flow plan), with this run's folder and task text and the flow's budget. A flow file is a reusable recipe, and each run names its folder with `--folder` and its task with `--task` (Alex's call, 2026-10-23). Skills and plugins are not pinned: every launch reads them again, `--resume` included (Claude's call, 2026-10-23, open to Alex's review). Promote versus Start, and when the worktree is made, stay open for the web app. See [[Run Flow Reference#Rules this command settles]].

### 3. Worktree path and branch
PRD §11 and backlog 2.1: `.vibe-worktrees/task-<id>` on `vibe/task-<id>`. The drawio: `.flowboard/worktrees/task-<id>` on `fb/task-<id>`. The task-detail mockup: `~/.flowboard/ws/<task>` on `flowboard/<task>`. Same as [[Workspaces Open Questions]] #6. → [[Execution Storage]], [[Workspace Naming]]

## Advancement

### 4. Is `implement` a join?
By PRD §8's definition (*"multiple incoming edges"*) it is: it has `on_fail` edges in from `check` and `review`. The literal rule does not block it, because it waits on upstream *instances*, which do not exist until their edges fire, and rework reuses the `implement` instance. But the wording invites a per-edge reading. PRD §15 names only `check` as *"the join"*. Backlog 5.2 states the intent: *"every non‑`on_fail` upstream instance"*. Adopt that wording. Feature map §2 (*"review waits for both code and tests"*), backlog 10.1 (*"`review` joins"*) and the monitor guide also call `review` the join. → [[Fan-Out And Join]]

> [!check] Answered by run-flow, 2026-10-23
> No. A step waits for each step with a forward route into it while that step is live or can still be reached from a live step, and rework routes never make a join (the run-flow plan). Its "forward" is not backlog 5.2's "non-`on_fail`": a forward `on_fail` route into a join is waited on like any other, and `--check` warns that, if that route does not fire, the join runs without it. See [[Run Flow Reference#Edges, loops and joins]].

### 5. Approval and questions on one step
PRD §8 checks approval before unanswered questions. A step with both parks for approval while questions are still open.

As built in run-flow (2026-10-23), this cannot happen: questions are answered live in the terminal, and any still open are withdrawn when the run ends, before an approval gate opens. Parking is left out of run-flow, so the question stays open for the worker.

### 6. What a `manual` step does
PRD §5 allows `kind = 'manual'`. No rule says how the engine runs it, what it waits for, or what sets its outcome.

As built in run-flow (2026-10-23), there is no manual step: a step is an `ai` step unless it has `shell:`. Manual steps are left out until [[Flow Design Open Questions]] #39 is settled (Claude's call, 2026-10-23, open to Alex's review); the stand-in is a step with `shell: "true"` and `gate: approval`.

### 7. Which artifact carries the outcome
When a step produces several JSON files, or calls `set_outcome` and also writes a JSON outcome, which wins is not stated. **Proposal:** `set_outcome` first, then the first produced JSON with an `outcome` key. → [[Run Outcomes]]

> [!check] Answered by run-flow, 2026-10-23
> The verdict `set_outcome` wrote, then the provider's `RunResult.outcome`, then none (the run-flow plan). No produced JSON is read; a JSON outcome fallback is on the plan's Left out list. Only agent steps whose routes or approval gate read the verdict are offered `set_outcome`, and an outcome another agent step reports is ignored (Claude's call, 2026-10-23, open to Alex's review). See [[Run Flow Reference#How a step's outcome is decided]].

### 8. Where `set_outcome`'s reason goes
Backlog 1.1 adds `step_instances.reason` for rejection or failure text. Whether `set_outcome({ reason })` writes it is not stated.

> [!check] Answered by run-flow, 2026-10-23
> On the run, not the step: run-flow keeps the agent's reason on its run record (`reason` in `state.json`) and in the run's `<NNN>-<step>.outcome.json`, and quotes it in the reason of an approval gate or an unhandled-fail gate; it does not reach the next run's prompt. A person's note is kept apart, on the step instance (`note`), and goes to the runs a decision starts (#21). Whether the worker's `step_instances.reason` holds either is still open. See [[Run Flow Reference#Gates and their choices]].

### 9. How "earlier step" is decided
Rework is *"an `on_fail` edge pointing at an earlier step"* (PRD §8). Earlier by topological order, `board_order`, or reachability is not stated.

> [!check] Answered by run-flow, 2026-10-23
> By reachability: an `on_fail` route back to its own step, or to a step from which it can be reached along `always` and `on_pass` routes, is a rework route. Every other route is forward, and forward routes may not loop (the run-flow plan). See [[Run Flow Reference#Loops]].

### 10. Task done
PRD has no done rule; `02` §3 gives *"no active instances **and** no reachable pending targets"*. "Reachable" is not defined. **Proposal** in [[Task Completion]].

> [!check] Answered by run-flow, 2026-10-23
> run-flow needs no "reachable" test: a pending step starts once no live step is, or can still reach, one of its forward upstreams, so none is left waiting, and the flow is done when no step is pending, running or waiting at a gate. In [[Task Completion]]'s stranding example the join runs without the route that did not fire, and the flow ends `done`; `--check` warns about such a join (the run-flow plan's answer to [[Flow Design Open Questions]] #19). See [[Run Flow Reference#Edges, loops and joins]].

### 11. Task status at a plain approval gate
`blocked` is stated for infra failures, spent loops and parked runs. Whether an ordinary approval gate sets `blocked` is not. The task-detail status bar says *"blocked on you"* while a gate waits; its header pill says *"waiting on you"*.

As built in run-flow (2026-10-23), the flow stays `running` at every gate, and no blocked or paused status is stored: each gate records its kind (`verdict`, `escalation` or `run_failed`), and a screen can read paused or stopped from `state.json` (Claude's call, 2026-10-23, open to Alex's review). What the web app shows at a plain approval gate is still open.

### 12. Instance states after Reject, Fail task and infra failure
The task status is given; the instance state is not. **Proposal** marked `*` in [[Execution State Machines]]. On screen, the monitor's **failed** chip maps to no settled PRD state: instance `failed`, an escalation gate, or a `blocked` task (see [[Execution Surfaces]]).

> [!check] Answered by run-flow, 2026-10-23
> As proposed for Reject and Fail: Reject leaves the step `done` with outcome `fail` and fires its `on_fail` and `always` routes, and Fail the flow marks every pending, running or waiting step `failed`. An infra failure is not `failed`: its step waits at `awaiting_approval` behind a *run failed* gate (Retry this step or Fail the flow), and only Fail the flow fails it (the run-flow plan). See [[Run Flow Reference#Gates and their choices]].

### 13. `queued` is not a state
The monitor and task-detail mockups show a **queued** state, *"ready, no free worker"*. PRD §5 has no such step state. **Inferred:** a `pending` instance with a queued `start_run` job.

> [!check] Answered by run-flow, 2026-10-23
> In run-flow, queued is a flag on the run, not a step state: a run is `queued: true` in `state.json` from the moment it is due until the host reports it launched (a `launched` event in `flow.jsonl`), while its step shows `running`. A run cut off while still queued behind `--max-runs` is recorded with the error `not launched`, is not wasted, and `--resume` starts it (Claude's call, 2026-10-23, open to Alex's review). The worker may still make `queued` a step state. See [[Run Flow Reference#Rules this command settles]].

## Loops

### 14. Escalate or fail at `max_attempts`?
PRD §8, `02` §3, the drawio *Loop guard* card and backlog D3 (decided 2026-10-15): escalate. PRD §16, backlog 10.1, the drawio D3 card, the flow designer guide, the monitor guide and the task-detail guide: fail. Update the stragglers. → [[Loop Guard And Escalation]]

> [!check] Answered by run-flow, 2026-10-23
> Escalate, as backlog D3 decided: a rework whose target has used up `max_attempts` opens an escalation gate (Retry this step or Fail the flow) on the target and starts nothing, and only a person's Fail the flow fails a flow (the run-flow plan). The escalation also stops and discards the work below its target, since Retry and Fail would both discard it (Claude's call, 2026-10-23, open to Alex's review). See [[Run Flow Reference#Loops]].

### 15. The Retries field versus `max_attempts`
The flow designer's *Retries* field defaults to 2 (`flow-designer.html`); PRD §5's `max_attempts` defaults to 3. [[Flow Data Model]] maps Retries as `max_attempts − 1`, a proposal ([[Flow Design Open Questions]] #11). (The drawio's *"Fail on the 4th (default 3)"* agrees with PRD §8 on the count; only fail versus escalate differs, which is #14.)

> [!check] Answered by run-flow, 2026-10-23
> The flow file has PRD §5's `max_attempts`, a whole number of 1 or more, default 3, counting the first run, and no Retries field (the run-flow plan). Setting it on a step no rework route leads back to is an error, since nothing reads it. The designer's field is [[Flow Design Open Questions]] #11. See [[Run Flow Reference#Step fields]].

### 16. After a Retry
Retry *"does not reset the counter"* (PRD §8). **Inferred:** the next failure escalates again at once. Not stated.

> [!check] Answered by run-flow, 2026-10-23
> As inferred: Retry at a spent loop's escalation gate reruns the target one attempt past `max_attempts`, without resetting the count, so its next failing loop escalates at once (the run-flow plan). At a stuck check with attempts left, the rerun is within the budget, and a later failure escalates again only if it fails the same way or spends the budget. See [[Run Flow Reference#Loops]].

### 17. Which runs are wasted on rework
PRD §8 and `02` §3 say *"superseded runs"*; only backlog 5.2 says *"downstream runs `wasted=1`"*. Whether the target's previous run and the failing step's run are wasted is not stated; the mockups waste the target's. → [[Rework Loop]]

> [!check] Answered by run-flow, 2026-10-23
> More than the PRD's *"superseded runs"*: on rework, every run so far of the target and of every step downstream of it is wasted, the failing run included, while a parallel branch not downstream of the target is not (the run-flow plan). Interrupted runs (cut off by Ctrl+C, a crash or a spent budget), runs that end at a *run failed* gate and runs replaced by a gate's Retry are wasted too; runs stopped by Fail the flow, and runs that never launched (#13), are not. See [[Run Flow Reference#Loops]].

### 18. Downstream attempts
Backlog 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."*

> [!check] Answered by run-flow, 2026-10-23
> Reset, as backlog 5.2 describes: a rework drops every step below the target, each starts again at attempt 1 when the work reaches it, and only the target's count carries over (the run-flow plan). See [[Run Flow Reference#Loops]].

### 19. Stripping digits and "fewer failing tests"
PRD §8 strips digits before hashing, then says fewer failing tests change the fingerprint. A count line like `3 failing` → `2 failing` does not change. → [[Stuck Detection And Fingerprints]]

> [!check] Answered by run-flow, 2026-10-23
> The run-flow plan keeps the PRD algorithm, with one change: an absolute path shrinks to its file name. run-flow also removes UUIDs, hex ids, durations with their unit, and day and month names before the digits. So a count-only change still looks stuck (`Tests: 3 failed` and `Tests: 2 failed` get one fingerprint), and a person who sees progress picks Retry this step at the escalation gate. See [[Run Flow Reference#Shell steps]].

### 20. Where the escalation gate sits
On the rework target, with the failing step's artifact (PRD §8). No mockup draws an escalated-loop gate where the two differ: the inbox's `billing-webhook` failure card is an egress failure on `build` itself. Which step the screens should name is not settled.

> [!check] Answered by run-flow, 2026-10-23
> On the rework target, as PRD §8 says, with the outputs the failing run wrote as evidence; the gate's `from` names the failing step, so a screen can name both (the run-flow plan). run-flow's terminal heads the gate `<target>: <reason>`, and only the stuck reason, `<step> failed the same way twice`, names the failing step. See [[Run Flow Reference#Gates and their choices]].

### 21. Where the reject reason and Retry note go in the prompt
*"a rejection carries your reason into the next attempt"* (feature map §4); Retry *"carries my note into it"* (PRD §8). The prompt part is not stated. **Proposal:** the preamble. Where the note is stored is not stated either. → [[Prompt Assembly]]

> [!check] Answered by run-flow, 2026-10-23
> In the preamble, as the line `A person's note for this attempt: <note>` (the run-flow plan); a shell step gets it as the environment variable `FLOWBOARD_NOTE`, and the step instance keeps it as `note` in `state.json`. Each note goes to the runs its decision starts: Approve's to the steps its routes start, Reject's to the rework target or the steps its routes start, and Retry's to the rerun, while Fail the flow's is kept only in `flow.jsonl` (Claude's call, 2026-10-23, open to Alex's review). See [[Run Flow Reference#Gates and their choices]].

## Failures and stopping

### 22. Is an egress denial an attempt?
Under PRD §7 it is not a work verdict, so it is not an attempt. Whether it is transient is unclear: the list includes *"network error"*. If not transient, it blocks the task. Task-detail and inbox mockups count it as an attempt. Same as [[Monitor Open Questions]] #11. Whether a denial ends the run at all, or only fails one tool call, is not stated either ([[Sandboxing Open Questions]] #14). → [[Infra Retries]]

### 23. Retry as-is for transient failures
Monitor guide offers it for *"a rate limit, a transient error"*; PRD §7 retries those automatically. ([[Monitor Open Questions]] #37; same as [[Human In The Loop Open Questions]] #25)

As built in run-flow (2026-10-23), nothing is retried automatically: a run that ends in an error, a rate limit included, waits at a *run failed* gate, whose Retry this step reruns the same attempt, run-flow's Retry as-is. Automatic retry with backoff is on the run-flow plan's Left out list, so the worker may still do what PRD §7 says.

### 24. Allow host & retry
Writes to *"this step's egress allowlist"*. Flows are immutable versions (PRD §4); which version it edits, and whether the running task sees it, are not stated. It does count: the monitor guide re-queues the run *"as the next attempt"*. What is open is a retry past the cap: the inbox card offers it on *"Attempt 3 of 3 failed"*, and no source says whether that attempt is allowed, escalates (PRD §8) or fails the task. Same as [[Sandboxing Open Questions]] #11 and [[Human In The Loop Open Questions]] #26.

### 25. How the runner classifies a failure
No source lists the exit codes, stderr patterns or events that mean "transient".

### 26. Unblocking after a non-transient failure
Partly answered: backlog 3.3 fails a dead run *"with a Retry hint"*, backlog 2.3 puts *"Retry"* in the sheet, and backlog 5.3 tests *"retry after failure"*. What that Retry does (same attempt or the next, counted or not) is not stated. `POST /api/step-instances/:id/retry` is described only for escalation gates.

> [!check] Answered by run-flow, 2026-10-23
> The same attempt, not counted: Retry this step at a *run failed* gate reruns the step at the same attempt number with the same inputs, and the failed run is wasted (the run-flow plan). run-flow offers Retry this step at every kind of gate. See [[Run Flow Reference#Gates and their choices]].

### 27. A stopped run: `cancelled` or `failed`?
`03` §8 and backlog 3.4: `cancelled`. Monitor guide: *"recorded as failed, with "stopped by you""*. ([[Monitor Open Questions]] #14)

> [!check] Answered by run-flow, 2026-10-23
> Neither, and there is no per-run Stop: a run cut off by Ctrl+C, SIGTERM or SIGHUP, or because the flow has spent its budget, is recorded with the error `interrupted` and wasted, and its step stays `running` for `--resume` (the run-flow plan). Runs stopped by Fail the flow get `stopped` (not wasted), runs stopped by a rework or an escalation `superseded` (wasted), and a run cut off before it launched `not launched` (#13). [[Run Flow Monitor Readiness]] suggests a `run failed: stopped by you` gate for a future per-run Stop, which matches the Monitor guide. See [[Run Flow Reference#Stopping and resuming]].

### 28. What the engine does after a Stop
Not stated. **Proposal:** park the instance at `awaiting_approval` with reason "stopped"; no automatic retry. → [[Stopping And Cancelling]]

> [!check] Answered by run-flow, 2026-10-23
> After Ctrl+C the step stays `running`, with no gate, and `--resume` reruns it at the same attempt; nothing reruns it by itself (the run-flow plan). A single run stopped on its own, today only by its `timeout_minutes`, ends with an error such as `timed out after 10 minutes` and waits at a *run failed* gate, close to the proposal; a per-run Stop would land there too. See [[Run Flow Reference#Stopping and resuming]].

### 29. Pause
Feature map §3 names it (*"**Pause, send back, or cancel**"*); the task-detail guide gives the rule: *"Stops after the current run rather than mid-flight. The workspace stays."* No status, column, endpoint or engine rule backs it. **Proposal:** a flag checked before enqueuing the next `start_run`.

> [!check] Answered by run-flow, 2026-10-23
> run-flow pauses mid-flight, not after the current run: Ctrl+C (or SIGTERM or SIGHUP) stops every live run, records it `interrupted` and wasted, saves the state and exits 130, and `--resume` reruns those runs at the same attempt (the run-flow plan). A gate that no terminal can answer also pauses the flow, with exit 3, and so does a spent budget: when a run ends and the flow has spent its `budget_usd`, run-flow stops the live runs as Ctrl+C does and exits 3, and `--resume <run folder> --budget-usd <more>` carries on (Alex's call for the ceiling, 2026-10-23; pausing at it is Claude's call, open to Alex's review). A pause that lets live runs finish and launches nothing new would be a small change to the run-flow host. See [[Run Flow Reference#Stopping and resuming]].

### 30. Restart: fail with a hint, or retry?
`03` §7 and backlog 3.3: dead pid → *"fail with a Retry hint"*. PRD §7: *"lost on restart"* is transient → automatic retry. → [[Worker Lifecycle]]

> [!check] Answered by run-flow, 2026-10-23
> Retry, as PRD §7 says, but not automatically: a person runs `--resume`, which records the runs still marked live as `interrupted` (or `not launched`, if they never started; #13), then reruns each running step at the same attempt (the run-flow plan). A dead host's lock is replaced, and the run-flow that replaces it first stops the agents and checks the dead one left running, which each run log's `pid` line names; `--resume` does the same in its own run folder (Alex's call, 2026-10-23). See [[Run Flow Reference#Stopping and resuming]].

### 31. Re-attaching to a live process
After a worker restart the stdout pipe is gone. How the worker keeps tailing a still-alive run is not stated. *Inferred gap.* Same as [[Agent Providers Open Questions]] #30. **Proposal:** for sandboxed runs, `docker logs -f` on the run's container ([[Worker Lifecycle]]).

> [!check] Answered by run-flow, 2026-10-23
> run-flow does not re-attach: the next run-flow in the folder, or `--resume`, stops what a dead host left running (Alex's call, 2026-10-23), and `--resume` reruns those runs at the same attempt. A pid is signalled only while its start time matches the one the run log's `pid` line recorded, since it may be another process's by now (Claude's call, 2026-10-23, open to Alex's review). The worker may still re-attach. See [[Run Flow Reference#Stopping and resuming]].

### 32. Graceful shutdown and re-queue
Shutdown marks runs `cancelled`. Whether they are re-queued when the worker returns is not stated.

> [!check] Answered by run-flow, 2026-10-23
> SIGTERM and SIGHUP stop the flow as Ctrl+C does: every live run is stopped and recorded `interrupted` (wasted, not cancelled), a run still waiting for a `--max-runs` slot `not launched` (#13), the state is saved, and the host exits 130. `--resume` re-queues them at the same attempt (the run-flow plan). See [[Run Flow Reference#Stopping and resuming]].

## Queue and runner

### 33. The 10-minute stale-lease reclaim and long runs
If a `start_run` stays leased for its run, a run over 10 minutes is reclaimed. The *"must not complete before the child spawns"* bug implies the job completes at spawn. Not stated outright. → [[Job Queue]]

### 34. Job payloads
No source specifies `payload`. **Proposal** in [[Job Queue]].

### 35. When a job is `failed`
`attempts` and `last_error` exist; no limit or rule.

### 36. `VIBE_MAX_RUNS` default
Not given. The monitor mockup uses 4. Whether shell runs take a slot is not stated. ([[Monitor Open Questions]] #20) Whether the cap is an env var or a setting is not stated. **Inferred:** non-run jobs (`advance_task`, `escalate_question`, `import_backlog`) take no slot, though `import_backlog` may run an agent (backlog 7.3).

> [!check] Answered by run-flow, 2026-10-23
> For run-flow: the cap is the `--max-runs` flag, per flow and unlimited by default; `flow.json` keeps it for `--resume` unless `--max-runs` is given again. Shell runs, and agent runs waiting on a question, each hold a slot (the run-flow plan). The worker's shared cap is still open. See [[Run Flow Reference#Commands]].

### 37. `resume_step` job kind
Backlog 1.1 (**DEC**). PRD §9 resumes with a `start_run`. Same as [[Human In The Loop Open Questions]] #7.

### 38. `args.json` or `spec.json`
PRD §7: `data/runs/<id>/args.json`. `03` §6 and the drawio: `spec.json` (+ raw stream). → [[Runner Pipeline]]

As built (2026-10-18), neither exists, and the Agent SDK builds the CLI's arguments inside the Claude adapter, so a runner has no final command line to snapshot. `run-agent` logs the launched `RunSpec` as the `start` line of its run log ([[Agent Providers Storage]]).

> [!check] Answered by run-flow, 2026-10-23
> Neither file: each run's spec is the `start` line of its log, `runs/<stamp>-<flow>/<NNN>-<step>.jsonl` (a shell run logs its command), the run's events and result follow in the same log, and `flow.json` beside it pins the flow (the run-flow plan). That layout is the interim answer; the worker's is still open. See [[Run Flow Reference#Files written]].

### 39. Where per-run `mcp.json` and `settings.json` are written
Not stated. **Proposal:** `data/runs/<id>/`.

> [!check] Answered by the code, 2026-10-18
> Nowhere: no file is written. The Claude adapter passes `mcpServers`, `settingSources: []` and the guard hook to the Agent SDK in memory; the OpenCode adapter passes one config in `OPENCODE_CONFIG_CONTENT`. See [[Agent Providers Open Questions]] #4 and #24.

> [!check] Answered by run-flow, 2026-10-23
> run-flow launches through the same adapters, so it writes neither file, and each run's logged spec is the record (#38). Per run it keeps only a `/tmp/fb-*` folder for the question socket and any copied skills, removed when the run ends. See [[Run Flow Reference#Files written]].

### 40. Shell step: task host or a fresh container?
PRD §7: *"through the same execution host"*. drawio: *"in a fresh sandbox"*, *"Check container"*. See also #61; [[Sandboxing Open Questions]] #17, #20. → [[Shell Step Execution]]

### 41. Shell steps that cannot start
A shell step's non-zero exit is an outcome. A missing command, an out-of-memory kill, or a container that never starts would loop as `fail` rather than block. Physical limit kills are #68. Same as [[Sandboxing Open Questions]] #15.

> [!check] Answered by run-flow, 2026-10-23
> A shell step whose command cannot run, or whose shell is killed by a signal, is a setup failure, not a `fail`: it waits at a *run failed* gate with `exit code 127: command not found`, `exit code 126: the command cannot run` or, for a signal, `killed by SIGKILL` and the like. Any other non-zero exit is a `fail` outcome (Claude's call, 2026-10-23, open to Alex's review). run-flow has no container tier, so a container that never starts does not arise yet. See [[Run Flow Reference#Shell steps]].

## Contracts

### 42. Three versions of `RunSpec` and `Capability`
`01-ports.md` has `tool_hooks`; the reference `agent-provider.ts` (`docs/old/reference/`) does not. `01-ports.md`'s sketch lacks `exec`; the reference carries the sandbox tier only through `exec` (`ExecHost.id`, `SandboxProfile.tier`). Neither carries the permission mode, the agent's system prompt or the per-run hook settings. Who generates the session id also differs: PRD §7 has the runner pass a generated `--session-id`, while `AgentRun.sessionId` resolves from `system/init`. Same as [[Agent Providers Open Questions]] #1, #3, #4, #5. → [[Agent Launch Contract]]

> [!check] Implemented 2026-10-18
> The shipped port (`core/src/ports/agent-provider.ts`) has `tool_hooks` and `RunSpec.exec`, and adds `permissionMode`, `systemPrompt` and `guards`, the provider-neutral hook rules. Claude Code and OpenCode declare `tool_hooks` and enforce `guards` in-agent, so no hook settings file is written. Nothing passes `exec` yet, so runs use the host. No adapter passes a session id: the provider reports it, Claude from the first `system/init` and OpenCode from its session create or fork response. See [[Agent Providers Open Questions]] #1, #3, #4 and #5.

### 43. Step kinds
PRD §5: `ai | shell | manual`. `02` §3: `skill | agent | shell | manual`. The reference `agent-provider.ts`: *"kind='skill'"*; the shipped port's comment names no kind ([[Prompt Assembly]]).

> [!check] Answered by D27, 2026-10-15
> `ai | shell | manual`, as PRD §5 has it: an `ai` step names an agent, a skill or both ([[Capability Library Decisions]] D27; [[Step Kinds]]). run-flow builds only the first two: a step is an `ai` step unless it has `shell:`, and it uses run-agent's `prompt`, `skill` and `system_prompt` keys, with no `agent:` key yet. Manual steps are #6.

### 44. Preamble and placeholders
`agent-provider.ts`: preamble is *"task title + body"*. PRD §7 adds acceptance criteria and non-goals. Backlog 3.2's placeholder list omits `{{acceptance_criteria}}` and `{{non_goals}}`.

### 45. Draft mode: `haiku` or a logical id
PRD §13 and the drawio: `haiku` / `low`. `06` §15: `'fast-cheap'` / `'low'`. PRD §5 treats Claude aliases as the logical ids, so `haiku` is logical under the PRD's reading. Budgets: answered, no; `06` §15's transform changes only model and effort. Same as [[Agent Providers Open Questions]] #13 and [[Settings And Plumbing Open Questions]] #4. No milestone names draft mode; **inferred** home M8, next to the cost views ([[Execution Roadmap]]). → [[Draft Mode And Spec Transforms]]

### 46. `wasted` in an append-only journal
`02` §1 wants `runs` append-only; `wasted` is set later on superseded runs. Same as [[Settings And Plumbing Open Questions]] #28.

> [!check] Answered by run-flow, 2026-10-23
> run-flow keeps the two apart. The run records in `state.json` are mutable, and the file is rewritten on every transition: `queued` and `live` are cleared as a run launches and ends, and `wasted` or a late cost can be set after it ended. `flow.jsonl` is the append-only journal, one `{at, event, commands}` line per transition (the run-flow plan). See [[Run Flow Reference#Files written]].

## API

### 47. Missing endpoints
Start, demote, pause, Fail task and Stop have no PRD endpoint. Sibling sets propose different shapes: Fail task as `POST /api/tasks/:id/fail` ([[Task Detail API And Routes]]) or `POST /api/step-instances/:id/fail-task` ([[Human In The Loop API And Routes]]); Allow host & retry as `retry` with `{ note?, allowHost? }` ([[Monitor API And Routes]]) or `POST /api/step-instances/:id/allow-host` `{ host }` (Human In The Loop and [[Sandboxing API And Routes]]). Stop (`POST /api/runs/:id/stop`) and demote (`POST /api/tasks/:id/demote`) proposals already agree across Task Detail, Monitor and Workspaces. Pick one shape for Fail task and Allow host. → [[Execution API And Routes]]

## Concurrency

### 48. Shared worktree
*"If two concurrent steps both write code they will conflict"* (PRD §11). A known constraint until the container workspace. See [[Shared Worktree Within A Task]] and [[Workspaces Open Questions]] #22.

As built in run-flow (2026-10-23), every step works in the one folder the run names with `--folder` (the run-flow plan). `write_roots`, paths inside that folder, narrows an agent step's file-editing tools only, `--max-runs 1` runs branches one at a time, and agent steps may not run git commands that discard uncommitted edits (Claude's call, 2026-10-23, open to Alex's review).

### 49. One branch blocked, the other running
When one fan-out branch escalates, the task is `blocked` while its sibling still runs. Not addressed.

> [!check] Answered by run-flow, 2026-10-23
> A gate stops only its own step: the other branches keep running, and the flow stays `running` (the run-flow plan). An escalation also stops the work below its target, so a sibling branch keeps running only if it is not below that target (Claude's call, 2026-10-23, open to Alex's review). run-flow pauses, with exit 3, only when nothing else can run and no terminal can answer, or when the flow has spent its budget (#29). See [[Run Flow Reference#Gates and their choices]].

### 50. Cancel mid-fan-out
Backlog 5.3 asks for the test; no rule beyond Cancel's general effect.

> [!check] Answered by run-flow, 2026-10-23
> There is no cancel: Ctrl+C pauses the flow for `--resume`, and Fail the flow at any gate stops every live run on every branch, without wasting them, and fails every live step (the run-flow plan). Cancel is on the plan's Left out list, so the worker may still add one. See [[Run Flow Reference#Stopping and resuming]].

## Added on grounding review

### 51. Where recalled memory goes
Before the closing instruction (PRD §7; `09-memory.md`) or appended as the final part (PRD §11.2; `03` §6; the drawio's *"+7"*). `PromptParts` (`agent-provider.ts`) has six fields and no slot for it. Same as [[Memory Open Questions]] #6. → [[Prompt Assembly]]

### 52. An empty `--settings` file, or the hooks file?
Backlog D5 and the drawio D5 card: *"Empty `--settings` file per run"*. PRD §7 and the drawio *Runner* card: a per-run `settings.json` *"with PreToolUse hooks"*. Backlog 0.1 leaves the mechanism open (**DEC**): *"`--settings` with an empty file, or `CLAUDE_CONFIG_DIR`"*. Same as [[Sandboxing Open Questions]] #24, [[Agent Providers Open Questions]] #24 and [[Settings And Plumbing Open Questions]] #29. → [[Run Guardrails At Launch]]

> [!check] Answered by the code for the host tier, 2026-10-18
> Neither a `--settings` file nor `CLAUDE_CONFIG_DIR`. Claude runs get `settingSources: []` and `strictMcpConfig`, and the guards are an in-process hook; OpenCode runs get a fresh `XDG_CONFIG_HOME` and `OPENCODE_DISABLE_PROJECT_CONFIG=1`. See [[Agent Providers Open Questions]] #24.

### 53. `bypassPermissions` on the host tier
Refuse (PRD §7, `01-ports.md`), refuse or downgrade (PRD §11.1), downgrade (`03` §6, drawio), or downgrade or fail the step (`08`, backlog 3.5 tagged **DEC**). Feature map §10 sides with refuse (*"otherwise FlowBoard refuses it"*). With no Docker, `08` adds *"(or warn)"* to disabling `bypassPermissions`. Same as [[Sandboxing Open Questions]] #1. Which tiers count also differs: `03` §6 names only *"(container/microVM)"*; `01-ports.md`, `08` and the drawio include gVisor ([[Sandboxing Open Questions]] #2). → [[Run Guardrails At Launch]]

> [!check] Answered by the code for the host tier, 2026-10-18
> Refuse unless the run opts in: `run-agent` refuses `bypassPermissions` or `auto` mode unless `permissions.allow_unrestricted_shell: true` ([[Run Agent CLI Decisions]] R3, R4). Every run-flow agent step goes through the same check, and `--check` and the flow's start then warn: `-- warning: steps.<step>: unrestricted shell: commands can write outside <folder>` (`outside the folder` when `--check` is given no `--folder`). The sandbox tier's half is still open.

### 54. Does the MCP process open the database?
Yes per `02` §1 and backlog 1.1 (*"so worker and MCP … hit the same file"*); never per PRD §3, §9 and the drawio *SQLite* card. Same as [[Settings And Plumbing Open Questions]] #20 and [[Human In The Loop Open Questions]] #37. → [[Worker Lifecycle]]

### 55. Would a Stop be retried automatically?
PRD §7 lists *"process killed by a signal"* as transient. Stop and graceful shutdown are SIGTERMs. On every shipped provider (Claude, OpenCode and Replay), `stop()` before the result settles `{ exitCode: 130, error: 'stopped' }`, while a process killed from outside is reported as exit 1. Same as [[Monitor Open Questions]] #35. Same as [[Agent Providers Open Questions]] #22. → [[Stopping And Cancelling]]

> [!check] Answered by run-flow, 2026-10-23
> No: nothing reruns a stopped run by itself. A run stopped by Ctrl+C, SIGTERM or SIGHUP is recorded `interrupted`, whatever its exit code, and reruns only on `--resume`; a run stopped by its timeout waits at a *run failed* gate (the run-flow plan: infra failures are not retried automatically). See [[Run Flow Reference#Stopping and resuming]].

### 56. Who finalises a stopped run?
`03` §7: the worker is *"the only writer of run lifecycle state"*. `03` §8 and backlog 3.4: the route SIGTERMs by pid and should *"finalise as cancelled"*. Same as [[Monitor Open Questions]] #36. **Inferred:** on the container tier the host pid belongs to the `docker` client, not the agent, and the port's `stop()` lives in the worker that holds the handle ([[Stopping And Cancelling]]). As built, the port has no `kill()`, a signal from outside is reported as a failed run (exit 1), not as a stop, and OpenCode's pid is its server's ([[Agent Run Handle And Result]]).

### 57. A failing shell run's `runs.state`
PRD §7's completion rule: non-zero → `failed`. Its shell paragraph: *"a result, not a run failure"*. Which run state a failing check records is not stated. → [[Shell Step Execution]]

> [!check] Answered by run-flow, 2026-10-23
> A result, not a run failure: a check that exits non-zero completes with outcome `fail` and, when it printed something, a fingerprint (the run-flow plan). Run records have no state field; a shell run ends with an error only when it cannot be set up or started, cannot save its output, exits 126 or 127 or is killed by a signal (#41), times out, or is stopped. See [[Run Flow Reference#Shell steps]].

### 58. Finding a check's "previous failed run"
Downstream steps are re-instantiated on rework (`02` §3), so the previous failed `check` run sits on an earlier instance. How the fingerprint lookup crosses instances is not stated. → [[Stuck Detection And Fingerprints]]

> [!check] Answered by run-flow, 2026-10-23
> The lookup searches the flow's whole run list by step name, so it crosses rework rounds: a failing check is compared with the latest earlier failed run of the same step that has a fingerprint, and a failure that printed nothing has none and is skipped (the run-flow plan). See [[Run Flow Reference#Loops]].

### 59. Escalation delay: 5 or 10 minutes
PRD §10, the drawio and backlog 6.1 (`settings.escalation_threshold_ms`, default 5 min): 5 minutes. 10 minutes: `inbox.html` (`ESCALATE = 10 * MIN`), `inbox-guide.html` (*"escalation after 10m"*, *"Ten minutes without an answer"*), `monitor.html:731` (`> 10 * MIN`) and the mockups README (*"crosses the ten-minute threshold"*). Same as [[Escalation And Notifications Open Questions]] #1 (the full source list), [[Monitor Open Questions]] #9, [[Settings And Plumbing Open Questions]] #6 and [[Human In The Loop Open Questions]] #18. See [[Escalation Threshold]]. → [[Job Queue]]

### 60. Cleanup after failure
PRD §11 offers cleanup once `done` or `cancelled`; feature map §14 and the task-detail guide say *"finished or cancelled"*. Backlog 2.1, `05` §11 and `workspace.ts` add `failed`. The task-detail mockup draws the button only once every step is done. Same as [[Workspaces Open Questions]] #11 and [[Task Detail Open Questions]] #13. → [[Execution Storage]], [[Cleaning Up A Workspace]]

### 61. Container per task, or per run
PRD §7 *Sandboxed runs*: *"inside the task's container"*. PRD §11.1: *"one per run, destroyed on completion"*; `08`: *"One container per run/attempt"*; the drawio: *"in a fresh sandbox"* for checks. Backlog 3.5 also says *"ephemeral container per run"*. Same as [[Sandboxing Open Questions]] #17 and [[Workspaces Open Questions]] #23. → [[Shell Step Execution]]

### 62. The event envelope and live cost
`events.ts` has no `v`, which `01-ports.md` and PRD §7 require. `Usage` arrives only on `result`, yet PRD §7 wants a running cost from per-message tokens. Same as [[Monitor Open Questions]] #38, #39. `agent-provider.ts` promises *"live token counts"* from `partial_stream`, but no event kind carries them. Same as [[Agent Providers Open Questions]] #6, #9. → [[Agent Launch Contract]]

> [!check] Answered by the code, 2026-10-18
> The shipped port adds an eighth kind, `usage`, with the run's running totals; Claude's carry no cost until the result. `v` is skipped for now, waiting for the runner and `run_events`. See [[Agent Providers Open Questions]] #6 and #9.

As built in run-flow (2026-10-23), `v` is still missing. run-flow prints and logs each `usage` event as it comes, but records a run's cost only when the run ends (`costUsd` on its record in `state.json`); a Claude run stopped before its result has tokens and no price, so its cost is `null`, printed `cost unknown`.

### 63. `06` §15's file layout
`06` §15 places routes in `src/app/api/` calling `src/lib/`; PRD §3 and §12 use `apps/web/app/api/` calling `packages/core`. Same as [[Settings And Plumbing Open Questions]] #13. → [[Execution API And Routes]]

### 64. Approving over an agent's `fail`
PRD §8 says *"approve means pass"* only for the no-outcome gate. `02` §3 and backlog 5.2 add *"Approve overrides the agent's `fail` outcome"*; backlog 10.2 lists *"approve overrides outcome"* as a README deviation. Feature map §4 (*"**Your call wins** — If you approve or reject a step, your decision overrides whatever the agent concluded"*) and drawio harness concept 8 (*"Your call overrides the agent's."*) side with `02` §3. → [[Advancement Rules]]

> [!check] Answered by run-flow, 2026-10-23
> The person wins, as `02` §3 says: at every verdict gate Approve completes the step with `pass` and Reject with `fail`, whatever the agent reported (the run-flow plan). An engine test pins Approve over an agent's `fail`. See [[Run Flow Reference#Gates and their choices]].

### 65. How many entry steps
Backlog 5.1's validation says *"exactly one entry"*. Backlog 8.2's inspector lists a field *"entry"* (beside *"advance mode"* and *"requires"*), which supports reading 5.1 as one entry step, with the PRD's `is_entry` column. `02` §2 has *"exactly one producer"*, which allows reading "entry" as each `requires` entry instead. Same as [[Flow Design Open Questions]] #23, which reads them as two rules: one entry step and one producer per artifact type. → [[Starting A Task]]

> [!check] Answered by run-flow, 2026-10-23
> Two rules: exactly one entry step, and one producer per artifact type (the run-flow plan). The entry is the step no route points to; when every step has a route into it, the flow names its first step with a top-level `entry:` key, which plays the part of the PRD's `is_entry` (Claude's call, 2026-10-23, open to Alex's review). A flow with no entry step, or with several steps no route points to, is refused. See [[Run Flow Reference#Rules this command settles]].

## Added on the second grounding review

### 66. When does `attempts` count the first run?
`step_instances.attempts` defaults to 0 (PRD §5), and PRD §8 only increments it on rework. Yet `max_attempts` *"counts total runs of the step, first try included"*, so the first run must set it to 1. No source says so. The mockups start every step at `attempts: 1` (`monitor.html`, `task-detail.html`). → [[Loop Guard And Escalation]]

> [!check] Answered by run-flow, 2026-10-23
> Yes: starting a run sets the step's `attempts` to that run's attempt number, 1 for the first, and a rework escalates when `attempts + 1 > max_attempts` (the run-flow plan). A Retry at a verdict gate counts as an attempt; one at a *run failed* gate does not. See [[Run Flow Reference#Loops]].

### 67. Stuck: "twice in a row" or "previous failed run"?
Feature map §4 stops on *"exactly the same error twice in a row"*. PRD §8 compares with *"its previous failed run"*, and `02` §3 with *"its previous failure"*. They differ when a passing check sits between two failures: `check` fails, then passes, `review` sends it back, and `check` fails the same way again. The PRD wording escalates there; "in a row" does not. → [[Stuck Detection And Fingerprints]]

> [!check] Answered by run-flow, 2026-10-23
> PRD §8's wording: a failing check whose fingerprint equals that step's previous failed run escalates, even when a pass came in between, and an engine test pins it (the run-flow plan). The feature map's "twice in a row" is the outlier. See [[Run Flow Reference#Loops]].

### 68. How a physical limit kill is classified
Backlog 3.5: *"a limit/timeout hit marks the run failed with reason."* PRD §7 lists *"budget or turn cap hit"* as non-transient but names no memory, CPU, pid or wall-clock kill. **Inferred:** such a kill is also a *"process killed by a signal"*, which PRD §7 calls transient. Same as [[Sandboxing Open Questions]] #15. → [[Infra Retries]]

> [!check] Answered by run-flow, 2026-10-23
> As a failure that waits for a person, as backlog 3.5 says, not as a transient one: a `timeout_minutes` stop ends as `timed out after N minutes`, an agent's turn or budget cap as the provider's error, and both wait at a *run failed* gate (the run-flow plan). run-flow sets no memory, CPU or pid limits; a shell step killed by a signal waits at the same gate, and the timeout's clock stops while one of the run's questions waits for a person (Claude's call, 2026-10-23, open to Alex's review). See [[Run Flow Reference#Step fields]].

### 69. Which process creates the worktree?
PRD §12 puts *"create worktree"* in the promote route (`apps/web`). The drawio draws the *Workspace manager* (*"git worktree add / remove per task"*) in `apps/worker`, and `apps/web` as *"thin: validates, calls core, enqueues; never spawns agents"*. No `jobs.kind` creates a workspace (PRD §5; drawio *Job loop*). PRD §2 bans only *"a long-lived child process"* from route handlers. Same as [[Workspaces Open Questions]] #2, [[Intake And Import Open Questions]] #15 and [[Projects Open Questions]] #24. → [[Starting A Task]], [[Job Queue]]

### 70. Beat A's two triggers
The drawio's *Life of one step* A: *"You press Start, or the engine advances a task. A server action validates the request."* In B, Next.js writes the rows and the `start_run` job. But `advance_task` is a worker job (PRD §8), so an engine advance involves no server action and no web write. **Inferred:** A and B describe Start only; after an advance the worker enqueues the next `start_run` itself. → [[Life Of One Step]]

### 71. Proving the no-outcome gate on the seeded flow
PRD §14 M5 wants *"a run that sets no outcome stops at a gate instead of passing"*. In the seeded flow `check` is a shell step and always has an outcome; `review` is the only AI step with conditional edges, and its own approval gate fires first. If Approve writes `pass` (`02` §3, feature map §4; see #64), no seeded step shows a distinct *"no outcome reported"* gate. Read literally, PRD §8 shows it only after a silent `review` is approved, as a second gate on the same step. No source names the test flow or fixture that would prove the gate on its own. → [[Seeded Flow Execution]]

> [!check] Answered by run-flow, 2026-10-23
> A silent approval step is gated once: its approval gate opens first and the decision is the outcome, so no *no outcome reported* gate follows (the run-flow plan). The no-outcome gate is proved on a step with a conditional route and no approval gate, in the engine test *no outcome on a conditional step waits for a verdict; approve takes the pass route* and in run-flow's *a gate asks in the terminal; approving takes the pass route*. See [[Testing The Run Flow CLI]].

### 72. Test runner: `tsx --test` or vitest
Backlog 0.2 (**FIX**): *"`pnpm test` = `tsx --test --test-concurrency=1` on a throwaway `VIBE_DB_PATH`"*. The drawio *Test lane*: *"vitest on engine rules, fingerprinting and the prompt builder"*. Same as [[Settings And Plumbing Open Questions]] #27. → [[Execution Testing]]

> [!check] Answered by the code, 2026-10-18
> Neither: since the first package, every package tests with `node:test` and `node:assert/strict` under Node's own type stripping (`node --test`, as `pnpm test:packages`), with no database path. run-flow's engine rules and fingerprints are tested the same way (the run-flow plan). See [[Testing The Run Flow CLI]].

## Related

- [[Execution Index]]
- [[Execution Sources]]
- [[Monitor Open Questions]]
- [[Task Detail Open Questions]]
- [[Human In The Loop Open Questions]]
- [[Flow Design Open Questions]]
- [[Agent Providers Open Questions]]
- [[Sandboxing Open Questions]]
- [[Workspaces Open Questions]]
- [[Memory Open Questions]]
- [[Settings And Plumbing Open Questions]]
- [[Intake And Import Open Questions]]
- [[Projects Open Questions]]
