---
tags: [flowboard, execution, concept, prompt]
module: Execution
---

# Prompt Assembly

The runner builds every agent run's prompt from fixed parts, in a fixed order. The prompt builder lives in `packages/core/prompt/` (PRD §3).

## The parts

*"The prompt is assembled from, in order:"* (PRD §7)

| # | Part | PRD §7 wording |
|---|---|---|
| 1 | Preamble | *"A short preamble naming the task, its title and body, its acceptance criteria ("the task is done when…") and its non-goals ("do not touch…"). Omit a heading when its field is empty."* |
| 2 | Inputs | *"A list of input artifacts with their absolute paths, one per `requires` entry, phrased as "read these first"."* |
| 3 | Outputs | *"The exact output path the step should write, one per `produces` entry."* |
| 4 | Invocation | *"When the step names a skill: the slash invocation, fully qualified as `/<plugin>:<slug>`, e.g. `/grill-me:grill-me`."* |
| 5 | Template | *"The step's `prompt_template` with `{{task_title}}`, `{{task_body}}`, `{{acceptance_criteria}}`, `{{non_goals}}`, `{{artifact:<type>}}` and `{{worktree}}` substituted."* |
| 6 | Closing | *"A closing instruction: this is a headless run, there is no terminal to ask into — use the `ask_user` MCP tool for any question."* |
| 7 | Memory (optional) | *"a short "context you've learned before" block from `MemoryStore.recall`"*, inserted *"just before the closing instruction"* |

> [!important] Why part 6 exists
> *"That last line matters. A headless agent that ends with "let me know if you also want tests" is a stuck run."* (PRD §7)

The drawio *Prompt builder* card compresses it: *"1 task + acceptance criteria + non-goals · 2 read-these-first paths · 3 output paths · 4 /skill · 5 template · 6 headless: use ask_user · +7 recalled memory, ≤ max_recall_chars"*.

## Part 7

- Scoped to *"user + project + agent + task"*, *"labelled as background rather than instructions"* (PRD §7).
- Capped: *"`settings.memory.max_recall_chars`, default 6,000 — roughly 1,500 tokens): hits are ranked by relevance and the tail is dropped to fit. It never grows the other six parts."* (PRD §7)
- *"With memory off (`none`), the prompt is exactly the six parts above."* (PRD §7)
- Recall runs host-side, before `launch()` (`03` §6).

## What changes on rework

*"The new run's "read these first" list (prompt part 2) also gets the artifacts the failing step produced, so a rework sees the raw `check_output` or `review`, not a summary of it."* (PRD §8) A human's reject reason or Retry note is also carried in: *"a rejection carries your reason into the next attempt"* (feature map §4); Retry *"carries my note into it, like a rejection reason"* (PRD §8). Which part holds the reason is not stated. *Proposal:* the preamble. See [[Execution Open Questions]].

## What changes on resume

After a park, the resume prompt contains the answers (PRD §9). Backlog Story 3.2 (**BUG**): *"Resume prompt must repeat the requires/produces paths, not only the answers."* `03` §6 repeats it. The HITL side is in [[Ask Park And Resume]].

## Design idea behind it

The drawio harness concept 2, **Map, not encyclopedia**: *"The prompt lists paths to read, not their contents. Recalled memory is capped."* Concept 1, **Bounded contract**: acceptance criteria and non-goals are *"Fixed before generation, checked at flow save, injected by the prompt builder."*

## Where the sources disagree

> [!warning] Placeholders and the preamble
> - Backlog 3.2 lists placeholders `{{task_title}} {{task_body}} {{artifact:<type>}} {{worktree}}` only; PRD §7 and `03` §6 add `{{acceptance_criteria}}` and `{{non_goals}}`.
> - `agent-provider.ts` documents the preamble as *"Preamble: task title + body"*; PRD §7 includes acceptance criteria and non-goals.
> - Step kinds: PRD §5 has *"'ai' | 'shell' | 'manual'"*, where an AI step names a skill, an agent or both. `02` §3 (*"`skill|agent|shell|manual`"*) and `agent-provider.ts` (*"Slash invocation for kind='skill', e.g. "/grill-me""*) use a separate `skill` kind. PRD §7 also qualifies the invocation as `/grill-me:grill-me`.

> [!warning] Where part 7 goes
> - *Before the closing instruction*: PRD §7 (*"inserted just before the closing instruction"*) and `09-memory.md` (*"just before the closing headless instruction"*).
> - *At the end*: PRD §11.2 (*"append them to the prompt as a final part"*), `03` §6 (*"append the hits as a **7th prompt part**"*) and the drawio *Prompt builder* card (*"+7 recalled memory"*, after part 6).
> - The port has no room for it either way: `PromptParts` (`agent-provider.ts`) has six fields, and *"adapters must not reorder"*.
>
> See [[Execution Open Questions]] #51.

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Runner Pipeline]]
- [[Rework Loop]]
- [[Artifact Contract]]
