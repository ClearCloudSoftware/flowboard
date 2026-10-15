---
tags: [flowboard, monitor, actions, cost]
module: Monitor
---

# Monitor Actions And Costs

The guide groups every action by where you find it. *"The changes column is what actually happens to the task; the money column is the part people get surprised by."*

> [!tip] Answering is free; stopping is not
> *"A run that asks you a question saves its place and stops billing while it waits — leaving a question unanswered costs nothing but time. A run you stop, or one that fails, has already spent its money, and that spend is re-labelled wasted rather than refunded."* (`monitor-guide.html:473`)

The keys act only on the oldest item in the band, and only when it is the right kind ([[Monitor Controls]], [[Monitor Open Questions]] #44).

## Needs you: an approval gate

| Action | Key | What changes | Money |
|---|---|---|---|
| **Approve** | `a` | *"Clears the gate. The next step queues straight away and the task carries on without you."* | *"Nothing. This is the only decision here that is free."* |
| **Send back** | `r` | *"Opens a one-line reason box. On submit the review is discarded, `build` re-queues as the next attempt, and your reason is handed to it. Tests are not re-run."* | *"Everything the discarded build spent moves to wasted."* |
| **Read review.md** | — | *"Jumps to the task's row and opens it, with the review in the artifact list and the agent's reasoning in the log."* The mockup leaves the gated review out of that list ([[Monitor Open Questions]] #47) | Nothing |

## Needs you: a question

| Action | Key | What changes | Money |
|---|---|---|---|
| **Option 1…9** | number keys | *"Records your answer and hands it to the paused run, which finishes the step and releases whatever comes next."* | *"Nothing while it waits — the run stopped billing the moment it asked."* |
| **Escalated** | automatic | *"Not a button. After a set wait the question is also posted to your chat tool with the same buttons; whoever answers first wins, and the other side updates itself."* | Nothing |

## Needs you: a failure

| Action | Key | What changes | Money |
|---|---|---|---|
| **Allow host & retry** | — | *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt. For the common case: the sandbox correctly refused a call the step genuinely needs."* | *"The failed attempt's spend moves to wasted."* |
| **Retry as-is** | — | *"Re-queues the run unchanged. For failures that aren't about the network — a flaky test, a rate limit, a transient error."* | Same |
| **Open the log** | — | *"Jumps to the row detail, where the last output and the error line are shown together."* | Nothing |

## Workers strip

| Action | Key | What changes | Money |
|---|---|---|---|
| **stop** | — | *"Ends that run now. It is recorded as failed, with "stopped by you" as the reason, and the slot is handed to whatever is next in the queue."* | *"Everything it had spent moves to wasted — stopping saves the future spend, not the past."* |
| **Expand the strip** | `w` | Shows the four slots | Nothing |

## A task's detail

| Action | What changes |
|---|---|
| **Stop this run** | *"Same as the strip's stop, reachable without hunting for the slot."* |
| **See it on the timeline** | Switches to [[Timeline View]] |
| **See the flow** | Switches to [[Pipeline View]] |

## What the mockup code does

| Action | Function | Effect |
|---|---|---|
| Approve | `approve(t)` | `review` → `done`, `advance`, `schedule` |
| Send back | `reject(t, reason)` | `t.rejectedFor = reason or 'needs another pass'`; build's cost added to `wasted`, `attempts++`, build re-queued; the review run is **deleted**, so its cost leaves the bill |
| Answer | `answer(t, r, choice)` | run → `done`, `answered = choice`, advance |
| Retry / Allow host & retry | `retry(t, r)` | cost added to `wasted`, `attempts++`, re-queued, error cleared. *Allow host* also sets `t.allowed = true` (nothing reads it) |
| Stop | `stop(t, r)` | cost added to `wasted`, state `failed`, `err = 'stopped by you'`. `cost` is **not** cleared, so the spend counts twice in *today*, and a later retry adds it to wasted again |

## Against the PRD

| Monitor | PRD |
|---|---|
| Approve | `POST /api/step-instances/:id/approve`. Approve also *"overrides the agent's `fail` outcome"* (backlog 5.2 FIX) |
| Send back + reason | `POST /api/step-instances/:id/reject`. Backlog 2.3 BUG: *"Reject asks for a reason (API accepts it, board renders it, UI never sends it)"* |
| Answer | `POST /api/questions/:id/answer` |
| Retry | `POST /api/step-instances/:id/retry`. PRD §8 escalation-gate Retry *"carries my note into it, like a rejection reason. It does not reset the counter."* The monitor's retry takes no note |
| (none) | PRD §8 **Fail task**. No endpoint is named for it; `POST /api/tasks/:id/cancel` (§12) is the nearest (inference). The monitor offers neither |
| Stop | PRD §13 viewer: *"A Stop button that kills the process."* Backlog 3.4: *"Stop: SIGTERM by pid from the route (same machine), finalise as cancelled."* No PRD endpoint. The monitor records **failed** |

See [[Monitor Open Questions]] #12, #13, #14, #17, and [[Monitor API And Routes]].

## Related

- [[Needs You Band]]
- [[Failures And Retries]]
- [[Burn Today And Wasted]]
- [[Monitor Controls]]
