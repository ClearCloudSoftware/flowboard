---
tags: [flowboard, cost-and-control, decisions]
module: Cost And Control
---

# Cost And Control Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Anything another note labels a **proposal** is listed here. Questions already tracked in a sibling set are linked rather than repeated in full.

## What the numbers mean

### 1. What counts as wasted?

| Source | Wasted is |
|---|---|
| PRD §5 | runs *"superseded by a rework loop or an infra retry"* |
| PRD §13, drawio ideation and functional cards | *"money burnt by rework loops"* |
| Drawio *Cost ledger* | *"wasted = rework + infra retries"* |
| Feature map §4 | an infra hiccup *"still shows up in wasted spend"* |
| Brief §5 | *"money burnt on work later discarded by a review sending the task back"* |
| Monitor guide | *"a failed build, a run you stopped, a review you sent back"* |
| Task-detail guide, on cancel | *"Anything in flight becomes wasted."* |
| Backlog 5.2 | the rework target's **downstream** runs too |

Not covered anywhere: a run that hit its budget or turn cap and blocked the task, then was retried or failed by a human. Is it wasted? Also: is a stopped run `cancelled` (backlog 3.4) **and** wasted? Monitor Open Questions #14 and #17 cover the stop and reject cases. See [[Wasted Spend]].

### 2. Live cost has no source path

The Claude stream carries per-message tokens mid-run (`message_start`, `message_delta`; see [[Usage And Native Cost]]). But `NormalizedEvent` carries `Usage` only on `result`. `07-ports-in-practice.md` updates live cost only on `result`. Claude's price table is a passthrough, so there are no rates to price live tokens. Monitor Open Questions #38 raised it.

**Proposal:** add a `usage` normalized event kind (emitted only by providers with `partial_stream`) carrying cumulative tokens for the run so far. Give the rate table rows for Claude models too, used **only** for the live estimate, never for `runs.cost_usd`. Replace the estimate with the result's total when it lands.

### 3. What is burn rate for real runs?

