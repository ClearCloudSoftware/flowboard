---
tags: [flowboard, human-in-the-loop, behaviour, inbox]
module: Human In The Loop
---

# Inbox Order And Filters

## Order

> [!quote] inbox guide
> *"**Oldest first, not most important.** The inbox will not rank questions for you, because it cannot know which matters — but it does know which has been blocking a run the longest, and that is the one costing you calendar time. The only re-ordering is the filter."*

The mockup's comment: *"Oldest first — the same rule the monitor's band uses. One card is open at a time: you work it, it goes, the next opens itself."* The monitor guide's *Needs you* band is *"Everything blocked on a human, oldest first."*

The other sources word the order differently:

| Source | Order |
|---|---|
| PRD §10 | *"newest-blocking-first"* |
| `04` §9 *Inbox notes* | *"Newest-blocking-first"* |
| Backlog Story 4.3 | *"newest-blocking-first"* |
| Feature map §12 | *"Everything waiting, most-urgent first"* |
| Inbox mockup, guide, monitor | Oldest first |

*Newest-blocking-first* can be read two ways: the most recently blocked first, or the one that has blocked longest. See [[Human In The Loop Open Questions]] #2.

The monitor's *needs you first* sort *"ranks failed above waiting above running"*. In the inbox the failure card happens to be oldest, so it is first either way.

## Grouping

| Source | Grouping |
|---|---|
| PRD §10 | *"Group by task."* |
| Feature map §12 | *"Grouped by task, each with the right control for its question type."* |
| `04` §9 | *"one card per `batch_id`"* |
| Backlog Story 4.3 | *"One card per batch"* |
| Old design handoff | Batches grouped by `(taskId, stepRunId)`; *"a batch renders as one card"* |
| Inbox mockup | One card per batch, per lone question, per gate and per failure. Two items from one task would be two cards |

See Open Questions #3.

## One open card

The rule the keyboard rests on: *"there is only ever one open card, so a key never has to ask 'which one?'"* (inbox guide). The first visible card opens on load. Answering closes it and opens the next at the same position (mockup `resolve()`). The guide's walkthrough: *"You never chose what to work on next."*

## The filter

| Chip | Shows | Source |
|---|---|---|
| **Waiting on me** (default) | *"Only what is assigned to you."* | inbox guide actions |
| **Everyone** | *"The whole team's queue, including cards waiting on someone else — visible, but theirs to answer."* | inbox guide actions |

A card for someone else carries *waiting on dana* in its header. The status bar counts `5 open · 4 on you`.

> [!warning] Who is "me"?
> The PRD has *"No auth, no multi-tenancy, no user table"* (§2), and `questions` has no assignee. The filter needs identities, which the feature map calls *"the one genuinely new foundation the team ideas need"*. See Open Questions #4.

## Ideas

- **A "my inbox" filter**: *"each teammate sees only what is waiting on them."* (feature map §12)
- **A shared pool to claim from**: *"unassigned questions and gates sit in a team queue anyone can pick up, like support tickets."* (feature map §12)
- **Assign a step to a person or role** (feature map §2) and **route the next human step to a teammate** (§4). Either would give a card its *who*.
- **The handoff relay**: *"FlowBoard routes the handoff into the next person's inbox."* (feature map *Appendix: Role starter flows*)

## Related

- [[Human In The Loop Screen]]
- [[Inbox Card Kinds]]
- [[Human In The Loop Controls]]
