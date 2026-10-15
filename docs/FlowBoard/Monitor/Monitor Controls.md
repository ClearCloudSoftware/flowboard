---
tags: [flowboard, monitor, ui, controls, keyboard]
module: Monitor
---

# Monitor Controls

Every control on the [[Monitor Screen]]. What each decision costs is in [[Monitor Actions And Costs]].

## Topbar

| Control | Does |
|---|---|
| **flow** button (`research→plan→build∥tests→review→summarize v4`) | Opens [[Pipeline View]]. Hidden below 900 px |

## Workers strip

| Control | Does |
|---|---|
| Strip header (`▸ WORKERS …`) | Expands or collapses the slot rows (`aria-expanded`). Key `w` |
| **stop** on a slot | Ends that run |

## Needs you band

| Control | On | Does |
|---|---|---|
| **Approve** `a` | gate | Clears the gate |
| **Send back** `r` | gate | Opens the reason form |
| Reason input + **Send back** / **Cancel** | gate | Submits the reason or closes the form. The guide's `Esc` does not work here (see *Rules from the code*) |
| **Read review.md** | gate | Opens the task's row in Pulse |
| Option buttons `1`…`9` | question | Answers with that option |
| **Allow host & retry** | failure | Allowlists the host, re-queues |
| **Retry as-is** | failure | Re-queues |
| **Open the log** | failure | Opens the task's row in Pulse |

## View switcher

| Control | Options | Notes (guide) |
|---|---|---|
| Tabs | **Pulse** · **Timeline** · **Pipeline** | Key `v` cycles them |
| Filter chips (Pulse) | `all · active · blocked · failed · done` | *"**blocked** is the useful one: everything waiting on a human, including gates and questions you scrolled past."* |
| Sort select (Pulse) | `needs you first · most expensive · longest running · name` | *"**needs you first** is the default and ranks failed above waiting above running. **Longest running** finds a hung agent faster than anything else here."* |
| Window chips (Timeline) | `30m · 1.5h · 4h` | *"Widen it to see a task's whole life, including the hours it sat waiting."* Default 1.5 h |

Pipeline has no tools.

## Rows and detail

| Control | Does |
|---|---|
| A row | Opens or closes its [[Task Row Detail]] and takes focus. Only one row is open at a time |
| **Stop this run** (detail) | Stops the running step shown in the log |
| **See it on the timeline** (detail) | Switches to Timeline |
| **See the flow** (detail) | Switches to Pipeline |
| Hover a flow-bar cell | Tooltip with step, model, time, cost, attempts |

## Keyboard

*"This is the screen you'll live in, so it's built to be driven without a mouse."*

| Key | Does (guide) |
|---|---|
| `j` / `k` | *"Move down and up the task list"* |
| `↑` / `↓` | *"Same as j and k"* |
| `↵` or `o` | *"Open or close the focused task's detail"* |
| `Esc` | *"Close the detail, cancel a reason box"* |
| `a` | *"Approve the top gate in Needs you"* |
| `r` | *"Send back the top gate — opens the reason box"* |
| `1` – `9` | *"Answer the top question with that option"* |
| `v` | *"Cycle Pulse → Timeline → Pipeline"* |
| `w` | *"Open or close the worker slots"* |

Rules from the code:

- Keys are ignored while focus is in an input or select, and with ⌘, Ctrl or Alt held. Opening **Send back** focuses the reason input, so `Esc` cannot cancel it there, despite the guide ([[Monitor Open Questions]] #46).
- `a`, `r` and `1`–`9` act on `needsList()[0]`, the oldest item, only if it is the right kind. If the oldest item is a failure, `a` does nothing even when a gate sits below it. On the seeded screen the oldest item *is* a failure (`billing-webhook`, 42m), so all three do nothing until it is cleared with the mouse ([[Monitor Open Questions]] #44).
- `j`/`k` move within the current filter and sort.

The status bar shows `j k move · ↵ open · a approve · 1-9 answer · v view · w workers`. It omits `r`, `o` and `Esc`.

### Against other sources

- The inbox (PRD §10) uses `j`/`k`, `1`–`9`, `Enter`. The old handoff's board keys were `h`/`l` pan, `[`/`]` jump to the next column needing attention, `Enter` open (backlog 2.2 too). The monitor has no columns, so it has no `h`/`l` or `[`/`]`.
- Backlog 2.2 BUG: *"Either implement the `a` (approve) shortcut or remove the chip from awaiting‑approval cards."* The monitor implements it.

## Related

- [[Monitor Screen]]
- [[Monitor Actions And Costs]]
- [[Pulse View]]
