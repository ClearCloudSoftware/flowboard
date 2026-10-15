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
| Feature map §18 | *"money burned on work that got redone or thrown away"* |
| Brief §5 | *"money burnt on work later discarded by a review sending the task back"* |
| Monitor guide | *"a failed build, a run you stopped, a review you sent back"*; *"A run you stop, or one that fails, has already spent its money, and that spend is re-labelled wasted rather than refunded."* |
| Task-detail guide, on cancel | *"Anything in flight becomes wasted."* Its status legend: failed, *"spend is wasted"* |
| Backlog 5.2 | the rework target's **downstream** runs too |

**Failures.** The PRD and backlog never flag a non-transient failure that blocks the task (a budget or turn cap hit, an auth error, an egress denial). The guides do: the monitor's status legend reads failed, *"spend becomes wasted"*, and the task-detail sample's `$0.48` of waste is *"a build the sandbox killed for reaching registry.npmjs.org"*. Is that spend wasted when the run fails, only once a human retries or fails the task, or never?

**Stops.** Three readings. Backlog 3.4 and `03` §8: *"finalise as cancelled"*. The monitor guide: the run *"is recorded as failed, with "stopped by you" as the reason"*. PRD §7 counts *"process killed by a signal"* as transient, so a literal classifier would retry a stopped run and flag it as an infra retry (Monitor Open Questions #35, [[Execution Open Questions]] #55). Of the three, only the PRD §7 reading sets `wasted`; the guides move the spend to wasted whatever the state.

**Send backs.** The guides move only the rework target's last attempt to wasted (*"moves everything the last attempt spent into **wasted**"*, `inbox.html:334`); in their figures the rejected review's own spend stays kept. Backlog 5.2 flags every downstream run, which includes that review. See [[Rework Loop]].

Monitor Open Questions #14 and #17 cover the stop and reject cases. See [[Wasted Spend]].

### 2. Live cost has no source path

The Claude stream carries per-message tokens mid-run (`message_start`, `message_delta`; see [[Usage And Native Cost]]). But `NormalizedEvent` carries `Usage` only on `result`. `07-ports-in-practice.md` updates live cost only on `result`. Claude's price table is a passthrough, so there are no rates to price live tokens. Monitor Open Questions #38 raised it.

**Proposal:** add a `usage_delta` normalized event kind (the name [[Agent Providers Open Questions]] #9 uses; it also offers `Usage` on `assistant_text`), emitted only by providers with `partial_stream`, carrying cumulative tokens for the run so far. Give the rate table rows for Claude models too, used **only** for the live estimate, never for `runs.cost_usd`. Replace the estimate with the result's total when it lands. Same as [[Execution Open Questions]] #62.

### 3. What is burn rate for real runs?

Every mockup prices by the minute per model. Real cost comes from tokens. No source defines burn. **Proposal** (from Monitor Open Questions #15, linked from [[Burn Today And Wasted]]): Σ over running runs of (cost added in the last *N* minutes) × 60 / *N*. Depends on #2. Monitor Open Questions #15.

### 4. What are "today" and "this week"?

Monitor and inbox *today*, chrome *"spend today"* (backlog 9.2), projects list *"this week's spend"* (PRD §13). Backlog 1.3: *"decide rolling 7 d vs calendar week"* (**DEC**). Local midnight or rolling 24 hours? By `started_at` or `ended_at`? A run spanning midnight? Monitor Open Questions #16 has a **proposal** for *today*; [[Projects Open Questions]] #11 asks the same of *this week*.

### 5. Draft mode

- **Where the toggle lives.** PRD §13 and feature map §19: settings. Drawio: on `/costs` (*"Costs & settings"*). Flow-designer mockup: in the designer topbar. Flow Design Open Questions #28.
- **Model id.** `haiku` (PRD, drawio) or the logical `fast-cheap` (`06` §15). [[Capability Library Decisions]] D20 makes the Claude aliases the logical ids in v1, so under that reading `haiku` is already logical. Flow Design Open Questions #15, [[Execution Open Questions]] #45, [[Agent Providers Open Questions]] #13.
- **Effort.** The PRD forces `low`. The mockup changes only the model chip.
- **Budget.** The mockup's draft ceiling counts `$0.05` per step; no source caps budget in draft mode, and `06` §15's transform changes only model and effort.
- **Scope.** Applied *"before `launch()`"*, so it reaches the next run of tasks already running (**inferred**; [[Settings And Plumbing Open Questions]] #10 proposes the same). Intended?
- **Shell steps.** Unmentioned; presumably untouched.
- **Rollups.** Do draft-mode runs count toward *cost per finished task by flow version*? They would make a version look cheap.
- **Default.** Off is **inferred**; no source states it ([[Settings Defaults]], [[Settings And Plumbing Open Questions]] #5).
- **Visibility.** Does the board or monitor show that draft mode is on? `06` §15: *"the flow editor and board read settings for display toggles"*, but no indicator is drawn. No mockup outside the designer shows it.

See [[Draft Mode]].

### 6. The rate table

- Where it lives and who updates it.
- The shape. **Proposal:** `price_rates(provider, model, effective_from, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok)`, which also implements `06` §12's *"versioned and dated"* idea.
- The inbox fixture asks *"Estimate spend from token counts, or record it as unknown and leave the totals honest?"* `06` §12 assumes estimate. If *unknown* is ever allowed, every sum needs a rule for `NULL`.
- `price(provider, …)` needs a provider id the PRD `runs` table lacks (#14), and a model key (#24).
- The probe splits cache writes by lifetime (`cache_creation.ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`), while `Usage` has one `cacheWrite`. If the two lifetimes are priced differently, one `cache_write_per_mtok` is not enough (**inferred**).

See [[Pricing Service]].

### 7. Is the Claude figure a real bill?

The probe's result carries `modelUsage.<model>.costBasis: "list"` and a `rate_limit_event` with five-hour and seven-day utilisation windows (`stream-sample.jsonl`). On a subscription plan, `total_cost_usd` is a list-price estimate, not money charged. The monitor guide calls *today* *"The real bill"*. The pitch talks about *"one opaque line on a vendor invoice"*. No source says which billing mode FlowBoard assumes, whether to show the cost basis, or whether rate-limit utilisation belongs on a cost screen.

### 8. Budget caps

- **Per attempt or per run?** The guide says *"on one attempt"*. The CLI flag applies per process. Infra retries are new runs with the same attempt number, and a parked run resumes in a new process. Does each get the full budget?
- **Enforcement without `budget_cap`.** *"else it is advisory"* (`agent-provider.ts`). Does FlowBoard stop the run itself when live cost passes the cap? That needs #2.
- **The ceiling per task** is not a ceiling. Flow Design Open Questions #12.
- **A cap hit's spend.** Blocked, not retried (PRD §7). The guides call a failed run's spend wasted; the PRD sets no flag. See #1.
- **Turn caps.** `budget_cap` covers `maxBudgetUsd`; no capability covers `maxTurns` ([[Agent Providers Open Questions]] #25).
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

- No settings route in PRD §12, so nothing toggles draft mode. **Proposal:** `GET` and `PATCH /api/settings`, one settings object with `PATCH` as a partial update. Shared with [[Settings And Plumbing API And Routes]], Memory and Sandboxing ([[Settings And Plumbing Open Questions]] #2).
- No response shape for `GET /api/costs`. **Proposal** in [[Cost API And Routes]].
- No endpoint for chrome *spend today*. It belongs on the summary poller (backlog 9.2), which is unnamed.

### 13. `/costs` has no design

No mockup, no guide. No layout, empty state, drill-down, or trend axis for *cost per finished task*. Does the memory bucket appear here? See [[Costs Page]].

## Schema

### 14. Columns the PRD schema lacks

`runs.model`, `runs.effort` (backlog 1.1, `02` §1), `runs.sandbox` (PRD §11.1) and `runs.provider` (`02` §1) appear in prose but not in the PRD §5 `CREATE TABLE`. The model × effort rollup and the PricingService need them. Also [[Agent Providers Open Questions]] #16 and [[Settings And Plumbing Open Questions]] #22. See [[Cost Data Model]].

### 15. Where the memory bucket lives

`06` §12 and PRD §11.2 tag memory spend separately. No source gives it storage. **Proposal:** `memory_usage(at, adapter, op, tokens, cost_usd)`.

A second gap: recall adds a seventh prompt part of up to 6,000 characters (PRD §7). Those tokens are billed inside the run (**inferred**). Do they count as run cost, or are they memory's cost? If they count as run cost, the *net* figure never sees them. Same as [[Memory Open Questions]] #22. See [[Memory Cost Accounting]].

### 16. A resumed run: one cost or two?

A parked run resumes in a new CLI process (`--resume … --fork-session`). PRD §5 has `parked` as a run state, which suggests the same row. Then two result events, each with its own `total_cost_usd`, land on one row. Are they added? Is the second total cumulative over the fork? Not specified. See [[Ask Park And Resume]].

### 17. Flagging wasted after the fact

`02` §1: *"never mutate cost after the result lands; corrections are new rows."* Marking a run `wasted = 1` on rework updates an existing row. The cost is untouched, so this is probably fine. Should the flag change be journalled (who, when, which rework)? Also [[Execution Open Questions]] #46.

## Guidance and display

### 18. Is "under a tenth" a rule?

*"A healthy board keeps it under roughly a tenth of the bill."* (monitor guide). A threshold that colours or alerts, or guidance only? The inbox sample sits at about 13% with no signal. Monitor Open Questions #18.

### 19. Mockup accounting bugs

Monitor `reject()` drops the review run's cost. Monitor `stop()` double-counts. Task-detail `sendBack()` shrinks the bill. All break *"it never goes down"*. Monitor Open Questions #17, Task Detail Open Questions #15.

### 20. What a stopped run costs

`AgentRun.stop()` SIGTERMs the child. The stream ends before `result`, so `total_cost_usd` never arrives. `ReplayProvider` settles a stop with zero usage. The guides say a stopped run's spend becomes wasted, but the port never reports it. Use the last live estimate (#2)? Record `0`? Also applies to a run lost on worker restart (backlog 3.3), which PRD §7 classes as transient and so flags `wasted = 1` with whatever cost was recorded.

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

The flow library shows `Software delivery @core v4` at `~$2.14/task` with `182 runs` (`flow-designer.html:293`, `:577`). The task Cost tab says *"this recipe averages $2.14 across 182 tasks on v4"*. A task has many runs, so both can't be 182. Which count does the average divide by? Related to #10.

## Coverage

### 23. Model calls that are not runs

Two model calls belong to no step, so nothing gives them a `runs` row (**inferred**): the backlog importer agent (*"haiku, `--tools ""`"*, backlog 7.3) and Mem0's extraction model (*"its extraction LLM is metered separately"*, drawio *Mem0 OSS server* card). PRD §17 sends every model call through the `claude` CLI, but every rollup reads only `runs`. Does their spend land nowhere, in the memory bucket (#15), or in a bucket of its own? [[Intake And Import Open Questions]] #12, [[Memory Open Questions]] #24.

### 24. Which model id the ledger records

`runs.model` and the rate table could key on the step's alias (`sonnet`), a logical id (`fast-cheap`), or the id the CLI reports (`claude-fable-5-1` in the probe's `modelUsage`). The *model × effort* rollup and `PricingService.price(provider, model, …)` both depend on the choice. `06` §15 says the run records the *"resolved"* model. [[Agent Providers Open Questions]] #12, [[Logical Model Ids]].

## Related

- [[Cost And Control Index]]
- [[Monitor Open Questions]]
- [[Task Detail Open Questions]]
- [[Flow Design Open Questions]]
- [[Human In The Loop Open Questions]]
