---
tags: [flowboard, agent-providers, decision, acp]
module: Agent Providers
---

# Agent Client Protocol Option

Before the port was built, the sources asked whether it should be a standard protocol instead of a hand-written parser per vendor.

> *"**First ask whether the port should *be* the Agent Client Protocol (ACP)**, the open protocol for driving coding agents, which has adapters for Claude Code and Codex. If ACP covers session/resume, streaming, permission requests, MCP passthrough and cost, the `AgentProvider` becomes one ACP client plus capability flags, instead of a hand-written parser per vendor. If it doesn't, keep this port and record what ACP lacks. Check its maturity at spike time."* — `01-ports.md`, *Validating the port*

> [!info] Design, not built
> No ACP code exists on `dev` as of 2026-10-22, and no record of the spike exists. The hand-written port was built instead; see [[#Status]].

## What ACP would have to cover

| Need | Port today |
|---|---|
| Session / resume | `sessions`, `resume_fork`, `RunSpec.resume` |
| Streaming | `NormalizedEvent` (eight kinds, among them running `usage`), `partial_stream` |
| Permission requests | `permission_modes`, `RunSpec.permissionMode`, `toolPolicy` |
| MCP passthrough | `mcp_tools`, `RunSpec.tools` |
| Cost | `native_cost`, `Usage.costUsd` |

(The five needs are `01-ports.md`'s; the right column is this note's mapping onto the port, not a source table: [[Agent Providers Open Questions]] #35. The port is the shipped one, `code/flowboard/packages/core/src/ports/`.)

## Where it appears

- Architecture README, open decision 2: *"**ACP + Codex spike before the port hardens.** First: could the AgentProvider port *be* the Agent Client Protocol (ACP), with Claude Code and Codex adapters, instead of a parser per vendor?"*
- Feature map §6 ❓: *"check first whether an open standard for driving coding tools (the Agent Client Protocol) could do the translating for us."*
- Drawio *Harness architecture*: *"spike first: could this port be ACP?"*
- [[Capability Library Decisions]], *Deferred*: *"**ACP** (OQ16): re-check pack mounting if the `AgentProvider` port becomes the Agent Client Protocol."*

## Status

Deferred, not chosen. [[Provider SDK Fit Analysis]] (2026-10-18) found that the Claude Agent SDK and the OpenCode SDK give typed access to every need in the table above, so the hand-written port stays viable. The branch then built that port, with the [[Claude Code Adapter]] and the [[OpenCode Adapter]] behind it. The OpenCode plan lists ACP as out of scope (`docs/superpowers/plans/2026-10-18-agent-providers-opencode.md`). No ACP spike is recorded, so neither is what ACP lacks, which the quote above asks for. Whether to revisit or drop it is open: [[Agent Providers Open Questions]] #18.

## Related

- [[Provider SDK Fit Analysis]]
- [[Codex Adapter]]
- [[AgentProvider Port]]
- [[Agent Providers Roadmap]]
