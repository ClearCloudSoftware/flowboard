---
tags: [flowboard, memory, sources]
module: Memory
---

# Memory Sources

Every fact in these notes comes from the files below (paths relative to the repo root). Checked on 2026-10-15 against branch `dev` at `49c7d97`.

## Primary

| File | What it contributes |
|---|---|
| `docs/old/architecture/09-memory.md` | The whole design: the cold-start gap, the port, the scope table (holds / written from / read into), recall then commit, Mem0 mapping, self-hosted vs managed, the trust boundary (injection, poisoning, host-side broker), schema, memory cost, the five recommendations |
| `docs/old/reference/core/ports/memory-store.ts` | `MemoryScope`, `MemoryHit`, `RecallQuery`, `MessageLike`, `WriteInput`, `MemoryStore` with adapter ids; host-side and additive rules in comments; the Mem0-first header |
| `docs/old/PRD.MD` §3, §7, §11.2, §13, §14, §16, §17 | §3 `ports/` and `adapters/memory/ # none, local`; §7 part 7 (placement, label, `max_recall_chars` 6,000) and commit after success; §11.2 the memory layer (adapters, recall, commit, scopes, schema, cost tagging); §13 the settings section; §14 M9; §16 three acceptance checks; §17 Mem0 cloud out of scope, never a precondition. §5 (`settings` table, no memory tables), §8 and §15 (seed steps) used for context |
| `docs/feature-map.md` §21, *Across everything* | Start warm, remember your answers, four kinds, starts simple, sorts itself out, yours on your machine, off until you want it; the ❓ on which scope first; the shared team memory idea; the cross-cutting *Memory across tasks* theme |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: the Memory (Mem0) card group (recall, commit, remembers your answers, host-side broker, D10 self-host vs managed, pays for itself) and its edge to the runner. *Logical components*: Memory (core), MemoryStore (ports), Mem0 memory (adapters), Memory store (stores), run orchestrator edge. *Functional components*: the Memory group and its two inbound edges. *Harness architecture*: `MemoryStore port` card, arrow D to SQLite, Mem0 OSS server (later) on `fb-memory`, SQLite card listing `memories + FTS5`, `run_memories`, `settings (memory, …)`; prompt builder `+7`; cost ledger *"memory cost tagged separately"*; injection scan (later); knowledge assets (later); concepts 2 and 3; life-of-a-step letter D |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/architecture/01-ports.md` | MemoryStore as the sixth, additive port; adapter build order; the port sketch; *"queried by the runner, never from a route"* |
| `docs/old/architecture/03-execution-substrate.md` §6 | The runner brackets `launch()`; recall truncated to `max_recall_chars`; write after success; no-op with `none` |
| `docs/old/architecture/05-environment-and-registry.md` §11 | Artifacts vs memory |
| `docs/old/architecture/06-cost-and-platform.md` §12, §15 | Memory as a wasted-spend lever; the memory bucket and the net; the settings memory block |
| `docs/old/architecture/08-sandboxing.md` | Memory off the egress allowlist; the cross-run trust channel; *"can still poison what a run proposes to remember"* |
| `docs/old/architecture/README.md` | Agentic memory paragraph; module layout `core/memory/`, `adapters/memory/mem0/ local/`; open decision 4, memory posture |
| `docs/old/reference/core/ports/agent-provider.ts` | `PromptParts` has six fields and no part 7 |
| `docs/old/REBUILD-BACKLOG.md` | Absence: no memory epic or story; Stories 3.2, 8.3 and 10.1 omit memory; Story 1.2 puts the `researcher` template out of v1; decisions stop at D9 |
| `docs/mockups/task-detail.html` | The `MEMORY` array and the *carried in from memory* aside block |
| `docs/mockups/task-detail-guide.html` | The aside's *memory* field; region 5, *"what memory it started with"* |
| `docs/mockups/monitor.html` | Sample task `mem0-adapter` and its log |
| `docs/mockups/inbox.html` | `mem0-adapter` rows in `RUNNING`; the absence of a repeats counter |

## Other vault notes relied on

| Note | For |
|---|---|
| [[Memory Carried Into A Task]], [[Task Detail Open Questions]] | The aside's gaps (#26), the egress-failure attempt (#12), decision-number collisions (#33) |
| [[Answers And Memory]], [[Human In The Loop Open Questions]] | The inbox side; undo after commit (#16) |
| [[Memory Cost Accounting]], [[Cost And Control Open Questions]] | The memory bucket and part 7's tokens (#15) |
| [[Prompt Assembly]], [[Runner Pipeline]], [[Execution Open Questions]] | Part 7 placement (#51); commit vs advancement order |
| [[Capability Library Decisions]] | D23 agents per project, D27 agent and skill on one step |

## Not used

`docs/mockups/capability-library*.html`, `flow-designer*.html`, `inbox-guide.html`, `monitor-guide.html` and `docs/mockups/README.md` do not mention agentic memory. `docs/old/architecture/02-core-and-engine.md`, `04-hitl-and-notify.md` and `07-ports-in-practice.md` do not either. Hits on `--memory` in the sandbox docs and `memoryMb` in `exec-host.ts` are the container resource limit, not this component.

## Related

- [[Memory Index]]
- [[Memory Open Questions]]
