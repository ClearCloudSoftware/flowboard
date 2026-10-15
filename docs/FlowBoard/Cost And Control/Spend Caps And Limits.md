---
tags: [flowboard, cost-and-control, control, limits]
module: Cost And Control
---

# Spend Caps And Limits

The per-step controls that bound what a run can spend, and the physical limits behind them. The flow-designer side, every guardrail field, is in [[Step Guardrails]]. This note is the money view.

> *Guardrails* — A spending cap, a limit on back-and-forth turns, which tools it's allowed, and how many times it may retry before giving up. (feature map §2)

## Three layers

| Layer | Control | Where | Source |
|---|---|---|---|
| Logical, per run | `max_budget_usd` → `--max-budget-usd N` | `step_defs` | PRD §5, §7 |
| Logical, per run | `max_turns` → `--max-turns N` | `step_defs` | PRD §5, §7 |
| Per step instance | `max_attempts` (default 3): total runs, first try included, infra retries excluded | `step_defs` | PRD §8 |
| Physical, per run | `--memory`, `--cpus`, `--pids-limit`, wall-clock | sandbox profile | PRD §11.1 |
| Global | [[Draft Mode]] | `settings` | PRD §13 |

PRD §11.1: resource limits *"physically backstop the logical `max_turns`/`max_budget_usd` caps."* `08-sandboxing.md`: *"A runaway or looping agent is contained at the OS level, not only at the token level."* Feature map §10: *"**Hard limits** — Ceilings on memory, processing, and time, so a runaway agent is stopped by the box, not just by its spending budget."* The port shape for the physical side is `SandboxProfile.limits?: { memoryMb?, cpus?, pids?, wallClockMs? }` (`01-ports.md`). See [[Resource Limits]].

## The budget field

- Column: `max_budget_usd REAL` (PRD §5), nullable, no default.
- Port: `RunSpec.limits?: { maxTurns?: number; maxBudgetUsd?: number }` (`agent-provider.ts`).
- Mockup: the inspector's **Budget** input (`$`, step 0.10, `flow-designer.html:514`) and the third chip on every node.
- Guide: *"The most this step may spend on one attempt. The canvas bar totals these into a ceiling per task."* Get it wrong: *"No ceiling means a looping agent has no financial brake — only the sandbox's time limit."*

### Enforced, or advisory

The `budget_cap` capability: *"honours maxBudgetUsd; else it is advisory"* (`agent-provider.ts`). Claude passes the flag to the CLI; a provider without the capability does not stop at the cap. No source says whether FlowBoard enforces the cap itself (for example, by stopping a run whose live cost passes it) for providers without `budget_cap`. No capability covers `maxTurns` at all ([[Agent Providers Open Questions]] #25). See [[Cost And Control Open Questions]] #8.

## When a cap is hit

PRD §7 classifies the non-zero exit: *"Anything else, or a 4th transient failure (budget or turn cap hit, auth error, bad config, unknown): put the task into `blocked`, as before. Retrying these would only burn the same money again."* Backlog 3.5: *"Map logical `max_turns`/`max_budget_usd` to physical limits; a limit/timeout hit marks the run failed with reason."* (**NEW**). The drawio *Permission gate*: *"budget caps map to --memory / --cpus / --pids-limit"*.

A cap hit is **not** an infra retry. It does not retry automatically. The PRD sets no `wasted` flag on that run; the guides count any failed run's spend as wasted. See [[Wasted Spend]] and [[Cost And Control Open Questions]] #1.

## Attempts are a budget too

> The counter lives on the **target** instance, so every loop that sends work back to the same step shares one budget. In the seeded flow, a failed `check` and a failed `review` both spend `implement`'s attempts. (PRD §8)

When the attempts run out, FlowBoard escalates instead of failing: *"Escalate, don't fail, when a loop is spent or stuck."* A repeated failure fingerprint escalates early, so the third try is not spent. See [[Branching Joining And Loops]] and [[Failures And Escalated Loops]].

## The ceiling per task

The canvas bar reads `est. $X ceiling per task`: the sum of every step's budget (`flow-designer.html:611`). It is not a ceiling. Budget is per attempt, and rework loops, infra retries and human retries all go past it. Flow Design Open Questions #12. No source specifies a **per-task** or **global** cap. `06` §15 names *"cap-budget-globally"* only as a possible future transform.

## Ideas

- *"**A team budget** — give a team a monthly cap and alert its lead as it fills."* (feature map §18)
- *"**Team guardrails vs personal defaults** — the team can pin rules nobody can quietly lift (a review step must wait for approval, a budget cap holds)"* (feature map §16)

## Competitive note

`docs/competitor-multica.md`: Multica shows *"Token usage shown *after* the fact. Docs mention **no** spend caps, budgets, or rate limits"*; FlowBoard has *"Per-step budget caps, per-stage and per-task dollars, an explicit wasted-spend metric to attack"*.

## Related

- [[Step Guardrails]]
- [[Draft Mode]]
- [[Wasted Spend]]
- [[Cost Accounting Rules]]
