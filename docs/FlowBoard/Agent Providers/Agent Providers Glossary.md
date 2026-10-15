---
tags: [flowboard, agent-providers, glossary]
module: Agent Providers
---

# Agent Providers Glossary

> [!warning] Overloaded words
> - **Capability** means three different things. (1) A **provider capability**: a flag such as `effort` or `native_cost` that says what a CLI can do ([[Provider Capabilities]]). (2) A **library capability**: the logical thing a step asks for, such as `code-review` ([[Capability Versus Provider Pack]]). (3) The `CapabilityPack` on `RunSpec.capabilities`, one packaging of a library capability. In container hardening, *"Drop capabilities: `--cap-drop ALL`"* (`08-sandboxing.md`) is a fourth, Linux kernel meaning, and the `capabilities` array on Claude's `system/init` line (`interrupt_receipt_v1` …, `stream-sample.jsonl`) a fifth. These notes always qualify the word.
> - **Replay** means four things. The **ReplayProvider** adapter ([[Replay Provider]]), which the feature map's *"Replay any past run"* idea would reuse; **context-replay**, the park/resume fallback that re-injects requires, produces and answers into a fresh prompt (the README's and drawio's *"prompt replay"*; [[Session Resume And Context Replay]]); SSE **replay** from `Last-Event-ID` ([[Event Stream And SSE]]); and Slack's *"300s replay window"* (`04` §10), which has nothing to do with providers.
> - **Session** is both the provider's own conversation id (`sessionId`, `runs.claude_session_id`) and, in the UI, the *live session viewer* at `/runs/[id]`.
> - **Model** is either a **logical id** (`reasoning-high`, or a Claude alias in v1) or a **native id** (`o3`, the `claude-fable-5-1` reported in the stream sample). `opus` / `sonnet` / `haiku` are Claude aliases (PRD §5), though `resolveModel`'s doc comment shows `opus` on the native side (`'reasoning-high' -> 'opus' | 'o3'`). See [[Logical Model Ids]].
> - **Provider** in the drawio *Harness architecture* also appears in *"Egress proxy … injects the real API key"*, where the "provider" is the model vendor's API, not the adapter.

| Term | Meaning | Source |
|---|---|---|
| **AgentProvider** | The port that *"makes coding-agent CLIs interchangeable"*; members `id`, `capabilities`, `resolveModel`, `launch` | `agent-provider.ts` |
| **Adapter** | An implementation of a port. Agent adapters live under `adapters/agent/<claude\|codex\|replay>/` | `agent-provider.ts`; architecture README |
| **Provider id** | `ProviderId = 'claude-code' \| 'codex' \| 'replay' \| (string & {})` — *"keeps autocomplete without closing the set"* | `agent-provider.ts` |
| **RunSpec** | *"Everything needed to launch one attempt of one step, provider-agnostically."* | `agent-provider.ts` |
| **PromptParts** | The six-part prompt, *"passed structured rather than pre-flattened"* | `agent-provider.ts`; PRD §7 |
| **AgentRun** | *"A live handle on one running attempt"*: `sessionId`, `pid`, `events`, `result`, `stop()` | `agent-provider.ts` |
| **RunResult** | `{ usage, exitCode, outcome?, error? }`, settled on process exit | `agent-provider.ts` |
| **NormalizedEvent** | One of seven event kinds every adapter emits: `assistant_text`, `thinking`, `tool_use`, `tool_result`, `system`, `result`, `error` | `events.ts`; `01-ports.md` |
| **Usage** | Token counts, turns and optional `costUsd` | `events.ts` |
| **Capability negotiation** | Querying `capabilities` *"before using a knob"* and degrading when absent | `01-ports.md` |
| **Capability contract** | The design-time check that *"every knob a step uses is supported by its target provider"* | `02` §2 |
| **Logical model id** | A provider-neutral model name a step references, resolved per provider | `01-ports.md` |
| **resolveModel** | *"Map a logical model id to this provider's native id, e.g. 'reasoning-high' -> 'opus' \| 'o3'."* | `agent-provider.ts` |
| **Effort** | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`; *"Dropped by the adapter when `effort` is unsupported"* (`agent-provider.ts`), *"dropped if unsupported"* (`01-ports.md`) | `agent-provider.ts`; `01-ports.md` |
| **ToolServer** | *"An MCP tool server to inject (e.g. the ask-user server). Used only when `mcp_tools` is present."* | `agent-provider.ts` |
| **CapabilityPack** | *"A mountable capability (a "skill"/plugin, generalized)"*; `mount` is `plugin_dir`, `system_prompt` or `native` | `agent-provider.ts` |
| **ExecHost** | *"WHERE a process runs, decoupled from WHICH agent runs it."* | `exec-host.ts` |
| **ReplayProvider** | *"an AgentProvider that replays a scripted event stream. Zero spend, deterministic."* | `replay-provider.ts` |
| **ReplayScript** | `{ events, sessionId?, pid?, streamDelayMs? }`, the replay adapter's input | `replay-provider.ts` |
| **Context-replay** | The fallback when `resume_fork` is missing: *"re-inject requires/produces + answers into a fresh prompt"* | `01-ports.md` |
| **stream-json** | Claude Code's newline-delimited JSON output (`--output-format stream-json`) | PRD §0, §7 |
| **Stream sample** | `docs/stream-sample.jsonl`, the captured probe the Claude parser is written against | PRD §0; now at `docs/old/stream-sample.jsonl` |
| **ACP** | The Agent Client Protocol, *"the open protocol for driving coding agents"* | `01-ports.md` |
| **PricingService** | `price(provider, model, usage) → costUsd`; closes the gap for providers without `native_cost` | `06` §12 |
| **SpecTransform** | `(spec: RunSpec) => RunSpec`, a pure function applied before `launch()`; draft mode is one | `06` §15 |
| **Composition root** | Where the concrete provider is constructed; *"Swapping Claude for Codex means constructing a different `provider` in the composition root and nothing here changes."* | `07` |
| **OTel GenAI conventions** | The field-naming standard the event envelope follows *"where one exists (model, token usage, tool name)"* | `01-ports.md`; PRD §7 |

## Related

- [[Agent Providers Index]]
- [[Agent Providers Overview]]
- [[Execution Glossary]]
- [[Capability Library Glossary]]
