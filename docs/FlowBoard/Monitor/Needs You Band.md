---
tags: [flowboard, monitor, hitl, needs-you]
module: Monitor
---

# Needs You Band

Band 3 of the [[Monitor Screen]]: *"Everything blocked on a human, oldest first. Empty most of the time."* Its header reads **NEEDS YOU** with a count, and the hint *"oldest first — clear these and everything else runs itself"* (`monitor.html:728`).

## What lands here

Any task whose first blocking run is in one of three states (`needsList()`):

| Kind | Icon | Card body | Actions |
|---|---|---|---|
| **Gate** | ‖ ochre | *"Review passed. Approve the change so the task can move to **summarize**?"* | `a` **Approve** (primary) · `r` **Send back** · **Read review.md** |
| **Question** | ? ochre | The agent's question, in sans | One button per option, keyed `1`…`9`, the first one primary |
| **Failure** | ✕ brick | *"Attempt N of 3 failed — <error>. $X spent on the attempts so far."* | **Allow host & retry** (primary) · **Retry as-is** · **Open the log** |

Each card shows `task-id · step`, then `waited 12m`, with an `ESCALATED` tag in front when the wait passes 10 minutes (`monitor.html:731`). A failure card has a brick left edge and border (`is-fail`). Actions are in [[Monitor Actions And Costs]].

## Ordering

*"Oldest first."* Items sort by `since` (when the gate opened or the question was asked), else the run's end time. The inbox mockup uses the same rule: *"Oldest first — the same rule the monitor's band uses."* PRD §10 orders the inbox *"newest-blocking-first"* ([[Monitor Open Questions]] #6).

The keyboard acts only on the **top** card: *"Number keys act on the top item in Needs you — the oldest one — so you can clear the band without ever choosing what to look at next."* (`monitor-guide.html:508`)

## Send back

**Send back** swaps the action row for a one-line form: an input with the placeholder *"Why — this goes to the next build attempt"*, a **Send back** submit, and **Cancel**. While the input has focus the band does not re-render.

The guide says `Esc` cancels the form (*"Close the detail, cancel a reason box"*). In the mockup it cannot: opening the form puts focus in the input, and the key handler ignores every key while focus is in an input (`monitor.html:1100, 1126`). Only **Cancel** closes it ([[Monitor Open Questions]] #46).

## Empty state

When nothing is blocked the band collapses to one white line: `✓ Nothing waiting on you. · 3 running, 5 queued`. *"When nothing is blocked, band 3 collapses to a single white line and every trace of amber leaves the screen."* The old handoff gave the inbox's empty state the same job: *"The empty state's job is to say what is running."* So does the drawio *Inbox* card: *"Empty state shows what's running / Not a shrug illustration."*

When something is waiting the band turns amber (`needs.hot`: wash `#F7EAD3`, a solid ochre header). This is the one element where the accent runs at full strength.

## Against the inbox

The [[Human In The Loop Index|Human In The Loop]] component's inbox shows the same items with every question shape. The band only renders single-choice questions as buttons. The same seeded task differs: `csv-export` is one three-option question on the monitor and a five-question batch in the inbox mockup. How the band shows a batch, a text or a number question is not designed ([[Monitor Open Questions]] #5).

The card copy for a gate is fixed (*"Review passed…"*). PRD §8 also parks steps at `awaiting_approval` for *"no outcome reported"* and for a spent or stuck loop. Those need different wording ([[Monitor Open Questions]] #33).

## Related

- [[Waiting And Escalation]]
- [[Monitor Actions And Costs]]
- [[Failures And Retries]]
- [[Approval Gates]]
