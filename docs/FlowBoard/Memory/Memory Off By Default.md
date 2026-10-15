---
tags: [flowboard, memory, behaviour, rule]
module: Memory
---

# Memory Off By Default

Memory is the one optional piece of the core. Every rule below says the same thing from a different source.

| Source | Wording |
|---|---|
| PRD §11.2 | *"It is **additive** — with it off, every flow behaves exactly as this spec describes; memory is never on the critical path of a run."* |
| PRD §13 | *"Default the adapter to `none` — memory is additive, and nothing else in the app depends on it being on."* |
| PRD §17 | *"Memory must never become a precondition for a run: with the `none` adapter the app behaves exactly as the rest of this spec describes."* |
| `01-ports.md` | *"a run happens without it, it only makes runs warmer"* |
| `03` §6 | *"With the `none` adapter this is a no-op and nothing else changes — memory is additive, not on the critical path."* |
| `06` §15 | *"Off (`none`) by default; memory is additive."* |
| `memory-store.ts` | *"core runs unchanged with the `none` adapter"* |
| Feature map §21 | *"**Off until you want it** — It's an add-on, not a requirement: every flow runs exactly as before with memory switched off."* |
| Drawio | *"Off by default; every flow runs without it."* (ideation); *"sixth port · additive · off by default"* (logical); dashed = optional (functional) |

## How it is proved

- PRD §14, M9: *"turning memory off returns the app to exactly its M1–M8 behaviour."*
- PRD §16: *"With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition"*.
- With `none`, *"the prompt is exactly the six parts above"* (PRD §7).

## It ships last

M9 is the last milestone: *"Off by default; ships last because it depends on runs, questions, and artifacts already existing."* (PRD §14)

## Turning it on

| Source | How |
|---|---|
| PRD §13 | The settings section: pick an adapter other than `none`, and the enabled scopes |
| `09` recommendation 1 | *"default `none` until the first flow opts in"* |

> [!question] Global or per flow?
> The PRD makes memory a global setting. `09` speaks of a flow *opting in*, and of scopes *"per step"*. No flow or step field exists for either. See [[Memory Open Questions]] #4.

> [!question] Failures
> No source says what happens when recall or commit fails (store unreachable, FTS error). *"never on the critical path"* suggests (inferred) that the run should go ahead without memory. See [[Memory Open Questions]] #28.

## Related

- [[Memory Settings]]
- [[Memory Adapters]]
- [[Measuring Memory Payoff]]
- [[Memory Index]]
