---
tags: [flowboard, execution, controls, keyboard]
module: Execution
---

# Execution Controls

Every control in the sources that starts, stops or redirects execution, grouped by what it does to the engine. Screen-by-screen control lists live with each screen: [[Monitor Controls]], [[Task Detail Controls]], [[Human In The Loop Controls]], [[Flow Design Controls]].

As built in run-flow (2026-10-23), the terminal was the only screen; since 2026-11-10 the runs page is a second one (below). `pnpm run-flow --folder <dir> --task <file> <flow.yaml>` starts a flow, and `--budget-usd <n>` overrides its budget. A gate asks for a decision, `Approve (pass)`, `Reject (fail)`, `Retry this step` or `Fail the flow`, with Reject offered only when the step has an `on_fail` route and only Retry and Fail at an escalation or a *run failed* gate. Then it asks `Note for the next run (optional)`, which goes to the runs the decision starts (Claude's call, 2026-10-23, open to Alex's review). A *run failed* gate's `See:` line names the run's log. A spent loop escalates and never fails the flow by itself. Ctrl+C stops the flow so `--resume` can continue it. Once the flow has spent its budget, run-flow stops the runs the same way and pauses the flow, and `--resume <run folder> --budget-usd <more>` continues it. There is no Pause, Cancel or Stop for one run. See [[Run Flow Reference#Gates and their choices]].

As built (2026-11-10), the runs page (`/runs`, one run at `/runs?run=<run folder>`) has these controls ([[Execution Surfaces]]):

| Control | Works on | Effect |
|---|---|---|
| **+ New run** | always; the designer's **Run** opens it on one flow | Flow, Folder, Task, an optional Budget and an allow-dirty box; starts `run-flow --page` ([[Starting A Task]]) |
| **Approve** (`a`), **Send back** (`r`), **Retry**, **Fail** | an open gate of a run started with `--page` | the gate's decisions, with a note field; Send back is Reject. The first answer, terminal or page, wins. With several gates open, only the first takes the `a` and `r` keys and shows their hints |
| **Allow host & retry** | a *run failed* or escalation gate of an OpenSandbox run started with `--page` | Retry, after the host typed in the host field is let through the box and added to the run's pinned `sandbox.egress` |
| An agent's question | a run started with `--page` | answered on the page; the first answer wins |
| **Stop run** | a run whose host is alive, `--page` or not | writes `<run folder>/stop`, which the host checks every 400 ms and handles as a first Ctrl+C; a repeated Stop is ignored |
| **Resume**, **Resume with more budget…** | a `paused` run | `run-flow --resume <run folder> --page` in the background, with `--budget-usd` for the second |

The page checks an answer against the question's options and takes answers only while a `--page` host is alive. A run without `--page` gets a banner instead of gate controls: its gates are decided in its terminal only. There is no `esc`.

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

In the sources, the two retry buttons are mockup-only, and the PRD's Retry and Fail task are not drawn on any mockup. See [[Failures And Escalated Loops]]. As built (2026-11-10), the runs page has Retry, Fail and Allow host & retry, the last only on an OpenSandbox run, at a *run failed* or escalation gate. At *run failed* it reruns the same attempt, not the next as the monitor guide has it; at an escalation it is the escalation's Retry. It edits the run's pinned `flow.json`, never the recipe, so it makes no version ([[Execution Open Questions]] #24).

## Stop

| Control | Where | Engine effect | Money |
|---|---|---|---|
| Stop | Live run viewer | SIGTERM, `cancelled` (`03` §8). As built (2026-11-10), the runs page's **Stop run** stops the whole flow as a first Ctrl+C, through a `stop` file | — |
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
| Retries | Flow designer inspector | the loop budget, mapped as `max_attempts − 1` (a proposal, [[Flow Design Open Questions]] #11); mockup default 2 against the PRD's `max_attempts` default 3. Guide: *"How many redos a rework loop gets before the task stops and waits for you: one more try with a note, or fail it."* ([[Execution Open Questions]] #14, #15). |
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
| `a`, `r` | Approve, Send back; with several gates open, the first gate only (as built, 2026-11-10) | runs page |

No key is assigned to Start, Stop, the PRD's Retry or Fail task, Retry as-is or Cancel in any source. Backlog 9.4 (**BUG**) asks for a *"keyboard equivalent for promote/demote"* without naming one.

## Related

- [[Execution Index]]
- [[Execution Surfaces]]
- [[Execution API And Routes]]
- [[Stopping And Cancelling]]
- [[Egress Denials]]
