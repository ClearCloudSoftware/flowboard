---
tags: [flowboard, monitor, status]
module: Monitor
---

# Task Status Icons

The icon at the start of a row describes the task as a whole. The [[Flow Bar And Step States|flow bar]] next to it describes each step. The guide calls them *"Two alphabets"*.

> *"A task shows the most demanding thing true about it. Anything blocked outranks anything running, which outranks anything finished."* (`monitor-guide.html:334`)

## The six statuses

| Icon | Colour | Status | When you see it (guide) | What to do (guide) |
|---|---|---|---|---|
| ✕ cross | brick | **Failed**: something broke | *"A step errored, hit its retry limit, or you stopped it. The task is parked and spending nothing."* | *"Open it, read the error, then **Allow host & retry** or **Retry as-is** — or leave it and let the spend stop there."* |
| ‖ pause bars | ochre | **Waiting on you**: a gate | *"Every agent step is done for now; a step needs your approval before the task can continue."* | *"Approve it or send it back. Until you do, the task occupies no worker and costs nothing."* |
| ? circle | ochre | **Waiting on you**: a question | *"A run paused mid-job because it needs an answer it can't safely guess."* | *"Answer it. The run picks up exactly where it stopped, with your answer in hand."* |
| ◉ dot with halo | petrol | **Running**: an agent is working | *"At least one of its steps has a worker and is producing output right now. Two lit cells means it fanned out."* | *"Nothing. Watch the cost if it's a long one, or stop it if it's clearly lost."* |
| ◌ dashed circle | grey | **Idle**: queued or in the backlog | *"Either it's in the backlog untouched, or its next step is ready but every worker is busy."* | *"Nothing — it will start itself. If the queue is always deep, raise the worker cap."* |
| ✓ tick | stone | **Done**: finished | *"It reached the end of the flow. The row drains to grey so finished work stops competing for your eye."* | *"Nothing. Its artifacts are in the task workspace, tracked in git."* |

## How the mockup derives it

`statusOf(t)` in `monitor.html`:

1. Any run in `gate`, `asking` or `failed` → **fail** if that run failed, else **wait**.
2. Any run `running` → **run**.
3. Task has `finished` → **done**.
4. Otherwise → **idle**.

`blocking(t)` returns the *first* blocking run in flow order, so a task has at most one needs-you card. The ranking used by the default sort is `fail 0 · wait 1 · run 2 · idle 3 · done 4`.

The *where* column (`whereOf`) shows the blocking step, the running step(s) joined by ` ∥ `, `queued`, `done` or `backlog`.

## Against the PRD

PRD §13 gives the board card a *"state dot (running / awaiting answers / awaiting approval / failed)"*: four states. The monitor has six icons and splits *waiting* into gate and question with different glyphs but one colour. `tasks.status` in PRD §5 is `backlog | todo | running | blocked | done | failed | cancelled`. The mockup has no `todo` and no `cancelled`. PRD `blocked` splits across two icons: **Waiting on you** when a step is `awaiting_approval` or `awaiting_answers`, and **Failed** when a run failed. **Failed** also covers the PRD's terminal `failed`. A **proposal** mapping is in [[Monitor Data Model]]; see [[Monitor Open Questions]] #7.

The old design handoff (1b) styled the done card with *"No colour at all"* and a hollow dot. The monitor keeps the idea but uses a tick.

## Related

- [[Flow Bar And Step States]]
- [[Pulse View]]
- [[Needs You Band]]
- [[Monitor Data Model]]
