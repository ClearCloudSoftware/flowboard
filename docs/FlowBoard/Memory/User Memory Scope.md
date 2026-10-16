---
tags: [flowboard, memory, scope]
module: Memory
---

# User Memory Scope

`{ kind: 'user' }`: *"the operator: standing prefs + recurring decisions"* (`memory-store.ts`). It has no id: *"A single-user tool has exactly one `user` scope."*

## Why it matters most

> [!quote] `09-memory.md`
> *"A single-user tool has *one* `user` scope — which is what makes the user-memory the highest-leverage of the four: answer a preference once, and it stops surfacing in the inbox."*

PRD §11.2 calls it *"the single highest-leverage one"*. `09` recommendation 2: *"The user scope is the cheapest, highest-leverage win (fewer inbox repeats)."*

The feature map §21: *"**Remember your answers** — When you answer a question in the inbox, or reject a step with a reason, FlowBoard remembers it. The next task doesn't ask you the same thing again — the screen you live in gets quieter over time."* The drawio *FlowBoard ideation* card *Remembers your answers*: *"A preference answered once stops surfacing in the inbox on the next task."*

| | |
|---|---|
| Holds | *"uses pnpm", "rejects speculative abstractions", recurring answers* (`09`) |
| Written from | *answered questions (§9), rejections* (`09`) |
| Read into | *every run* (`09`: *"Recall the `user` scope into every run"*) |
| Mockup label | `you`: *"Prefers vitest; never suggest jest for this repo."* (task-detail aside) |
| Mem0 mapping | `user_id` (`09`) |

## The proof that memory works

PRD §14, M9: *"Proof it works: a preference answered once in the inbox is recalled into the next task and not asked again"*. PRD §16 acceptance: *"With memory enabled, a preference answered in the inbox is recalled into the next task's run and not asked again"*. Both are user-scope behaviour. The inbox side is in [[Answers And Memory]].

> [!question] Gaps
> - The mockup's `you` line says *"for this repo"*: a project-specific fact filed under the user scope. Nothing says how a commit decides between `user` and `project`. See [[Memory Open Questions]] #11.
> - Rejections are a human action at a gate, not a run, yet commit happens *"after a run succeeds"*. See [[Memory Open Questions]] #12.
> - The feature map idea of *"a shared team memory"* would make this scope shared. See [[Memory Roadmap]].

## Related

- [[Memory Scopes]]
- [[Answers And Memory]]
- [[Measuring Memory Payoff]]
- [[Memory Index]]
