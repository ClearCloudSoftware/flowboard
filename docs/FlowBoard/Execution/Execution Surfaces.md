---
tags: [flowboard, execution, screen]
module: Execution
---

# Execution Surfaces

Execution has **no screen of its own**. The tracker lists its mockup as *"partial (via task detail) — also `monitor`, `inbox`, `flow-designer`"*. Its state shows up on six other screens, and its controls are spread across them. This note stands in for an *Execution Screen* note; every control is in [[Execution Controls]].

## Where execution shows

| Screen | What of execution it shows | Mockup | Notes |
|---|---|---|---|
| Board `/p/[slug]` | Each task's furthest-advanced step, state dot, live cost, split badge | none (PRD §13) | *"The board is a projection, not the model."* (PRD §4) |
| Monitor | Every task's flow bar, worker slots, needs-you band, burn / today / wasted | `monitor.html` | [[Monitor Index]] |
| Task detail `/t/[id]` | One task's step instances, runs, attempts, gate, cost | `task-detail.html` | [[Task Detail Index]] |
| Inbox `/inbox` | Gates, questions and failure cards. Its *"escalated"* tag means posted to chat, not the engine's escalation. The drawio inbox box lists *"questions, approval gates, escalated loops"*. | `inbox.html` | [[Human In The Loop Index]] |
| Live run viewer `/runs/[id]` | One run's event stream, elapsed, turns, cost, Stop | none | [[Live Run Viewer]] |
| Flow designer `/p/[slug]/flow` | Execution inputs: retries, gates, budgets, draft mode | `flow-designer.html` | [[Flow Design Index]] |

The drawio *Harness architecture* front-end box names the task detail route `/t/[id]`: *"step timeline, attempts, artifacts, plan vs built diff"*. PRD §13 calls it a *"detail sheet"* opened from the board.

## How each state reads

The step states the engine writes reach the screens as marks. The monitor guide's *Life of a single step*:

| Mockup state | Meaning (monitor guide) | Engine state (PRD §5) |
|---|---|---|
| pending | *"not started yet"* | `pending` |
| queued | *"ready, no free worker"* | none: a `pending` instance with a queued `start_run` job (*inferred*, [[Execution Open Questions]] #13) |
| running | *"an agent is working"* | `running` |
| asking | *"paused, billing stops"* | `awaiting_answers` |
| gate | *"waiting for your call"* | `awaiting_approval` |
| failed | *"spend becomes wasted"* | instance `failed`, an escalation gate, or a `blocked` task; not settled ([[Execution Open Questions]] #12, #22) |
| done | *"artifact written"* | `done` |

Transitions the guide draws between them: *"its dependencies are done"* (pending → queued), *"a worker slot frees up"* (queued → running), *"the agent finished its job"*, *"it asks you something"*, *"it errored, or you stopped it"*, *"you answered"*, *"Retry as-is · Allow host & retry"*, *"…if the step is a gate"*, *"Send back"*, *"Approve → the next step queues"*, *"build re-queues with your reason"*.

> [!check] Answered by run-flow, 2026-10-23
> Queued is on the run, not the step: a run is `queued: true` in `state.json` from the engine's run command until the host reports it launched, which behind `--max-runs` means *"ready, no free worker"*; its step is already `running`. A run cut off while still queued is recorded `error: 'not launched'`, not wasted, the summary's run count leaves it out, and `--resume` starts it (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).

As built in run-flow (2026-10-23), two other marks map as follows. *asking* has no state of its own: the step stays `running` while its agent's question waits in the terminal, and the step's `timeout_minutes` clock stops meanwhile (Claude's call, open to Alex's review). *failed* is a step at a *run failed* gate, `awaiting_approval` with gate kind `run_failed`, whose run counts as wasted; a step is `failed` only when a person fails the flow.

Full mark tables: [[Flow Bar And Step States]], [[Task Status Icons]], [[Task Detail Marks]].

## The four human decisions

*"Nothing on this screen moves because you dragged it. A task's position is decided entirely by the engine following the flow, with exactly four exceptions — the four decisions that are yours: approve, send back, answer, retry or stop."* (monitor guide)

## Empty and loading states

No execution-specific empty state is designed. Backlog 3.4 (**GAP**) asks the run viewer for *"Loading, 404 and stream‑lost states"*, and backlog 4.3 asks the inbox for a *"lost the orchestrator"* card. The inbox's empty state *"tells you what is still running and when to expect the next interruption"* (inbox guide); the drawio *FlowBoard ideation* inbox card: *"Empty state shows what's running / Not a shrug illustration."*

## Related

- [[Execution Index]]
- [[Execution Controls]]
- [[Monitor Screen]]
- [[Task Detail Screen]]
- [[Human In The Loop Screen]]
