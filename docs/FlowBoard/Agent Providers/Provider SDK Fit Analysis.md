---
tags: [flowboard, agent-providers, analysis, sdk, claude, opencode]
module: Agent Providers
date: 2026-10-18
---

# Provider SDK Fit Analysis

Can the **Claude Agent SDK** and the **OpenCode SDK**, both in TypeScript, implement the [[AgentProvider Port]] as these notes describe it? This note checks every requirement in the contract notes against the SDK documentation and source as of 2026-10-18.

> [!check] Verdict
> Both SDKs can implement the port, with a few changes to the port. The Claude Agent SDK covers the design almost one for one. OpenCode covers most of it, but it runs as a long-lived HTTP server rather than one process per attempt, which changes how a run is launched, stopped and re-attached.

## Versions checked

| SDK | Package | Version | Notes |
|---|---|---|---|
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | docs examples up to 0.3.296 | Tracks the bundled Claude Code version. The V2 session preview (`unstable_v2_*`) was removed in 0.3.142; use `query()`. |
| OpenCode | `@opencode-ai/sdk`, imported from **`/v2`** | 1.19.3 (2026-10-16) | The root import is a frozen legacy API. A separate package, `@opencode/sdk` 2.0.x, is a breaking rewrite that is already tagged `latest`; opencode.ai/docs still describes the 1.x line. |

## Authentication decision

FlowBoard drives the `claude` CLI installed on the owner's machine and authenticates with the owner's own Pro/Max login, not an API key (decision of 2026-10-18).

- The Agent SDK docs say: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."* That targets products offering the login to their users. A personal tool on the owner's machine is the low-risk case.
- The SDK spawns the `claude` CLI and does not call the API directly, so PRD §17 (*"Every model call goes through the `claude` CLI"*) still holds.
- OpenCode 1.19.3 has **no Claude Pro/Max login**. Its built-in auth plugins cover Codex (ChatGPT), Copilot, GitLab, Poe, Azure, xAI and others (`packages/opencode/src/plugin/index.ts`). The OpenCode provider therefore runs non-Claude models.

Consequences for the Claude adapter:

- Point the SDK at the installed binary with `pathToClaudeCodeExecutable`.
- TypeScript `env` replaces the whole environment. Never let an inherited `ANTHROPIC_API_KEY` through, or it wins over the login.
- Isolate runs with `settingSources: []`, `strictMcpConfig: true` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, **not** `CLAUDE_CONFIG_DIR`. Relocating the config dir likely drops the login (unverified: the macOS Keychain entry appears to be keyed to the config dir).
- The proxy-injects-the-credential design in [[Providers And Sandboxing]] fits an API key, not a subscription login. On the host tier nothing changes. A container tier would need a `claude setup-token` token passed as `CLAUDE_CODE_OAUTH_TOKEN`, which breaks the "no real credential in the sandbox" rule.
- The SDK bundles a CLI version; pointing it at a different installed version can drift. The `claude --version` probe (PRD §0) should compare against the version the SDK expects.

## Requirement by requirement

