---
tags: [flowboard, agent-providers, decision, acp]
module: Agent Providers
---

# Agent Client Protocol Option

Before the port hardens, the sources ask whether it should be a standard protocol instead of a hand-written parser per vendor.

> *"**First ask whether the port should *be* the Agent Client Protocol (ACP)**, the open protocol for driving coding agents, which has adapters for Claude Code and Codex. If ACP covers session/resume, streaming, permission requests, MCP passthrough and cost, the `AgentProvider` becomes one ACP client plus capability flags, instead of a hand-written parser per vendor. If it doesn't, keep this port and record what ACP lacks. Check its maturity at spike time."* — `01-ports.md`, *Validating the port*

## What ACP would have to cover

| Need | Port today |
|---|---|
| Session / resume | `sessions`, `resume_fork`, `RunSpec.resume` |
| Streaming | `NormalizedEvent`, `partial_stream` |
| Permission requests | `permission_modes`, `toolPolicy` |
| MCP passthrough | `mcp_tools`, `RunSpec.tools` |
| Cost | `native_cost`, `Usage.costUsd` |

(The five needs are `01-ports.md`'s; the right column maps them onto the port.)

## Where it appears

- Architecture README, open decision 2: *"**ACP + Codex spike before the port hardens.** First: could the AgentProvider port *be* the Agent Client Protocol (ACP), with Claude Code and Codex adapters, instead of a parser per vendor?"*
- Feature map §6 ❓: *"check first whether an open standard for driving coding tools (the Agent Client Protocol) could do the translating for us."*
- Drawio *Harness architecture*: *"spike first: could this port be ACP?"*
- [[Capability Library Decisions]], *Deferred*: *"**ACP** (OQ16): re-check pack mounting if the `AgentProvider` port becomes the Agent Client Protocol."*

## Status

Open. No source records the outcome of the spike. [[Agent Providers Open Questions]] #18.

## Related

- [[Codex Adapter]]
- [[AgentProvider Port]]
- [[Agent Providers Roadmap]]
