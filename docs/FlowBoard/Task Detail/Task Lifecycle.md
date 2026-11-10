---
tags: [flowboard, task-detail, behaviour, lifecycle]
module: Task Detail
---

# Task Lifecycle

Where a task can be, and what moves it. The field guide's rule: *"Solid arrows happen on their own. Dashed amber arrows are yours — they are the only places a person moves a task."*

## The guide's diagram

```mermaid
stateDiagram-v2
  [*] --> backlog
  backlog --> running: you promote it
  running --> waiting: a gate, a question, or retries spent
  waiting --> running: you answer, approve, or send back
  waiting --> done: approved
  waiting --> failed: you fail it
  failed --> running: you retry
  done --> [*]
```

Box subtitles: backlog *"no workspace yet"*, running *"an agent has it"*, waiting *"on you · $0/min"*, done *"workspace kept"*, failed *"spend is wasted"*. Arrows labelled *you promote it*, *you answer, approve, or send back*, *you fail it* and *you retry* are the person's.

*"**Pause**, **Send to backlog** and **Cancel** are not drawn because they can happen from anywhere."* (guide). See [[Task Actions]].

## The PRD's statuses

PRD §5 `tasks.status`: `backlog`, `todo`, `running`, `blocked`, `done`, `failed`, `cancelled`. The feature map (§3): *"it moves through states from 'backlog' to 'in progress' to 'done' (or 'blocked' / 'failed' if something goes wrong)."*

```mermaid
stateDiagram-v2
  [*] --> backlog: create / import
  backlog --> todo: promote (pin flow, create worktree)
  todo --> backlog: demote (keeps worktree)
  todo --> running: Start
  running --> blocked: question parked, loop spent or stuck, infra failure
  blocked --> running: answer / Retry
  blocked --> failed: Fail task
  running --> failed: reject with no on_fail edge, missing row
  backlog --> cancelled: cancel
  running --> done: no active instances and no reachable pending targets
  running --> cancelled: cancel
  todo --> cancelled: cancel
  blocked --> cancelled: cancel
  done --> [*]
  failed --> [*]
  cancelled --> [*]
```

Assembled from PRD §5, §7, §8, §11, §12, backlog Stories 2.1, 3.2, 4.2 and 5.2, and `02` §3. Of the `awaiting_approval` cases, only a spent or stuck loop is stated to set `blocked` (*"Set the target step instance to `awaiting_approval` and the task to `blocked`"*, PRD §8). Backlog Story 4.2 sets the task `blocked` when a run parks on questions. No source says what a plain approval gate or a no-outcome gate does to the task's status; this diagram leaves it `running` (an inference), while the mockup's status bar says *"blocked on you"* ([[Task Detail Open Questions]] #34). The edges out of `blocked` and into `cancelled` are inferences too, the latter from *"they can happen from anywhere"*.

## Mapping the vocabularies

| Guide / screen | PRD `tasks.status` | Step-level cause |
|---|---|---|
| backlog | `backlog` (and `todo`?) | — |
| running · `<step> running` | `running` | an instance `running` |
| waiting · `waiting on you` | `running` or `blocked` | `awaiting_approval` or `awaiting_answers` |
| done | `done` | — |
| failed | `failed` | — |
| *(not drawn)* | `todo` | — |
| *(not drawn)* | `cancelled` | — |
| `in progress` (mockup fallback pill) | `running` | nothing running, nothing gated: e.g. a step `queued` for a worker |

The guide has no `todo` and goes straight from backlog to running on *promote*. That matches the PRD only if promotion starts the task. Backlog decision **D1** recommends the opposite: *"Explicit Start button on card + sheet; promote stays cheap"*. See [[Task Detail Open Questions]].

## When a task is done

*Task‑done condition: "nothing active and no edge fired" strands a task in `running` when a conditional edge never fires. Use "no active instances and no reachable pending targets".* (backlog Story 5.2, **BUG**; `02` §3).

In the mockup the flow simply has no step after Summarize. The monitor guide: *"The flow has no step after summarize, so the task is finished."*

## When a task fails

The engine never fails a task by itself when attempts run out. PRD §8: *"Escalate, don't fail, when a loop is spent or stuck."* Backlog D3: *"escalate to a gate, never auto-fail"* (*"Decided 2026-10-15"*). The guides, the drawio D3 card, PRD §16 and backlog Story 10.1 once said the task fails; they were brought in line on 2026-11-10, and the guide's lifecycle now draws *retries spent* into **waiting** and a dashed *you fail it* from there to **failed**. The guide's *you retry* arrow out of **failed** has no auto-failed task left to retry ([[Task Detail Open Questions]] #35). Under backlog D3, *failed* is reached only through **Fail task** at an escalation gate, through a reject with no `on_fail` edge (*"reject with no `on_fail` edge fails the task"*, backlog Story 5.2), or through a missing row (*"fails the task cleanly"*, `02` §3). See [[Attempts And Send Back]].

## Related

- [[Task Detail Index]]
- [[Task Actions]]
- [[Deciding At A Gate]]
- [[Attempts And Send Back]]
- [[Version Pinning]]
