---
tags: [flowboard, memory, open-questions]
module: Memory
---

# Memory Open Questions

Every place the sources disagree or leave a gap. Nothing here is decided. Where another set already logged the same question, it is linked.

## Adapters and switching on

### 1. Which adapter comes first?

**`local` first:** PRD §11.2 and §14, `01-ports.md`, `09-memory.md` (opening and recommendation 1), the architecture README (*Agentic memory* and open decision 4), feature map §21, drawio *Harness architecture* (*"none (default) · local SQLite FTS5 (first) · mem0 (later)"*, and concept 3 *"local first, Mem0 later"*), PRD §3 (`adapters/memory/ # none, local`).
**Mem0 first or Mem0 only:** the `memory-store.ts` header (*"Mem0 … is the first adapter"*), drawio *FlowBoard ideation* (*"Memory (Mem0)"*, D10), *Logical components* (Mem0 is the only adapter and store) and *Functional components* (*"contradiction resolution (Mem0)"*), `05` §11 (*"extracted and de-duplicated by Mem0"*), `03` §6 (*"the adapter (Mem0)"*), and `09-memory.md`'s own *The port* and *How it maps to Mem0* sections (*"**Self-hosted OSS is the default**"*).
The `local`-first wording reads like a later revision that did not reach every passage (inferred; the sources carry no dates). See [[Memory Adapters]].

### 2. Is Mem0 cloud a v1 option?

PRD §17 puts it out of scope for v1. PRD §13 offers *"Mem0 cloud"* in the settings adapter list, and the port's `id` includes `'mem0-cloud'`. `06` §15 lists only *"`mem0`/`local`/`none`"*. Same as [[Settings And Plumbing Open Questions]] #9.

### 3. Which scopes are on by default?

Feature map §21 ❓: *"Which memory to switch on first — just *your* preferences (the cheapest win), or project memory too?"* `09` and the README recommend `user` first. PRD §11.2 and §13 make scopes a setting with no default. See [[Memory Scopes]].

### 4. Global, per flow, or per step?

The PRD has one global adapter setting. `09` says *"default `none` until the first flow opts in"* and *"`project`/`agent`/`task` per step"*. No flow or step field exists for either. Same as [[Settings And Plumbing Open Questions]] #9; a per-project override is [[Projects Open Questions]] #23. See [[Memory Off By Default]].

## Recall

### 5. How does recall rank?

*"ranked by relevance"* (PRD §7), *"ranked by scope and recency"* (PRD §11.2, `local`), *"recall prefers the newest"* (PRD §11.2, `09`), *"finds them by keyword, newest first"* (feature map §21). `MemoryHit` has both `score` and `updatedAt`. See [[Local Memory Adapter]].

### 6. Where does part 7 go?

Before the closing instruction (PRD §7, `09`) or at the end (PRD §11.2, `03` §6, drawio *"+7"*). `PromptParts` has six fields and no slot. Same as [[Execution Open Questions]] #51 and [[Capability Library Open Questions]] #17. See [[Recalled Memory In The Prompt]].

### 7. What is the query, and what is the limit?

`query` is *"The assembled task/step context to match against"* (`memory-store.ts`). For FTS5 keyword search, a whole prompt is a poor query, and no source says how terms are chosen. The recall `limit` has no default. See [[Memory Recall]].

### 8. Which id is the agent scope?

The scope is *"the step's *agent/skill*"* but the field is `agentId`. Skill-only steps (`grill`, `explain`) and agent-plus-skill steps (`plan`, `implement`, `review`; Capability Library D27) are not covered. Agents are scoped by project (Capability Library D23), so is agent memory per project too? See [[Agent Memory Scope]].

### 9. Per run or per task?

Recall is per run. The task-detail aside shows one *carried in from memory* list per task, without an `agent` line, and one of its lines was written mid-task. Same as [[Task Detail Open Questions]] #26. See [[Memory Carried Into A Task]].

### 10. Recall on resume?

A parked run resumes with `--resume` and the answers. No source says whether recall runs again, or whether part 7 is repeated in the resume prompt.

## Commit

### 11. What is written to which scope?

`write()` takes one scope. `09` lists each scope's sources (answers and rejections → `user`; summaries, review notes, research briefs → `project`; the agent's outputs → `agent`; each run → `task`) but not how one run's output is split. `09` and `08` say a run writes *"its own project/agent/task"*, leaving `user` out. The mockup's `you` line is about *"this repo"*. A split is proposed in [[Memory Commit]].

### 12. Who writes rejections?

Feature map §21 and `09` put rejections into memory. Commit happens *"after a run succeeds"*. A rejection is a human decision at a gate, after the run. No source says when or how it is written.

### 13. Should failed runs leave a memory?

Only successes commit (PRD §7, §11.2). The mockup's task memory *"Attempt 1 died on an egress denial"* describes an infrastructure failure, which is a failed run and commits nothing. Related: [[Task Detail Open Questions]] #12.

### 14. Shell and manual steps

A shell step's run has no answers and one artifact, `check_output`. PRD §7 reads two ways on a non-zero exit. Its *Completion* rule says *"On non-zero exit, set `failed`"*, which would rule out a commit. Its *Shell steps* paragraph says *"A non-zero exit here is a result, not a run failure"*, with outcome `fail`, which would allow one. Which run state a failing check records is [[Execution Open Questions]] #57. Either way, no source says whether a shell run commits at all. Manual steps have no run. Not stated.

