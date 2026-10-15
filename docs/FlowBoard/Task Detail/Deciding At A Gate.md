---
tags: [flowboard, task-detail, behaviour, gates]
module: Task Detail
---

# Deciding At A Gate

The moment the screen is built for. The design brief says the approval gate *"needs to be the obvious focus of the sheet without a modal"*. Backlog Story 2.3: *"Approve / Reject as the visual focus of the sheet"*.

## Why a task stops at a gate

A step instance goes to `awaiting_approval` (PRD §8) when:

1. its step has `advance_mode='approval'` and its run succeeded (*"It advances only when I click Approve."*). See [[Approval Gates]].
2. it has an `on_pass` / `on_fail` edge and the run set no outcome: *"A missing outcome is never a pass."* The gate's reason is *"no outcome reported"*.
3. a rework loop is **spent** (past `max_attempts`) or **stuck** (same shell fingerprint twice). The task also goes `blocked`, and the gate shows *"the failing step's last artifact (the error log or review)"*.

The mockup shows only case 1: Review is gated and *"passed with 2 notes"*.

## The gate banner

Present only while a step is gated. In the mockup:

- **Head strip** (ochre): `NEEDS YOU` · *"review passed with 2 notes"* · `waited 5m 00s` (ticks every second).
- **Question** (prose): *"The reviewer passed the change but flagged two things: plan item 2 deviated — it revokes one token rather than the family — and item 3 was never built. Approve anyway, or send it back with a reason?"*
- **Buttons**: `a` **Approve** (primary), `r` **Send back** (danger), **Compare plan vs built** (switches to that tab).

The text is the reviewer's finding, not a generic prompt: *"it says what the reviewer actually flagged"* (guide). No source says where this text comes from. It matches what `review.md` and `set_outcome({ outcome, reason })` (PRD §9) could carry. See [[Task Detail Open Questions]].

## Approve

| | |
|---|---|
| Key | `a` |
| Guide | *"Clears the gate. The next step queues immediately and the task finishes without you."* |
| Money | *"Free — nothing is re-run, nothing is wasted."* |
| Engine | *"Approve overrides the agent's `fail` outcome (human wins)"* (backlog Story 5.2 **FIX**). For a no-outcome gate, *"approve means pass"* (PRD §8). |
| API | `POST /api/step-instances/:id/approve` |
| Mockup | Review → done; 0.5 s later Summarize runs for 7 s of wall time, bills at ×24, writes `summary.md`, and the task shows **done** |

## Send back

| | |
|---|---|
| Key | `r` opens the reason box; `Esc` closes it |
| Guide | *"Opens a reason box. Review is discarded, build re-queues as the next attempt carrying your reason, and tests are left alone."* |
| Money | *"The build's kept spend moves to wasted."* |
| Engine | *"reject sets `fail` + reason; reject with no `on_fail` edge fails the task"* (backlog Story 5.2). *"a rejection carries your reason into the next attempt"* (feature map §4). |
| API | `POST /api/step-instances/:id/reject` |
| Mockup | The reason field placeholder reads *"Why — this goes to the next build attempt"*, prefilled *"Finish item 2: revoke the whole token family, not just the presented token."* An empty submit becomes *"needs another pass"*. The button reads **Send back to build**. A 1 s timer redraws the banner, so typed edits are lost and the prefilled reason is what gets sent (see [[Task Detail Controls]]). |

Backlog Story 2.3 records that the old build never sent a reason: *"**Reject asks for a reason** (API accepts it, board renders it, UI never sends it). **BUG**"*.

The money and attempt mechanics are in [[Attempts And Send Back]].

## The walkthrough

The guide's centrepiece, *"a decision rather than a tour"* (mockups README). Seven common beats, then a branch.

| # | Beat | The point |
|---|---|---|
| 1 | You arrive from the inbox | *"First look: **is anything red?**"* A passed review with notes is the normal case. |
| 2 | Read the spine before the diff | Build's `↺2`: *"a step that struggled is a step more likely to have cut a corner."* Attempt 1 died on egress, not the code. |
| 3 | Open Plan vs built | *"The tally is the whole judgement in one line."* Item 1 is clean. |
| 4 | The deviation | *"**This is the one that ships bugs.** A missing item is obvious; a deviation has evidence of work behind it."* |
| 5 | The item that never happened | *"Approving leaves **two** halves of one feature undone, not one."* |
| 6 | And something nobody asked for | *"Cheap rule: unplanned code either earns a line in the next plan, or comes back out."* |
| 7 | Check what it cost | *"a task well over its recipe's average usually means something went around in circles."* |

**Approve branch**

| # | Beat | The point |
|---|---|---|
| 8 | You approve | *"Approving costs nothing and wastes nothing — it is the only free decision here."* You accepted *"item 2 half-built, item 3 not built, and an untested metrics file."* |
| 9 | Done — and what you owe next | *"Approving with known gaps is a legitimate call — the honest version of it files the follow-up before you close the tab."* `summary.md · $2.63 · workspace kept` |

**Send-back branch**

| # | Beat | The point |
|---|---|---|
| 8 | You send it back | Build re-queues as attempt 3 with your reason. *"**The money moves, it does not come back.**"* Bill stays $2.61, wasted jumps to $1.60. |
| 9 | Back where you were, poorer | Kept $1.01, wasted $1.60, bill $2.61, *"61% of this task's spend is now on work that was thrown away"*. *"a gate you keep re-opening is usually a sign the plan was unclear, not the agent."* |

> [!warning] Three versions of the send-back money
> The figures above are the guide's: kept $1.01, wasted $1.60, bill $2.61. The mockup's `sendBack()` zeroes Review's $0.16 instead of moving it, so its bill falls to $2.45. Backlog Story 5.2's rule (*"downstream runs `wasted=1`"*) gives kept $0.85, wasted $1.76, bill $2.61. See [[Attempts And Send Back]].

## Reading order the guide teaches

A summary of the walkthrough's beats, not a list in the guide:

1. Is anything red?
2. The spine: which step struggled (`↺`)?
3. Plan vs built: the tally, then every **deviated** hunk.
4. **Not built**: was it needed?
5. **Unplanned**: does it earn its place?
6. Cost against the recipe average.
7. Decide. If you approve with gaps, file the follow-up.

## Ideas

- **Separation of duties** — *"whoever ran the build can't be the one who approves its own review."* (feature map §3)
- **Two sign-offs on one gate** (feature map §4)
- **Route the next human step to a teammate** (feature map §4)

## Related

- [[Task Detail Index]]
- [[Plan Versus Built]]
- [[Attempts And Send Back]]
- [[Approval Gates]]
- [[Task Detail Controls]]
