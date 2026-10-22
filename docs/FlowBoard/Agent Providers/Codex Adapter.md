---
tags: [flowboard, agent-providers, adapter, codex]
module: Agent Providers
---

# Codex Adapter

> [!info] Design, not built
> Nothing in this note exists on `dev` as of 2026-10-22, apart from `'codex'` in the port's `ProviderId` list. The built providers are [[Claude Code Adapter]] and [[OpenCode Adapter]], plus [[Replay Provider]], a test double.

The planned second real provider, after v1: PRD §3 lists `adapters/agent/` as *"claude-cli, codex-cli (later), replay"*; the drawio *Harness architecture* says *"Codex (later)"*; [[Capability Library Decisions]] D1 makes v1 Claude-only. The build overtook that plan: on 2026-10-18 OpenCode was built as the second real provider instead ([[Provider SDK Fit Analysis]], *Recommendation*). Whether OpenCode is in v1, and whether Codex is still next, is not decided: [[Agent Providers Open Questions]].

## Why it matters

*"The interface is only as good as its second implementation."* (`01-ports.md`). The feature map's ❓: *"Try FlowBoard against a second real tool (Codex) early, to be sure the "swap the AI" design actually holds"* (§6). The drawio *FlowBoard ideation* page: *"Codex adapter spike / Validate AgentProvider against Codex's real CLI before the port hardens."*, with an edge to *"Five ports carry the program"*.

## The spike: three risk points

> *"Either way, spike the **Codex adapter** against three risk points:*
> *(a) session/resume semantics vs Claude's `--resume --fork-session`;*
> *(b) cost — Codex reports tokens, not dollars, so `native_cost` is absent and PricingService is on the critical path;*
> *(c) MCP tool exposure — confirm `ask_user` can be injected, else the artifact-file HITL fallback is mandatory, not optional."* — `01-ports.md`, *Validating the port*

| Risk | If it fails | See |
|---|---|---|
| (a) resume | Context-replay | [[Session Resume And Context Replay]] |
| (b) cost | PricingService prices from a `(codex, model) → rates` row | [[Pricing Service]] |
| (c) MCP | Artifact-file HITL becomes mandatory | [[Capability Negotiation]] |

`04` §9 already asserts *"Claude *and* Codex speak MCP"*, which (c) still asks to confirm: [[Agent Providers Open Questions]] #19.

None of the three has been checked against Codex. The OpenCode build met the same three on 2026-10-18: it forks a session on resume, reports cost per step (0 for a model with no listed price), and takes `ask_user` as an injected MCP server ([[OpenCode Adapter]]).

The architecture README's open decision 2: *"**ACP + Codex spike before the port hardens.** First: could the AgentProvider port *be* the Agent Client Protocol (ACP) … Then validate against Codex's real CLI (session/resume, cost reporting, MCP exposure) before committing the shape."* See [[Agent Client Protocol Option]]. The port was then built by hand on 2026-10-18, after [[Provider SDK Fit Analysis]] found that the Claude and OpenCode SDKs cover every need ACP was meant to cover.

## What the sources expect of it

- `capabilities` *"likely without `native_cost`, maybe without `plugins`"* (`06`).
- Flags: *"For Codex: its own equivalents. All of that lives *inside the adapter*."* (`03` §5).
- Stream: *"Codex's own event format"* parsed into the seven kinds (`01-ports.md`). The shipped port has eight: it added `usage` ([[Agent Providers Open Questions]] #9).
- Cost: *"Codex leaves it absent for PricingService."* (`03` §5); *"Codex reports tokens only, so the same service prices it from a `(provider, model) → rates` table."* (`06` §12).
- Packs: *"Codex-format `CapabilityPack`s for any skills used by flows targeting it"* (`06`).
- Sandbox: Codex has its own OS sandbox, network off by default (`08`). Its credential injection is not described ([[Sandboxing Open Questions]] #28). See [[Providers And Sandboxing]].
- Models: `'reasoning-high' -> … 'o3'` (`agent-provider.ts`).

## In the mockups

- The capability-library mockup's `PROVIDERS` list pairs `claude` with *Claude Code* and `codex` with *Codex CLI*, with *"codex packs for 7 of 17"* in the status bar. The guide: *"Steps name their provider individually — one flow can mix them."* (deferred in v1 by D1).
- The monitor and inbox mockups carry a sample task, `provider-codex` *"Codex CLI behind the AgentProvider seam"*, whose research step asks: *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"* See [[Agent Providers Defaults And Sample Content]].

> [!warning] Is Codex in v1?
> The drawio *Logical components* legend says *"dashed = not in v1"*, and the *Codex CLI* adapter box is drawn solid, like Claude Code. The capability-library mockup also treats Codex as live (Codex packs, a provider filter, the coverage counter). PRD §3, the drawio *Harness architecture* and D1 say later. [[Agent Providers Open Questions]] #17. Since OpenCode was built, the question is also whether Codex is still next: see the same note.

## Related

- [[Adding A Provider]]
- [[Agent Client Protocol Option]]
- [[OpenCode Adapter]]
- [[Provider Coverage And Portability]]
- [[Usage And Native Cost]]
- [[Agent Providers Roadmap]]
