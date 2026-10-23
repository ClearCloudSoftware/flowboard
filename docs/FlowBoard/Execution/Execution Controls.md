---
tags: [flowboard, execution, controls, keyboard]
module: Execution
---

# Execution Controls

Every control in the sources that starts, stops or redirects execution, grouped by what it does to the engine. Screen-by-screen control lists live with each screen: [[Monitor Controls]], [[Task Detail Controls]], [[Human In The Loop Controls]], [[Flow Design Controls]].

As built in run-flow (2026-10-23), the terminal is the only screen. `pnpm run-flow --folder <dir> --task <file> <flow.yaml>` starts a flow, and `--budget-usd <n>` overrides its budget. A gate asks for a decision, `Approve (pass)`, `Reject (fail)`, `Retry this step` or `Fail the flow`, with Reject offered only when the step has an `on_fail` route and only Retry and Fail at an escalation or a *run failed* gate. Then it asks `Note for the next run (optional)`, which goes to the runs the decision starts (Claude's call, 2026-10-23, open to Alex's review). A *run failed* gate's `See:` line names the run's log. A spent loop escalates and never fails the flow by itself. Ctrl+C stops the flow so `--resume` can continue it. Once the flow has spent its budget, run-flow stops the runs the same way and pauses the flow, and `--resume <run folder> --budget-usd <more>` continues it. There is no Pause, Cancel or Stop for one run. See [[Run Flow Reference#Gates and their choices]].

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
| Approve | Monitor needs-you, task detail, inbox | `a`; in the inbox also `↵` on a gate card | outcome pass, *"The next step queues immediately"* (task-detail and inbox guides) | *"Free — nothing is re-run, nothing is wasted."* (task-detail guide) |
| Send back | same | `r` | reject with reason → `on_fail` rework | *"The build's kept spend moves to wasted."* (task-detail guide) |
| `esc` | reason box | `esc` | cancels the reason box; on the monitor it also closes the open row | — |

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
| Retry as-is | monitor, inbox failure card | *"Re-queues the run unchanged."* | monitor guide ([[Execution Open Questions]] #23) |
| Allow host & retry | monitor, inbox failure card (inbox: `↵`) | *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt."* | monitor guide; inbox guide draws *"↵ Allow host & retry"*, and the inbox's `Enter` handler runs it on a failure card ([[Execution Open Questions]] #24) |
| Open the log | monitor, inbox failure card | none | monitor, inbox |

The two retry buttons are mockup-only; the PRD's Retry and Fail task are not drawn on any mockup. See [[Failures And Escalated Loops]].

## Stop

| Control | Where | Engine effect | Money |
|---|---|---|---|
| Stop | Live run viewer | SIGTERM, `cancelled` (`03` §8) | — |
| stop | Monitor workers strip | *"recorded as failed, with "stopped by you""* | *"Everything it had spent moves to wasted"* |
| Stop this run | Monitor row detail | *"Same as the strip's stop, reachable without hunting for the slot."* | same |
| Stop from the story row | Task detail | task-detail guide: *"Watch, or stop the run from the story row if it is clearly lost."* No button is drawn in `task-detail.html`. | — |
| Pause | Task detail | *"Stops after the current run rather than mid-flight."* No engine rule backs it ([[Execution Open Questions]] #29). | *"Stops future spend only."* |
| Cancel task | Task detail | stop all, cancel questions, skip instances | *"Anything in flight becomes wasted."* |
| Clean up workspace | Task detail | *"Only offered once the task is finished or cancelled. Removes the branch and the folder."* Backlog 2.1 also allows it after `failed` ([[Execution Open Questions]] #60). See [[Cleaning Up A Workspace]]. | — |

## Shape what runs

| Control | Where | Effect on execution |
|---|---|---|
| Draft mode | Flow designer topbar, settings | every next run on haiku / low ([[Draft Mode And Spec Transforms]]) |
| Retries | Flow designer inspector | the loop budget, mapped as `max_attempts − 1` (a proposal, [[Flow Design Open Questions]] #11); mockup default 2 against the PRD's `max_attempts` default 3. Guide: *"How many attempts before the step gives up and fails the task."* The "fails the task" part conflicts with PRD §8's escalation ([[Execution Open Questions]] #14, #15). |
| Approval | Flow designer inspector | `advance_mode` |
| Budget | Flow designer inspector | `max_budget_usd`: *"The most this step may spend on one attempt."* |
| Expand workers | Monitor | `w`: shows slots; no effect |

## Keyboard summary

| Key | Action | Screens |
|---|---|---|
| `a` | Approve | monitor, task detail, inbox |
| `r` | Send back (reason box) | monitor, task detail, inbox |
| `esc` | Cancel the reason box | monitor, task detail, inbox |
| `1`–`9` | Pick an option | inbox, monitor |
| `↵` | Submit; on a gate card Approve; on a failure card Allow host & retry | inbox |
| `w` | Expand worker slots | monitor |

No key is assigned to Start, Stop, the PRD's Retry or Fail task, Retry as-is or Cancel in any source. Backlog 9.4 (**BUG**) asks for a *"keyboard equivalent for promote/demote"* without naming one.

## Related

- [[Execution Index]]
- [[Execution Surfaces]]
- [[Execution API And Routes]]
- [[Stopping And Cancelling]]
- [[Egress Denials]]
