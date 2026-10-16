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
| **Entry step** | A step definition with `is_entry = 1` | PRD §5 |
| **Outcome** | `pass`, `fail` or null on a step instance; *"drives conditional edges"* | PRD §5 |
| **`RunSpec`** | *"Everything needed to launch one attempt of one step, provider-agnostically"* | `agent-provider.ts` |
| **`RunResult`** | `{ usage, exitCode, outcome?, error? }`, what the engine consumes. See [[Agent Run Handle And Result]]. | `01-ports.md`, `agent-provider.ts` |
| **`NormalizedEvent`** | The seven event kinds every provider's stream is parsed into. See [[Normalized Event Envelope]]. | `01-ports.md`, `events.ts` |
| **ExecHost** | *"WHERE a process runs, decoupled from WHICH agent runs it"*. See [[ExecHost Port]]. | `exec-host.ts` |
| **Fingerprint** | A hash of a failing shell step's normalised output tail, on `runs.fingerprint` | PRD §8 |
| **Run record** | `data/runs/<id>/`: `args.json` (PRD §7) or `spec.json` (`03` §6), plus *"raw stream"* (drawio *Run records*) | PRD §7, `03` §6, drawio |

## Actors

| Term | Meaning | Source |
|---|---|---|
| **Engine** | The state machine that decides what runs next. Architecture component #3. | `02` §3 |
| **Runner** | The loop that launches one run and records its result. Component #6. | `03` §6 |
| **Worker** ⚠ | (1) The separate Node process `apps/worker` that leases jobs (PRD §2, §3). (2) On the monitor and in the guides, a **slot**: *"a worker slot frees up"*, *"Two of your four slots are on this task"* (monitor guide). | see [[Worker Lifecycle]], [[Worker Slots]] |
| **Loop guard** | The rule set that caps rework and escalates. A drawio card of its own. | drawio *Harness architecture* |
| **Infra-retry classifier** | Sorts a non-zero agent exit into transient or not | drawio *Harness architecture* |
| **Broker** | The worker-side half of `ask_user`; *"the only writer of the `questions` table"* | PRD §9 |

## Moves

| Term | Meaning | Source |
|---|---|---|
| **Promote** | Backlog → Todo: pin the flow, create the worktree. Some sources put both on *start* instead ([[Starting A Task]]). | PRD §11, §12 |
| **Start** | Todo → running. Whether it is separate from promote is open (D1). | backlog 2.1 |
| **Advance** | Apply the outgoing edges of a finished step (`advance_task`) | PRD §8 |
| **Fan-out** | *"If more than one edge fires, create all the target step instances and start them concurrently."* | PRD §8 |
| **Join** | *"A step definition with multiple incoming edges"*, which waits for its upstream instances. Backlog 5.2 narrows it: *"join waits for every non‑`on_fail` upstream instance"*. See [[Execution Open Questions]] #4. | PRD §8, backlog 5.2 |
| **Rework** | An `on_fail` edge to an earlier step: same instance, `attempts++`, a new run | PRD §8, `02` §3 |
| **Escalate** ⚠ | (1) Engine: a spent or stuck loop parks the target at `awaiting_approval`, task `blocked` (PRD §8). (2) Notifier: post a pending question to Slack after a timer (PRD §10). | [[Loop Guard And Escalation]] |
| **Park** | Exit the agent process with state saved; the run becomes `parked` | PRD §9 |
| **Resume** | A new `start_run` with `--resume <session> --fork-session`. The drawio *Flow engine* card instead says *"park / resume via prompt replay"*, the context-replay path ([[Prompt Assembly]]) | PRD §9; drawio card `engine-3` |
| **Stop** ⚠ | (1) Kill one run's process (PRD §13, `03` §8). (2) Monitor guide: *"Ends that run now. It is recorded as failed"*. (3) At a gate *"the task stops here and asks for you"* (monitor guide). | [[Stopping And Cancelling]] |
| **Cancel** | End a task: stop runs, cancel questions, skip instances | backlog 2.1 |

## Overloaded words

> [!warning] Attempt
> - **Step instance `attempts`**: total runs of the step that count, first included. *"`max_attempts` counts total runs of the step, first try included (infra retries excluded)."* (PRD §8)
> - **`runs.attempt`**: the attempt number a run belongs to. An infra retry is *"a new run with the same `attempt` number"* (PRD §7), so two runs can share an attempt.
> - **`jobs.attempts`**: how many times the queue tried a job (PRD §5). Unrelated to the other two.
> - **The mockups' attempt**: *"Attempt 3 of 3 failed — egress denied"* (inbox), which counts a failure the PRD would not count. See [[Execution Open Questions]] #22.

> [!warning] Retry
> - **Infra retry**: the runner re-runs a transient failure on its own, *"up to 3 times"* (PRD §7). Not counted.
> - **Rework**: an `on_fail` loop. Counted. The flow designer's *Retries* field sets this budget, but not one-to-one: the mockup defaults it to 2 against `max_attempts`' 3, and [[Flow Data Model]] maps it as `max_attempts − 1`, a proposal ([[Flow Design Open Questions]] #11).
> - **Retry at an escalation gate**: *"**Retry** grants one more attempt and carries my note into it"* (PRD §8).
> - **Retry as-is** and **Allow host & retry**: mockup buttons on a failure card (monitor, inbox).
> - **`POST /api/step-instances/:id/retry`**: the one PRD endpoint (PRD §12).

> [!warning] Blocked
> - **Task status `blocked`**: set for an infra failure that is not transient (PRD §7), a spent or stuck loop (PRD §8), and a parked run (backlog 4.2).
> - **"blocked on you"**: the task-detail status bar while a gate waits (`task-detail.html`); the header pill on the same screen says *"waiting on you"*. Not a task status.
> - Not the same as **queued**: the monitor's *"ready, no free worker"*.

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
