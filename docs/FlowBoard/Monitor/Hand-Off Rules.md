---
tags: [flowboard, monitor, engine, rules]
module: Monitor
---

# Hand-Off Rules

> *"Nothing on this screen moves because you dragged it. A task's position is decided entirely by the engine following the flow, with exactly four exceptions — the four decisions that are yours: approve, send back, answer, retry or stop."* (`monitor-guide.html:360`)

> *"When a step finishes, the engine reads the flow and applies these. Nothing else moves work."* (`monitor-guide.html:416`)

## The four rules

| Rule | Looks like | Trigger | In this flow (guide) |
|---|---|---|---|
| **Advance** | `done · queued · …` | *"A step finishes, so the next one queues."* | *"When `research` is done, `plan` queues. It does not start — it waits for a worker."* |
| **Fan out** | `done · done · queued∥queued` | *"One step feeds several, and they all queue at once."* | *"`plan` feeds both `build` and `tests`, so finishing plan queues two runs. The row grows a ⑂2 badge and can occupy two worker slots."* |
| **Join** | `done · done · running∥done · pending` | *"A step waits for every branch feeding it."* | *"`review` depends on build and tests. Tests finishing alone changes nothing — review stays pending until build lands too."* |
| **Loop back** | `done · done · failed(2)∥done` | *"A failure or a rejection re-queues an earlier step."* | *"Sending a review back re-queues `build` as attempt 2 with your reason attached. Tests are not re-run — they already passed, and that result still stands."* |

## In the mockup engine

```js
NEXT = { research:['plan'], plan:['build','tests'], build:['review'], tests:['review'], review:['summarize'], summarize:[] }
DEPS = { plan:['research'], build:['plan'], tests:['plan'], review:['build','tests'], summarize:['review'] }
```

- `ready(t, step)`: every step in `DEPS[step]` is `done`.
- `advance(t, from)`: for each `NEXT[from]` that is not yet started and is ready, create a `queued` run. Finishing `summarize` sets `finished`.
- `finish()`: a step with `gate: true` goes to `gate` instead of advancing.

## In the engine spec

The same rules from PRD §8 and feature map §4, with more detail. Full treatment in [[Branching Joining And Loops]] and [[Approval Gates]].

- **Advance:** *"Otherwise mark it `done` and enqueue `advance_task`."* `always` edges always fire; `on_pass` / `on_fail` follow `step_instances.outcome`.
- **Fan out:** *"If more than one edge fires, create all the target step instances and start them concurrently."*
- **Join:** *"A step definition with multiple incoming edges is a join: it starts only once every upstream step instance for this task is `done`."* Backlog 5.2: *"join waits for every non‑`on_fail` upstream instance."*
- **Loop back:** *"an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run."* Superseded runs are marked `wasted = 1`.
- **Silence is not success:** *"A missing outcome is never a pass."* The step parks at `awaiting_approval` with *"no outcome reported"*.
- **Your call wins:** *"If you approve or reject a step, your decision overrides whatever the agent concluded, and a rejection carries your reason into the next attempt."* (feature map §4)

> [!note] The monitor's flow has no check step
> In the PRD's seeded flow the review sends work back to `implement`, and `check` (a shell step) sits between implement/tests and review. The monitor's six-step flow has no check step, so its loop is review → build only. See [[Seeded Flows]].

## Why no drag

> *"**Why you can't drag a card.** Everything past the backlog is driven by the engine, so dragging a task into `review` would be a lie — no review has run. The board shows where work is, not where you'd like it to be. Your leverage is the four decisions above, and the flow itself."* (`monitor-guide.html:419`)

## Related

- [[Monitor Actions And Costs]]
- [[Flow Bar And Step States]]
- [[Life Of A Task]]
- [[Branching Joining And Loops]]
