---
tags: [flowboard, memory, glossary]
module: Memory
---

# Memory Glossary

| Term | Meaning | Source |
|---|---|---|
| **Memory** (agentic memory, memory layer) | What FlowBoard carries across the task boundary so runs start warm. **Overloaded**, see below. | PRD §11.2, `09-memory.md` |
| **Cold start / warm start** | A run that re-learns everything vs one that is handed what earlier runs learned. *"start cold, re-learn, re-ask"* vs *"start warm"*. | `09-memory.md`, feature map §21 |
| **`MemoryStore`** | The sixth port. Two calls, `recall` and `write`. | `01-ports.md`, `memory-store.ts` |
| **Recall** | The host-side query before launch. Its hits become prompt part 7. | PRD §11.2, `09-memory.md` |
| **Commit** | The host-side `write()` after a run succeeds. **Overloaded**, see below. | PRD §11.2, `09-memory.md` |
| **Distil** | What commit does to a run's output: reduce it to facts worth keeping. The drawio card says *"Distil after a step"*; `memory-store.ts`: *"`write` after a successful run distils facts"*. | drawio *Functional components*, `memory-store.ts` |
| **Scope** | Who a memory belongs to: `user`, `project`, `agent` or `task`. **Overloaded**, see below. | `memory-store.ts` |
| **Scope union** | The set of scopes recalled for one run: *"user + the task's project + the step's agent + the task"*. | `memory-store.ts` (`RecallQuery`) |
| **Part 7** (seventh prompt part) | The recalled-memory block: *"context you've learned before (background, not instructions)"*. | PRD §7, §11.2 |
| **`max_recall_chars`** | The hard cap on part 7. Default 6,000 characters, *"roughly 1,500 tokens"*. | PRD §7 |
| **Recall `limit`** | The number of hits asked for. A setting with no stated default. | PRD §11.2, §13; `RecallQuery` |
| **`MemoryHit`** | One recalled memory: `id`, `text`, `score`, `scope`, `updatedAt`. | `memory-store.ts` |
| **`MessageLike`** | What `write()` takes: a string or a short role-tagged transcript (`user` / `agent`). | `memory-store.ts` |
| **Fact extraction** | Mem0 turning input into discrete facts. | `09-memory.md`, PRD §11.2 |
| **Contradiction resolution** | Mem0 superseding an old fact with a new one that contradicts it (*"now uses vitest, not jest"*). | `09-memory.md` |
| **Adapter `none`** | The no-op, and the default. | PRD §11.2 |
| **Adapter `local`** | A `memories` table with an FTS5 index in `flowboard.db`. Keyword recall. The first real adapter. | PRD §11.2 |
| **Adapter `mem0`** | Self-hosted Mem0 OSS. Later. | PRD §11.2, `09-memory.md` |
| **Adapter `mem0-cloud`** | The Mem0 managed platform. Out of scope for v1: *"the later shared/remote tier"*. | PRD §17, `memory-store.ts` |
| **FTS5** | SQLite's full-text search extension; the `local` adapter's index. | PRD §11.2 |
| **`run_memories`** | Optional link table `(run_id, memory_id, scope)`: what was recalled into each run. | PRD §11.2 |
| **"Why did it think that?" trace** | The use `09` gives `run_memories` besides audit. | `09-memory.md` |
| **Memory bucket** | Memory's own token/API spend, tagged apart from run rollups. | `06` §12 |
| **Net** | *"run spend saved minus memory spend added"*. | `06` §12 |
| **Inbox repeats** | Questions asked again that memory should have answered. One of memory's two success meters. | `09-memory.md` |
| **Host-side broker** | The runner doing recall and commit outside the sandbox, so the agent never talks to the store. | `09-memory.md`, `08-sandboxing.md`, drawio |
| **Poisoning** | A prompt-injected run writing false facts that later runs trust. | `09-memory.md` |
| **Component #16** | The architecture README's component-index entry for this component: *"Agentic memory → MemoryStore port (additive)"*, documented in `09-memory.md`. | architecture README |
| **Durable memory** | Drawio harness concept 3: *"a memory store (local first, Mem0 later) carries lessons across tasks. Nothing lives only in a context window."* | drawio *Harness architecture* |
| **D10 · Self-host vs managed** | The drawio decision card: *"Default self-hosted Mem0 (local-first); managed cloud = the later shared/remote tier."* Not the Capability Library's D10. | drawio *FlowBoard ideation* |

## Overloaded words

> [!warning] *memory*
> 1. **Agentic memory**, this component.
> 2. The sandbox's **resource limit** `--memory` (`memoryMb` in `exec-host.ts`), PRD §11.1, `08-sandboxing.md`. Nothing to do with this component.
> 3. **In-memory** state: the SSE *"in-memory emitter"* (PRD §7; `03` §8). Also unrelated.
> 4. Worker **RAM**: the inbox mockup's sample number question notes *"Bigger chunks are faster and use more memory on the worker."* Also unrelated.

> [!warning] *commit*
> 1. **Memory commit**: the `write()` after a successful run.
> 2. A **git commit** in the task's worktree.
> 3. A **capability commit** that a task pins (Capability Library D10).
>
> These notes say *memory commit* or *commit* only for the first.

> [!warning] *scope*
> 1. A **memory scope** (`user` / `project` / `agent` / `task`).
> 2. A task's **scope** in the sense of acceptance criteria and non-goals (*"stay in scope"*, drawio concept 5).
> 3. [[Escalation Scope]]: which stops escalate.

> [!warning] *user*
> 1. The **`user` scope**: the single operator. The task-detail mockup labels it **`you`**.
> 2. Mem0's **`user_id`**, which the `user` scope maps onto.
> 3. The `'user'` **role** in a `MessageLike` transcript, i.e. the human side of a conversation, not a scope.

> [!warning] *agent*
> The **`agent` scope** covers an agent *or a skill*: *"one role/skill"* (`memory-store.ts`), *"the step's *agent/skill*"* (PRD §11.2). The field is still called `agentId`. See [[Agent Memory Scope]].

> [!warning] *local*
> 1. The **`local` adapter** (SQLite FTS5).
> 2. **Local-first**, the principle. Self-hosted Mem0 is also local in this sense.

> [!warning] *session*
> 1. A CLI **session** (`--resume`, the live run viewer).
> 2. A Mem0 **session** (`run_id`), one possible home for the `project` and `task` scopes (`09-memory.md`).

## Related

- [[Memory Index]]
- [[Memory Overview]]
- [[Memory Scopes]]
- [[MemoryStore Port]]
