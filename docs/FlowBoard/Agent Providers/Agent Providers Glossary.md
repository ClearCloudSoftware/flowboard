---
tags: [flowboard, agent-providers, glossary]
module: Agent Providers
---

# Agent Providers Glossary

> [!warning] Overloaded words
> - **Capability** means five things: three in FlowBoard's own vocabulary, plus two outside it. (1) A **provider capability**: a flag such as `effort` or `native_cost` that says what a CLI can do ([[Provider Capabilities]]). (2) A **library capability**: the logical thing a step asks for, such as `code-review` ([[Capability Versus Provider Pack]]). (3) The `CapabilityPack` on `RunSpec.capabilities`, one packaging of a library capability. In container hardening, *"Drop capabilities: `--cap-drop ALL`"* (`08-sandboxing.md`) is a fourth, Linux kernel meaning, and the `capabilities` array on Claude's `system/init` line (`interrupt_receipt_v1` …, `stream-sample.jsonl`) a fifth. These notes always qualify the word.
> - **Replay** means four things. The **ReplayProvider** adapter ([[Replay Provider]]), which the feature map's *"Replay any past run"* idea would reuse; **context-replay**, the park/resume fallback that re-injects requires, produces and answers into a fresh prompt (the README's and drawio's *"prompt replay"*; [[Session Resume And Context Replay]]); SSE **replay** from `Last-Event-ID` ([[Event Stream And SSE]]); and Slack's *"300s replay window"* (`04` §10), which has nothing to do with providers.
> - **Session** is both the provider's own conversation id (`sessionId`, `runs.claude_session_id`) and, in the UI, the *live session viewer* at `/runs/[id]`.
> - **Model** is either a **logical id** (`reasoning-high` in the design; as built, a Claude alias or an OpenCode `providerID/modelID`) or a **native id** (`o3`, the `claude-fable-5-1` reported in the stream sample). PRD §5 calls `sonnet` *"a Claude alias"*, so by extension `opus` and `haiku` are too, though `resolveModel`'s doc comment shows `opus` on the native side (`'reasoning-high' -> 'opus' | 'o3'`). See [[Logical Model Ids]].

In the *Source* column, `agent-provider.ts`, `events.ts`, `exec-host.ts` and `replay-provider.ts` are the shipped files in `code/flowboard/packages/` (`core/src/ports/` and `adapters/src/agent/replay/`), not the reference port in `docs/old/reference/`.

