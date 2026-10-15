---
tags: [flowboard, memory, storage]
module: Memory
---

# Memory Storage

Where memories physically live, per adapter.

| Adapter | Memories live in | FlowBoard keeps | Source |
|---|---|---|---|
| `none` | nowhere | the settings block | PRD §11.2 |
| `local` | `memories` + FTS5 index in `data/flowboard.db` | that, plus `run_memories` | PRD §11.2, drawio |
| `mem0` | Mem0's *"local vector store + SQLite history"* | settings, `run_memories` | `09` |
| `mem0-cloud` | Mem0's managed platform | settings, `run_memories` | `09`, out of scope (PRD §17) |

## The SQLite file

`data/flowboard.db` (PRD §3). The drawio *Harness architecture* SQLite card lists *"settings (memory, sandbox_profile) · run_memories · memories + FTS5"* and says the file is *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*. PRD §3: *"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does."*

## Mem0, when it comes

*"**Self-hosted OSS is the default** (local vector store + SQLite history) — it keeps FlowBoard local-first: your machine, your repos, your keys, no new service to depend on."* (`09`)

The drawio places a *Mem0 OSS server (later)* container *"on fb-memory, reachable from the host only, never from the sandbox"*. `fb-memory` appears only on that card; no other source defines the network.

## What never leaves the machine

| Rule | Source |
|---|---|
| *"nothing about how you work leaves your laptop"* | feature map §21 |
| *"Self-hosting keeps the whole store local."* | `09` |
| *"memory adds nothing to the sandbox egress allowlist"* | PRD §11.2 |
| Mem0 cloud is the only adapter that sends memories off the machine, and it is out of scope for v1 | PRD §17 |

With `mem0`, the extraction model is called by the Mem0 server, so whatever text it extracts from goes to that model's provider (inferred; no source names the extraction model or its endpoint).

## Backup and lifetime

No source covers backing up, exporting, migrating between adapters (`local` → Mem0), or deleting memories. See [[Memory Open Questions]] #18.

## Related

- [[Memory Data Model]]
- [[Local Memory Adapter]]
- [[Mem0 Adapter]]
- [[Execution Storage]]
- [[Memory Index]]
