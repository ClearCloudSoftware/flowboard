---
tags: [flowboard, agent-providers, adapter, opencode]
module: Agent Providers
---

# OpenCode Adapter

The second real provider, implemented 2026-10-18. It runs a FlowBoard step on OpenCode, so on a non-Claude model, through the same [[AgentProvider Port]]. *"The interface is only as good as its second implementation."* (`01-ports.md`). The choice of OpenCode over Codex for that role, and what its SDK covers, is in [[Provider SDK Fit Analysis]].

Code: `code/flowboard/packages/adapters/src/agent/opencode/` (`permissions.ts`, `options.ts`, `normalize.ts`, `guard-plugin.ts`, `server.ts`, `provider.ts`), on `@opencode-ai/sdk` 1.19.3 (the `/v2` entry) and the OpenCode CLI 1.19.3.

## One server per run

OpenCode is a server, not a one-shot CLI. Each `launch()` starts its own `opencode serve` through `RunSpec.exec`, bound to `127.0.0.1`, with a random per-run password (`OPENCODE_SERVER_PASSWORD`). The run's whole config travels in `OPENCODE_CONFIG_CONTENT`. The adapter then:

1. creates the session, or forks or reuses one on resume, and emits `system`;
2. fails the run if `guards` are set but the guard plugin did not load (OpenCode only logs a plugin load failure; the plugin writes a marker file the adapter checks);
3. subscribes to the server's event stream, waits for `server.connected` (the SDK's stream connects lazily), and only then sends the prompt with `promptAsync`. Subscribing after the fork matters: a fork republishes the cloned history, which must not count as this run's events or cost;
4. answers every `permission.asked` (OpenCode waits forever on an unanswered one);
5. stops at the root session's `session.idle`, kills the server, and deletes the scratch config dir.

`AgentRun.pid` is the server's pid. Because the server outlives a single prompt and sessions persist in OpenCode's database, re-attaching after a worker restart is possible in principle; the port has no method for it yet ([[Agent Providers Open Questions]] #30).

## `RunSpec` mapping

| `RunSpec` field | OpenCode |
|---|---|
| `model` | `resolveModel` maps a logical id through the table given to the provider; the value is `providerID/modelID`, split on the first `/` (OpenRouter ids contain slashes). An unknown id fails the run |
| `effort` | the prompt's `variant`, only when the model offers a variant of that name; else dropped |
| `prompt` | the canonical render; a `/<plugin>:<slug>` invocation becomes `Use the "<slug>" skill.` |
| `systemPrompt`, `system_prompt` packs | the prompt's `system` |
| `toolPolicy`, `permissionMode` | session permission rules (last match wins): ask everything, allow read-only tools, then the allow list, then *ask* before reading `*.env` / `*.env.*` (`*.env.example` allowed), then the deny list; `bypassPermissions` starts from allow-everything. Claude tool names map to OpenCode keys (`Write` → `edit`, `Bash(x)` → `bash` with pattern `x`) |
| permission requests | answered `once` under `bypassPermissions` / `auto` (and for `edit` under `acceptEdits`), else rejected with *"Not permitted in this headless run."* A reject also settles the session's other pending requests, so a reply that finds its request gone (404) is ignored, and `experimental.continue_loop_on_deny` keeps the agent going after a reject |
| subagents | the same rules are injected as config `permission`, because a child session only inherits its parent session's deny rules. A key whose only pattern is `*` is written as a plain action, which some keys (`todowrite`, `question`) require |
| OpenCode's `question` tool | denied last in every mode, which hides it: it blocks until answered, and a headless run asks through `ask_user` |
| `tools` | config `mcp` (local servers), always allowed |
| `capabilities` | `plugin_dir` → config `skills.paths` = `<dir>/skills` (OpenCode reads Claude-style `SKILL.md`); `native` → merged into config |
| `guards` | `guard-plugin.ts` in config `plugin`, rules in `FLOWBOARD_GUARDS`; it checks `write`, `edit`, `apply_patch` and `bash` with the core `checkToolCall` |
| `limits.maxTurns` | `steps` on the `build`, `plan`, `general` and `explore` agents |
| `limits.maxBudgetUsd` | enforced by the adapter: past the cap it aborts the session with `max_budget: spent $x of $y` |
| `resume` | `fork: true` → `session.fork`; otherwise the stored session; either way the run's permission rules are re-applied |

## Events and usage

`text` and `reasoning` parts are emitted once, when they end (`time.end`); deltas are folded. A `tool` part gives one `tool_use` and one `tool_result`. Parts of user messages are skipped, so the prompt is never shown as the agent's reply. Child (subagent) sessions count as the run's own. Usage is the sum of `step-finish` parts: `output` includes reasoning tokens, `numTurns` counts steps, `costUsd` sums OpenCode's cost (priced from models.dev; 0 for an unpriced model).

## Isolation and credentials

The adapter strips `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` from the inherited env. The server password is in the server's env, which OpenCode's bash children inherit: a run that reads its env can reach its own server. Guards still hold (they run in the plugin); the sandbox tier is the floor.

The server gets a fresh `XDG_CONFIG_HOME`, so `~/.config/opencode` stays out, plus `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_CLAUDE_CODE=1` and `OPENCODE_DISABLE_AUTOUPDATE=1`. `XDG_DATA_HOME` is untouched: it holds OpenCode's own `auth.json` and the session database that resume needs. OpenCode 1.19.3 has no Claude Pro/Max login, so this provider runs non-Claude models; on this machine its only credential is an OpenRouter API key, and live runs cost real money.

## Verified live

`FLOWBOARD_OPENCODE_MODEL=openrouter/deepseek/deepseek-v4.1-flash pnpm test:live`, against the installed CLI: a read-and-reply run, a plugin skill invoked by name, and the guard plugin blocking a write outside the worktree under `bypassPermissions` (the plugin loads inside OpenCode and imports `@flowboard/core`). The normalizer is also tested against a recorded stream, `packages/adapters/test/fixtures/opencode-read.jsonl`.

## Related

- [[Claude Code Adapter]]
- [[Provider SDK Fit Analysis]]
- [[Provider Capabilities]]
- [[Adding A Provider]]
- [[Codex Adapter]]
