---
tags: [flowboard, human-in-the-loop, screen, inbox]
module: Human In The Loop
---

# Human In The Loop Screen

The inbox at `flowboard/inbox` (route `/inbox`, PRD §10, §13). Sources: `docs/mockups/inbox.html` and its field guide. The old dark design handoff (`docs/old/design/README.md`, artboards 1a, 1d, 1e) covers the states the mockup lacks.

> [!important] *"The queue you work, not a list you browse"*
> *"The screen is built around a single claim: you should be able to empty it without touching the mouse — so one card is open at a time, the number keys always mean the thing in front of you, and answering closes the card and opens the next."* — inbox guide

## Layout

```
┌ flowboard / inbox   [4 waiting · 2 escalated]           show  Waiting on me  Everyone ┐  1
├──────────────────────────────────────────────────────┬───────────────────────────────┤
│ ✕ billing-webhook · build          escalated · 42m   │ while you're here             │
│ ? csv-export · plan                escalated · 12m   │  running now                  │
│   ┌ the one open card — its controls are here ┐      │  costing you   $/hr           │  3
│ ? provider-codex · research               9m        │  next decision                │
│ ‖ auth-refactor · review                  5m        │  answered today               │
│                                                  2   │  recently answered            │
├──────────────────────────────────────────────────────┴───────────────────────────────┤
│ 4 open · 4 on you · escalation after 10m · answers sync both ways with chat   j k …  │  4
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Region | Guide wording |
|---|---|---|
| 1 | **Count** | *"Amber while anything waits, green when it doesn't. The filter switches between what's on you and what's on the team."* |
| 2 | **Queue** | *"Oldest first, exactly one card open. Answering it closes the card and opens the next."* |
| 3 | **Context** | *"What's still running, what it's costing, and roughly when the next decision lands — so you know whether to stay."* (fixed 292 px column) |
| 4 | **Status bar** | *"The escalation window, and the reminder that answers sync both ways with chat."* Plus the key legend |

## The topbar

- Brand `flowboard / inbox`.
- Count: `N waiting` and, when any are escalated, `· N escalated`, on an amber chip. With nothing visible it shows `all clear` in the teal *run* colour (the guide calls it green). *"Green means done, and it is the only reward this screen offers."*
- `show` **Waiting on me** · **Everyone**. See [[Inbox Order And Filters]].

## A card

Closed: icon (`✕` failure, `‖` gate, `?` question or batch), `task · step`, *waiting on <who>* when it isn't you, meta (`escalated ·` or `escalates in …` then `waited …`), and a one-line summary. Open: a dark border with a 3 px left rule (red for a failure) and the body for its kind. See [[Inbox Card Kinds]].

## The context panel — *while you're here*

| Block | Sample (mockup) |
|---|---|
| running now | `sandbox-egress` build opus; `mem0-adapter` build opus; `mem0-adapter` tests sonnet; `docs-pass` research haiku. A task with parallel branches gets two rows |
| costing you | `$20.28 /hr` (the per-minute rates of running runs × 60); today `$19.46`; wasted `$2.55` |
| next decision | *"In about 4 minutes, when sandbox-egress reaches its review gate."* |
| answered today | questions `11`; median reply `3m 20s`; from chat `3 of 11` |
| recently answered | `task`, a `web`/`slack` tag, and *question → answer · when*: e.g. *flow-versioning · Pin to the flow version, or the latest? → Pin to the version · 14m ago* |

The old handoff's right rail (320 px) had *Running now* with live cost and `model · effort · elapsed`, *Next checkpoints* (*"label/ETA pairs"*) and the shortcut legend. Backlog Story 4.3: *"Right rail: running steps with live cost estimate, next checkpoints (median ETA), shortcut legend."* How the figures are derived is not specified: [[Human In The Loop Open Questions]] #32.

## States

| State | What shows | Source |
|---|---|---|
| **Working** | Queue with one open card | inbox mockup |
| **Clear** | ✓ *"Nothing is waiting on you"*, *"Four agents are still working. The next decision should land in about four minutes — you'll be nudged in chat if you're not here."* | inbox mockup |
| **Answered elsewhere** | The card closes; a dark toast with a `slack` tag: *"dana answered pdf-import · plan in chat — it's closed here too"* (about 5 s) | inbox mockup |
| **Reject open** | The gate's buttons give way to the reason form; the 1 s re-render pauses while it is open | inbox mockup |
| **Loading** | Skeletons in the shape of a batch; footer *"connecting to orchestrator…"* | old handoff 1d |
| **Error** | A `stale` badge, then a *"Lost the orchestrator"* card: *"Answers you submit now will not reach the running steps"*, the raw cause, `Retry now` / `Open logs`. *"The stale queue stays visible below at opacity .45 … never blanked."* | old handoff 1d; backlog Story 4.3 |

> [!tip] The empty state is the point
> *"The empty state does not congratulate you; it tells you what is still running and when to expect the next interruption."* … *"That last sentence is the point of the whole screen: you can leave. Nothing needs watching, and chat will find you."* (inbox guide walkthrough). The old brief: *"Empty state matters. It's the state I'll see most often, and it should tell me what's running rather than showing a shrug illustration."*

## The guide's walkthrough

*"Four cards to zero"*: five common beats, then a choice of two endings.

1. **Four waiting, two overdue**: the oldest card is already open.
2. **Clear the failure first**: Allow host & retry.
3. **The batch opens itself**: *"You never chose what to work on next."*
4. **Five shapes, one keyboard.**
5. **Submit all five**: *"One submission, one resume."*
6. *Answer here*: **You answer the escalated one here**, then **The gate, and empty**. *Or in chat*: **A teammate answers it in chat** (*"your cursor did not move"*), then **The record says where it came from**.

## Look

Light only, zero radius, IBM Plex Mono and Sans, hairlines rather than shadows (mockup CSS). The amber *wait* colour marks anything waiting on you, red *fail* marks failures, and teal *run* marks clear and chat. The PRD says *"Dark-first"* (§13). See Open Questions #34.

## Related

- [[Human In The Loop Controls]]
- [[Inbox Card Kinds]]
- [[Inbox Order And Filters]]
- [[Decisions Outside The Inbox]]
