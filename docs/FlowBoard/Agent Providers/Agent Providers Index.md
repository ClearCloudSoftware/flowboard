---
tags: [flowboard, agent-providers, index]
module: Agent Providers
---

# Agent Providers Index

Agent Providers is the FlowBoard platform component that lets the system drive different AI coding CLIs through one contract: the **AgentProvider** port. Two real providers are built, Claude Code and OpenCode, plus Replay, a zero-spend test double. A Codex adapter is designed but not built. The feature map's one-liner: *"The layer that lets FlowBoard drive different AI coding tools (like Claude or Codex) interchangeably."* (feature map §6).

> [!important] The one idea to get right first
> An adapter does **exactly two mappings**: `RunSpec` to the provider's native flags, and the provider's native stream to `NormalizedEvent`. *"Everything else — the flow engine, board projection, cost ledger, HITL protocol, live viewer — consumes only the normalized outputs and never learns which provider ran."* (`core/src/ports/agent-provider.ts`). See [[AgentProvider Port]].

> [!check] Implemented 2026-10-18
> The port, both providers, Replay and the `run-agent` command were built on 2026-10-18 in `code/flowboard/packages/` (`core`, `adapters`, `ask-user`, `cli`). They were fixed on 2026-10-22 after the [[Agent Providers Docs Audit]]. The runner, the database, the routes and capability negotiation are not built; the entries marked *design* below describe them.

> [!question] v1 was planned Claude-only
> The plan: the Capability Library decisions of 2026-10-15 summarise v1 as *"Claude-only, with the provider seam kept in the port"* ([[Capability Library Decisions]], *v1 in one paragraph*); D1 reads *"**v1 is Claude-only.**"* PRD §3 lists `adapters/agent/` as *"claude-cli, codex-cli (later), replay"*, so Codex was to come second.
>
> The build went further: on 2026-10-18 the OpenCode adapter was built as the second real provider. Whether OpenCode is in v1, and whether Codex is still next, is not decided. See [[Agent Providers Open Questions]] and [[Agent Providers Roadmap]].

There is no mockup for this component. It is documented as architecture reference.

## Start here

- [[Agent Providers Overview]] — purpose, place in the system, design principles, and what is built
- [[Agent Providers Glossary]] — terms, including the overloaded *capability*, *session* and *replay*
- [[AgentProvider Port]] — the interface and its four members

## The contract

- [[Run Spec]] — everything needed to launch one attempt of one step
- [[Agent Run Handle And Result]] — the live handle (`AgentRun`) and what it settles to (`RunResult`)
- [[Normalized Event Envelope]] — the eight event kinds and `Usage`
- [[Provider Capabilities]] — the capability flags, source by source
- [[Logical Model Ids]] — `resolveModel` and the logical-to-native mapping

## Behaviour and rules

- [[Capability Negotiation]] — graceful degradation and the design-time capability contract (design: nothing reads a provider's `capabilities` yet)
- [[Stream Parsing And Normalization]] — SDK messages and server events in, normalized events out, the native message kept as `raw`
- [[Session Resume And Context Replay]] — session ids, resume and fork, and the context-replay fallback (the fallback is design)
- [[Providers And Sandboxing]] — the ExecHost seam, the permission gate, credentials (only the host tier is built)
- [[Provider Boundary Rules]] — what lives in an adapter, what never leaks into core
- [[Adding A Provider]] — the acceptance test for the whole abstraction

## The adapters

- [[Claude Code Adapter]] — the first real provider, on the Claude Agent SDK driving the installed `claude` CLI; also the PRD's flags and Claude-specific fixes
- [[OpenCode Adapter]] — the second real provider: a per-run opencode server, non-Claude models
- [[Codex Adapter]] — design, not built: the planned second provider, and the spike that validates the port
- [[Replay Provider]] — the reference implementation and zero-spend test double
- [[Agent Client Protocol Option]] — could the port *be* ACP? (design)
- [[Provider SDK Fit Analysis]] — can the Claude Agent SDK and the OpenCode SDK implement the port?
- [[Provider Implementation Decisions]] — the calls made while building both providers, and the review findings left for later

## Running a provider today

- [[Run Agent CLI Decisions]] — `pnpm run-agent <task.yaml>`: one YAML file runs either provider; the calls made and the issues left for later
- [[Run Config Reference]] — every field of the `run-agent` YAML file: type, default, checks, and how it behaves on each adapter
- [[Testing The Run Agent CLI]] — how to test the providers and `run-agent`: the free suite, the live tests, and hand-run scenarios

## Under the hood

- [[Agent Providers Data Model]] — types and the database columns the port feeds (the database is design)
- [[Agent Providers Runtime]] — where providers live and run, step by step (design)
- [[Agent Providers API And Routes]] — why no route knows the provider (design: no route exists)
- [[Agent Providers Storage]] — module layout, run snapshots, raw captures (design; `run-agent` logs each run to `runs/*.jsonl`)

## Content and direction

- [[Agent Providers Defaults And Sample Content]] — the defaults in the code and in the design, seed models, sample tasks and recorded streams
- [[Agent Providers Roadmap]] — the v1 plan, what was built when, ideas, out of scope
- [[Agent Providers Open Questions]] — every place the sources disagree or leave a gap
- [[Agent Providers Sources]] — where every fact in these notes comes from: the design sources, the code, the plans and specs

## Related

- [[Component Documentation Tracker]]
- [[Execution Index]]
- [[Capability Library Index]]
- [[Cost And Control Index]]
