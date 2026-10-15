---
tags: [flowboard, cost-and-control, screen]
module: Cost And Control
---

# Cost Surfaces

Money shows on almost every screen. This note lists each place, what the figure counts, and where the detail lives.

| Screen | Figure | Counts | Source | Detail |
|---|---|---|---|---|
| Projects list `/` | this week's spend per project | Rolling 7 days or calendar week: undecided | PRD §13, backlog 1.3 | [[Spend Rollups]] |
| App chrome | running dot + *"spend today"* | Not defined | backlog 9.2 | — |
| Board card | live cost; split badge with per-branch cost; *"Done · 8 steps + total cost"* | The task's spend so far | PRD §13, backlog 2.2, old handoff | [[Board Projection]] |
| Monitor topbar | **burn** `/hr`, **today**, **wasted** `(N%)` | Rate of running runs; kept + wasted today; wasted part only | `monitor.html`, monitor guide | [[Burn Today And Wasted]] |
| Monitor workers strip | burn per hour | Same as topbar | `monitor.html:881` | [[Worker Slots]] |
| Monitor pulse row | cost in bold, `$X wasted` under it when over half a cent | The task's kept and wasted | `monitor.html` | [[Pulse View]] |
| Monitor pipeline | *"↺ sent back ×N today · $X burned"* on the retry loop | Wasted on that loop today | `monitor.html:1009` | [[Pipeline View]] |
| Monitor row detail | *This task, so far*; *Burned on redone work* | Task bill; task wasted | `monitor.html` | [[Task Row Detail]] |
| Inbox context panel | **costing you** `$/hr`, today, wasted | Burn of running runs; hard-coded `$19.46` and `$2.55` in the mockup | `inbox.html:379`–`388` | [[Human In The Loop Screen]] |
| Inbox cards | *"Approving is free"*, *"Three attempts, $1.44 spent and thrown away"* | Cost of the decision | `inbox.html`, inbox guide | [[Monitor Actions And Costs]] |
| Task detail header | **bill**, *"$X of it wasted"* | Kept + wasted for one task | `task-detail.html:400` | [[Task Cost And Wasted Spend]] |
| Task detail timeline | cost per step, `+$X wasted` | Per step instance | `task-detail.html:466` | [[Step Instances And Runs]] |
| Task detail Cost tab | per-step bars, kept · wasted · bill, *"this recipe averages"* | Per step; recipe average by flow version | `task-detail.html:548`–`570` | [[Task Cost And Wasted Spend]] |
| Live run viewer | sticky footer: elapsed, turns, **running cost** | One run, estimate until `result` | PRD §13, backlog 3.4 | [[Live Run Viewer]] |
| Flow designer node | third chip: budget | `max_budget_usd`, per attempt | `flow-designer.html:486` | [[Step Guardrails]] |
| Flow designer canvas bar | `est. $X ceiling per task` | Sum of step budgets; `$0.05` per step in draft mode | `flow-designer.html:611` | [[Spend Caps And Limits]] |
| Flow library | `~$/task` per variant | Cost per finished task for that flow version | `flow-designer.html:577` | [[Flow Library]] |
| `/costs` | the five rollups | See note | PRD §13 | [[Costs Page]] |

## Consistency across screens

- **Bill never goes down.** The monitor and task-detail guides both state it, and both mockups break it on send-back. See [[Wasted Spend]].
- **Same sample.** `auth-refactor` is *"the same task the monitor shows waiting"*; its task-detail bill is `$2.61`. The flow library's `Software delivery @core v4` shows `~$2.14/task` over 182 runs, matching the task Cost tab's *"this recipe averages $2.14 across 182 tasks on v4"*.
- **Same rates.** The monitor, inbox and task-detail mockups all use `haiku 0.008`, `sonnet 0.05`, `opus 0.14` dollars per minute. See [[Cost Defaults And Sample Figures]].
- **Colour.** The old handoff says live cost is *"never coloured"*. The newer mockups colour only wasted. *"Spend boldness in one place"* (`docs/mockups/README.md`).

## Related

- [[Live Cost]]
- [[Spend Rollups]]
- [[Costs Page]]
- [[Monitor Screen]]
- [[Task Detail Screen]]
