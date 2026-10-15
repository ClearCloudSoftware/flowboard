---
tags: [flowboard, task-detail, behaviour, cost]
module: Task Detail
---

# Task Cost And Wasted Spend

What one task cost, and how much of that went nowhere. Feature map §18: *"Wasted spend, called out — A specific number for money burned on work that got redone or thrown away, so you can actually go after it."*

## The three money words

| Word | Guide definition |
|---|---|
| **Kept** | *"spend on attempts whose output is still in the workspace."* |
| **Wasted** | *"spend on attempts that were thrown away."* |
| **Bill** | *"the two added together. It never goes down. Sending a step back moves money from kept to wasted; it does not reduce what you owe."* |

In the schema, wasted is `runs.wasted = 1`: *"1 if superseded by a rework loop or an infra retry"* (PRD §5). The `/costs` page's wasted figure is *"sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops"* (PRD §13). Kept has no column. It is the remainder.

> [!note] Wasted counts more than rework
> PRD §13, `06` §12 and both drawio cards say wasted is *"money burnt by rework loops"*. But PRD §5 and §7 also mark infra-retried runs `wasted = 1`, and the drawio *Cost ledger* says *"wasted = rework + infra retries"*. The guide adds cancelled runs: *"Anything in flight becomes wasted."* The sample's $0.48 is an egress failure, not a rework.

## The four header numbers

From the guide's *The numbers, and what they don't say*:

| Number | Counts | Watch for |
|---|---|---|
| **bill** | *"Everything this task has cost — kept work plus thrown-away attempts."* | *"It never falls. If it looks high, open the Cost tab rather than guessing."* |
| **agent time** | *"The sum of run durations. **Not** how long the task has been open."* | *"A big gap between this and wall-clock means the task spent its life waiting on a human."* |
| **waiting on you** | *"How long the current gate or question has been open, ticking."* | *"Anything past your escalation window should already have reached you in chat."* |
| **retries** | *"Extra attempts across all steps. One retry is ordinary; three is a signal."* | *"A step that keeps retrying is usually blocked by the environment, not confused by the task."* |

### Agent time is not wall-clock

*"This task shows 22m of agent time, but it has been open far longer. The gap is time nobody paid for: 2m 14s while Plan waited on your answer, and the 5m and counting since the review gate opened. A run that asks you a question saves its place and stops billing, so a slow answer costs you calendar time and nothing else."* (guide)

## The Cost tab

- Heading: *where the money went* — *"grey is work that counted, red is work thrown away"*.
- **One bar per step**, scaled to the most expensive step. A grey kept segment, then a red wasted segment, then the total (`—` for no spend).
- **Summary**: kept `$2.13` · wasted `$0.48` (red) · bill `$2.61` · **this recipe averages** `$2.14` *"across 182 tasks on v4"*.
- **Red note**: *"$0.48 went nowhere. The first build attempt was killed by the sandbox — it reached for registry.npmjs.org, which was not on that step's allowlist. The host is allowed now, so the next task down this flow will not pay that toll again."*
- **Petrol note**: *"Answering is free. Plan paused for $0.00 while it waited 2m 14s on your answer — a run that asks a question stops billing until you reply."*

The sample's per-step figures are in [[Sample Task Auth Refactor]].

## The recipe average

`this recipe averages $2.14 across 182 tasks on v4` compares the task with its pinned flow version. The source is PRD §13's *"cost per completed task, trended by flow version"* and feature map §18's *"Cost per finished task — Tracked across recipe versions"*. The guide: *"Cost rarely decides a gate on its own — but a task well over its recipe's average usually means something went around in circles."* Both sources count only finished tasks (*"completed"*, *"finished"*), though neither says whether a failed or cancelled task counts. No source says bill or kept. The guide's *"Roughly on par with the recipe's average, plus a toll the sandbox charged once"* reads as kept ($2.13 against $2.14). The flow-designer mockup's library shows the same dollar figure for `Software delivery @core v4`, `~$2.14/task`, but over `182 runs`, where the Cost tab says *"182 tasks"*. See [[Task Detail Open Questions]] #18 and [[Cost And Control Open Questions]] #22.

## Rules from the ledger

| Rule | Source |
|---|---|
| The result event's cost is authoritative | *"Take the final result event's total cost as authoritative for `runs.cost_usd`."* (PRD §7) |
| Show a live number before it lands | *"Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* (PRD §7) |
| Runs are a journal | *"treat `runs` as an **append-only usage journal** — never mutate cost after the result lands; corrections are new rows."* (`02` §1) |
| Price at start time | *"each run prices against the table in effect at its `started_at`"* (`06` §12) |
| Shell runs are free | *"Shell runs cost nothing and record `cost_usd = 0`."* (PRD §7) |
| Memory cost is separate | *"Tag memory-layer token/API cost separately so it never lands in the per-run cost rollups"* (PRD §11.2) |
| Draft mode records truth | *"override to haiku/low and record actual model/effort on the run"* (backlog Story 3.2) |

## A parked run is not billing

The mockup's Plan log: *"? asked you 2 questions — paused, billing stopped"*. The mechanism is PRD §9's park: after 20 minutes the agent writes its state and ends its turn, the run goes `parked`, and the answer resumes it with `--resume … --fork-session`. Before 20 minutes, the broker *"holds the shim's call open"*, so the CLI process is still alive while it waits. Whether a blocked tool call accrues cost is a provider question. The sources assert "stops billing" without checking it. See [[Questions Within A Task]].

## Related

- [[Task Detail Index]]
- [[Attempts And Send Back]]
- [[Task Detail Tabs]]
- [[Sample Task Auth Refactor]]
