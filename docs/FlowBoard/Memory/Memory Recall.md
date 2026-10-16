---
tags: [flowboard, memory, behaviour, recall]
module: Memory
---

# Memory Recall

The first of the two calls. Before launch, the runner asks the store for what earlier runs learned that is relevant to this run.

> [!quote] `09-memory.md`
> *"**Recall (before launch).** Build the scope union for the run — `user` + the task's `project` + the step's `agent` + the `task` — and `recall({ scopes, query })` where `query` is the assembled task/step context. The hits become a **7th prompt part** … Part 7 is capped at `max_recall_chars` (default 6,000): hits are ranked and the tail is dropped. A map, not an encyclopedia."*

The feature map §21: *"**Start warm, not cold** — Before a step runs, FlowBoard hands the agent the relevant things it has already learned: your standing preferences, this project's conventions, what worked (and what didn't) on earlier tasks. So it isn't re-discovering the same facts run after run. It hands over only the most relevant few, up to a fixed size, so remembering more never means a longer prompt."*

## Steps

| # | Step | Source |
|---|---|---|
| 1 | Skip entirely if the adapter is `none` | PRD §7 (*"With memory off (`none`), the prompt is exactly the six parts above."*) |
| 2 | Build the scope union: user, the task's project, the step's agent/skill, the task | PRD §11.2, `RecallQuery` |
| 3 | Build `query`: *"The assembled task/step context to match against."* | `memory-store.ts` |
| 4 | `recall({ scopes, query })` on the host, plus the optional `limit` | `09`, `03` §6; `limit` from `RecallQuery` in `memory-store.ts` |
| 5 | Rank the hits, drop the tail to fit `max_recall_chars` | PRD §7 |
| 6 | Render them as part 7, labelled background | PRD §7, §11.2 |
| 7 | Optionally record each recalled memory in `run_memories` | PRD §11.2 |

## Inputs and limits

| Input | Value | Source |
|---|---|---|
| Scopes | The union of four, filtered by the *enabled scopes* setting | PRD §11.2, §13 |
| `limit` | *"recall limit"* in settings; no default given | PRD §11.2, §13; `RecallQuery.limit?` |
| `max_recall_chars` | 6,000, *"roughly 1,500 tokens"* | PRD §7 |
| Ranking | Relevance (PRD §7), scope and recency (PRD §11.2, `local`), newest first (feature map) | see #5 |

## Rules

- **Host-side, before `launch()`.** *"Recall (before `launch()`) turns the scope union into a 7th prompt part"* (`01-ports.md`).
- **Capped, never growing the rest.** *"It never grows the other six parts."* (PRD §7). `03` §6: *"truncated to `max_recall_chars` so recall can never become a context dump."*
- **Per run.** Recall happens before each run, so two steps of one task can see different memories. The task-detail aside shows one list per task. See [[Memory Carried Into A Task]] and [[Memory Open Questions]] #9.
- **Audited.** *"the per-run recall set is logged"* (`09`), in `run_memories`.

> [!question] Open
> - **Ranking**: relevance, scope + recency, or newest first? #5
> - **The query**: *"the assembled task/step context"* is a whole prompt's worth of text. How that becomes an FTS5 keyword query is not specified. #7
> - **The agent id** for a skill-only or agent-plus-skill step. #8
> - **Resume**: a parked run resumes with `--resume` and its answers; no source says whether recall runs again. #10
>
> Numbers refer to [[Memory Open Questions]].

## Related

- [[Recalled Memory In The Prompt]]
- [[Memory Scopes]]
- [[Prompt Assembly]]
- [[Memory Lifecycle]]
- [[Memory Index]]
