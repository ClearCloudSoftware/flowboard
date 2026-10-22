---
tags: [flowboard, agent-providers, concept, capabilities]
module: Agent Providers
---

# Provider Capabilities

A provider capability is a flag that says what one CLI can do. *"The engine and flow editor query this BEFORE using a knob, and degrade gracefully when it is absent (capability negotiation)"* (`agent-provider.ts`). Nothing queries the flags yet: see [[Capability Negotiation]]. Not to be confused with a library capability ([[Agent Providers Glossary]]).

## The flags

In the table, `agent-provider.ts` means the port's own comment. The ten original flags read the same in the reference port (`docs/old/reference/core/ports/agent-provider.ts`) and the shipped one (`core/src/ports/agent-provider.ts`). Only the shipped port has `tool_hooks`.

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
| `tool_hooks` | Shipped port: *"enforces `RunSpec.guards` inside the agent"*. PRD §7: *"Hooks are a provider capability (`tool_hooks`)"* | *"a provider without them relies on the sandbox alone, and the flow editor says so"* (PRD §7; the shipped port says the same) |

## Which source lists which

| Flag | `01-ports.md` | reference port | shipped port | PRD §7 |
|---|---|---|---|---|
| `effort`, `sessions`, `resume_fork`, `mcp_tools`, `plugins`, `allowed_tools`, `permission_modes`, `native_cost`, `partial_stream`, `budget_cap` | ✓ | ✓ | ✓ | — |
| `tool_hooks` | ✓ | — | ✓ | ✓ |

> [!check] Implemented 2026-10-18
> The `tool_hooks` drift is closed. The shipped port has the flag, and both real providers declare it and enforce `RunSpec.guards` ([[Agent Providers Open Questions]] #1). The drift line in [[Capability Library Decisions]] (*"`tool_hooks` missing from `agent-provider.ts`"*) is about the reference port.

## Per provider

The Claude Code and OpenCode columns describe the shipped adapters (`adapters/src/agent/claude/`, `adapters/src/agent/opencode/`). A Claude cell names the Agent SDK option, with the CLI flag the SDK turns it into in brackets; PRD §7's flag form is in [[Claude Code Adapter]]. The Codex column is what the design sources say, since Codex is designed, not built; blank means the sources don't say. The ReplayProvider column is its declared set.

| Flag | Claude Code | OpenCode | Codex | ReplayProvider |
|---|---|---|---|---|
| `effort` | `effort` (`--effort`), passed as given | the prompt's `variant`, only when the model has a variant of exactly that name; else dropped | | — |
| `sessions` | `session_id` of the first `system/init`; the adapter passes no `--session-id` | the id from the session create or fork response, emitted as a synthesized `system` event | | ✓ |
| `resume_fork` | `resume` + `forkSession` (`--resume --fork-session`) | `session.fork`, then the run's permission rules are re-applied | risk point (a) of the spike (`01-ports.md`) | — |
| `mcp_tools` | `mcpServers` + `strictMcpConfig` (`--mcp-config --strict-mcp-config`) | config `mcp` (local servers) in `OPENCODE_CONFIG_CONTENT` | *"Claude *and* Codex speak MCP"* (`04` §9) vs *"confirm `ask_user` can be injected"* (`01-ports.md`) | — |
| `plugins` | `plugins: [{ type: 'local', path }]` (`--plugin-dir`); a dir missing from `system/init` fails the run | partly: only `<plugin_dir>/skills` is mounted, as `skills.paths`, and nothing checks that it loaded | *"maybe without `plugins`"* (`06`) | — |
| `allowed_tools` | `allowedTools`, `disallowedTools` (`--allowedTools`, `--disallowedTools`) | session and config permission rules; the last match wins | | — |
| `permission_modes` | `permissionMode` (`--permission-mode`), default `dontAsk` | emulated: permission rules, plus the adapter's reply to each `permission.asked` | approval policy and `--dangerously-bypass-approvals-and-sandbox` (`08`, prior art) | — |
| `native_cost` | `total_cost_usd`, on the result only | the sum of `step-finish` costs, on every `usage` event; 0 for a model with no listed price | *"likely without `native_cost`"* (`06`); *"Codex reports tokens, not dollars"* (`01-ports.md`) | ✓ |
| `partial_stream` | `includePartialMessages` (`--include-partial-messages`): `usage` events mid-turn | partly: one `usage` event per step; text and reasoning deltas are dropped | | ✓ |
| `budget_cap` | `maxBudgetUsd` (`--max-budget-usd`) | enforced by the adapter, which aborts the session past the cap; never trips on a model with no listed price | | — |
| `tool_hooks` | an in-process `PreToolUse` callback (the SDK's `hooks`), registered only when `RunSpec.guards` is set; no `--settings` file | `guard-plugin.ts` (`tool.execute.before`) in config `plugin`, for the agent's tool calls; a guarded run fails if the plugin did not load | | — |

All three sets are now code. `ClaudeCodeProvider` and `OpencodeProvider` declare all eleven flags. `ReplayProvider` declares `new Set(['sessions', 'partial_stream', 'native_cost'])` (`adapters/src/agent/replay/replay-provider.ts`), the same set as the reference. OpenCode honours several flags only in part: `plugins`, `partial_stream` and `budget_cap` as above, `permission_modes` by emulation, and `effort` only by an exact variant name. The capability table in [[Provider SDK Fit Analysis]], written before the build, lists `plugins`, `permission_modes` and `budget_cap` as missing on OpenCode; the shipped provider declares them. [[Agent Providers Open Questions]] #31 asked for the Claude set, and #21 asks whether the replay set should be configurable.

The Claude CLI's own `system/init` line also carries a `capabilities` array (`interrupt_receipt_v1`, `interrupt_cancel_queued_v1`, `msg_lifecycle_v1` in the stream sample). Those are the CLI's protocol features, not FlowBoard's `Capability` flags.

> [!note] No flag for `maxTurns`
> `limits.maxTurns` has no capability, while `maxBudgetUsd` has `budget_cap`. [[Agent Providers Open Questions]] #25. Both built adapters honour it anyway: Claude through `maxTurns`, OpenCode through `steps` on its agents.

## Related

- [[Capability Negotiation]]
- [[AgentProvider Port]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Codex Adapter]]
- [[Replay Provider]]
- [[Provider SDK Fit Analysis]]
