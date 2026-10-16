---
tags: [flowboard, monitor, ui, views]
module: Monitor
---

# Timeline View

Guide: *"How long has this really taken, and how much of that was waiting on me?"* Reach for it when *"A task feels slow. Flat hatched stretches are hours nobody paid for — the board waiting on a human."*

## What it draws

- A time axis over the chosen window: **30m**, **1.5h** (default) or **4h**. Ticks every 5, 15 or 60 minutes.
- One **lane** per task that had any run in the window, ordered by its first run's start. The lane name is the task id (grey when done); the lane cost is on the right.
- One bar per run, from start to end (or now), labelled with the step name when wide enough:
  - petrol **running**
  - stone **finished**
  - brick **failed**
- One hatched ochre bar from when a gate opened or a question was asked until now, labelled *"waiting on you"*. Mockup bug: `approve()` (`monitor.html:673-677`) sets the review run to `done` but never clears `r.since`, and the timeline draws a hold bar for any run with `since` (`monitor.html:924`). After **Approve** the lane keeps a growing *waiting on you* bar. `reject()` and `answer()` clear it ([[Monitor Open Questions]] #22).
- Overlapping bars stack into extra rows in the lane, so parallel `build` and `tests` sit one above the other.
- A brick **NOW** line at the right edge.
- Tooltip: `task · Step · model · duration · cost`, or `task · Step · waiting on you 12m`.

Legend line: *"Flat, hatched stretches are the hours nobody paid for — the board waiting on a human."*

Empty: *"Nothing ran in this window."*

## Where it comes from

No PRD, backlog or feature-map item asks for a timeline across tasks. PRD §13's task detail sheet has a *"Timeline of step instances with state, attempts, cost and duration"* for one task. The drawio *Observability* card *Read the step timeline* (*"state, attempts, cost, duration"*) means the same per-task timeline. The monitor's cross-task timeline is designed beyond the PRD ([[Monitor Roadmap]]).

The bars need run start and end times (`runs.started_at`, `ended_at`) and the moment a step started waiting. The PRD stores `questions.created_at`, but no column records when a step instance entered `awaiting_approval`. **Proposal:** use `step_instances.updated_at` for the gate's start, or add a column ([[Monitor Open Questions]] #22).

## Related

- [[Pulse View]]
- [[Pipeline View]]
- [[Waiting And Escalation]]
- [[Monitor Data Model]]
