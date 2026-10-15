---
tags: [flowboard, sandboxing, concept, limits]
module: Sandboxing
---

# Resource Limits

> *"**Resource limits:** `--memory`, `--cpus`, `--pids-limit`, and a wall-clock timeout — the *physical* backstop to the *logical* `max_turns` / `max_budget_usd` caps. A runaway or looping agent is contained at the OS level, not only at the token level."* — `08-sandboxing.md`

## Logical caps and physical backstops

| Layer | Limits | Who enforces | Source |
|---|---|---|---|
| Logical | `max_turns` → `--max-turns`; `max_budget_usd` → `--max-budget-usd` | The agent CLI | PRD §5, §7 |
| Physical | `--memory`, `--cpus`, `--pids-limit`, wall-clock | The container runtime | PRD §11.1, `08` |

The type: `limits?: { memoryMb?: number; cpus?: number; pids?: number; wallClockMs?: number }`, *"Physical backstop to the logical max_turns / max_budget_usd caps."* (`exec-host.ts`)

Feature map §10: *"Ceilings on memory, processing, and time, so a runaway agent is stopped by the box, not just by its spending budget."*

## The mapping

`03-execution-substrate.md` §6: the runner *"maps the logical `max_turns` / `max_budget_usd` caps to the sandbox's physical `--memory` / `--cpus` / `--pids-limit` / wall-clock backstops."* The drawio *Permission gate* card: *"budget caps map to --memory / --cpus / --pids-limit"*. Backlog Story 3.5: *"Map logical `max_turns`/`max_budget_usd` to physical limits"*.

> [!question] No formula
> No source says how a dollar budget or a turn count becomes a memory size, a CPU count or a timeout. PRD §11.1 and §13 put the limits in the settings `sandbox_profile`, set by the user. Whether the runner derives them from the step's caps or simply applies the configured values is open. See [[Sandboxing Open Questions]].

## When a limit is hit

*"a limit/timeout hit marks the run failed with reason."* (backlog Story 3.5)

PRD §7 classes *"budget or turn cap hit"* as non-transient: the task goes to `blocked`. A physical limit is not in its list; see [[Infra Retries]].

The drawio *Hardening* card says *"wall-clock kill"*.

## Why it matters without a budget

The flow-designer guide on the **Budget** field: *"No ceiling means a looping agent has no financial brake — only the sandbox's time limit."* `max_budget_usd` is nullable and the seed flow sets none (PRD §5, §15), so the wall-clock limit is the only brake on the seeded flow when the sandbox is on.

## Defaults

None given. PRD §13: the settings sandbox section holds *"the resource limits"*; no values. See [[Sandbox Defaults]].

## Related

- [[Sandbox Security Profile]]
- [[Spend Caps And Limits]]
- [[Step Guardrails]]
- [[Infra Retries]]
