---
tags: [flowboard, cost-and-control, concept, rollups]
module: Cost And Control
---

# Spend Rollups

> **Break it down every way that matters** — Spend per project over time, per step (so you can see what a particular skill really costs you), and per AI model. (feature map §18)

## The five rollups

PRD §13, `/costs`: *"Not just a total. Show:"*

| # | Rollup | PRD §13 wording | Backlog 8.1 | Drawio card |
|---|---|---|---|---|
| 1 | Per project over time | *"spend per project over time (bar chart, Recharts)"* | *"Recharts stacked bars per project per day"* | *Spend per project over time — Bar chart.* |
| 2 | Per step definition | *"spend per step definition, so I can see what `/grill-me` actually costs me"* | *"tables per step def (by flow version)"* | *Spend per step definition — What does /grill-me actually cost me?* |
| 3 | Per model × effort | *"spend per model and effort combination"* | *"per model × effort (from `runs.model/effort`)"* | *Spend per model × effort* |
| 4 | Wasted | *"sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops"* | *"wasted spend"* | *Σ cost_usd where wasted = 1* |
| 5 | Per finished task by flow version | *"cost per completed task, trended by flow version"* | *"cost per completed task by flow version"* | *Cost per completed task — Trended by flow version.* |

The brief (§5) lists four of the five (it has no per-project rollup) and asks a question of only #2: *"does the questioning step earn its cost?"* It words #5 as *"Cost per completed task, trended over time"*. Feature map §18 on #5: *"Tracked across recipe versions, so you can tell whether a change made things cheaper or more expensive."*

## How each joins

Every rollup starts from `runs`. **Proposal** (no source spells out the joins):

| Rollup | Group by | Join path |
|---|---|---|
| Per project over time | `projects.id`, day of `runs.started_at` | `runs → step_instances → tasks → projects` |
| Per step definition | `step_defs.id` (or key, or skill; see below) | `runs → step_instances → step_defs` |
| Per model × effort | `runs.model`, `runs.effort` | `runs` alone, **not** `step_defs`, so draft-mode overrides land in the right bucket |
| Wasted | none, or any of the above | `WHERE runs.wasted = 1` |
| Per finished task by version | `tasks.flow_id` (the pinned version) | sum of task spend `WHERE tasks.status = 'done'`, averaged per `flow_id` |

> [!warning] "Per step definition" has three readings
> Step definitions belong to one flow version, so a per-`step_defs.id` rollup splits `/grill-me` across every version. PRD §13 wants *"what `/grill-me` actually costs"*: a **skill**. Feature map §18 says *"per step (so you can see what a particular skill really costs you)"*. Backlog 8.1 says *"per step def (by flow version)"*. Group by step key, by skill, or by `step_defs.id`? See [[Cost And Control Open Questions]] #11.

## Model × effort needs the run's own record

`runs.model` and `runs.effort` are not in the PRD §5 schema. Backlog 1.1 adds them: *"`runs.model`, `runs.effort` (draft mode must not corrupt cost views)"*. `02` §1 agrees. Without them, a draft-mode run on haiku/low would be booked to the step's opus/high. Which id `runs.model` holds (alias, logical id, or the CLI's `claude-fable-5-1`) is [[Cost And Control Open Questions]] #24. See [[Draft Mode]].

## Cost per finished task

- Shown on the task Cost tab as *"this recipe averages $2.14 across 182 tasks on v4"*. Task-detail guide: *"a task well over its recipe's average usually means something went around in circles."*
- Shown in the flow library as `~$/task` per variant. Flow-designer guide: *"What it typically costs end to end."* Get it wrong: *"Paying for the heavy recipe on work that never needed it."*
- Open: does it average the bill or only kept spend? Do failed or cancelled tasks count? Are draft-mode tasks mixed in? See [[Cost And Control Open Questions]] #10. The library counts `182 runs` where the Cost tab says `182 tasks` (#22).

## Smaller rollups elsewhere

| Where | Figure | Source |
|---|---|---|
| Projects list `/` | *"Cards with task counts by status and this week's spend."* Backlog 1.3: *"decide rolling 7 d vs calendar week"* (**DEC**) | PRD §13 |
| App chrome | *"running dot + spend today; one summary poller"* | backlog 9.2 |
| Monitor topbar | `today` and `wasted (N%)` | `monitor.html` |
| Inbox context panel | `today` and `wasted` | `inbox.html:387` |

## Filters

PRD §12: `GET /api/costs?project=&from=&to=`. Backlog 8.1: *"Add project filter and real `from`/`to` (API supports both, UI sends neither)."* (**GAP**). See [[Cost API And Routes]].

## Related

- [[Costs Page]]
- [[Cost Ledger]]
- [[Wasted Spend]]
- [[Version Pinning]]
