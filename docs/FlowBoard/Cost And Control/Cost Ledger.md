---
tags: [flowboard, cost-and-control, concept, ledger]
module: Cost And Control
---

# Cost Ledger

Architecture component **#12 Cost & usage ledger + PricingService** (`06-cost-and-platform.md` §12). It is the read side of money: rollups over the run journal, plus the one service that prices providers that don't report dollars.

## Role

> rollups (PRD §13) — spend per project over time, per step definition (what does `/grill-me` actually cost), per model×effort, **wasted spend** (`cost_usd` where `wasted=1`, money burnt by rework loops), and cost per completed task trended by flow version. (`06` §12)

## Seam

> the ledger consumes `Usage` from the provider port and reads the append-only `runs` journal. A single new service closes the provider gap (`06` §12)

- **Input:** `Usage` on the `result` event of every agent run. See [[Usage And Native Cost]]. (As built, a run stopped or failed before its result has no `result` event; `RunResult.usage` then holds its last running totals, without `costUsd` on Claude. See [[Agent Run Handle And Result]].)
- **Pricing:** the [[Pricing Service]] fills `costUsd` when the provider did not.
- **Store:** one row per run in `runs`. See [[Cost Data Model]].
- **Output:** the [[Spend Rollups]], the [[Wasted Spend]] figure, and the card and viewer cost. *"the board's live card cost (4) and the viewer's running estimate (8) both read the same `Usage`"* (`06` §12).

## The runs table is a journal

> **Idea:** treat `runs` as an **append-only usage journal** — never mutate cost after the result lands; corrections are new rows. The ledger becomes auditable and reproducible. (`02` §1)

Three things make the journal work:

| Mechanism | What it guarantees | Source |
|---|---|---|
| A new run per attempt and per infra retry | Every spend has its own row; nothing is overwritten by a redo | PRD §7, §8 |
| `runs.wasted` flag | Thrown-away spend stays in the table, marked, never deleted | PRD §5 |
| `runs.model`, `runs.effort` (and `runs.sandbox`) record what actually ran | Overrides such as draft mode can't corrupt the rollups | backlog 1.1, `02` §1, PRD §11.1 |

`06` §12 adds a pricing idea that fits the journal: *"keep the price table **versioned and dated**. When rates change, historical cost stays reproducible because each run prices against the table in effect at its `started_at`. Pairs with the append-only journal: cost is never rewritten, only re-derivable."*

> [!note] Live cost is not the journal
> The live figure a card shows mid-run is an estimate. The journal value is written once, from the result event. PRD §7: *"Take the final result event's total cost as authoritative for `runs.cost_usd`."* See [[Live Cost]].

## Provider-blind by construction

The ledger never sees provider JSON. `agent-provider.ts`: *"Everything else — the flow engine, board projection, cost ledger, HITL protocol, live viewer — consumes only the normalized outputs and never learns which provider ran."* `06`, *Where a new provider actually touches the codebase*, requires **zero changes** to *"cost rollups"* when Codex is added. The only cost-specific step for a new provider is *"A `(codex, model) → rates` row in the price table (12), because `native_cost` is absent."*

## A clear record

The feature map's cross-cutting theme: *"**A clear record** — an honest, unchangeable log of what every agent did and what it cost, so you can always look back."* The journal is that record for money. The drawio *Harness architecture* adds **Run records**: *"data/runs/<id>/spec.json + raw stream, replayable at $0"*.

## Composes with

- **Draft mode** (#15) *"overrides model/effort *and records the actual ones used* so `runs.model` / `runs.effort` keep the rollups honest"* (`06` §12). See [[Draft Mode]].
- **Memory** (`09-memory.md`): warm starts are *"a **wasted-spend** lever"*; memory's own spend is tagged separately. See [[Memory Cost Accounting]].
- **Sandbox** (`08-sandboxing.md`): *"the sandbox's physical limits complement the budget caps; `runs.sandbox` records the tier for audit alongside `runs.model`/`runs.effort`."*

## Related

- [[Cost Accounting Rules]]
- [[Pricing Service]]
- [[Spend Rollups]]
- [[Cost Runtime]]
