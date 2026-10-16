---
tags: [flowboard, human-in-the-loop, screen, monitor, task-detail]
module: Human In The Loop
---

# Decisions Outside The Inbox

The inbox is not the only place to answer, approve or send back. The monitor and task detail offer the same gate decisions under `a` and `r`; the monitor also answers questions with `1`–`9`. The board only signals that a decision is waiting. The Monitor set covers the band in [[Needs You Band]] and [[Waiting And Escalation]]; the Task Detail set covers the banner in [[Deciding At A Gate]] and [[Questions Within A Task]].

## Monitor — the *Needs you* band

`docs/mockups/monitor.html`. The monitor guide's region 3: *"Everything blocked on a human, oldest first. Empty most of the time."* The mockup's header: *"needs you · N · oldest first — clear these and everything else runs itself"*.

| Item | Body | Actions |
|---|---|---|
| gate | *"Review passed. Approve the change so the task can move to summarize?"* | `a Approve` · `r Send back` · `Read review.md` |
| question | the question | `1`…`n` one button per option, the first primary |
| failure | *"Attempt N of 3 failed — <err>. $X spent on the attempts so far."* | `Allow host & retry` · `Retry as-is` · `Open the log` |

The keys act on the **top** item: *"`a` Approve the top gate in Needs you"*, *"`r` Send back the top gate — opens the reason box"*, *"`1 – 9` Answer the top question with that option"* (monitor guide keyboard). They fire only if the top item is the matching kind. The band sorts oldest first, so in the seeded state the failure (`billing-webhook`, about 42m) is on top and `a`, `r` and `1`–`9` do nothing until it is cleared. The monitor puts no failure action on a key ([[Monitor Open Questions]] #44); the inbox puts *Allow host & retry* on `↵` ([[Human In The Loop Controls]]), and *Retry as-is* has no key anywhere ([[Human In The Loop Open Questions]] #28). Every item past 10 minutes (gate, question and failure) shows `escalated`; the monitor guide lists *Escalated* only for a question. When empty: *"Nothing waiting on you. · N running, M queued"*.

The monitor guide's status table:

| Status | Means | Do |
|---|---|---|
| Waiting on you — *a gate* | *"Every agent step is done for now; a step needs your approval before the task can continue."* | *"Approve it or send it back. Until you do, the task occupies no worker and costs nothing."* |
| Waiting on you — *a question* | *"A run paused mid-job because it needs an answer it can't safely guess."* | *"Answer it. The run picks up exactly where it stopped, with your answer in hand."* |
| Failed | *"A step errored, hit its retry limit, or you stopped it. The task is parked and spending nothing."* | *"Open it, read the error, then Allow host & retry or Retry as-is — or leave it and let the spend stop there."* |

The monitor guide calls these *"the four decisions that are yours: approve, send back, answer, retry or stop"*. The mockup's Timeline view ([[Timeline View]]) hatches the stretches a task spent waiting on a person, with the caption *"Flat, hatched stretches are the hours nobody paid for — the board waiting on a human."* (the guide: *"Flat hatched stretches are hours nobody paid for — the board waiting on a human."*) Its *blocked* filter is *"everything waiting on a human, including gates and questions you scrolled past."*

## Task detail — the gate banner

`docs/mockups/task-detail.html`: a **needs you** banner above the tabs, *review passed with 2 notes · waited 5m 00s* with a ticking timer (the guide shows *"review passed with 2 notes · waited 5m"*), with `a Approve`, `r Send back`, and **Compare plan vs built**. The reason form submits as **Send back to build**. The mockup's 1 s redraw discards typed text, so the prefilled reason is what gets sent ([[Task Detail Open Questions]] #32). The status pill reads `‖ waiting on you`. The Story tab shows what you answered: *"you answered Every use after 2m 14s — the run resumed where it stopped"*. The cost panel notes: *"Answering is free. Plan paused for $0.00 while it waited 2m 14s on your answer — a run that asks a question stops billing until you reply."* The task-detail guide's walkthrough starts at this banner: *"You arrive from the inbox"*. In task detail `1`–`4` switch tabs; they don't answer anything.

The guide's *Plan vs built* row: *"Always, before approving. It is the only view that compares intent against the working tree."* And for an item marked *not built*: *"If it was, send it back — approving is accepting the gap."*

PRD §13 already puts *"Approve / Reject buttons on the step that is awaiting approval"* on the task detail sheet. The old brief: *"The approval gate. When a step is waiting on me, this is where I approve or reject. It needs to be the obvious focus of the sheet without a modal."* Backlog Story 2.3: *"Approve / Reject as the visual focus of the sheet; Reject asks for a reason"*.

## Board — the card

PRD §13: *"a state dot (running / awaiting answers / awaiting approval / failed)"*. The feature map words it *"(running / waiting on you / needs approval / failed)"* (§5), and the drawio *Card at a glance*: *"state dot (running / answers / approval / failed)"*. The old handoff's attention rows: amber *"6 questions waiting"* + elapsed, and accent *"Plan needs approval"* + an `a` key chip. Backlog Story 2.2: *"Either implement the `a` (approve) shortcut or remove the chip from awaiting-approval cards."* (**BUG**). The board as a read model: [[Board Projection]]. The feature map ideas: *"who a waiting gate is on ('waiting on Alice' vs 'waiting on you')"* (§5).

## Global chrome

Backlog Story 9.2: *"amber inbox count"*. The old handoff's Inbox nav pill *"carries its pending count in mono, amber"*.

> [!note] One decision, many doors
> Every surface writes through the same PRD §12 endpoints (`approve`, `reject`, `retry`, `answer`). First write wins is specified only for answers: *"already answered by <channel>"* (PRD §10). No source sets a rule for a gate acted on from two surfaces. *Allow host & retry* has no endpoint at all ([[Human In The Loop Open Questions]] #26).

## Related

- [[Approving And Sending Back]]
- [[Inbox Card Kinds]]
- [[Human In The Loop Controls]]
- [[Approval Gates]]
- [[Needs You Band]]
- [[Deciding At A Gate]]
