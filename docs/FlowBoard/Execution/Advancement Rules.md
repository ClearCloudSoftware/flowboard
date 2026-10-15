---
tags: [flowboard, execution, behaviour, advancement, engine]
module: Execution
---

# Advancement Rules

What the engine does after a run finishes. The rules are PRD §8; the code lives in `packages/core/engine/` (PRD §3).

## After a run succeeds

*"After a run succeeds:"* (PRD §8)

1. *"If the step has `advance_mode='approval'`, set the step instance to `awaiting_approval` and stop. It advances only when I click Approve."*
2. *"If the step has unanswered required questions, set `awaiting_answers` and stop."*
3. *"Otherwise mark it `done` and enqueue `advance_task`."*

"Succeeds" means the process exited 0 (*"On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8"*, PRD §7). A shell step with a non-zero exit also follows its edges (PRD §7). See [[Run Outcomes]].

## `advance_task`

*"`advance_task` resolves outgoing edges from the completed step definition:"* (PRD §8)

| Edge | Fires when |
|---|---|
| `always` | *"always fire"* |
| `on_pass` / `on_fail` | *"fire based on `step_instances.outcome`"* |
| any conditional, no outcome | nothing fires: *"set the step instance to `awaiting_approval` with the reason "no outcome reported" and stop"* |

Then:

- **Fan-out.** *"If more than one edge fires, create all the target step instances and start them concurrently."*
- **Join.** *"A step definition with multiple incoming edges is a join: it starts only once every upstream step instance for this task is `done`."*
- **Rework.** *"an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run."*

Details: [[Fan-Out And Join]], [[Rework Loop]].

```mermaid
flowchart TD
  S[Run succeeded] --> A{advance_mode = approval?}
  A -->|yes| AA[awaiting_approval, stop]
  A -->|no| Q{unanswered required questions?}
  Q -->|yes| AQ[awaiting_answers, stop]
  Q -->|no| D[done + enqueue advance_task]
  D --> O{conditional edges and no outcome?}
  O -->|yes| NO[awaiting_approval: no outcome reported]
  O -->|no| F[fire matching edges]
  F --> T{each target}
  T -->|earlier step, on_fail| RW[rework: attempts++]
  T -->|join not satisfied| W[wait]
  T -->|ready| ST[create instance + start_run]
  F -->|nothing fires, nothing active| DONE[task done?]
```

Assembled from PRD §8. The order of the "no outcome" check relative to `done` is not stated; the PRD places it inside `advance_task`.

## Gates and human decisions

- **Approve**: *"approve means pass"* (PRD §8). *"Approve overrides the agent's `fail` outcome (human wins)"* (`02` §3).
- **Reject**: *"reject sets `fail` + reason; reject with no `on_fail` edge fails the task"* (`02` §3).
- **Answers**: when the last required answer arrives, *"enqueue a new `start_run` that resumes"* (PRD §9). See [[Ask Park And Resume]].

The drawio *Flow engine* card in the worker: *"advance_task: always / on_pass / on_fail · fan-out + join · approval and answer gates · no outcome → gate, never pass"*.

## The feature map's version

§4 *The engine*: *"**Decide the next step** — When a step finishes, the engine reads the recipe and starts whatever comes next."*; *"**Follow pass/fail paths** — If a step reports success or failure, the engine takes the matching route (a passed review moves on; a failed one loops back)."* The monitor guide's *"four handoff rules"* restate this for the screen; see [[Hand-Off Rules]].

## Gaps

- **Approval and questions together.** A step with `advance_mode='approval'` that also has unanswered questions hits rule 1 first and never reaches rule 2. Whether that is intended is not stated.
- **Approval on a failed outcome.** On an approval step whose agent set `fail`, the run still "succeeds", so rule 1 parks it for approval. Approve then overrides to pass. The sources agree; the screens should show the agent's verdict at the gate.
- **`manual` steps.** PRD §5 allows `kind = 'manual'`; no rule says what the engine does when it reaches one. See [[Execution Open Questions]].

## Related

- [[Execution Index]]
- [[Run Outcomes]]
- [[Fan-Out And Join]]
- [[Rework Loop]]
- [[Approval Gates]]
- [[Connections And Routes]]
