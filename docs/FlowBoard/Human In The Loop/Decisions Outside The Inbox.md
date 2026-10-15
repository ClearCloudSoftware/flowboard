---
tags: [flowboard, human-in-the-loop, screen, monitor, task-detail]
module: Human In The Loop
---

# Decisions Outside The Inbox

The inbox is not the only place to answer, approve or send back. Three sibling screens offer the same decisions with the same keys.

## Monitor — the *Needs you* band

`docs/mockups/monitor.html`, region 3: *"Everything blocked on a human, oldest first. Empty most of the time."* Its header: *"needs you · N · oldest first — clear these and everything else runs itself"*.

| Item | Body | Actions |
|---|---|---|
| gate | *"Review passed. Approve the change so the task can move to summarize?"* | `a Approve` · `r Send back` · `Read review.md` |
| question | the question | `1`…`n` one button per option, the first primary |
| failure | *"Attempt N of 3 failed — <err>. $X spent on the attempts so far."* | `Allow host & retry` · `Retry as-is` · `Open the log` |

The keys act on the **top** item: *"`a` Approve the top gate in Needs you"*, *"`r` Send back the top gate"*, *"`1 – 9` Answer the top question with that option"* (monitor guide keyboard). Items past 10 minutes show `escalated`. When empty: *"Nothing waiting on you. · N running, M queued"*.

The monitor guide's status table:

| Status | Means | Do |
|---|---|---|
| Waiting on you — *a gate* | *"Every agent step is done for now; a step needs your approval before the task can continue."* | *"Approve it or send it back. Until you do, the task occupies no worker and costs nothing."* |
| Waiting on you — *a question* | *"A run paused mid-job because it needs an answer it can't safely guess."* | *"Answer it. The run picks up exactly where it stopped, with your answer in hand."* |
| Failed | *"A step errored, hit its retry limit, or you stopped it. The task is parked and spending nothing."* | *"Open it, read the error, then Allow host & retry or Retry as-is"* |

The monitor's Timeline view hatches the stretches a task spent waiting on a person: *"Flat, hatched stretches are the hours nobody paid for — the board waiting on a human."* Its *blocked* filter is *"everything waiting on a human, including gates and questions you scrolled past."*

## Task detail — the gate banner

`docs/mockups/task-detail.html`: a **needs you** banner above the tabs, *"review passed with 2 notes · waited 5m"*, with `a Approve`, `r Send back`, and **Compare plan vs built**. The reason form submits as **Send back to build**. The status pill reads `‖ waiting on you`. The Story tab shows what you answered: *"you answered Every use after 2m 14s — the run resumed where it stopped"*. The cost panel notes: *"Answering is free. Plan paused for $0.00 while it waited 2m 14s on your answer"*.

The guide: *"Plan vs built — Always, before approving. It is the only view that compares intent against the working tree."* And for an item marked *not built*: *"If it was, send it back — approving is accepting the gap."*

PRD §13 already puts *"Approve / Reject buttons on the step that is awaiting approval"* on the task detail sheet. The old brief: *"The approval gate. When a step is waiting on me, this is where I approve or reject. It needs to be the obvious focus of the sheet without a modal."* Backlog Story 2.3: *"Approve / Reject as the visual focus of the sheet; Reject asks for a reason"*.

## Board — the card

PRD §13: *"a state dot (running / awaiting answers / awaiting approval / failed)"*. The old handoff's attention rows: amber *"6 questions waiting"* + elapsed, and accent *"Plan needs approval"* + an `a` key chip. Backlog Story 2.2: *"Either implement the `a` (approve) shortcut or remove the chip from awaiting-approval cards."* (**BUG**). The feature map ideas: *"who a waiting gate is on ('waiting on Alice' vs 'waiting on you')"* (§5).

## Global chrome

Backlog Story 9.2: *"amber inbox count"*. The old handoff's Inbox nav pill *"carries its pending count in mono, amber"*.

> [!note] One decision, many doors
> Every surface writes through the same endpoints (`approve`, `reject`, `retry`, `answer`, PRD §12), so the first decision wins wherever it was made. No source says how a second surface reacts when a gate is cleared somewhere else. For questions the rule is *"already answered by <channel>"*.

## Related

- [[Approving And Sending Back]]
- [[Inbox Card Kinds]]
- [[Human In The Loop Controls]]
- [[Approval Gates]]
