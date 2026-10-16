---
tags: [flowboard, agent-providers, behaviour, architecture]
module: Agent Providers
---

# Provider Boundary Rules

The rules that keep provider knowledge inside the adapter.

## The dependency rule

> *"**Dependency rule for the rebuild:** the domain (flow engine, board projection, question protocol, cost ledger) depends only on **ports**; everything provider-specific is an **adapter** behind one. `core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule. If adding Codex requires touching anything outside `adapters/agent/codex/` plus a couple of capability checks, the abstraction leaked."* — architecture README, *Thesis*

PRD §3 states the package form: *"`packages/core` imports no framework, no database driver and no CLI."* The drawio *FlowBoard ideation* page: *"core/ never imports adapters/ / Only core/ports. Enforce with a lint rule."*

## What the spec leaked, and where it goes

The architecture README: *"Today the spec bleeds adapters into the core: the runner builds `claude` flags inline (§7), the question loop assumes MCP (§9), Slack is named directly (§10), isolation is hardwired to git worktrees (§11)."*

| Leak | Fix | Source |
|---|---|---|
| Runner builds `claude` flags | Flags live in the Claude adapter | `03` §5 |
| `runs.claude_session_id` | Rename to `agent_session_id`; add `runs.provider` | `02` §1 |
| Skills as Claude plugins | `skills` gains `provider` + `format`; a plugin dir is *"one packaging"* | `02` §1; `05` §13 |
| Question loop assumes MCP | `mcp_tools` capability, file fallback | `04` §9 |
| Default model ids | Logical ids | `05` §13 |

## What lives where

| Concern | Lives in | Source |
|---|---|---|
| `RunSpec` → native flags | adapter | `agent-provider.ts` |
| Native stream → `NormalizedEvent` | adapter | `agent-provider.ts` |
| Claude-specific fixes (`--plugin-dir`, `message_delta`, `session_id`, `total_cost_usd`, `mcp__vibe__*`) | Claude adapter | `03` §5 |
| Prompt assembly | runner, provider-neutral | `agent-provider.ts` |
| Draft mode | runner, as a `SpecTransform` | `06` §15 |
| Permission gate, infra-retry classification | runner | `03` §6 |
| Pricing tokens for providers without `native_cost` | `PricingService` | `06` §12 |
| Pack format | registry stores; adapter mounts | `05` §13 |
| Where the process runs | `ExecHost` | `exec-host.ts` |
| Writing the per-run `mcp.json` and hook `settings.json` (Claude-format files) | runner | `03` §6; PRD §9; drawio *Runner* |

> [!warning] Two placements the port does not match
> - The runner writes Claude-format `mcp.json` and `settings.json`, though `03` §5 wants Claude specifics in the adapter. [[Agent Providers Open Questions]] #4.
> - The drawio puts stream parsing in the core's *Run orchestrator* (*Logical components*) and in a separate worker *Stream parser* node (*Harness architecture*), not in the adapter. [[Agent Providers Open Questions]] #34; see [[Stream Parsing And Normalization]].

## Tests of the abstraction

- *"Components 6–8 contain **zero provider strings** once 5 is extracted"* (`03` intro).
- *"If a route ever needs to know whether it's Claude or Codex, something leaked upward."* (`06` §15).
- The worker *"is a **generic executor host** — nothing about it knows the provider."* (`03` §7).
- The four-step checklist in [[Adding A Provider]].
- No source applies these tests to agent calls outside a step. The backlog's import agent (Story 7.3: *"haiku, `--tools ""`"*) is a second Claude invocation; whether it goes through the port is [[Intake And Import Open Questions]] #12.

## Related

- [[Adding A Provider]]
- [[AgentProvider Port]]
- [[Agent Providers Storage]]
- [[Agent Providers API And Routes]]