Every mockup prices by the minute per model. Real cost comes from tokens. No source defines burn. **Proposal** (from Monitor Open Questions #15, linked from [[Burn Today And Wasted]]): Σ over running runs of (cost added in the last *N* minutes) × 60 / *N*. Depends on #2. Monitor Open Questions #15.

### 4. What are "today" and "this week"?

Monitor and inbox *today*, chrome *"spend today"* (backlog 9.2), projects list *"this week's spend"* (PRD §13). Backlog 1.3: *"decide rolling 7 d vs calendar week"* (**DEC**). Local midnight or rolling 24 hours? By `started_at` or `ended_at`? A run spanning midnight? Monitor Open Questions #16 has a **proposal** for *today*.

### 5. Draft mode

- **Where the toggle lives.** PRD §13 and feature map §19: settings. Drawio: on `/costs` (*"Costs & settings"*). Flow-designer mockup: in the designer topbar. Flow Design Open Questions #28.
- **Model id.** `haiku` (PRD, drawio) or the logical `fast-cheap` (`06` §15). Flow Design Open Questions #15.
- **Effort.** The PRD forces `low`. The mockup changes only the model chip.
- **Budget.** The mockup's draft ceiling counts `$0.05` per step; no source caps budget in draft mode.
- **Scope.** Applied *"before `launch()"*, so it reaches the next run of tasks already running. Intended?
- **Shell steps.** Unmentioned; presumably untouched.
- **Rollups.** Do draft-mode runs count toward *cost per finished task by flow version*? They would make a version look cheap.
- **Visibility.** Does the board or monitor show that draft mode is on? No mockup outside the designer shows it.

See [[Draft Mode]].

### 6. The rate table

- Where it lives and who updates it.
- The shape. **Proposal:** `price_rates(provider, model, effective_from, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok)`, which also implements `06` §12's *"versioned and dated"* idea.
- The inbox fixture asks *"Estimate spend from token counts, or record it as unknown and leave the totals honest?"* `06` §12 assumes estimate. If *unknown* is ever allowed, every sum needs a rule for `NULL`.
- `price(provider, …)` needs a provider id the PRD `runs` table lacks (#14).

See [[Pricing Service]].

### 7. Is the Claude figure a real bill?

The probe's result carries `modelUsage.<model>.costBasis: "list"` and a `rate_limit_event` with five-hour and seven-day utilisation windows (`stream-sample.jsonl`). On a subscription plan, `total_cost_usd` is a list-price estimate, not money charged. The monitor guide calls *today* *"The real bill"*. The pitch talks about *"one opaque line on a vendor invoice"*. No source says which billing mode FlowBoard assumes, whether to show the cost basis, or whether rate-limit utilisation belongs on a cost screen.

### 8. Budget caps

- **Per attempt or per run?** The guide says *"on one attempt"*. The CLI flag applies per process. Infra retries are new runs with the same attempt number, and a parked run resumes in a new process. Does each get the full budget?
- **Enforcement without `budget_cap`.** *"else it is advisory"* (`agent-provider.ts`). Does FlowBoard stop the run itself when live cost passes the cap? That needs #2.
- **The ceiling per task** is not a ceiling. Flow Design Open Questions #12.
- **A cap hit's spend.** Blocked, not retried (PRD §7). Wasted or kept? See #1.
- **No default.** `max_budget_usd` is nullable and the seed sets none, so the seeded flow has no financial brake: *"only the sandbox's time limit"* (flow-designer guide).

See [[Spend Caps And Limits]].

### 9. Does a waiting question stop billing?

*"a parked run is not billing you"* holds once the run parks, after 20 minutes. Before that the CLI process is alive with a blocked tool call. Task Detail Open Questions #17, Monitor Open Questions #42 (the old handoff's *"burning idle"*).

### 10. What is cost per finished task?

Bill or kept? Do failed and cancelled tasks count (PRD says *"completed"*, feature map *"finished"*)? Do draft-mode runs (#5)? Does a task that crossed a flow-version change count once, under its pinned version? Task Detail Open Questions #18.

### 11. What does "per step definition" group by?

PRD §13 wants *"what `/grill-me` actually costs"* (a skill). Feature map §18: *"per step (so you can see what a particular skill really costs you)"*. Backlog 8.1: *"per step def (by flow version)"*. `step_defs.id` changes every version. Group by `step_defs.id`, by step key across versions, by skill, or by agent? See [[Spend Rollups]].

## Interfaces

### 12. API gaps

- No settings route in PRD §12, so nothing toggles draft mode. **Proposal:** `GET` and `PATCH /api/settings`.
- No response shape for `GET /api/costs`. **Proposal** in [[Cost API And Routes]].
- No endpoint for chrome *spend today*. It belongs on the summary poller (backlog 9.2), which is unnamed.

### 13. `/costs` has no design

No mockup, no guide. No layout, empty state, drill-down, or trend axis for *cost per finished task*. Does the memory bucket appear here? See [[Costs Page]].

## Schema

### 14. Columns the PRD schema lacks

`runs.model`, `runs.effort` (backlog 1.1, `02` §1), `runs.sandbox` (PRD §11.1) and `runs.provider` (`02` §1) appear in prose but not in the PRD §5 `CREATE TABLE`. The model × effort rollup and the PricingService need them. See [[Cost Data Model]].

### 15. Where the memory bucket lives

`06` §12 and PRD §11.2 tag memory spend separately. No source gives it storage. **Proposal:** `memory_usage(at, adapter, op, tokens, cost_usd)`.

A second gap: recall adds a seventh prompt part of up to 6,000 characters (PRD §7). Those tokens are billed inside the run (**inferred**). Do they count as run cost, or are they memory's cost? If they count as run cost, the *net* figure never sees them. See [[Memory Cost Accounting]].

### 16. A resumed run: one cost or two?

A parked run resumes in a new CLI process (`--resume … --fork-session`). PRD §5 has `parked` as a run state, which suggests the same row. Then two result events, each with its own `total_cost_usd`, land on one row. Are they added? Is the second total cumulative over the fork? Not specified. See [[Ask Park And Resume]].

### 17. Flagging wasted after the fact

`02` §1: *"never mutate cost after the result lands; corrections are new rows."* Marking a run `wasted = 1` on rework updates an existing row. The cost is untouched, so this is probably fine. Should the flag change be journalled (who, when, which rework)?

## Guidance and display

### 18. Is "under a tenth" a rule?

*"A healthy board keeps it under roughly a tenth of the bill."* (monitor guide). A threshold that colours or alerts, or guidance only? The inbox sample sits at about 13% with no signal. Monitor Open Questions #18.

### 19. Mockup accounting bugs

Monitor `reject()` drops the review run's cost. Monitor `stop()` double-counts. Task-detail `sendBack()` shrinks the bill. All break *"it never goes down"*. Monitor Open Questions #17, Task Detail Open Questions #15.

### 20. What a stopped run costs

`AgentRun.stop()` SIGTERMs the child. The stream ends before `result`, so `total_cost_usd` never arrives. `ReplayProvider` settles a stop with zero usage. The guides say a stopped run's spend becomes wasted, but the port never reports it. Use the last live estimate (#2)? Record `0`? Also applies to a run lost on worker restart (backlog 3.3).

### 21. Colour of money

Old handoff: live cost *"never coloured"*. The newer mockups colour wasted two ways:

| Where | Colour | Line |
|---|---|---|
| Monitor topbar `wasted` stat | `--wait` (`#A35A00`), the colour the monitor uses for work waiting on a human | `monitor.html:61` |
| Monitor row `$X wasted` | `--fail` | `monitor.html:209` |
| Inbox context panel | `--fail` | `inbox.html:388` |
| Task detail header, timeline, Cost tab bars | `--fail` | `task-detail.html:64`, `:135`, `:198` |

Backlog 8.1: wasted uses *"the red token"*. Should the monitor's wasted total keep borrowing the waiting colour, which makes it read like a human bottleneck?

### 22. Runs or tasks behind the recipe average?

The flow library shows `Software delivery @core v4` at `~$2.14/task` with `182 runs` (`flow-designer.html:292`, `:577`). The task Cost tab says *"this recipe averages $2.14 across 182 tasks on v4"*. A task has many runs, so both can't be 182. Which count does the average divide by? Related to #10.

## Related

- [[Cost And Control Index]]
- [[Monitor Open Questions]]
- [[Task Detail Open Questions]]
- [[Flow Design Open Questions]]
- [[Human In The Loop Open Questions]]
