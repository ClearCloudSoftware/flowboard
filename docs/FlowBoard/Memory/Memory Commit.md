---
tags: [flowboard, memory, behaviour, commit]
module: Memory
---

# Memory Commit

The second call. After a run succeeds, the runner hands its salient, structured output to `write()`. The drawio calls it *"Distil after a step"*.

> [!quote] PRD §11.2
> *"**Commit, after a run succeeds:** hand the run's salient output — the answers it collected, the outcome it set, the summary/review it produced — to `write()`. With `local`, it is stored as written and recall prefers the newest; with Mem0, Mem0 does the fact extraction and contradiction resolution. FlowBoard never diffs memories by hand. Commit reads from **declared artifacts and answers only**, never raw agent output."*

## What goes in

| Input | Source wording |
|---|---|
| Answers the run collected | *"the answers it collected"* (PRD §11.2) |
| The outcome it set | *"the outcome it set"* (PRD §11.2) |
| Summary / review artifacts | *"the summary/review it produced"* (PRD §11.2); *"the summary/review artifact it produced"* (`09`) |
| Declared artifacts generally | *"Commit reads from **declared artifacts and answers only**"* (PRD §11.2) |
| Provenance | `metadata`: *"runId, stepKey, source artifact type"* (`memory-store.ts`) |

## What never goes in

*"never raw agent output"* (PRD §11.2), *"never from raw agent chatter"* (`09`), *"never the reverse"* (artifacts are never written from memory, `05` §11).

> [!quote] Why — `09-memory.md`
> *"that is both a quality choice (structured > stream-of-consciousness) and a safety one"*

## When

| Rule | Source |
|---|---|
| Only after the run **succeeds** | PRD §7: *"When the memory layer is enabled, after a success the runner also `write()`s the run's salient output (declared artifacts + answers) to `MemoryStore` (§11.2)."* |
| On the host, never in the agent | PRD §11.2, `03` §6, `08` |
| Scoped to the run's own project/agent/task | `09`, `08` |
| Audited: metadata records run and step | `09` |

A run that sets `fail` still succeeded as a run (PRD §7: *"work verdicts arrive as outcomes"*), so a rework's cause can be committed. A run that exits non-zero is an infrastructure failure, and commits nothing.

## Which scope gets what

`09-memory.md` gives each scope its sources:

| Scope | *Written from* |
|---|---|
| `user` | *answered questions (§9), rejections* |
| `project` | *summaries, review notes, research briefs* |
| `agent` | *that agent's own run outputs* |
| `task` | *each run in the task* |

> [!example] Proposal (not in the sources)
> One `write()` per scope per successful run, each with the subset that table names: answers → `user`; `summary`, `review` and `research_brief` artifacts → `project`; the run's declared outputs → `agent`; the outcome and any review → `task`. The sources do not say whether one artifact may go to several scopes, how `user` is told apart from `project` (*"Prefers vitest … for this repo"*), or who writes rejections. See [[Memory Open Questions]] #11, #12.

## Open

| Question | # |
|---|---|
| What content goes to which scope | 11 |
| Rejections are human actions, not runs | 12 |
| Failed runs commit nothing, yet the mockup remembers one | 13 |
| Shell and manual steps | 14 |
| Commit before or after advancement | 15 |
| Undoing an answer after commit | 16 |

Numbers refer to [[Memory Open Questions]].

## Related

- [[Contradictions And Freshness]]
- [[Memory Trust Boundary]]
- [[Answers And Memory]]
- [[Artifacts Versus Memory]]
- [[Memory Index]]
