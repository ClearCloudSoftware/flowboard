---
tags: [flowboard, agent-providers, roadmap]
module: Agent Providers
---

# Agent Providers Roadmap

## v1 scope

| Item | Source |
|---|---|
| The `AgentProvider` port in `packages/core/ports` | PRD §3 |
| The Claude Code adapter (`claude -p`, stream-json, flags as PRD §7) | PRD §7; M3 in PRD §14 |
| `NormalizedEvent` v1, raw line kept, OTel-named fields | PRD §5, §7 |
| The ReplayProvider / fake-`claude` test lane | backlog Story 0.2; drawio *Test lane* |
| Park and resume via `--resume --fork-session` | PRD §9; M4 |
| Draft mode forcing haiku/low, recording the actual model/effort | PRD §13; backlog 3.2 |
| ExecHost spawning so any provider runs sandboxed | backlog Story 3.5 |
| Claude-only; aliases as logical ids; no provider column | [[Capability Library Decisions]] D1, D20, D23 |

## Designed beyond the PRD

| Item | Source |
|---|---|
| Codex adapter, and the spike against three risk points | `01-ports.md`; `06`; drawio |
| ACP as the port | `01-ports.md`; README open decision 2 |
| Abstract logical ids (`reasoning-high`, `fast-cheap`, `default`) and per-provider resolution tables | `01-ports.md` |
| Capability contract at design time; editor greys unsupported knobs | `01-ports.md`; `02` §2 |
| Provider-format packs and the provider-match check | `05` §13; capability-library mockup |
| `runs.provider`, `runs.agent_session_id` | `02` §1 |
| PricingService rate rows for token-only providers | `06` §12 |
| Snapshot `spec.json` and replay any run through ReplayProvider | `03` §6 |
| A plain OTel exporter to Langfuse | `01-ports.md`; drawio *Langfuse (later)* |
| `StepExecutor` interface, where `agent`/`skill` delegate to a provider | `02` §3 (optional) |

## Ideas

- *"Auto-pick the AI per step"* (feature map, parking lot).
- *"Replay any past run — step through exactly what happened, to debug it after the fact."* (feature map, parking lot).
- *"Run agents in the cloud, not just your laptop"* (feature map, parking lot); the worker as *"a **generic executor host**"* that *"later allows remote executors or a fleet"* (`03` §7).
- Gemini CLI as another adapter (architecture README, five-ports table).
- Feature map §6 *💡 Ideas* is empty.

## Out of scope

- *"anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI."* (PRD §17)
- *"multi-machine support"* (PRD §17).
- A second provider in v1 ([[Capability Library Decisions]] D1).

## Related

- [[Agent Providers Open Questions]]
- [[Codex Adapter]]
- [[Agent Client Protocol Option]]
- [[Execution Roadmap]]
- [[Capability Library Roadmap]]
