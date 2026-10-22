---
tags: [flowboard, cost-and-control, concept, pricing]
module: Cost And Control
---

# Pricing Service

The one service that turns any provider's `Usage` into dollars (`06-cost-and-platform.md` §12).

```ts
interface PricingService {
  price(provider: string, model: string, usage: Usage): number;  // -> costUsd
}
```

## The passthrough

> **Genericize — the elegant part:** Claude reports `total_cost_usd`, so its price table is a **passthrough** (`usage.costUsd` already set). Codex reports tokens only, so the same service prices it from a `(provider, model) → rates` table. **One code path costs every provider uniformly**; native cost is just the degenerate case where the table isn't consulted. Every downstream rollup is provider-blind. (`06` §12)

```mermaid
flowchart TD
  U[Usage from result event] --> Q{usage.costUsd set?<br/>provider has native_cost}
  Q -->|yes · Claude| PT[Passthrough<br/>use costUsd]
  Q -->|no · Codex| RT[Look up provider, model<br/>in rate table]
  RT --> C[tokens × rates]
  PT --> RUN[(runs.cost_usd)]
  C --> RUN
```

> [!warning] The shipped code differs
> No PricingService or rate table is built. The port no longer ties a missing `costUsd` to a missing `native_cost` (2026-10-22): Claude declares `native_cost`, yet its live `usage` events and a run stopped before its result carry no `costUsd`; OpenCode declares it and sets `costUsd` on every event, but to 0 for a model it has no price for, so a passthrough would record $0 for such a run (**inferred**). Absent means "price it from tokens". See [[Normalized Event Envelope]] and [[Agent Providers Open Questions]] #9.

## Adding a provider

`06`, *Where a new provider actually touches the codebase*, step 2: *"A `(codex, model) → rates` row in the price table (12), because `native_cost` is absent."* Step 4: *"Zero changes to: engine, board projection, HITL protocol, notifier, cost rollups, viewer, API."*

## Versioned and dated rates

An idea, not a requirement:

> keep the price table **versioned and dated**. When rates change, historical cost stays reproducible because each run prices against the table in effect at its `started_at`. (`06` §12)

> [!note] This only bites for priced providers
> For Claude the result's `total_cost_usd` is authoritative and stored once, so a rate change never touches history. The versioned table matters for providers priced from tokens. As built, that includes a Claude run stopped or failed before its result: `RunResult.usage` then has its tokens but no `costUsd` ([[Agent Run Handle And Result]]).

## The mockups ask the same question

The inbox mockup seeds a pending question on task `provider-codex`, step `research` (`inbox.html:220`):

> *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"* Options: **Estimate from tokens** · **Record as unknown**.

The inbox guide's walkthrough answers it **Estimate from tokens**. `06` §12 already assumes estimation. The *Record as unknown* option has no design: a `NULL` cost would break every sum. See [[Cost And Control Open Questions]] #6.

A second inbox fixture, already answered: `cost-rollup`, *"Roll up by model, or by step?"* → **Both** (`inbox.html:244`). That matches PRD §13, which asks for both.

## What is not specified

- Where the rate table lives (a table, a JSON file, settings) and who maintains it.
- The rate shape: per million input, output, cache-read and cache-write tokens is the natural reading of `Usage`, but no source says so. The Claude probe splits cache writes into 5-minute and 1-hour lifetimes, which a single cache-write rate cannot tell apart (**inferred**).
- The provider id. `price()` takes `provider`, but the PRD `runs` table has no provider column; `02` §1 proposes adding `runs.provider`.

- The model key: the step's alias, a logical id, or the id the CLI reports (`claude-fable-5-1` in the probe).

These are in [[Cost And Control Open Questions]] #6 and #24.

## Related

- [[Usage And Native Cost]]
- [[Cost Ledger]]
- [[Provider Coverage And Portability]]
- [[Cost Data Model]]
