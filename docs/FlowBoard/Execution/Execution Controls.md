---
tags: [flowboard, execution, controls, keyboard]
module: Execution
---

# Execution Controls

Every control in the sources that starts, stops or redirects execution, grouped by what it does to the engine. Screen-by-screen control lists live with each screen: [[Monitor Controls]], [[Task Detail Controls]], [[Human In The Loop Controls]], [[Flow Design Controls]].

## Start and go back

| Control | Where | Key | Engine effect | Source |
|---|---|---|---|---|
| Drag Backlog ↔ Todo | Board | — | promote / demote | PRD §13; backlog 2.2 *"Native HTML5 drag only Backlog ↔ Todo"* |
| Promote | Task detail sheet | — | `POST /api/tasks/:id/promote` | PRD §12; backlog 2.3 lists *"Retry, Cancel, Cleanup, Promote, Start, Demote"* |
| **Start** | Card + sheet (D1 default) | — | todo → running | backlog 2.1, D1; drawio *"You press Start"* |
| Send to backlog | Task detail | — | demote, keep workspace | task-detail guide: *"Returns the task to the backlog, keeping its workspace and everything it produced."* |

No mockup draws a Start or Promote button ([[Monitor Open Questions]] #24).

## Decide at a gate

| Control | Where | Key | Engine effect | Money (guides) |
|---|---|---|---|---|
| Approve | Monitor needs-you, task detail, inbox | `a` | outcome pass, *"The next step queues immediately"* | *"Free — nothing is re-run, nothing is wasted."* |
| Send back | same | `r` | reject with reason → `on_fail` rework | *"The build's kept spend moves to wasted."* |
| `esc` | reason box | `esc` | cancels the reason box | — |

PRD §13: *"Approve / Reject buttons on the step that is awaiting approval."* Backlog 2.3 (**BUG**): *"**Reject asks for a reason** (API accepts it, board renders it, UI never sends it)."* Backlog 2.2 (**BUG**): *"Either implement the `a` (approve) shortcut or remove the chip from awaiting‑approval cards."*

## Answer

| Control | Where | Key | Engine effect |
|---|---|---|---|
| Option | Inbox, monitor needs-you | `1`–`9` | records an answer; the last required answer resumes the run |
| Submit | Inbox | `↵` | sends the card |

Monitor guide: *"Records your answer and hands it to the paused run, which finishes the step and releases whatever comes next."* See [[Ask Park And Resume]].

## Recover a failure or a spent loop

| Control | Where | Engine effect | Source |
|---|---|---|---|
| Retry (with a note) | escalation gate | *"grants one more attempt … does not reset the counter"* | PRD §8; `POST /api/step-instances/:id/retry` (PRD §12) |
| Fail task | escalation gate | ends the task | PRD §8; no endpoint |
| Retry as-is | monitor, inbox failure card | *"Re-queues the run unchanged."* | monitor guide |
| Allow host & retry | monitor, inbox failure card | *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt."* | monitor guide |
| Open the log | monitor, inbox failure card | none | monitor, inbox |

The two retry buttons are mockup-only; the PRD's Retry and Fail task are not drawn on any mockup. See [[Failures And Escalated Loops]].

## Stop

| Control | Where | Engine effect | Money |
|---|---|---|---|
| Stop | Live run viewer | SIGTERM, `cancelled` (`03` §8) | — |
| stop | Monitor workers strip | *"recorded as failed, with "stopped by you""* | *"Everything it had spent moves to wasted"* |
| Stop this run | Monitor row detail, task detail story row | same as the strip's stop | same |
| Pause | Task detail | *"Stops after the current run rather than mid-flight."* | *"Stops future spend only."* |
| Cancel task | Task detail | stop all, cancel questions, skip instances | *"Anything in flight becomes wasted."* |
| Clean up workspace | Task detail | removes branch and folder, only once finished or cancelled | — |

## Shape what runs

| Control | Where | Effect on execution |
|---|---|---|
| Draft mode | Flow designer topbar, settings | every next run on haiku / low ([[Draft Mode And Spec Transforms]]) |
| Retries (`max_attempts`) | Flow designer inspector | the loop budget: *"How many attempts before the step gives up and fails the task."* |
| Approval | Flow designer inspector | `advance_mode` |
| Budget | Flow designer inspector | `max_budget_usd`: *"The most this step may spend on one attempt."* |
| Expand workers | Monitor | `w`: shows slots; no effect |

## Keyboard summary

| Key | Action | Screens |
|---|---|---|
| `a` | Approve | monitor, task detail, inbox |
| `r` | Send back (reason box) | monitor, task detail, inbox |
| `esc` | Cancel the reason box | task detail, inbox |
| `1`–`9` | Pick an option | inbox, monitor |
| `↵` | Submit | inbox |
| `w` | Expand worker slots | monitor |

No key is assigned to Start, Stop, Retry, Fail task or Cancel in any source.

## Related

- [[Execution Index]]
- [[Execution Surfaces]]
- [[Execution API And Routes]]
- [[Stopping And Cancelling]]