| Term | Meaning | Source |
|---|---|---|
| **AgentProvider** | The port that *"makes coding-agent CLIs interchangeable"*; members `id`, `capabilities`, `resolveModel`, `launch`. See [[AgentProvider Port]] | `agent-provider.ts` |
| **Adapter** | An implementation of a port. Agent adapters live under `adapters/src/agent/<claude\|opencode\|replay>/`; Codex has none yet | `agent-provider.ts`; architecture README |
| **Provider id** | `ProviderId = 'claude-code' \| 'codex' \| 'opencode' \| 'replay' \| (string & {})` — *"keeps autocomplete without closing the set"* | `agent-provider.ts` |
| **RunSpec** | *"Everything needed to launch one attempt of one step, provider-agnostically."* See [[Run Spec]] | `agent-provider.ts` |
| **PromptParts** | The six-part prompt, *"passed structured rather than pre-flattened"* | `agent-provider.ts`; PRD §7 |
| **AgentRun** | *"A live handle on one running attempt"*: `sessionId`, `pid` (a promise), `events`, `result`, `stop()`. See [[Agent Run Handle And Result]] | `agent-provider.ts` |
| **RunResult** | `{ usage, exitCode, outcome?, error? }`, settled when the run is over and its process has exited; a set `error` means failed, even at exit 0 | `agent-provider.ts` |
| **NormalizedEvent** | One of eight event kinds every adapter emits: `assistant_text`, `thinking`, `tool_use`, `tool_result`, `system`, `usage`, `result`, `error`, each with an optional `raw`. `01-ports.md` has the first seven. See [[Normalized Event Envelope]] | `events.ts`; `01-ports.md` |
| **Usage** | Token counts, the main agent's turns and an optional `costUsd` | `events.ts` |
| **`usage` event** | The eighth kind: the run's running totals, emitted mid-run (Claude on `message_start` and `message_delta`, OpenCode on each step). Claude's carry no `costUsd` | `events.ts` |
| **Capability negotiation** | Querying `capabilities` *"before using a knob"* and degrading when absent. Design: nothing reads `capabilities` yet | `01-ports.md` |
| **Capability contract** | The design-time check that *"every knob a step uses is supported by its target provider"*. Design, not built | `02` §2 |
| **Logical model id** | A provider-neutral model name a step references, resolved per provider | `01-ports.md` |
| **resolveModel** | *"Map a logical model id to this provider's native id, e.g. 'reasoning-high' -> 'opus' \| 'o3'."* | `agent-provider.ts` |
| **Effort** | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`; *"Dropped by the adapter when `effort` is unsupported"* (`agent-provider.ts`), *"dropped if unsupported"* (`01-ports.md`) | `agent-provider.ts`; `01-ports.md` |
| **ToolServer** | *"An MCP tool server to inject (e.g. the ask-user server). Used only when `mcp_tools` is present."* | `agent-provider.ts` |
| **CapabilityPack** | *"A mountable capability (a "skill"/plugin, generalized)"*; `mount` is `plugin_dir`, `system_prompt` or `native` | `agent-provider.ts` |
| **GuardRules** | `RunSpec.guards`: `writeRoots`, `denyPaths?`, `denyCommands?`, provider-neutral rules that an adapter with `tool_hooks` checks on every tool call. See [[Run Spec]] (Guards) | `agent-provider.ts`; `core/src/guard.ts` |
| **PermissionMode** | `RunSpec.permissionMode`, in Claude Code's vocabulary: `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`. OpenCode emulates them. Adapters default to `dontAsk`, `run-agent` to `acceptEdits`. See [[Run Config Reference]] | `agent-provider.ts` |
| **ExecHost** | *"WHERE a process runs, decoupled from WHICH agent runs it."* | `exec-host.ts` |
| **ReplayProvider** | *"an AgentProvider that replays a scripted event stream. Zero spend, deterministic."* | `replay-provider.ts` |
| **ReplayScript** | `{ events, sessionId?, pid?, streamDelayMs? }`, the replay adapter's input | `replay-provider.ts` |
| **Context-replay** | The fallback when `resume_fork` is missing: *"re-inject requires/produces + answers into a fresh prompt"*. Design, not built | `01-ports.md` |
| **Ask-user shim** | `packages/ask-user`, a stdio MCP server named `flowboard` that gives the agent `ask_user` and `ask_user_batch`. It forwards each call over a Unix socket (`FLOWBOARD_ASK_SOCKET`) to a broker and relays the reply. See [[Run Config Reference]] (Asking the owner) and [[Run Agent CLI Decisions]] R18; the design is [[Ask User MCP Server]] | `ask-user/src/server.ts` |
| **Run-agent broker** | The listener on the shim's socket inside `run-agent`, the command that runs one YAML file. It asks one batch at a time in the terminal, first in, first out, and numbers and logs each batch when it arrives. The worker's broker is meant to replace it. See [[Run Agent CLI Decisions]] R18, R22, R23 | `cli/src/ask/broker.ts` |
| **stream-json** | Claude Code's newline-delimited JSON output (`--output-format stream-json`); the Agent SDK reads it for the Claude adapter | PRD §0, §7 |
| **Stream sample** | `docs/stream-sample.jsonl`, the captured probe the Claude parser is written against | PRD §0; now at `docs/old/stream-sample.jsonl` |
| **ACP** | The Agent Client Protocol, *"the open protocol for driving coding agents"* | `01-ports.md` |
| **PricingService** | `price(provider, model, usage) → costUsd`; prices a `Usage` whose `costUsd` is absent, such as a Claude run that ended before its result. Design, not built | `06` §12 |
| **SpecTransform** | `(spec: RunSpec) => RunSpec`, a pure function applied before `launch()`; draft mode is one. Design, not built | `06` §15 |
| **Composition root** | Where the concrete provider is constructed; *"Swapping Claude for Codex means constructing a different `provider` in the composition root and nothing here changes."* | `07` |
| **OTel GenAI conventions** | The field-naming standard the design says the event envelope should follow *"where one exists (model, token usage, tool name)"*. Not built: the envelope has no model field, and nothing exports it to OTel | `01-ports.md`; PRD §7 |

## Related

- [[Agent Providers Index]]
- [[Agent Providers Overview]]
- [[Execution Glossary]]
- [[Capability Library Glossary]]
