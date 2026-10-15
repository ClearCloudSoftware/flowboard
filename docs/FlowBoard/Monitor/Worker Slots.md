---
tags: [flowboard, monitor, workers, concurrency]
module: Monitor
---

# Worker Slots

Band 2 of the [[Monitor Screen]]: *"How saturated the machine is. Collapsed to one line; click to see each slot."*

## The cap

The feature map §8: *"**Do the right amount at once** — A cap on how many agents run at the same time, so your machine isn't overwhelmed."* The cap is `VIBE_MAX_RUNS` (backlog Story 3.1, `03` §7, drawio *Harness architecture* card *Job loop*). The mockup sets `CAP = 4`. No source gives a default value for `VIBE_MAX_RUNS` ([[Monitor Open Questions]] #20).

A slot is taken by a **running** step. In the mockup, a task that fans out holds two slots (*"Two of your four slots are on this task"*, guide beat 8). A gated or asking step holds none: *"Until you do, the task occupies no worker and costs nothing."* PRD §9 keeps an asking run's process alive for up to 20 minutes before parking it ([[Monitor Open Questions]] #8).

## Collapsed strip

```
▸ WORKERS ■■■■ 4/4 · queue 2 · $20.28/hr   build · sandbox-egress · › edit runner/src/sandbox/egress.ts
```

- That is the seeded screen at load: four running, two queued. The guide's anatomy diagram draws an illustrative `3/4 · queue 5`
- Four squares, filled petrol when busy
- `running/cap`, the queue length, the burn rate
- A ticker with the first running slot's step, task and current log line, or `all slots idle`

## Expanded

Click the strip or press `w`. One row per slot:

| # | task | step | model | elapsed | current action | cost | |
|---|---|---|---|---|---|---|---|
| 1 | sandbox-egress | build | opus | 33m | `› edit runner/src/sandbox/egress.ts` | live $ | **stop** |
| 4 | — idle — | | | | | | |

Below the rows, when anything is queued: `queued · cost-rollup·plan  pdf-import·research`, each queued run as `task·step`.

**stop** ends that run. See [[Monitor Actions And Costs]].

The guide: *"Opens the four slots: which task, which step, which model, elapsed, live cost, and the line the agent is on right now."*

## Scheduling in the mockup

`schedule()` hands free slots to queued runs in the order of the `TASKS` array: the seed list's order, not age or priority. It is a simulation. The real queue is the `jobs` table, leased by the worker *"inside a transaction"* with *"stale‑lease reclaim at 10 min"* (backlog 3.1). Whether a [[Check Steps|check step]] (a shell run, *"no model"*) takes a slot is not stated.

## Related

- [[Burn Today And Wasted]]
- [[Monitor Runtime]]
- [[Monitor Controls]]
