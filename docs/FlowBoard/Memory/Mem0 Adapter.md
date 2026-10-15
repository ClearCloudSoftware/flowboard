---
tags: [flowboard, memory, adapter]
module: Memory
---

# Mem0 Adapter

The later adapter. [Mem0](https://github.com/mem0ai/mem0) *"describes itself as a universal memory layer for agents — user / session / agent memory, fact extraction, contradiction resolution, with SDKs, a CLI, self-hosting, and a managed platform."* (`09-memory.md`)

## When

*"Mem0, later and self-hosted. Adopt it only once the cost and inbox views show `local` memory paying off and recall quality is what limits it. Mem0 adds fact extraction and contradiction resolution, at the price of an extraction model's spend and a vector store."* (PRD §11.2)

The feature map §21: *"**It sorts itself out (later)** — Once memory has proven it earns its keep, a drop-in memory layer (Mem0) takes over: a new fact that contradicts an old one replaces it ("now uses vitest, not jest") instead of piling up, so the memory stays true without you curating it."*

## The mapping

| FlowBoard | Mem0 |
|---|---|
| `user` scope | `user_id` |
| `agent` scope | `agent_id` |
| `project`, `task` scopes | *"a `run_id`/session or a metadata namespace"*, undecided |
| `recall` | `search` |
| `write` | `add`, *"which is where extraction + contradiction-resolution live"* |

All from `09-memory.md`: *"The mapping is direct … One adapter method each way."*

## Who owns the data

*"Mem0 owns the memories (vector store + history)."* (`09`). *"With Mem0, Mem0 owns the memories and none of their content is duplicated into SQLite."* (PRD §11.2). FlowBoard keeps only the settings block and `run_memories`.

## Self-hosted vs managed

| | Self-hosted OSS (`mem0`) | Managed platform (`mem0-cloud`) |
|---|---|---|
| Status | The default Mem0 mode | Out of scope for v1 |
| Why | *"it keeps FlowBoard local-first: your machine, your repos, your keys, no new service to depend on"* (`09`) | *"the honest path to the *shared/remote tier* the pitch already flags as a later decision — the same seam, a different adapter id, nothing in core changes"* (`09`) |
| PRD | — | *"The Mem0 *managed cloud* platform is out of scope for v1; it is the later shared/remote tier, the same decision as a remote workspace."* (§17) |
| Drawio | *D10 · Self-host vs managed*: *"Default self-hosted Mem0 (local-first); managed cloud = the later shared/remote tier."* | |

## Deployment, as drawn

The drawio *Harness architecture* page has a dashed Docker-side card: *"Mem0 OSS server (later) — only once local memory pays off · on fb-memory, reachable from the host only, never from the sandbox / its extraction LLM is metered separately"*, reached from the `MemoryStore port` by a dashed *"later"* arrow.

The monitor mockup's sample task `mem0-adapter` (*"Wire the self-hosted memory port behind the seam"*) shows a log of `docker compose up -d mem0` and `✓ mem0 healthy on :8088`. That is sample data, not a design. See [[Memory Defaults And Sample Content]].

## Cost

Its extraction model is the memory layer's main spend. *"its extraction LLM is metered separately"* (drawio). See [[Memory Cost Accounting]].

> [!question] Open
> The `project` / `task` mapping (#23), the deployment (#24), and whether `mem0-cloud` is even a v1 setting (#2). See [[Memory Open Questions]].

## Related

- [[Memory Adapters]]
- [[Contradictions And Freshness]]
- [[Memory Storage]]
- [[Memory Index]]
