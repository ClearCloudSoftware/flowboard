---
tags: [flowboard, cost-and-control, index]
module: Cost And Control
---

# Cost And Control Index

Cost And Control is FlowBoard's money layer. It records what every agent run cost, keeps a live number ticking while a run is in flight, rolls the spend up by project, step, model and flow version, and calls out **wasted spend**. It also holds the levers that keep spend in bounds: **draft mode**, per-step **budget and turn caps**, and the sandbox's physical limits behind them.

> [!important] The one idea to get right first
> The bill is a journal, not a balance. Every run's cost is written once, from the provider's final result event, and never rewritten. *"Sending a step back moves money between columns, it doesn't refund it"* (monitor guide). Wasted spend is a **flag on runs that were thrown away**, not a deduction. So the numbers people act on, *wasted* and *cost per finished task*, can always be re-derived from the `runs` table. See [[Cost Ledger]] and [[Wasted Spend]].

There is no mockup for `/costs`. This set is built from the PRD, the backlog, the architecture notes, the drawio, and the places other mockups show money. Expect more [[Cost And Control Open Questions|open questions]] than in the screen-backed sets.

## Start here

- [[Cost And Control Overview]]: purpose, place in the system, design principles
- [[Cost And Control Glossary]]: terms, including the overloaded words *bill*, *budget*, *cost*, *burn*, *today* and *wasted*

## Core concepts

- [[Cost Ledger]]: component #12, the append-only `runs` journal every rollup reads
- [[Usage And Native Cost]]: the `Usage` record, the stream-json fields, which number is authoritative
- [[Pricing Service]]: one code path that prices every provider; Claude is a passthrough
- [[Live Cost]]: the ticking number on cards, rows and the viewer footer, and burn rate
- [[Wasted Spend]]: what is thrown away, how it gets flagged, why it is the number to attack
- [[Spend Rollups]]: the five `/costs` views, including cost per finished task by flow version

## Control

- [[Draft Mode]]: force every step onto the cheapest model while iterating on the recipe
- [[Spend Caps And Limits]]: `max_budget_usd`, `max_turns`, the physical backstops, the per-task ceiling
- [[Memory Cost Accounting]]: memory's own spend tagged apart, so the ledger can show the net

## Behaviour and rules

- [[Cost Accounting Rules]]: every rule, quoted, with the run-cost lifecycle

## Where money shows

- [[Costs Page]]: `/costs` as the PRD, the brief and the backlog specify it
- [[Cost Surfaces]]: every other screen that shows money, and what each figure counts

## Under the hood

- [[Cost Data Model]]: the columns cost reads and writes, and proposed additions
- [[Cost Runtime]]: from provider stream to `runs.cost_usd`; the `RunSpec` transform chain
- [[Cost API And Routes]]: `GET /api/costs` and the proposed settings endpoint
- [[Cost Storage]]: what is persisted and where

## Content and direction

- [[Cost Defaults And Sample Figures]]: defaults, mockup rates and every sample figure
- [[Cost And Control Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Cost And Control Open Questions]]: where the sources disagree or leave a gap
- [[Cost And Control Sources]]: where every fact in these notes comes from

## Related

- [[Monitor Index]]: burn, today and wasted in the topbar
- [[Task Detail Index]]: one task's Cost tab
- [[Flow Design Index]]: per-step model, effort and budget
- [[Component Documentation Tracker]]
