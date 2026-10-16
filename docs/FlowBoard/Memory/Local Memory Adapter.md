---
tags: [flowboard, memory, adapter]
module: Memory
---

# Local Memory Adapter

The first real adapter. *"A `memories` table with an FTS5 index in the same `flowboard.db`. Keyword recall, ranked by scope and recency. No embeddings, no extraction model, no extra container."* (PRD §11.2)

The feature map §21 says it plainly: *"**Starts simple** — The first version keeps memories in FlowBoard's own database and finds them by keyword, newest first: nothing extra to install or pay for."*

## What it stores

PRD §11.2: *"The `local` adapter adds one `memories` table (scope, scope_id, text, source_run_id, created_at) with an FTS5 index."* The drawio *Harness architecture* SQLite card lists *"memories + FTS5"* and *"run_memories"*. See [[Memory Data Model]].

## How it behaves

| Call | Behaviour | Source |
|---|---|---|
| `write` | *"With `local`, it is stored as written"* | PRD §11.2, `09` |
| `recall` | Keyword match over the FTS5 index, filtered to the scope union | PRD §11.2 |
| Ranking | *"ranked by scope and recency"* (PRD §11.2); *"recall prefers the newest"* (PRD §11.2, `09`); *"newest first"* (feature map). PRD §7 says part 7's hits are *"ranked by relevance"*. | see [[Memory Open Questions]] #5 |
| Contradictions | None resolved. An old and a new fact both stay; newest wins on ranking. | [[Contradictions And Freshness]] |

It runs where the runner runs. The drawio arrow **D** goes from the worker's `MemoryStore port` to SQLite: *"recall / write (local adapter)"*. The drawio is explicit that SQLite is *"opened by apps/web and apps/worker only, never from a sandbox"*.

## Why it comes first

- *"nothing extra to install or pay for"* (feature map §21).
- It needs no model: *"No embeddings, no extraction model"* (PRD §11.2). That the memory bucket therefore stays near zero until Mem0 is inferred; part 7's tokens are a separate question ([[Memory Open Questions]] #22). See [[Memory Cost Accounting]].
- It lets the cost and inbox views show whether memory pays off before buying a vector store and an extraction model. *"Move to self-hosted Mem0 only when the cost and inbox views show memory paying off and recall quality is the limit."* (`09`)

> [!question] Open
> - The ranking rule (relevance, scope, recency) is not settled. #5
> - The query is *"the assembled task/step context"*: a long text for a keyword search. #7
> - No source gives the FTS5 table's shape, a `metadata` column, or the `updatedAt` that `MemoryHit` returns. #20
>
> Numbers refer to [[Memory Open Questions]].

## Related

- [[Memory Adapters]]
- [[Memory Storage]]
- [[Memory Data Model]]
- [[Memory Index]]
