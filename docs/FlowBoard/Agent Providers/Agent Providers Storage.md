---
tags: [flowboard, agent-providers, storage]
module: Agent Providers
---

# Agent Providers Storage

## Code layout

| Path | Holds | Source |
|---|---|---|
| `packages/core/ports/` | *"AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource interfaces"* | PRD §3 |
| `packages/core/events.ts` | *"NormalizedEvent, versioned (§7 "Events")"* | PRD §3 |
| `packages/adapters/agent/` | *"claude-cli, codex-cli (later), replay"* | PRD §3 |
| `packages/adapters/exec/` | *"host, docker"* | PRD §3 |
| `adapters/agent/claude/ codex/ replay/` | the architecture's layout | architecture README |
| `docs/old/reference/core/ports/agent-provider.ts`, `events.ts`, `exec-host.ts` | reference port types | `reference/README.md` |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | runnable reference adapter | `reference/README.md` |

Reference files use *"relative imports … so they run with zero config"* and *"`import type` only, so at runtime these depend on nothing but Node builtins"*; *"Avoid TS features that need a transform (e.g. parameter properties, enums) so strip-only runtimes keep working."* (`reference/README.md`)

## Per-run files

| Path | Content | Source |
|---|---|---|
| `data/runs/<id>/args.json` | *"Snapshot the final args"* of the `claude` command | PRD §7; backlog Story 3.2 |
| `data/runs/<id>/spec.json` | The resolved `RunSpec` (idea) | `03` §6 |
| *"raw stream"* next to `spec.json` | *"Run records / data/runs/<id>/spec.json + raw stream, replayable at $0"* | drawio *Harness architecture* |
| per-run `mcp.json` | points the CLI at the ask-user shim | PRD §7, §9 |
| per-run `settings.json` | `PreToolUse` hooks | PRD §7 |
| `data/sock/<run_id>.sock` | the broker socket the shim forwards to | PRD §9 |

`.gitignore` covers `data/runs` (backlog Story 0.3).

## In the database

`run_events.raw` keeps *"the original JSON line"* (PRD §5) so *"a new provider's parser can be debugged against real captures without re-spending"* (`01-ports.md`). See [[Agent Providers Data Model]].

## Captures

| File | Content |
|---|---|
| `docs/old/stream-sample.jsonl` | The PRD §0 probe: 22 `stream-json` lines. PRD §0 names the path `docs/stream-sample.jsonl`. |
| `docs/old/stream-sample.stderr` | Its stderr, empty in this capture |

See [[Stream Parsing And Normalization]].

## Related

- [[Agent Providers Data Model]]
- [[Execution Storage]]
- [[Replay Provider]]
- [[Provider Boundary Rules]]
