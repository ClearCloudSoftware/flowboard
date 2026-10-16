---
tags: [flowboard, monitor, cost]
module: Monitor
---

# Burn Today And Wasted

The topbar's three money numbers. The guide's table:

| Number | What it counts | Why you'd look |
|---|---|---|
| **burn** `/hr` | *"The per-hour rate of everything running right now, from each running step's model. It drops to zero the moment the last agent stops."* | *"To know what leaving the board running will cost you while you make coffee."* |
| **today** | *"The real bill: work you kept, plus attempts that were thrown away. It never goes down — sending a step back moves money between columns, it doesn't refund it."* | *"To sanity-check a day against what you got out of it."* |
| **wasted** `(N%)` | *"Only the thrown-away part, with its share of the bill next to it. A row shows its own share under its cost."* | *"It's the one number here you can actually act on."* |

**wasted** is the only stat with a warning colour (`.stat.warn`, ochre).

## Wasted is the number to attack

> *"It's every dollar spent on an attempt that was thrown away — a failed build, a run you stopped, a review you sent back. A healthy board keeps it under roughly a tenth of the bill. If it's climbing, the recipe is usually the culprit, not the code: check the Pipeline view for a thick retry loop."* (`monitor-guide.html:489`)

Elsewhere:

- Feature map §18: *"**Wasted spend, called out** — A specific number for money burned on work that got redone or thrown away, so you can actually go after it."*
- PRD §13 `/costs`: *"**wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops"*.
- PRD §5 `runs.wasted`: *"1 if superseded by a rework loop or an infra retry"*.
- Feature map §4, on infra hiccups: *"It doesn't use up a try, but it still shows up in wasted spend."*
- Design brief: *"This needs its own treatment; it's the number that changes my behaviour"*.
- Pitch, a success measure: *"**Wasted spend is a number on a dashboard**, and it trends down as flows are tuned (baseline it in week 1)."* (`docs/pitch.md`)

The guide adds **stopped runs** to wasted. The PRD does not mark cancelled runs `wasted = 1` ([[Monitor Open Questions]] #17).

## How the mockup computes them

- **burn** = Σ over running runs of `RATE[model] × 60`, with `RATE = { haiku: 0.008, sonnet: 0.05, opus: 0.14 }` dollars per minute.
- **today** = kept + wasted, where kept is the live `cost` of every run and wasted is each run's accumulated `wasted`. The code comment: *"the real bill: kept work + thrown-away attempts"* (`monitor.html:1072`).
- **wasted %** = `round(waste / total × 100)`.

> [!bug] The accounting bug the guide found
> *"writing this guide surfaced a real accounting bug in the screen — sending a step back made the topbar's **today** total shrink, because the spend moved to `wasted` and the two were never added back together."* (mockups README). The fix is the `kept + waste` line above. The mockup still drops a rejected review run's own cost: `reject()` deletes `t.runs.review` without moving its cost to wasted. And `stop()` adds a run's cost to wasted without clearing `cost`, so a stopped run counts twice in *today* ([[Monitor Open Questions]] #17).

## What an hour costs

The guide's rate table (mockup rates, not real prices):

| Model | Rate | An hour | Typically used for |
|---|---|---|---|
| haiku | $0.008/min | $0.48 | *"Research and summarize — reading and condensing, where the cheap model is genuinely enough."* |
| sonnet | $0.05/min | $3.00 | *"Tests and review — judgement, but bounded."* |
| opus | $0.14/min | $8.40 | *"Plan and build — where a wrong answer is expensive to unwind."* |

*"Four agents at once is not a small number — that's the point of showing it."*

The table describes the mockup's six-step flow. The decided seed ([[Capability Library Decisions|D26]]) runs research and summarize on sonnet, review on opus and `explain` on haiku, and its `check` step has no model at all. See [[Seeded Flows]].

## Where the real numbers come from

PRD §7: *"Take the final result event's total cost as authoritative for `runs.cost_usd`. Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* `06` §12: a `PricingService` prices providers without native cost from tokens. The card's live cost and the viewer's estimate *"both read the same `Usage`"*. No source defines burn rate or the *today* boundary for real data ([[Monitor Open Questions]] #15, #16). The sources also give no working path for a dollar figure *during* a run: usage arrives only on the final `result` event, and Claude's pricing is a passthrough with no rate table ([[Monitor Open Questions]] #38).

## Per task

Each row shows its cost in bold and, when over half a cent, `$X wasted` in brick underneath. The [[Task Row Detail]] lists *This task, so far* and *Burned on redone work*.

## Related

- [[Monitor Actions And Costs]]
- [[Pipeline View]]
- [[Worker Slots]]
- [[Models And Effort]]
- [[Wasted Spend]]
- [[Live Cost]]
