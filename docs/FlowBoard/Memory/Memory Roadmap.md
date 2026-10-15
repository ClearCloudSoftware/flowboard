---
tags: [flowboard, memory, roadmap]
module: Memory
---

# Memory Roadmap

## v1 scope (PRD)

**M9 — Memory (optional, additive).** *"The `MemoryStore` port with the `local` SQLite adapter and a `none` no-op (default); Mem0 is a later adapter behind the same port. Recall injects the seventh prompt part before a run; commit writes the run's declared artifacts + answers to the store after a success; both host-side. Off by default; ships last because it depends on runs, questions, and artifacts already existing."* (PRD §14)

| In v1 | Source |
|---|---|
| `MemoryStore` port, `recall` + `write` | PRD §11.2, §14 |
| `none` adapter, the default | PRD §11.2 |
| `local` adapter: `memories` + FTS5 in `flowboard.db` | PRD §11.2 |
| Recall into prompt part 7, capped at `max_recall_chars` | PRD §7 |
| Commit after success, from declared artifacts + answers | PRD §7, §11.2 |
| Four scopes | PRD §11.2 |
| Optional `run_memories` audit | PRD §11.2 |
| Memory section in settings | PRD §13 |
| Memory spend tagged apart | PRD §11.2 |

Acceptance (PRD §16):

- *"With memory enabled, a preference answered in the inbox is recalled into the next task's run and not asked again"*
- *"With memory disabled (`none`), every flow behaves exactly as in M1–M8 — memory is additive, never a precondition"*
- *"Recall and commit happen host-side; a sandboxed run needs no egress-allowlist entry for the memory store"*

> [!warning] Not in the backlog
> `REBUILD-BACKLOG.md` has no memory epic or story. Its epics stop at M8 plus design and acceptance. Story 8.3 (Settings) omits the memory section, Story 3.2's prompt builder has *"six parts"*, and Story 10.1 lists none of the three memory checks above. See [[Memory Open Questions]] #26.

## Designed beyond the PRD

| Design | Source |
|---|---|
| The Mem0 mapping (`user_id`, `agent_id`, `search`, `add`) | `09` |
| The trust boundary: injection and poisoning, with mitigations | `09`, `08` |
| *"Why did it think that?"* trace from `run_memories` | `09` |
| Measuring payoff against wasted spend and inbox repeats | `09`, `06` §12 |
| The net figure on `/costs` | `06` §12, drawio |
| A Mem0 OSS server on `fb-memory`, host-only | drawio *Harness architecture* |
| The *carried in from memory* aside | `task-detail.html` |

## Later

| Item | Source |
|---|---|
| Self-hosted Mem0, *"only once local memory pays off"* | PRD §11.2, `09`, drawio |
| Injection scan (LLM Guard) *"before the next step or memory trusts them"* | drawio *Harness architecture* |
| Knowledge assets as *"maps of the repo"* (repomix, Serena, graphify), a neighbour of project memory | drawio *Harness architecture* |

## Ideas

| Idea | Source |
|---|---|
| **A shared team memory**: *"a team could share a pool of standing decisions and conventions, so a question answered once helps everyone instead of just the person who answered it."* | feature map §21 💡 |
| Memory across tasks as a cross-cutting theme: *"self-hosted, off until you turn it on, and paid for only if it lowers cost"* | feature map *Across everything* |
| Agent/skill memory seen from the library | [[Capability Library Roadmap]] |

The team idea leans on the *Teams & collaboration* foundation (identities, a *who* on every answer) in the feature map's *Across everything*.

## Out of scope

| Item | Source |
|---|---|
| The Mem0 managed cloud: *"the later shared/remote tier, the same decision as a remote workspace"* | PRD §17, `09`, drawio D10 |
| Memory as a precondition for any run | PRD §17 |
| FlowBoard diffing or reconciling memories itself | `09`, PRD §11.2 |
| The sandboxed agent talking to the store | `09`, `08` |

## Related

- [[Memory Open Questions]]
- [[Memory Adapters]]
- [[Memory Index]]
