---
tags: [flowboard, execution, glossary]
module: Execution
---

# Execution Glossary

Terms used across the execution notes. ⚠ marks a word the sources use in more than one sense.

## Things

| Term | Meaning | Source |
|---|---|---|
| **Flow** | *"a versioned DAG of step definitions belonging to a project"* | PRD §4 |
| **Step definition** (`step_defs`) | *"a node in the flow"*: kind, model, effort, gate, limits, `requires`, `produces` | PRD §4, §5 |
| **Step instance** (`step_instances`) | *"one task's occupancy of one step definition. Has state and artifacts."* | PRD §4 |
| **Run** (`runs`) | *"one attempt at a step instance"* | PRD §4 |
| **Job** (`jobs`) | A row the worker leases: `start_run`, `advance_task`, `escalate_question`, `import_backlog` | PRD §5 |
| **Edge** (`step_edges`) | A connection with `condition` `always`, `on_pass` or `on_fail` | PRD §5 |
| **Entry step** | A step definition with `is_entry = 1`. As built in run-flow, the step no route points to (Alex's call in the run-flow plan), or, when every step has a route into it, the one the flow names with `entry:` (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]) | PRD §5 |
| **Outcome** | `pass`, `fail` or null on a step instance; *"drives conditional edges"* | PRD §5 |
| **`RunSpec`** | *"Everything needed to launch one attempt of one step, provider-agnostically"* | `agent-provider.ts` |
| **`RunResult`** | `{ usage, exitCode, outcome?, error? }`, what the engine consumes. See [[Agent Run Handle And Result]]. | `01-ports.md`, `agent-provider.ts` |
| **`NormalizedEvent`** | The event kinds every provider's stream is mapped to: seven in the sources, eight in the shipped port, which adds `usage` for running totals (2026-10-18). See [[Normalized Event Envelope]]. | `01-ports.md`, `events.ts` |
| **ExecHost** | *"WHERE a process runs, decoupled from WHICH agent runs it"*. See [[ExecHost Port]]. | `exec-host.ts` |
| **Fingerprint** | A hash of a failing shell step's normalised output tail, on `runs.fingerprint`. In run-flow, `fingerprint` on the run's record in `state.json` ([[Stuck Detection And Fingerprints]]) | PRD §8 |
| **Run record** | `data/runs/<id>/`: `args.json` (PRD §7) or `spec.json` (`03` §6), plus *"raw stream"* (drawio *Run records*). Not built; `run-agent` keeps `runs/<stamp>-<adapter>.jsonl`, whose `start` line holds the launched `RunSpec` ([[Agent Providers Storage]]). run-flow keeps the engine's fields for each run in `state.json`, and a log per run, `<NNN>-<step>.jsonl`, with its launch config, pid, events and result (Claude's call, 2026-10-23, open to Alex's review) | PRD §7, `03` §6, drawio |

## Actors

| Term | Meaning | Source |
|---|---|---|
| **Engine** | The state machine that decides what runs next. Architecture component #3. | `02` §3 |
| **Runner** | The loop that launches one run and records its result. Component #6. | `03` §6 |
| **Worker** ⚠ | (1) The separate Node process `apps/worker` that leases jobs (PRD §2, §3). (2) On the monitor and in the guides, a **slot**: *"a worker slot frees up"*, *"Two of your four slots are on this task"* (monitor guide). | see [[Worker Lifecycle]], [[Worker Slots]] |
| **Loop guard** | The rule set that caps rework and escalates. A drawio card of its own. | drawio *Harness architecture* |
| **Infra-retry classifier** | Sorts a non-zero agent exit into transient or not | drawio *Harness architecture* |
| **Broker** | The worker-side half of `ask_user`; *"the only writer of the `questions` table"*. As built, it runs inside `run-agent` (`cli/src/ask/broker.ts`) and asks in the terminal ([[Ask User MCP Server]]) | PRD §9 |

## Moves

| Term | Meaning | Source |
|---|---|---|
| **Promote** | Backlog → Todo: pin the flow, create the worktree. Some sources put both on *start* instead ([[Starting A Task]]). | PRD §11, §12 |
| **Start** | Todo → running. Whether it is separate from promote is open (D1). | backlog 2.1 |
| **Advance** | Apply the outgoing edges of a finished step (`advance_task`) | PRD §8 |
| **Fan-out** | *"If more than one edge fires, create all the target step instances and start them concurrently."* | PRD §8 |
| **Join** | *"A step definition with multiple incoming edges"*, which waits for its upstream instances. Backlog 5.2 narrows it: *"join waits for every non‑`on_fail` upstream instance"*. See [[Execution Open Questions]] #4. As built in run-flow, a step waits for each step with a forward route into it while that step is pending, running or at a gate, or can still be reached from one that is; rework routes never make a join (the run-flow plan) | PRD §8, backlog 5.2 |
| **Rework** | An `on_fail` edge to an earlier step: same instance, `attempts++`, a new run. As built in run-flow, an `on_fail` route to the step itself or to an ancestor along `always`/`on_pass` routes, which must be its step's only `on_fail` route; the steps below the target are deleted, not `skipped` | PRD §8, `02` §3 |
| **Escalate** ⚠ | (1) Engine: a spent or stuck loop parks the target at `awaiting_approval`, task `blocked` (PRD §8). In run-flow, an escalation gate on the target, which also stops everything below it; there is no task status. (2) Notifier: post a pending question to Slack after a timer (PRD §10). | [[Loop Guard And Escalation]] |
| **Park** | Exit the agent process with state saved; the run becomes `parked`. Not in run-flow, where questions are answered while the run waits (the run-flow plan's Left out list) | PRD §9 |
| **Resume** | A new `start_run` with `--resume <session> --fork-session`. The drawio *Flow engine* card instead says *"park / resume via prompt replay"*, the context-replay path ([[Prompt Assembly]]). run-flow's `--resume <run folder>` is different: it continues a stopped, paused or crashed flow, rerunning each cut-off step at the same attempt, after stopping anything a crashed host left running; a flow paused on a spent budget needs `--budget-usd <more>` too | PRD §9; drawio card `engine-3` |
| **Stop** ⚠ | (1) Kill one run's process (PRD §13, `03` §8). (2) Monitor guide: *"Ends that run now. It is recorded as failed"*. (3) At a gate *"the task stops here and asks for you"* (monitor guide). (4) In run-flow, the engine's `stop` command ends runs a rework or an escalation superseded (`error: 'superseded'`, wasted) or that *Fail the flow* cut off (`error: 'stopped'`, not wasted). A person can only press Ctrl+C, which stops every run, records each as `interrupted` and wasted, and lets `--resume` rerun it at the same attempt; a spent flow budget does the same and pauses the flow. Only `timeout_minutes` stops a single run, which then waits at a *run failed* gate. | [[Stopping And Cancelling]] |
| **Cancel** | End a task: stop runs, cancel questions, skip instances. Not in run-flow (the run-flow plan's Left out list); *Fail the flow* at a gate stops every run and marks the steps `failed` | backlog 2.1 |

## Overloaded words

> [!warning] Attempt
> - **Step instance `attempts`**: total runs of the step that count, first included. *"`max_attempts` counts total runs of the step, first try included (infra retries excluded)."* (PRD §8)
> - **`runs.attempt`**: the attempt number a run belongs to. An infra retry is *"a new run with the same `attempt` number"* (PRD §7), so two runs can share an attempt. In run-flow, a Retry at a *run failed* gate and a `--resume` rerun reuse their attempt's number.
> - **`jobs.attempts`**: how many times the queue tried a job (PRD §5). Unrelated to the other two.
> - **The mockups' attempt**: *"Attempt 3 of 3 failed — egress denied"* (inbox), which counts a failure the PRD would not count. See [[Execution Open Questions]] #22.

> [!warning] Retry
> - **Infra retry**: the runner re-runs a transient failure on its own, *"up to 3 times"* (PRD §7). Not counted. Not in run-flow, which retries nothing by itself.
> - **Rework**: an `on_fail` loop. Counted. The flow designer's *Retries* field sets this budget, but not one-to-one: the mockup defaults it to 2 against `max_attempts`' 3, and [[Flow Data Model]] maps it as `max_attempts − 1`, a proposal ([[Flow Design Open Questions]] #11).
> - **Retry at an escalation gate**: *"**Retry** grants one more attempt and carries my note into it"* (PRD §8).
> - **Retry as-is** and **Allow host & retry**: mockup buttons on a failure card (monitor, inbox).
> - **`POST /api/step-instances/:id/retry`**: the one PRD endpoint (PRD §12).
> - **Retry this step** in run-flow, a person's choice at three kinds of gate. At a *run failed* gate, the same attempt again, not counted. At an escalation, one more attempt, past the budget for a spent loop. At a verdict gate, the next attempt, wasting the run it replaces. That attempt counts against `max_attempts` but is never refused there, so a later rework can escalate at once (`impl has used 2 attempts, past its max_attempts of 1`).

> [!warning] Blocked
> - **Task status `blocked`**: set for an infra failure that is not transient (PRD §7), a spent or stuck loop (PRD §8), and a parked run (backlog 4.2).
> - **"blocked on you"**: the task-detail status bar while a gate waits (`task-detail.html`); the header pill on the same screen says *"waiting on you"*. Not a task status.
> - Not the same as **queued**: the monitor's *"ready, no free worker"*.
> - **run-flow** keeps no `blocked` status: the flow stays `running` while a step waits at a gate (Claude's call, 2026-10-23, open to Alex's review). See [[Execution State Machines]].

> [!warning] Job, run and step
> A *job* is a queue row; a *run* is a process attempt; a *step* is either a definition or an instance. The drawio's *"enqueue step"* edge enqueues a `start_run` job, which creates a run against a step instance.

> [!warning] Draft
> **Draft mode** is the global cheap-model override ([[Draft Mode And Spec Transforms]]). *"Draft mode isn't a version"* (flow designer guide) and has nothing to do with an unsaved flow edit.

## Related

- [[Execution Index]]
- [[Execution Entities]]
- [[Execution State Machines]]
- [[Task Detail Glossary]]
- [[Flow Design Glossary]]
- [[Agent Providers Glossary]]
- [[Sandboxing Glossary]]
- [[Workspaces Glossary]]
- [[Memory Glossary]]
