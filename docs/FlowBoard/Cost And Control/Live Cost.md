---
tags: [flowboard, cost-and-control, concept, live]
module: Cost And Control
---

# Live Cost

The number that ticks up while a run is in flight. Drawio *Functional components*: *"Ticking run cost — live, per card and per run"*.

## What the sources ask for

| Where | Wording | Source |
|---|---|---|
| Runner | *"**Track cost as it goes** — Adds up spending live, so you watch a number climb rather than only seeing a total at the end."* | feature map §7 |
| Board card | *"a live running cost"*; PRD: *"a live cost figure"* | feature map §5, PRD §13 |
| Live run viewer | *"Sticky footer with elapsed time, turn count, running cost."* | PRD §13, feature map §9 |
| Viewer, backlog | *"sticky footer with elapsed / turns / **running cost** (estimate from tokens until result lands)"* (**PRD/BUG**) | backlog 3.4 |
| Inbox context panel | *"What's running right now, what it's costing"* | feature map §12 |
| Brief | *"**Live accumulating cost** — this ticks up while a step runs"* | brief §2 |
| Handoff | *"Ticks up while a step runs, ~1s cadence, from the run's token accounting. Always mono, always right-aligned, never coloured."* | `docs/old/design/README.md` |
| Acceptance | *"A step streams to `/runs/[id]` with non‑zero cost **and live turns/cost during the run**."* | backlog 10.1 |

## How it is meant to work

PRD §7: *"Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* When the `result` event arrives, its total replaces the estimate as `runs.cost_usd`. `06` §12: *"the board's live card cost (4) and the viewer's running estimate (8) both read the same `Usage`."* The handoff wants *"one shared 1s ticker for every elapsed time and cost readout"*.

## Why it showed $0 the first time

The backlog's opening list of bugs that survived the first build includes a *"$0 running cost"* and a *"0 % progress bar"*. The causes it names:

- *"Progress hairline needs `runs.num_turns` written **incrementally** (today only on the final event → always 0 %)."* (backlog 2.2)
- *"persist `num_turns` per assistant turn so the viewer/board show live numbers."* (backlog 3.2)
- *"`message_delta.usage` is cumulative per message — reset per `message_start`, do not sum across deltas."* (backlog 3.2)

> [!bug] The path from tokens to a live dollar figure is not designed
> 1. The Claude stream has per-message tokens ([[Usage And Native Cost]]), but `NormalizedEvent` carries `Usage` only on `result`.
> 2. `07-ports-in-practice.md` updates live cost only `if (ev.type === 'result')`.
> 3. Claude's price table is a passthrough (`06` §12), so there are no Claude rates to turn mid-run tokens into dollars.
>
> Monitor Open Questions #38 raised this. [[Cost And Control Open Questions]] #2 has a **proposal**.

## Burn rate

The monitor topbar's `burn /hr` and the inbox panel's `costing you $/hr` are a rate over everything running. The mockups compute it from a per-minute price per model:

| Mockup | Formula | Line |
|---|---|---|
| Monitor | `RATE = { haiku:0.008, sonnet:0.05, opus:0.14 }` dollars per minute; `burnRate()` sums `RATE[model]` over running runs × 60 | `monitor.html:436`, `:874` |
| Inbox | `RUNNING` rows carry the same per-minute rate; `burn = Σ rate × 60` | `inbox.html:379` |
| Task detail | Same `RATE`; a running step's cost is `(ms / 60000) × RATE[model] × 24` on a ×24 demo clock | `task-detail.html:274`, `:620` |

Real runs are not priced by the minute. No source defines burn for real data. **Proposal** (from Monitor Open Questions #15): Σ over running runs of (cost added in the last *N* minutes) × 60 / *N*. See [[Cost And Control Open Questions]] #3.

The monitor guide's reason for showing it: *"To know what leaving the board running will cost you while you make coffee."* And the rate table's comment: *"Four agents at once is not a small number — that's the point of showing it."*

## When the number stops

- A **parked** run is not billing: *"a parked run is not billing you"* (inbox guide); *"paused, billing stopped"* (task-detail mockup). Before the 20-minute park the CLI is still alive. See [[Cost And Control Open Questions]] #9.
- A **shell** step never ticks: *"Shell runs cost nothing and record `cost_usd = 0`."* (PRD §7)
- **Burn** *"drops to zero the moment the last agent stops"* (monitor guide).

## Related

- [[Usage And Native Cost]]
- [[Live Run Viewer]]
- [[Burn Today And Wasted]]
- [[Cost Surfaces]]
