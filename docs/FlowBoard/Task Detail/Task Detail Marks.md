---
tags: [flowboard, task-detail, screen, marks]
module: Task Detail
---

# Task Detail Marks

> *"The screen uses three sets of marks, and they mean different things. The **spine** is about steps, the **story icons** are about runs, and the **verdict badges** are about work items. Don't read one as the other."* — task-detail guide, *Three alphabets*

The status pill is a fourth mark, for the task as a whole.

## 1. The spine — one segment per step

A row of bars under the header, one per step in the pinned flow, each with the step name and a duration. Clicking a segment jumps to that step in the Story tab and expands it.

| Segment | State | Means (guide) |
|---|---|---|
| solid stone grey | done | *"The step finished and its artifact is in the workspace. Grey, deliberately — most of a healthy task is this, and colouring it would drown the part that wants you."* |
| petrol, sweeping | running | *"An agent has it right now. The segment sweeps and the bill climbs."* |
| ochre hatching (45°) | waiting on you | *"The agent work is finished; a human decision is holding the task. Hatched, so it reads as blocked without relying on colour."* |
| pale fill, hairline outline | queued | *"Ready to run, waiting for a free worker. The hairline outline separates it from pending."* |
| pale fill | pending | *"Not started, and it can't be — something upstream is unfinished."* |
| solid brick | failed | *"Out of retries. Whatever it spent is now wasted."* |

The label under a segment reads the duration, `waiting` for a gate, `—` for pending, and a red `↺n` when the step took more than one attempt.

> [!note] The spine is a line, the flow is a graph
> The spine lists steps in a single order. It cannot show that Build and Tests ran in parallel, which the monitor's bar draws as `done,done,done:done,…` with a join. The PRD's board puts a split card *"in the column of the split point"* with a split badge (PRD §4). No source says how task detail shows branches.

## 2. Story icons — the state of each run

| Icon | Colour | Run state | What the row tells you (guide) |
|---|---|---|---|
| ✓ tick | stone | done | *"Duration, cost, and how many attempts it took. Expand it for the log and the artifact it wrote."* |
| ● dot in a faint ring | petrol | running | *"Live duration and a cost that climbs while you watch."* |
| ‖ two bars | ochre | gate | *"Finished, waiting on your approval. Costs nothing while it waits."* |
| ✕ cross | brick | failed | *"Expand for the error. The red band names what broke and what that attempt cost."* |
| ◌ dashed circle | hairline | not started | *"No run yet — nothing to show but the step's settings."* |

In the mockup `queued` and `pending` both use the dashed circle.

> [!question] "Nothing to show but the step's settings"
> The guide promises a not-started row shows the step's settings. The mockup shows only `agent · model · effort` in the row head (the same as every row) and *"Nothing written yet."* when expanded.

## 3. Verdict badges — work items

| Badge | Status | Colour |
|---|---|---|
| `as planned` | matched | stone outline |
| `deviated` | deviated | ochre |
| `not built` | missed | brick |
| `unplanned` | unplanned | petrol |

Meanings in [[Plan Versus Built]].

> [!warning] Same colour, different meaning
> Petrol means **alive** on the spine and the run icons, but **unplanned** on a verdict badge. Brick means **failed** on a run but **not built** on a verdict. This is why the guide insists the alphabets not be mixed.

## 4. The status pill — the task as a whole

| Pill | Means | What you can do (guide) |
|---|---|---|
| `● build running` (petrol) | running | *"Watch, or stop the run from the story row if it is clearly lost."* |
| `‖ waiting on you` (ochre) | waiting | *"The gate banner is showing. Approve or send back — nothing else advances it."* |
| `✓ done` (stone) | done | *"Read the summary, then clean up the workspace when you no longer need the branch."* |
| `in progress` (plain) | anything else | mockup only, not in the guide |

There is no pill for **failed**, **cancelled**, **blocked**, **backlog** or **todo**, though the PRD has all of them as task statuses. A gate pill takes priority over a running one when both apply. See [[Task Detail Open Questions]].

## Symbols in text

| Symbol | Where | Meaning |
|---|---|---|
| `↺n` | spine, story row | the step took n attempts |
| `›` | log | an action: read, write, edit, run |
| `✓` | log | success |
| `◆` | log | a finding that wants attention |
| `?` | log | a question to you |
| `⋯` | log | skipped |
| `+a −d` | Plan vs built, Files | lines added, removed |

## Related

- [[Task Detail Index]]
- [[Task Detail Screen]]
- [[Task Detail Tabs]]
- [[Task Lifecycle]]
