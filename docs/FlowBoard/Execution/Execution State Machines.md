---
tags: [flowboard, execution, concept, lifecycle, state]
module: Execution
---

# Execution State Machines

Four state columns move during execution. The value sets come from PRD §5, which draws no transitions. The monitor guide's *"The life of a single step"* does draw a step lifecycle, but in the mockup's own states (pending, queued, running, asking, gate, failed, done); see [[Execution Surfaces]]. The diagrams below are **assembled** in PRD states from the rules in PRD §7–§9, `02` §3, `03` §6–§8 and the backlog. Each edge names its source. Edges marked `*` are *proposals*: no source states them, or a source gives the trigger but not the state that results.

## Task status

`tasks.status`: *"'backlog'|'todo'|'running'|'blocked'|'done'|'failed'|'cancelled'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> backlog
  backlog --> todo: promote (PRD §12)
  todo --> backlog: demote (backlog 2.1, NEW)
  todo --> running: Start (backlog 2.1, D1)
  running --> blocked: non-transient infra failure (PRD §7)
  running --> blocked: loop spent or stuck (PRD §8)
  running --> blocked: run parked (backlog 4.2)
  blocked --> running: Retry / answers / resume *
  running --> done: no active instances, no reachable pending targets (02 §3)
  running --> failed: reject with no on_fail edge (02 §3)
  running --> failed: missing row guard (02 §3)
  blocked --> failed: Fail task (PRD §8) *
  running --> cancelled: Cancel (PRD §12)
  blocked --> cancelled: Cancel *
  todo --> cancelled: Cancel *
```

- `blocked → running` is a proposal: the PRD says what blocks a task but not what status it returns to.
- `failed` after **Fail task** is inferred. PRD §8 says only *"**Fail task** ends it."*
- Cancel from `todo` or `blocked` is inferred from `POST /api/tasks/:id/cancel` (PRD §12), which names no starting status.
- The missing-row guard: *"Guard `getInstance()!` / `defs.find()!` so a missing row fails the task cleanly instead of throwing."* (`02` §3)
- Whether a plain approval gate (not an escalation) sets the task to `blocked` is not stated. The task-detail status bar calls it *"blocked on you"*; its header pill says *"waiting on you"*. See [[Execution Open Questions]] #11.
- **Three failed attempts.** PRD §16 and backlog 10.1 have the task fail after three failed attempts; PRD §8 escalates instead (`blocked`). The diagram follows PRD §8 ([[Execution Open Questions]] #14).
- **Pause** has no status to hold it. Feature map §3 names it (*"**Pause, send back, or cancel**"*); the task-detail guide defines it: *"Stops after the current run rather than mid-flight."*

Full task-level treatment: [[Task Lifecycle]].

## Step instance state

`step_instances.state`: *"'pending'|'running'|'awaiting_answers'|'awaiting_approval'|'done'|'failed'|'skipped'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> pending: instance created, fan-out or entry *
  pending --> running: start_run leased *
  running --> awaiting_approval: advance_mode = approval (PRD §8)
  running --> awaiting_answers: unanswered required questions (PRD §8)
  awaiting_answers --> running: last answer → resume (PRD §9) *
  running --> done: auto (PRD §8)
  done --> awaiting_approval: no outcome reported, inside advance_task (PRD §8)
  done --> awaiting_approval: loop spent or stuck, on the rework target (PRD §8)
  awaiting_approval --> done: Approve (pass) *
  awaiting_approval --> done: Reject (fail, follows on_fail) *
  awaiting_approval --> running: Retry with a note (PRD §8) *
  awaiting_approval --> failed: Fail task *
  done --> running: rework target, attempts++ (PRD §8) *
  done --> skipped: downstream of a rework target (02 §3)
  running --> failed: non-transient infra failure *
  running --> skipped: task cancelled (backlog 2.1)
  pending --> skipped: task cancelled (backlog 2.1)
```

Notes on the edges:

