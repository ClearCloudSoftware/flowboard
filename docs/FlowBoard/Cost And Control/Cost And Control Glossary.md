---
tags: [flowboard, cost-and-control, glossary]
module: Cost And Control
---

# Cost And Control Glossary

> [!warning] Overloaded words
> **bill**, **budget**, **burn**, **cost**, **today** and **wasted** each mean more than one thing across the sources. The entries below say which meaning each source uses.

| Term | Meaning | Source |
|---|---|---|
| **Bill** | A task's or a day's total spend: kept plus wasted. *"It never goes down."* | task-detail guide, monitor guide |
| **Budget** ⚠ | (1) A step's **spend cap**, `step_defs.max_budget_usd`, *"the most this step may spend on one attempt"*. (2) The **attempt budget**, `max_attempts`, which every rework loop into a step shares (*"every loop that sends work back to the same step shares one budget"*, PRD §8). (3) A **team budget**, a monthly cap (feature map §18 idea). (4) A **portability budget** in the capability library guide, which has nothing to do with money | flow-designer guide, PRD §5 and §8, feature map, capability-library guide |
| **Burn** ⚠ | (1) **Burn rate**, the dollars per hour of everything running now (monitor topbar, inbox *costing you*). (2) As a verb: *"money burnt by rework loops"* (PRD §13), *"burns money for no gain"* | monitor mockup, PRD §13 |
| **Burning idle** | A blocked batch still spending while it waits. Old handoff only; the newer mockups say waiting is free | `docs/old/design/README.md` |
| **Ceiling per task** | The flow designer's sum of step budgets, `est. $X ceiling per task`. Not a hard limit. See [[Spend Caps And Limits]] | `flow-designer.html:611` |
| **Cost** ⚠ | (1) A run's dollars, `runs.cost_usd`. (2) In the mockups, `cost` on a step is the **kept** part only, beside a separate `wasted` | PRD §5, `task-detail.html`, `monitor.html` |
| **Cost per completed task** | Rollup: average spend of finished tasks, trended by flow version. The task-detail guide shows it as *"this recipe averages"* | PRD §13, feature map §18 |
| **Cost basis** | The Claude stream's `modelUsage.<model>.costBasis`, `"list"` in the probe | `docs/old/stream-sample.jsonl` |
| **Draft mode** | A global setting that overrides every step's model and effort to the cheapest. See [[Draft Mode]] | PRD §13, feature map §7 and §19 |
| **Effort** | How hard the model thinks: `low \| medium \| high \| xhigh \| max`. One axis of the *model × effort* rollup | PRD §5 |
| **Infra retry** | An automatic re-run after a transient failure. It does not count toward `max_attempts`, and the failed run is marked wasted | PRD §7 |
| **Kept** | Spend on attempts whose output is still in the workspace. No column; it is the remainder | task-detail guide |
| **Ledger** | The cost and usage ledger, component #12: the rollups over the `runs` journal plus the PricingService. See [[Cost Ledger]] | `06` §12 |
| **Live cost** | A running figure during a run, from per-message token usage, replaced by the result's total at the end. See [[Live Cost]] | PRD §7 |
| **Logical cap** | `max_turns` and `max_budget_usd`, passed to the agent CLI | PRD §11.1 |
| **Logical model id** | A provider-neutral id (`reasoning-high`, `fast-cheap`, `default`) resolved per provider | `01-ports.md` |
| **Memory bucket** | A separate tag for memory-layer token and API cost, kept out of per-run rollups | `06` §12 |
| **Native cost** | The `native_cost` capability: the provider reports dollars. Claude has it; Codex does not | `01-ports.md`, `agent-provider.ts` |
| **Passthrough** | The PricingService does nothing when the provider already set `costUsd` | `06` §12 |
| **Physical limit** | The sandbox's `--memory`, `--cpus`, `--pids-limit` and wall-clock limits, which backstop the logical caps | PRD §11.1, `08-sandboxing.md` |
| **PricingService** | `price(provider, model, usage) → costUsd`. See [[Pricing Service]] | `06` §12 |
| **Rate table** | The `(provider, model) → rates` table the PricingService uses for providers without native cost. *"Versioned and dated"* is an idea | `06` §12 |
| **Rollup** | An aggregate over `runs`: per project, step definition, model × effort, wasted, per finished task. See [[Spend Rollups]] | PRD §13 |
| **SpecTransform** | A pure function `RunSpec → RunSpec` applied before `launch()`. Draft mode is one | `06` §15 |
| **Today** ⚠ | (1) The monitor's daily bill, kept plus wasted. (2) The inbox context panel's `today`. (3) Chrome *"spend today"* (backlog 9.2). No source defines the day boundary | monitor, inbox, backlog |
| **Usage** | The normalized record of tokens, turns and optional `costUsd` that a provider reports. See [[Usage And Native Cost]] | `events.ts` |
| **Wasted** ⚠ | (1) The flag `runs.wasted = 1`. (2) The rollup, the sum of `cost_usd` where flagged. Sources disagree on what earns the flag: rework only, rework plus infra retries, or also stopped runs. See [[Wasted Spend]] | PRD §5, §13; guides |
| **This week's spend** | The figure on each projects-list card. Rolling seven days or calendar week is an open decision | PRD §13, backlog 1.3 |

## Related

- [[Cost And Control Index]]
- [[Monitor Glossary]]
- [[Task Detail Glossary]]
- [[Flow Design Glossary]]
