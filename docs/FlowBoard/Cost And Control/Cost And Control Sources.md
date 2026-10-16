---
tags: [flowboard, cost-and-control, sources]
module: Cost And Control
---

# Cost And Control Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `1787d20` (2026-10-15), re-checked at `49c7d97`, where the sources are unchanged. There is no `/costs` mockup or guide.

## Primary

| File | What it contributes |
|---|---|
| `docs/feature-map.md` §18 | Cost tracking: break it down every way, wasted spend called out, cost per finished task across recipe versions; ideas *spend by person and team*, *a team budget* |
| `docs/feature-map.md` §2, §4, §5, §6, §7, §9, §10, §12, §16, §19, §21, *Across everything*, parking lot | §2 step guardrails (*a spending cap*); §4 *hiccups don't count* but show in wasted, *stops early when stuck*; §5 live running cost on cards; §6 capabilities include *reporting cost*, the free test stand-in; §7 *track cost as it goes*, draft mode; §9 running tally; §10 hard limits; §12 context panel; §16 team guardrails (*a budget cap holds*); §19 draft mode in settings; §21 memory earns its keep on the cost view; *A clear record*; *see costs* role; parking lot (auto-pick the cheapest model, trends dashboard, replay) |
| `docs/old/PRD.MD` | §0 probe for cost and token fields; §5 `runs` cost, token, turn and `wasted` columns, `step_defs.model/effort/max_turns/max_budget_usd/max_attempts`, `settings`; §7 CLI flags `--max-turns`, `--max-budget-usd`, cost from the result event, live token accumulation, shell runs `$0`, transient retries marked wasted, cap hits block, `max_recall_chars`, OTel names; §8 rework marks superseded runs wasted, shared attempt budget, fingerprint escalation; §11.1 physical limits backstop logical caps, `runs.sandbox/model/effort`; §11.2 memory cost tagged separately, Mem0's extraction spend; §12 `GET /api/costs?project=&from=&to=`; §13 projects-list weekly spend, card live cost, viewer running cost, `/costs` five rollups, draft mode `haiku`/`low`; §14 M3 cost on the run, M8 cost views; §15 seeded models and efforts; §16 acceptance; §17 no direct Anthropic API |
| `docs/old/REBUILD-BACKLOG.md` | *"$0 running cost"* bug; 0.1 probe cost fields and cap flags; 0.2 fake `claude` without spend; 1.1 `runs.model/effort`; 1.3 weekly spend DEC; 2.2 card cost, incremental `num_turns`; 2.3 timeline model/effort; 3.2 cumulative `message_delta.usage`, `total_cost_usd` authoritative, draft mode records actual; 3.3 restart recovery; 3.3 graceful shutdown marks runs cancelled; 3.4 viewer running-cost estimate, stop as cancelled; 3.5 caps to physical limits, failed with reason, transforms compose; 4.3 right-rail live cost; 5.2 downstream runs wasted; 7.3 importer agent on haiku; 8.1 `/costs`; 8.3 draft mode toggle; 9.2 spend today, one poller; 10.1 acceptance |
| `docs/old/architecture/06-cost-and-platform.md` §12, §15 | Component #12: role, seam, `PricingService`, passthrough, provider-blind rollups, versioned and dated price table, memory's net effect. Component #15: settings, draft mode as a `SpecTransform` with `fast-cheap`, thin API handlers. *Where a new provider touches the codebase* |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Costs & settings group (5 rollups + draft mode toggle), card live ticking cost, task sheet cost, *"Latency here costs money"*, stream-json cost + tokens, sticky footer running cost, ReplayProvider *"no cost"*, memory *"Pays for itself, or it's off"*. *Logical components*: Costs `/costs`, Cost rollup, Database *costs*, `events, cost` edge. *Functional components*: Cost & control group (5 cards), `usage` edge from Execution, step timeline cost. *Harness architecture*: Run viewer live cost; Library · Costs · Settings; Read models; SQLite card; Run records at $0; Runner draft-mode transform; Permission gate budget caps; AgentProvider ReplayProvider at $0; Infra-retry classifier; Stream parser live token and cost; Cost ledger; Test lane at $0; `--max-turns`, `--max-budget-usd`; deterministic gates as $0; bounded contract; loop layer; life-of-a-step beat G; *Mem0 OSS server* (*"its extraction LLM is metered separately"*); SQLite card's *"settings (memory, sandbox_profile)"* |
| `docs/old/stream-sample.jsonl` | The probe: per-message `usage` on `message_start`, `assistant`, `message_delta`; `rate_limit_event`; `result` with `total_cost_usd`, `num_turns`, `usage` (with the 5-minute and 1-hour `cache_creation` split), `is_error`, `modelUsage` keyed by `claude-fable-5-1` with `costUSD` and `costBasis: "list"`. `stream-sample.stderr` is empty |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/architecture/01-ports.md` | `RunSpec.limits`, `SandboxProfile.limits`, `RunResult.usage`, `Usage` with optional `costUsd`, capability negotiation (*no `native_cost` → PricingService*), logical model ids, ReplayProvider zero-spend, Codex cost risk |
| `docs/old/architecture/02-core-and-engine.md` §1, §3, §4 | `runs.model/effort/provider`; the append-only usage journal; superseded runs wasted; card cost from the ledger; incremental `num_turns`; materialized view idea |
| `docs/old/architecture/03-execution-substrate.md` §5, §6, §8 | Cumulative usage reset; `total_cost_usd` → `Usage.costUsd`; draft mode applied in the runner; caps to physical backstops; infra retries wasted; shell steps cost nothing; `spec.json` snapshot; viewer footer estimate |
| `docs/old/architecture/07-ports-in-practice.md` | ReplayProvider `costUsd: 0.012`; live cost updated only on `result` |
| `docs/old/architecture/08-sandboxing.md` | Physical limits as the backstop to logical caps; `runs.sandbox` beside `runs.model/effort` |
| `docs/old/architecture/09-memory.md` | Memory as a wasted-spend control; tag memory cost separately; measure it against wasted spend |
| `docs/old/architecture/README.md` | *"cost ledger"* in the system definition; component index #12 and #15; `cost/` package |
| `docs/old/reference/core/ports/events.ts` | `Usage` type; `Usage` only on `result` |
| `docs/old/reference/core/ports/agent-provider.ts` | `native_cost`, `partial_stream`, `budget_cap` capability comments; `Effort`; `RunSpec.model` as a logical id; `limits` |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | Declares `native_cost` and `partial_stream`; zero usage until `result`; stop settles with `exitCode: 130` |
| `docs/old/design/brief.md` | §2 live accumulating cost; §3 timeline with model, effort, cost; §4 footer running cost; §5 `/costs` *"which parts of my flow are worth their price"*, wasted spend *"the number that changes my behaviour"* |
| `docs/old/design/README.md`, `Vibe Kanban.dc.html` | `/costs` not designed; live cost cadence and *"never coloured"*; chrome `4 running · $28.40 today` and board header `14 tasks · $28.40 today`; inbox right rail with live cost; per-branch cost; done card total; *"burning idle"*; Plex Mono for costs; `StepRun.costUsd` |
| `docs/mockups/monitor.html`, `monitor-guide.html` | `RATE`, `burnRate()`, today = kept + wasted, wasted %, *"under roughly a tenth"*, rate table, per-row cost, sent-back loop label, stop *"recorded as failed"*, failed spend *"re-labelled wasted"*, wasted colours (`--wait` on the topbar, `--fail` on rows). Covered in [[Burn Today And Wasted]] and [[Monitor Actions And Costs]] |
| `docs/mockups/inbox.html`, `inbox-guide.html` | `RUNNING` burn, context panel today and wasted, decision costs, *"a parked run is not billing you"*, `billing-webhook` $1.44, `provider-codex` pricing question, `cost-rollup` answer |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | Kept, wasted, bill; Cost tab; recipe average; *"Answering is free"*; `RATE`; *"Anything in flight becomes wasted"*. Covered in [[Task Cost And Wasted Spend]] |
| `docs/mockups/flow-designer.html`, `flow-designer-guide.html` | Draft mode toggle and its effects; budget field and chip; ceiling per task; library `~$/task`; model, effort and budget guidance; *"Draft mode isn't a version"* |
| `docs/mockups/capability-library-guide.html` | The *"portability budget"* sense of budget; the `$0.48` build toll |
| `docs/mockups/README.md` | Retries bill wasted spend; the *today* accounting bug |
| `docs/pitch.md` | The cost of the current state (unattributed spend, rework waste); objection 4, the spend-control layer; wasted spend as the success metric; illustrative figures |
| `docs/competitor-multica.md` | Multica has no spend caps or budgets; FlowBoard's per-step caps and wasted metric |
| `docs/FlowBoard/Monitor/*` | Linked: [[Burn Today And Wasted]], [[Monitor Actions And Costs]], [[Live Run Viewer]], [[Board Projection]], [[Needs You Band]]; Monitor Open Questions #14–#18, #35, #38, #42 |
| `docs/FlowBoard/Execution/*` | Linked: [[Draft Mode And Spec Transforms]], [[Rework Loop]]; Execution Open Questions #45, #46, #55, #62 |
| `docs/FlowBoard/Capability Library/*` | [[Capability Library Decisions]] D20: Claude aliases as the logical model ids |
| New sets on unmerged branches | Settings And Plumbing: [[Settings Defaults]], [[Draft Mode Setting]], [[Settings Overrides And Spec Transforms]], [[Settings Data Model]], [[Settings And Plumbing API And Routes]]; Open Questions #2, #5, #10, #22. Agent Providers: [[Logical Model Ids]], [[Normalized Event Envelope]]; Open Questions #9, #12, #13, #16, #25, #32, #33. Memory: [[Measuring Memory Payoff]], [[Mem0 Adapter]]; Open Questions #22, #24. Projects: [[Project Lifecycle And Deletion]]; Open Questions #9, #11. Sandboxing: [[Resource Limits]]. Intake And Import: Open Questions #12 |
| `docs/FlowBoard/Task Detail/*` | Linked: [[Task Cost And Wasted Spend]], [[Attempts And Send Back]], [[Sample Task Auth Refactor]], [[Memory Carried Into A Task]]; Task Detail Open Questions #15, #17, #18 |
| `docs/FlowBoard/Human In The Loop/*` | Linked: [[Ask Park And Resume]], [[Human In The Loop Screen]], [[Answers And Memory]]; [[Human In The Loop Open Questions]] #38, #42 |
| `docs/FlowBoard/Escalation And Notifications/*` | Linked: [[Escalation API And Routes]] (the shared settings-route proposal) |
| `docs/FlowBoard/Flow Design/*` | Linked: [[Models And Effort]], [[Step Guardrails]], [[Seeded Flows]], [[Flow Library]]; Flow Design Open Questions #12, #15, #28 |
| `docs/FlowBoard/Component Documentation Tracker.md` | Scope: live cost, rollups, wasted spend, draft mode; feature map §18; architecture #12 |

## Related

- [[Cost And Control Index]]
- [[Cost And Control Open Questions]]