- **The no-outcome gate fires from `done`.** PRD §8: *"Otherwise mark it `done` and enqueue `advance_task`."* Then, inside `advance_task`: *"If the step has an `on_pass` or `on_fail` edge and the run ended without setting an outcome, set the step instance to `awaiting_approval`"*. Only `advance_mode = approval` goes straight from `running`.
- **Approve and Reject.** The sources give the outcome (*"approve means pass, reject means fail"*, PRD §8) but not the instance state that follows.
- **Fail task and non-transient infra failures.** The sources give the task status (PRD §7 *"put the task into `blocked`"*; PRD §8 *"**Fail task** ends it"*) but not the instance state.
- **Creation, resume, Retry and rework.** PRD §8 says *"create all the target step instances and start them"*, and no source names the state a new instance starts in. A resume, a Retry and a rework each start a new run (PRD §8, §9), but no source says the instance moves to `running`. PRD §9 says only that a parked run *"leaves the step instance in `awaiting_answers`"*.
- **Cancel.** Backlog 2.1: *"Cancel: SIGTERM live runs, cancel pending questions, mark instances skipped."* That covers running instances as well as pending ones.

> [!note] Escalation lands on the target
> *"Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate."* (PRD §8) The gate sits on the **rework target** (for example `implement`), while the evidence comes from the **failing step** (for example `check`).

- **`failed`** on an instance has no stated trigger. *Proposal:* set when the task fails ([[Execution Open Questions]] #12).
- **`queued`** is not a PRD state. The monitor and task-detail mockups draw **queued** (*"ready, no free worker"*) as distinct from **pending** (*"not started yet"*). See [[Execution Open Questions]] #13.

## Run state

`runs.state`: *"'starting'|'running'|'parked'|'succeeded'|'failed'|'cancelled'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> starting: job leased, child spawning *
  starting --> running: process up *
  running --> succeeded: exit 0 (PRD §7)
  running --> failed: non-zero exit or is_error (PRD §7, backlog 3.2)
  running --> failed: limit or timeout hit (backlog 3.5)
  running --> parked: no_answer_yet, process exits (PRD §9)
  running --> cancelled: Stop / graceful shutdown (03 §7–8)
  starting --> failed: dead pid on restart (03 §7)
  running --> failed: dead pid on restart (03 §7)
  succeeded --> [*]
  failed --> [*]
  parked --> [*]
  cancelled --> [*]
```

- **Restart.** *"A `starting`/`running` row whose pid is alive → keep tailing; dead → fail with a Retry hint."* (`03` §7; backlog 3.3 *"reclaim `starting` **and** `running`"*). PRD §7 instead treats *"lost on restart"* as transient and retries it. See [[Execution Open Questions]] #30, #31.
- **Stop.** `03` §8 and backlog 3.4 finalise a stopped run as `cancelled`; the monitor guide records it as failed (*"stopped by you"*). See [[Execution Open Questions]] #27.
- **Shell steps.** PRD §7's completion rule sends any non-zero exit to `failed`, but its shell paragraph says a non-zero exit there *"is a result, not a run failure"*. Which `runs.state` a failing check records is not stated ([[Execution Open Questions]] #57).

A run never restarts. A retry, rework or resume is a **new run** (PRD §7, §8, §9). A superseded run gets `wasted = 1`: *"1 if superseded by a rework loop or an infra retry"* (PRD §5).

## Job state

`jobs.state`: *"'queued'|'leased'|'done'|'failed'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> queued: enqueue with run_after (PRD §5)
  queued --> leased: lease transaction (PRD §7)
  leased --> done: handled *
  leased --> failed: error, attempts and last_error *
  leased --> queued: stale lease reclaimed after 10 min (PRD §7, backlog 3.1)
```

The reclaim edge is from PRD §7 (*"with a stale-lease reclaim after 10 minutes"*) and backlog 3.1 (*"stale‑lease reclaim at 10 min"*). What makes a job `failed` rather than re-queued is not stated ([[Execution Open Questions]] #35). See [[Job Queue]].

## Related

- [[Execution Index]]
- [[Execution Entities]]
- [[Task Lifecycle]]
- [[Step Instances And Runs]]
- [[Flow Bar And Step States]]
- [[Execution Open Questions]]
