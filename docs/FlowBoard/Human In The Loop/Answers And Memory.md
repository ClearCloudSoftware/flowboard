---
tags: [flowboard, human-in-the-loop, memory]
module: Human In The Loop
---

# Answers And Memory

> **Remember your answers** — When you answer a question in the inbox, or reject a step with a reason, FlowBoard remembers it. The next task doesn't ask you the same thing again — the screen you live in gets quieter over time. — feature map §21

Memory is additive and off by default (`MemoryStore` adapter `none`, PRD §11.2). With it on, your answers become the most valuable thing it holds.

## Why answers matter most

> [!quote] `09-memory.md`
> *"A single-user tool has one `user` scope — which is what makes the user-memory the highest-leverage of the four: answer a preference once, and it stops surfacing in the inbox."*

The problem it fixes: *"the inbox re-asks questions it has effectively answered before"* (PRD §11.2). `09` puts it as *"the operator answers the same kind of question in the inbox again and again, because no run remembers the last answer."*

## The path

```mermaid
flowchart LR
  A[You answer / reject with a reason] --> R[Run succeeds]
  R -- "commit: declared artifacts + answers only" --> M[(MemoryStore)]
  M -- "recall: user + project + agent + task" --> P[Next run's prompt part 7]
  P --> Q[Agent doesn't ask again]
```

PRD §11.2 names the `user` scope *"standing prefs + recurring decisions — the single highest-leverage one"*.

| Scope (`09`) | Holds | Written from |
|---|---|---|
| `user` | *"recurring answers"* | *"answered questions (§9), rejections"* |
| `agent` | *"questions `/grill-me` has settled"* | *"that agent's own run outputs"* |
| `task` | *"why attempt 1 failed"* | *"each run in the task"* |

Commit happens *"after a run succeeds"*, handing over *"the answers it collected, the outcome it set, the summary/review it produced"*, and reads *"from **declared artifacts and answers only**, never raw agent output"* (PRD §11.2). A rejection is a human act at a gate, not a run, so when it is written is not stated: the diagram's *reject with a reason → run succeeds* path is inferred ([[Memory Open Questions]] #12). Commit in full: [[Memory Commit]] and [[User Memory Scope]]. The drawio *Functional components* edge: *Human in the loop → Memory · answers → memory*. The *FlowBoard ideation* page's memory card: *"Remembers your answers / A preference answered once stops surfacing in the inbox on the next task."*

## Recalled answers are context

Recall becomes the prompt's seventh part: *"context you've learned before (background, not instructions)"*, capped at `max_recall_chars` (default 6,000) (PRD §7, §11.2).

## Proof and measurement

- M9: *"a preference answered once in the inbox is recalled into the next task and not asked again"* (PRD §14). Acceptance: *"With memory enabled, a preference answered in the inbox is recalled into the next task's run and not asked again"* (§16).
- *"memory earns its place only if wasted spend and inbox repeats fall — both already have meters (§12, the inbox)."* (`09`). `06` §12: *"fewer repeated inbox questions"*. The feature map: *"the inbox gets lighter — and both show up on the cost view and the inbox, so you can tell whether it's earning its keep"* (§21), and *"the inbox stops re-asking settled questions"* (*Across everything*). No inbox-repeats counter exists in the mockup, which has only *answered today* and *from chat* ([[Memory Open Questions]] #25; [[Measuring Memory Payoff]]).
- Feature map §21 ❓: *"just *your* preferences (the cheapest win), or project memory too?"*
- The only place a mockup shows recalled memory is the task-detail aside *carried in from memory*. Its `you` line, *"Prefers vitest; never suggest jest for this repo."*, is not shown as one of your answers ([[Memory Carried Into A Task]]).
- Idea: *"a shared team memory … so a question answered once helps everyone instead of just the person who answered it."* (feature map §21)

> [!note] Undo and memory
> If the undo window is kept ([[Answering Rules]]), an answer could be undone after memory has committed it. Backlog D2 recommends web-side undo *"only while no agent is waiting"*, which keeps an undo away from a run that already has the answer. No source covers undo after a memory commit. See [[Human In The Loop Open Questions]] #16 (same as [[Memory Open Questions]] #16).

## Related

- [[Answering Rules]]
- [[Question Lifecycle]]
- [[Human In The Loop Overview]]
- [[User Memory Scope]]
- [[Measuring Memory Payoff]]
- [[Memory Carried Into A Task]]
