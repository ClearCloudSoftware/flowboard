---
tags: [flowboard, agent-providers, index]
module: Agent Providers
---

# Agent Providers Index

Agent Providers is the FlowBoard platform component that lets the system drive different AI coding CLIs (Claude Code, Codex, a zero-spend replay double) through one contract: the **AgentProvider** port. The feature map's one-liner: *"The layer that lets FlowBoard drive different AI coding tools (like Claude or Codex) interchangeably."* (feature map §6).

> [!important] The one idea to get right first
> An adapter does **exactly two mappings**: `RunSpec` to the provider's native flags, and the provider's native stream to `NormalizedEvent`. *"Everything else — the flow engine, board projection, cost ledger, HITL protocol, live viewer — consumes only the normalized outputs and never learns which provider ran."* (`agent-provider.ts`). See [[AgentProvider Port]].

> [!check] v1 is Claude-only
> The Capability Library decisions of 2026-10-15 settled v1 as *"Claude-only, with the provider seam kept in the port"* ([[Capability Library Decisions]] D1). The port, the Claude Code adapter and the ReplayProvider are v1; Codex is designed but deferred. See [[Agent Providers Roadmap]].

There is no mockup for this component. It is documented as architecture reference.

## Start here

- [[Agent Providers Overview]] — purpose, place in the system, design principles
- [[Agent Providers Glossary]] — terms, including the overloaded *capability*, *session* and *replay*
- [[AgentProvider Port]] — the interface and its four members

## The contract

- [[Run Spec]] — everything needed to launch one attempt of one step
- [[Agent Run Handle And Result]] — the live handle (`AgentRun`) and what it settles to (`RunResult`)
- [[Normalized Event Envelope]] — the seven event kinds and `Usage`
- [[Provider Capabilities]] — the capability flags, source by source
- [[Logical Model Ids]] — `resolveModel` and the logical-to-native mapping

## Behaviour and rules

- [[Capability Negotiation]] — graceful degradation and the design-time capability contract
- [[Stream Parsing And Normalization]] — native stream in, versioned events out, raw line kept
- [[Session Resume And Context Replay]] — session ids, `--resume --fork-session`, and the fallback
- [[Providers And Sandboxing]] — the ExecHost seam, the permission gate, credentials
- [[Provider Boundary Rules]] — what lives in an adapter, what never leaks into core
- [[Adding A Provider]] — the acceptance test for the whole abstraction

## The adapters

- [[Claude Code Adapter]] — the v1 adapter: flags, fixes, stream-json
- [[Codex Adapter]] — the second real provider, and the spike that validates the port
- [[Replay Provider]] — the reference implementation and zero-spend test double
- [[Agent Client Protocol Option]] — could the port *be* ACP?

## Under the hood

- [[Agent Providers Data Model]] — types and the database columns the port feeds
- [[Agent Providers Runtime]] — where providers live and run, step by step
- [[Agent Providers API And Routes]] — why no route knows the provider
- [[Agent Providers Storage]] — module layout, run snapshots, raw captures

## Content and direction

- [[Agent Providers Defaults And Sample Content]] — seed model and effort values, sample tasks, the replay self-check
- [[Agent Providers Roadmap]] — v1 scope, designed beyond the PRD, ideas, out of scope
- [[Agent Providers Open Questions]] — every place the sources disagree or leave a gap
- [[Agent Providers Sources]] — where every fact in these notes comes from

## Related

- [[Component Documentation Tracker]]
- [[Execution Index]]
- [[Capability Library Index]]
- [[Cost And Control Index]]
