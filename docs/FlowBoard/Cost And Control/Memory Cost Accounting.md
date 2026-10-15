---
tags: [flowboard, cost-and-control, control, memory]
module: Cost And Control
---

# Memory Cost Accounting

Memory is optional and off by default (PRD §11.2). When it is on, it has to prove it pays for itself, and the cost ledger is where it does.

## Memory is a spend control

> That re-derivation is not free — it is tokens, and a slice of it is exactly the **wasted spend** the cost view (§12) exists to attack. Memory turns "start cold, re-learn, re-ask" into "start warm": it is a spend-*control* feature as much as a quality one. (`09-memory.md`)

`06` §12: *"warm-start is a **wasted-spend** lever — fewer rework re-derivations, fewer repeated inbox questions. The ledger is where that shows up or doesn't (baseline before enabling memory, compare after)."*

## Tag it apart

| Source | Rule |
|---|---|
| PRD §11.2 | *"Tag memory-layer token/API cost separately so it never lands in the per-run cost rollups (§13) — the point of memory is to *lower* run cost, and the ledger must be able to show the net."* |
| `06` §12 | *"The memory layer has its own small token/API cost; **tag it separately** (e.g. `memory` bucket) so it never lands in the per-run rollups — the honest number is *net*: run spend saved minus memory spend added. If that stays negative, the memory posture (09) is wrong, and the same meter says so."* |
| `09-memory.md` | *"Memory-layer calls have their own (small) token/API cost. Tag it separately so it never muddies the run cost rollups (§12)"* |
| Drawio ideation | *"Pays for itself, or it's off — Warm starts cut wasted spend; memory's own cost is tagged apart, so /costs shows the net."* |
| Feature map §21 | *"Turn it on and runs get cheaper (less re-deriving) and the inbox gets lighter — and both show up on the cost view and the inbox, so you can tell whether it's earning its keep."* |

## What it costs

- The `local` adapter is *"an FTS5 table in `flowboard.db`: no embeddings, no extraction model, no extra container"* (`09-memory.md`). It has no model spend.
- Recall adds a capped seventh prompt part: *"`settings.memory.max_recall_chars`, default 6,000 — roughly 1,500 tokens"* (PRD §7). **Inferred:** those tokens are billed inside the run, so they would land in run cost, not in the memory bucket, and the *net* figure would not see them. No source says which side they count on. See [[Cost And Control Open Questions]] #15 and [[Memory Open Questions]] #22.
- Mem0 adds *"fact extraction and contradiction resolution, at the price of an extraction model's spend and a vector store"* (PRD §11.2). Adopt it *"only once the cost and inbox views show `local` memory paying off"*. The drawio *Mem0 OSS server (later)* card adds *"its extraction LLM is metered separately"*. No source names that model or says how its spend is captured ([[Memory Open Questions]] #24, [[Cost And Control Open Questions]] #23).

## Measuring it

`09-memory.md` recommendation 5: *"**Measure it:** memory earns its place only if wasted spend and inbox repeats fall — both already have meters (§12, the inbox). Baseline before enabling, compare after; if it doesn't move them, turn it off."*

> [!question] Where the memory bucket lives
> No source gives the bucket a column or table. `runs` is per run, and memory calls are not runs. **Proposal:** a small `memory_usage(at, adapter, op, tokens, cost_usd)` table, summed beside the run rollups on `/costs`. See [[Cost And Control Open Questions]] #15.

## Related

- [[Wasted Spend]]
- [[Spend Rollups]]
- [[Answers And Memory]]
- [[Memory Carried Into A Task]]
- [[Measuring Memory Payoff]]
- [[Mem0 Adapter]]