| Requirement | Claude Agent SDK | OpenCode SDK (`/v2`) |
|---|---|---|
| Spawn through `ExecHost` ([[Providers And Sandboxing]]) | ✅ `spawnClaudeCodeProcess(opts) => SpawnedProcess` maps onto `ExecHost.spawn` | ⚠️ `ExecHost` starts `opencode serve --port 0`; the adapter drives it with `createOpencodeClient({baseUrl, directory})`. `createOpencode()` defaults to port 4096, so parallel spawns collide |
| `AgentRun.pid` | ⚠️ Not exposed; capture it inside the custom spawn | ⚠️ Not exposed; spawn the server yourself to get the server's pid |
| Caller-chosen session id (#5) | ✅ `sessionId` option; also `session_id` on `system/init` | ❌ Server-generated `ses_…`. Store FlowBoard's own key in session `metadata` |
| `resume_fork` | ✅ `resume` + `forkSession`; `resumeSessionAt` exists but is undocumented | ✅ `session.fork({sessionID, messageID?})`. The fork drops session `permission`, `agent` and `model`; re-apply with `session.update` |
| Stop | ✅ `abortController`, `Query.interrupt()` | ✅ `session.abort` (`MessageAbortedError` on the message) |
| Re-attach after worker restart (#30) | ❌ Only `resume`, which starts a new process | ✅ Sessions persist in SQLite (`$XDG_DATA_HOME/opencode/opencode.db`). If the server outlives the worker, re-subscribe to `event.subscribe` |
| Seven normalized kinds ([[Normalized Event Envelope]]) | ✅ `SDKMessage` union. `tool_use` and thinking blocks are in assistant content; tool results arrive in user messages | ✅ Parts `text`, `reasoning`, `tool` (state `pending` / `running` / `completed` / `error`), `step-finish`; events `message.part.updated`, `session.status`, `session.error` |
| `partial_stream` and live usage (#9) | ✅ `includePartialMessages` gives raw `stream_event` lines | ✅ `message.part.delta` for text and reasoning; usage on each `step-finish` |
| `native_cost` and `Usage` (#32) | ✅ `total_cost_usd`, `usage`, `modelUsage` (per model, with `costBasis`), `num_turns`. `usage` excludes subagents; `modelUsage` includes them | ✅ `step-finish.cost` and `tokens {input, output, reasoning, cache {read, write}}`, priced from models.dev. Sum the `step-finish` parts: message-level `tokens` is last-step-only while `cost` accumulates. Unpriced models cost 0. No turn counter; count `step-finish` parts |
| `effort` (#29) | ✅ `effort: 'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`, plus `thinking` | ⚠️ `variant`, whose values differ per model (Anthropic `high`/`max`, OpenAI `minimal`…`xhigh`). Needs a per-model mapping |
| `allowed_tools`, enforced | ✅ `allowedTools`, `disallowedTools` (scoped patterns such as `Bash(rm *)`). `bypassPermissions` ignores `allowedTools` | ✅ Session `permission: [{permission, pattern, action}]`; last matching rule wins, no match means `ask`. Do not use the deprecated per-prompt `tools`, which overwrites session permissions |
| `permission_modes` | ✅ `permissionMode` (`default`, `acceptEdits`, `bypassPermissions` with `allowDangerouslySkipPermissions`, `plan`, `dontAsk`, `auto`). Use `dontAsk` + `allowedTools` for headless runs | ⚠️ No server-side bypass. Use `"permission": "allow"` in config, or the adapter answers every `permission.asked` with `permission.reply`. **An unanswered request hangs the run** |
| `tool_hooks` with a reason | ✅ In-process `hooks.PreToolUse` callbacks; `permissionDecision: 'deny'` + `permissionDecisionReason` reaches the model | ✅ Plugin hook `tool.execute.before` that throws; the error becomes the tool's `error` state. It is a plugin file loaded by the server (`plugin: ["/abs/path.ts"]`), not a callback in the worker |
| `mcp_tools` and `ask_user` | ✅ `mcpServers` (stdio, http, sse) and in-process `createSdkMcpServer`, which removes the `mcp-shim` process and its unix socket on the host tier | ✅ Config `mcp.<name>` or runtime `mcp.add`. A built-in `question` tool with a `question.asked` event may replace `ask_user` (unverified) |
| `plugins` and `CapabilityPack` | ✅ `plugins: [{type: 'local', path}]`; `/<plugin>:<slug>` works headless. A missing path is skipped silently: check `plugins` on `system/init` | ⚠️ No plugin manifest. Reads Claude-style `SKILL.md` (`skills.paths`), plus `agents/`, `commands/`, `plugins/` and `skills/` under `OPENCODE_CONFIG_DIR`. A `native` mount fits |
| `budget_cap` | ✅ `maxBudgetUsd` (an estimate; the crossing response still completes) | ❌ None. The adapter sums `step-finish.cost` and calls `session.abort` |
| `limits.maxTurns` (#25) | ✅ `maxTurns` | ⚠️ `agent.<name>.steps`: set on an agent, not a prompt, so each run needs its own agent definition. A soft stop: tools are dropped on the last step |
| System prompt (#4) | ✅ `systemPrompt`; the preset `append` field is unverified | ✅ `system` on each prompt; agent-level `prompt` |
| Isolation from personal config (#24) | ✅ `settingSources: []` + `strictMcpConfig: true`. `~/.claude.json`, managed policy and auto-memory are read regardless | ⚠️ The global `$XDG_CONFIG_HOME/opencode` config always loads. Point `XDG_CONFIG_HOME` and `HOME` at a scratch dir, keep `XDG_DATA_HOME` (auth, DB), and set `OPENCODE_DISABLE_CLAUDE_CODE=1` |
| Outcome (#10) | ✅ `outputFormat: {type: 'json_schema', schema}` → `structured_output` | ✅ Prompt `format: {type: 'json_schema', schema}` → `info.structured` (the docs wrongly say `structured_output`) |
| `is_error` on exit 0 (#33) | ✅ Result subtypes `error_max_turns`, `error_max_budget_usd`, `error_during_execution`, `error_max_structured_output_retries`. `query()` **throws** after yielding an error result | ✅ `AssistantMessage.error` with named errors (`ProviderAuthError`, `APIError`, `ContextOverflowError`, …) |
| Rate-limit signal (transient class) | ✅ `SDKRateLimitEvent`, `SDKAPIRetryMessage` | ✅ `session.status` `retry`, `retry` part |

## Changes the port needs

These are **proposals**, not decisions.

1. **`RunSpec` gains `permissionMode` and `systemPrompt`** (#4). Both SDKs take them as options. The runner no longer writes Claude-format `settings.json` and `mcp.json`; guardrail rules become provider-neutral data that each adapter translates (Claude: hook callbacks; OpenCode: permission rules plus a plugin).
2. **`AgentRun.pid` becomes optional.** Claude has one process per run; OpenCode has one server that can hold many sessions. Restart recovery (#30) becomes "re-attach by session id when the provider supports it", not "re-attach by pid".
3. **Session ids stay provider-reported** (#5). OpenCode cannot take a caller-chosen id, so `AgentRun.sessionId` as a promise is the right shape. The Claude adapter may still pass `sessionId` up front.
4. **A `usage_delta` event kind** (#9). Both SDKs report usage mid-run.
5. **Outcome via structured output** (#10). Both SDKs can force a pass/fail JSON schema, which gives `RunResult.outcome` one source.
6. **One OpenCode server per run** for now. Env-level config (`OPENCODE_CONFIG_CONTENT`, `OPENCODE_PERMISSION`, `XDG_*`) is process-wide. Pool servers later if startup time hurts.

## Capability sets

What each adapter would declare ([[Provider Capabilities]]), from the table above.

| Flag | Claude Agent SDK | OpenCode |
|---|---|---|
| `effort` | ✓ | ✓ via `variant` mapping |
| `sessions` | ✓ | ✓ |
| `resume_fork` | ✓ | ✓ |
| `mcp_tools` | ✓ | ✓ |
| `plugins` | ✓ | — (`native` mount instead) |
| `allowed_tools` | ✓ | ✓ |
| `permission_modes` | ✓ | — (adapter answers requests) |
| `native_cost` | ✓ | ✓ (0 for unpriced models) |
| `partial_stream` | ✓ | ✓ |
| `budget_cap` | ✓ | — (adapter-enforced) |
| `tool_hooks` | ✓ | ✓ (plugin file) |

## Risks

- **OpenCode is moving fast.** Two SDK lines, frequent field renames (`structured` vs `structured_output`, `tools` vs `permission`, `maxSteps` vs `steps`), and a 2.x rewrite already on `latest`. Pin the server and SDK to the same exact version. Proposal: pin 1.19.3 and move to 2.x once its docs catch up.
- **SDK/CLI version drift** when the Claude SDK drives the installed CLI.
- **Cost under a subscription is a list-price estimate**, not a bill, for both providers ([[Cost And Control Open Questions]] #7).
- **Unverified:** whether a `canUseTool` deny message reaches the model; the `systemPrompt` preset `append` field; `resumeSessionAt` semantics; OpenCode's `question` tool as an `ask_user` replacement; the `CLAUDE_CONFIG_DIR` login loss.

## Recommendation

Build the **Claude adapter first** on the Agent SDK: it fits the port almost exactly and removes the per-run settings files and the `mcp-shim` process. Build the **OpenCode adapter second**, on non-Claude models (ChatGPT through the built-in Codex login, Copilot, or local models). It is the real test of the abstraction ([[Adding A Provider]]): a server instead of a process, server-chosen ids, no budget cap, and a different permission model. It will show where the port still assumes Claude.

This also bears on [[Agent Client Protocol Option]] (#18): both SDKs give typed access to every need ACP was meant to cover, so the hand-written port stays viable.

## Sources

- Claude Agent SDK: `https://code.claude.com/docs/en/agent-sdk/` pages `overview`, `typescript`, `sessions`, `permissions`, `hooks`, `mcp`, `plugins`, `claude-code-features`, `cost-tracking`, `hosting`, `secure-deployment`, `streaming-output`, `structured-outputs`, `agent-loop`, `configuration`, `quickstart`.
- OpenCode: `https://opencode.ai/docs/` pages `sdk`, `server`, `permissions`, `plugins`, `agents`, `commands`, `models`, `skills`, `rules`; source at `github.com/sst/opencode` tag `v1.19.3` (`packages/sdk/js`, `packages/opencode/src/session`, `src/config`, `src/plugin`, `src/permission`, `src/cli/cmd/run.ts`).

## Related

- [[AgentProvider Port]]
- [[Claude Code Adapter]]
- [[Codex Adapter]]
- [[Provider Capabilities]]
- [[Agent Providers Open Questions]]
