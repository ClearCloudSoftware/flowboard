---
tags: [flowboard, execution, concept, lifecycle, state]
module: Execution
---

# Execution State Machines

Four state columns move during execution. The value sets come from PRD §5. No source draws the transitions as diagrams; the diagrams below are **assembled** from the rules in PRD §7–§9, `02` §3, `03` §6–§8 and the backlog. Each transition names its source. Transitions no source states are marked *proposal*.

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
  blocked --> running: Retry / answers / resume
  running --> done: nothing active, nothing reachable (02 §3)
  running --> failed: reject with no on_fail edge (02 §3)
  blocked --> failed: Fail task (PRD §8)
  running --> cancelled: Cancel (PRD §12)
  blocked --> cancelled: Cancel
  todo --> cancelled: Cancel
```

- `blocked → running` is *proposal*: the PRD says what blocks a task but not what status it returns to.
- Whether a plain approval gate (not an escalation) sets the task to `blocked` is not stated. The task-detail mockup calls it *"blocked on you"*. See [[Execution Open Questions]].
- The task-detail mockup adds **Pause** (*"Stops after the current run rather than mid-flight"*) with no status to hold it.

Full task-level treatment: [[Task Lifecycle]].

## Step instance state

`step_instances.state`: *"'pending'|'running'|'awaiting_answers'|'awaiting_approval'|'done'|'failed'|'skipped'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> pending: instance created (fan-out / entry)
  pending --> running: start_run leased
  running --> awaiting_approval: advance_mode = approval (PRD §8)
  running --> awaiting_approval: no outcome reported (PRD §8)
  running --> awaiting_answers: unanswered required questions (PRD §8)
  awaiting_answers --> running: last answer → resume (PRD §9)
  awaiting_approval --> done: Approve (pass)
  awaiting_approval --> done: Reject (fail, follows on_fail) *
  running --> done: auto, outcome resolved (PRD §8)
  done --> running: rework target, attempts++ (PRD §8)
  done --> skipped: downstream of a rework target (02 §3)
  done --> awaiting_approval: loop spent or stuck, escalation gate (PRD §8)
  awaiting_approval --> running: Retry with a note (PRD §8)
  awaiting_approval --> failed: Fail task *
  running --> failed: non-transient infra failure *
  pending --> skipped: task cancelled (backlog 2.1)
```

Transitions marked `*` are *proposals*: the sources give the trigger but not the state the instance lands in. After a Reject, PRD §8 says only that reject *"means fail"*; after Fail task and a non-transient infra failure, it names the task status (`failed`, `blocked`) but not the instance state.

> [!note] Escalation lands on the target
> *"Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate."* (PRD §8) The gate sits on the **rework target** (for example `implement`), while the evidence comes from the **failing step** (for example `check`).

- **`failed`** on an instance has no stated trigger. *Proposal:* set when the task fails. Listed in open questions.
- **`queued`** is not a PRD state. The monitor and task-detail mockups draw **queued** (*"ready, no free worker"*) as distinct from **pending** (*"not started yet"*). See [[Execution Open Questions]].

## Run state

`runs.state`: *"'starting'|'running'|'parked'|'succeeded'|'failed'|'cancelled'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> starting: job leased, child spawning
  starting --> running: process up
  running --> succeeded: exit 0 (PRD §7)
  running --> failed: non-zero exit (PRD §7)
  running --> parked: no_answer_yet, process exits (PRD §9)
  running --> cancelled: Stop / graceful shutdown (03 §7–8)
  starting --> failed: lost on restart, dead pid (03 §7)
  succeeded --> [*]
  failed --> [*]
  parked --> [*]
  cancelled --> [*]
```

A run never restarts. A retry, rework or resume is a **new run** (PRD §7, §8, §9). A superseded run gets `wasted = 1`: *"1 if superseded by a rework loop or an infra retry"* (PRD §5).

## Job state

`jobs.state`: *"'queued'|'leased'|'done'|'failed'"* (PRD §5).

```mermaid
stateDiagram-v2
  [*] --> queued: enqueue (run_after)
  queued --> leased: lease transaction
  leased --> done: handled
  leased --> failed: error (attempts, last_error)
  leased --> queued: stale lease reclaimed after 10 min
```

The reclaim edge is from *"stale‑lease reclaim at 10 min"* (backlog 3.1). What makes a job `failed` rather than re-queued is not stated. See [[Job Queue]].

## Related

- [[Execution Index]]
- [[Execution Entities]]
- [[Task Lifecycle]]
- [[Step Instances And Runs]]
- [[Flow Bar And Step States]]
- [[Execution Open Questions]]