### 15. Commit before or after advancement?

Both follow a success; the order is not stated. Logged in [[Runner Pipeline]]. If advancement starts the next run first, that run cannot recall what was just learned (inferred). Parallel branches (`implement` ∥ `tests`) both commit to the same task scope, with no ordering rule between them either. See [[Task Memory Scope]].

### 16. Undo after commit

An answer undone after commit stays in memory. Same as [[Human In The Loop Open Questions]] #16. See [[Answers And Memory]].

### 17. Research briefs and third-party content

`09` says recalled memory is *"never third-party content promoted to "fact""*, but project memory is written from *"research briefs"*, which summarise web content. See [[Memory Trust Boundary]].

## Lifetime and visibility

### 18. Forgetting, editing, retention

No source covers deleting, editing, expiring or exporting memories; what happens to task memories after the task ends or to project memories when a project is removed; or migrating from `local` to Mem0. Under `local`, stale facts are only outranked, never removed. Project deletion, which would leave `memories` rows behind (no foreign key), is [[Projects Open Questions]] #9. See [[Contradictions And Freshness]].

### 19. No way to see memories

No screen, route or mockup lists memories, and the *"why did it think that?"* trace has no UI. Nothing shows whether memory is on, and nothing says what the task-detail aside shows when it is off ([[Task Detail Open Questions]] #26). Routes are proposed in [[Memory API And Routes]], which also notes that `01-ports.md` forbids routes from calling the port.

## Schema and storage

### 20. The `memories` table

PRD §11.2 gives five columns and no id, metadata or `updated_at`, while `MemoryHit` returns `id` and `updatedAt` and `WriteInput.metadata` carries `stepKey` and the artifact type. Neither table is in PRD §5. A DDL is proposed in [[Memory Data Model]].

### 21. The settings block

`settings` is key–value (PRD §5). PRD §7's `settings.memory.max_recall_chars` implies a nested block. PRD §13 and `06` §15 omit `max_recall_chars` from the field list. A JSON row is proposed in [[Memory Settings]]. Same as [[Settings And Plumbing Open Questions]] #5.

### 22. The memory bucket, and part 7's tokens

No source gives the bucket storage. Part 7's tokens are billed inside the run (inferred), so the *net* figure may never see them. Same as [[Cost And Control Open Questions]] #15. See [[Memory Cost Accounting]].

### 23. Mem0 mapping of `project` and `task`

*"a `run_id`/session or a metadata namespace"* (`09`): two options, no choice.

### 24. Mem0 deployment

The drawio places it on `fb-memory`, host-only. The monitor sample shows `docker compose up -d mem0` on `:8088`. No source names the extraction model, its endpoint, or how its spend is captured. See [[Mem0 Adapter]].

## Measurement

### 25. The inbox-repeats meter

`09` says wasted spend and inbox repeats *"both already have meters (§12, the inbox)"*. The inbox mockup has *answered today* and *from chat*, but nothing that counts repeats, and no rule defines a repeat. *"Baseline before enabling, compare after"* (`09`) gives no baseline period, comparison window or threshold. See [[Measuring Memory Payoff]].

## Source drift

### 26. The backlog has no memory work

No M9 epic, no memory section in Story 8.3, no part 7 in Story 3.2, none of the three PRD §16 memory checks in Story 10.1. See [[Memory Roadmap]].

### 27. Paths, numbers and edges

- PRD §11.2 and `memory-store.ts` cite `docs/architecture/09-memory.md`; the file is `docs/old/architecture/09-memory.md`.
- The architecture README's component index numbers memory **#16** (*"Agentic memory → MemoryStore port (additive)"*), but `09-memory.md` itself has no numbered section, unlike components 1–15 in `02`–`06`.
- The drawio *D10 · Self-host vs managed* shares its number with Capability Library D10 and has no backlog row (backlog decisions stop at D9). Same as [[Task Detail Open Questions]] #33.
- The drawio *Functional components* page draws *Execution → Memory* and *Human in the loop → Memory*, but no edge for recall back into execution.
- `09`'s scope table reads `user` into *"every run's prompt preamble"*; everything else puts recalled memory in part 7, not part 1.
- PRD §7 puts its only commit sentence (*"after a success the runner also `write()`s …"*) at the end of the *"Anything else … `blocked`"* failure bullet, not with the success path. See [[Memory Commit]].

### 28. When memory itself fails

No source says what happens when recall or commit fails (store down, FTS error, Mem0 timeout). *"never on the critical path of a run"* (PRD §11.2) suggests the run goes ahead without memory, and a failed commit doesn't fail the run (inferred). Nothing says whether either is logged, retried, or shown. See [[Memory Off By Default]].

### 29. Building the adapter, and settings changes

Settings name the adapter (PRD §13). No source says how the worker constructs it, or whether a change to the memory block reaches a worker that is already running or a run already queued. The general question is [[Settings And Plumbing Open Questions]] #10. See [[Memory Runtime]].

## Related

- [[Memory Roadmap]]
- [[Memory Sources]]
- [[Memory Index]]
