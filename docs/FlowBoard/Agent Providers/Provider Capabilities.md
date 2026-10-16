---
tags: [flowboard, agent-providers, concept, capabilities]
module: Agent Providers
---

# Provider Capabilities

A provider capability is a flag that says what one CLI can do. *"The engine and flow editor query this BEFORE using a knob, and degrade gracefully when it is absent (capability negotiation)"* (`agent-provider.ts`). Not to be confused with a library capability ([[Agent Providers Glossary]]).

## The flags

| Flag | Meaning (`agent-provider.ts` unless noted) | When absent |
|---|---|---|
| `effort` | — | *"drop the flag; editor greys the field"* |
| `sessions` | *"a stable session id is reported"* | — not stated |
| `resume_fork` | *"supports --resume --fork-session"* | *"fall back to context-replay (re-inject requires/produces + answers)"* |
| `mcp_tools` | *"can inject MCP tool servers"* | *"HITL uses the artifact-file fallback (agent writes questions.json, exits)"* |
| `plugins` | *"can mount CapabilityPacks as plugin dirs"* | a `system_prompt` or `native` mount (`CapabilityPack`) |
| `allowed_tools` | *"tool allow/deny is enforced, not advisory"* | *"tool policy becomes advisory / prompt-level"* (`01-ports.md`) |
| `permission_modes` | *"supports a bypass/ask permission mode"* | — not stated |
| `native_cost` | *"reports cost in USD"* | *"PricingService derives it"* |
| `partial_stream` | *"emits incremental deltas (live token counts) mid-turn"* | — not stated |
| `budget_cap` | *"honours maxBudgetUsd"* | *"it is advisory"* |
| `tool_hooks` | Not in `agent-provider.ts`. PRD §7: *"Hooks are a provider capability (`tool_hooks`)"* | *"a provider without them relies on the sandbox alone, and the flow editor says so"* (PRD §7) |

## Which source lists which

| Flag | `01-ports.md` | `agent-provider.ts` | PRD §7 |
|---|---|---|---|
| `effort`, `sessions`, `resume_fork`, `mcp_tools`, `plugins`, `allowed_tools`, `permission_modes`, `native_cost`, `partial_stream`, `budget_cap` | ✓ | ✓ | — |
| `tool_hooks` | ✓ | — | ✓ |

> [!warning] `tool_hooks` drift
> [[Capability Library Decisions]] lists *"`tool_hooks` missing from `agent-provider.ts`"* as drift still open. [[Agent Providers Open Questions]] #1.

## Per provider

What the sources say, flag by flag. Blank means the sources don't say.

| Flag | Claude Code | Codex | ReplayProvider |
|---|---|---|---|
| `effort` | `--effort` (PRD §7) | | — |
| `sessions` | `--session-id`, `system/init` (PRD §7; `03` §5) | | ✓ |
| `resume_fork` | `--resume --fork-session` (PRD §9) | risk point (a) of the spike (`01-ports.md`) | — |
| `mcp_tools` | `--mcp-config --strict-mcp-config` | *"Claude *and* Codex speak MCP"* (`04` §9) vs *"confirm `ask_user` can be injected"* (`01-ports.md`) | — |
| `plugins` | `--plugin-dir` | *"maybe without `plugins`"* (`06`) | — |
| `allowed_tools` | `--allowedTools` | | — |
| `permission_modes` | `--permission-mode` | approval policy and `--dangerously-bypass-approvals-and-sandbox` (`08`, prior art) | — |
| `native_cost` | `total_cost_usd` (`03` §5) | *"likely without `native_cost`"* (`06`); *"Codex reports tokens, not dollars"* (`01-ports.md`) | ✓ |
| `partial_stream` | `--include-partial-messages` | | ✓ |
| `budget_cap` | `--max-budget-usd` | | — |
| `tool_hooks` | `PreToolUse` hooks via `--settings` (PRD §7) | | — |

Only the ReplayProvider's set is written down as code: `new Set(['sessions', 'partial_stream', 'native_cost'])` (`replay-provider.ts`). No source writes out the Claude adapter's set; the Claude column is **inferred** from the flags PRD §7 and `03` §5 pass ([[Agent Providers Open Questions]] #31). [[Agent Providers Open Questions]] #21 asks whether the replay set should be configurable.

The Claude CLI's own `system/init` line also carries a `capabilities` array (`interrupt_receipt_v1`, `interrupt_cancel_queued_v1`, `msg_lifecycle_v1` in the stream sample). Those are the CLI's protocol features, not FlowBoard's `Capability` flags.

> [!note] No flag for `maxTurns`
> `limits.maxTurns` has no capability, while `maxBudgetUsd` has `budget_cap`. [[Agent Providers Open Questions]] #25.

## Related

- [[Capability Negotiation]]
- [[AgentProvider Port]]
- [[Claude Code Adapter]]
- [[Codex Adapter]]
- [[Replay Provider]]
