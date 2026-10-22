---
tags: [flowboard, agent-providers, adapter, opencode]
module: Agent Providers
---

# OpenCode Adapter

The second real provider, implemented 2026-10-18. It runs a FlowBoard step on OpenCode, so on a non-Claude model, through the same [[AgentProvider Port]]. *"The interface is only as good as its second implementation."* (`01-ports.md`). The choice of OpenCode over Codex for that role, and what its SDK covers, is in [[Provider SDK Fit Analysis]]. The design had planned Codex as the second provider and v1 as Claude-only ([[Codex Adapter]]); whether OpenCode is in v1 is not decided ([[Agent Providers Open Questions]]).

Code: `code/flowboard/packages/adapters/src/agent/opencode/` (`permissions.ts`, `options.ts`, `normalize.ts`, `guard-plugin.ts`, `server.ts`, `provider.ts`), on `@opencode-ai/sdk` 1.19.3 (the `/v2` entry) and the OpenCode CLI 1.19.3.

## One server per run

OpenCode is a server, not a one-shot CLI. Each `launch()` starts its own `opencode serve` through `RunSpec.exec`, bound to `127.0.0.1`, with a random per-run password (`OPENCODE_SERVER_PASSWORD`). The run's whole config travels in `OPENCODE_CONFIG_CONTENT`. The adapter then:

1. creates the session, or forks or reuses one on resume, and emits `system`;
2. fails the run if `guards` are set but the guard plugin did not load (OpenCode only logs a plugin load failure; the plugin writes a marker file the adapter checks);
3. subscribes to the server's event stream, waits for `server.connected` (the SDK's stream connects lazily), and only then sends the prompt with `promptAsync`. Subscribing after the fork matters: a fork republishes the cloned history, which must not count as this run's events or cost;
4. answers every `permission.asked` (OpenCode waits forever on an unanswered one);
5. stops at the root session's `session.idle`, kills the server, and deletes the scratch config dir.

`AgentRun.pid` is the server's pid. Because the server outlives a single prompt and sessions persist in OpenCode's database, re-attaching after a worker restart is possible in principle; the port has no method for it yet ([[Agent Providers Open Questions]] #30).

How the server starts and fails (`adapters/src/agent/opencode/server.ts` and `provider.ts`):

- The adapter runs `opencode serve --hostname 127.0.0.1 --port 0` in the run's folder. The server is ready when it prints `opencode server listening on http://…` on stdout.
- No such line within 30 s: the adapter stops the server, and the run fails with exit 1 (`opencode server did not start within 30000 ms`).
- A binary that cannot be spawned, such as a missing `opencode`: exit 127.
- A server that exits during start-up: its own exit code, with its stderr tail in `error`.
- A server that dies mid-run, killed from outside included: exit 1, with `opencode server ended the run early: <stderr tail>`.
- `stop()` aborts the session and ends the event stream. The run settles with exit 130 and `error: 'stopped'`, unless the result came first. A stop before the server is up still kills it.
- However the run ends, the adapter stops the server (SIGTERM, then SIGKILL after `killGraceMs`), waits for it to close, and deletes the scratch config dir.

The constructor takes `models` (logical id → `providerID/modelID`), `opencodePath` (default `opencode`), `env` (default `process.env`) and `killGraceMs` (default 5000).

## `RunSpec` mapping

| `RunSpec` field | OpenCode |
|---|---|
| `model` | `resolveModel` looks the logical id up in the `models` table given to the provider. An id that is not in the table but contains a `/` passes through unmapped; only an unmapped id without a `/` throws (`no OpenCode model for logical id '…'`), which fails the run with exit 1. `run-agent` passes an empty table and relies on the pass-through; its loader requires the `/`. The value `providerID/modelID` is split on the first `/` (OpenRouter ids contain slashes) |
| `effort` | the prompt's `variant`, only when the model offers a variant of that name; else dropped |
| `prompt` | the canonical render; a `/<plugin>:<slug>` invocation becomes `Use the "<slug>" skill.` |
| `systemPrompt`, `system_prompt` packs | the prompt's `system` |
| `toolPolicy`, `permissionMode` | session permission rules (last match wins): ask everything and allow read-only tools, then plain allows (`Read`), then *ask* before reading `*.env` / `*.env.*` (`*.env.example` allowed), then specific allows (`Read(.env)`), then the injected tool servers, then the deny list; `bypassPermissions` starts from allow-everything. Claude tool names map to OpenCode keys (`Write` → `edit`, `Bash(x)` → `bash` with pattern `x`, `mcp__s__t` → `s_t`); other names are lowercased. OpenCode matches both the key and the pattern as globs, so an allow entry such as `*`, `b*`, `ba?h` or `Bash(?*)` lets the agent run any shell command. `run-agent` refuses those without `allow_unrestricted_shell: true`, using the adapter's `allowsAnyShell` ([[Run Config Reference]]) |
| permission requests | answered `once` under `bypassPermissions` / `auto` (and for `edit` under `acceptEdits`), else rejected with *"Not permitted in this headless run."* A reject also settles the session's other pending requests, so a reply that finds its request gone (404) is ignored, and `experimental.continue_loop_on_deny` keeps the agent going after a reject |
| subagents | the same rules are injected as config `permission`, because a child session only inherits its parent session's deny rules. A key whose only pattern is `*` is written as a plain action, which some keys (`todowrite`, `question`) require |
| OpenCode's `question` tool | denied last in every mode, which hides it: it blocks until answered, and a headless run asks through `ask_user` |
| `tools` | config `mcp` (local servers, no time limit). Each server's tools (`<name>_*`) are allowed after the allow list, so no allow list can lock out `ask_user`; an explicit deny (`mcp__flowboard__ask_user`, `mcp__flowboard__*`, `*`) still wins, as on Claude |
| `capabilities` | `plugin_dir` → config `skills.paths` = `<dir>/skills` (OpenCode reads Claude-style `SKILL.md`). `native` → its config goes in first, then the adapter's own keys replace the pack's top-level keys of the same name: always `permission` and `experimental`, and `mcp`, `skills`, `agent` and `plugin` when the run sets them. Keys the adapter never sets, such as `instructions`, are kept; a pack's own `mcp` servers or `plugin` entries are lost when the run sets those keys. `run-agent` never builds `native` packs |
| `guards` | `guard-plugin.ts` in config `plugin`, rules in `FLOWBOARD_GUARDS`. It maps OpenCode's tool calls onto the Claude names that core's `checkToolCall` knows (`write` and `edit` → `Write`; each path in an `apply_patch` → `Write`; `bash` → `Bash`) and lets every other tool through. For the `rm` rule it passes bash's `workdir`, resolved against the run's folder, as the folder the shell is in, since OpenCode tells the agent to use `workdir` instead of `cd`. The rules are the same as on Claude ([[Claude Code Adapter]], *In-agent hooks*). A thrown error blocks the call, and the model sees its message |
| `limits.maxTurns` | `steps` on the `build`, `plan`, `general` and `explore` agents. On its last step OpenCode takes the tools away and the session goes idle without an error. When the root session reaches the limit and its step before still wanted tools, the adapter fails the run with `max_turns: reached the limit of N steps` (with a limit of 1 it cannot tell, and the run passes) |
| `limits.maxBudgetUsd` | enforced by the adapter: past the cap it aborts the session with `max_budget: spent $x of $y`. It never trips on a model with no listed price, which costs 0 |
| `resume` | `fork: true` → `session.fork`; otherwise the stored session; either way the run's permission rules are re-applied |

> [!check] Changed 2026-10-22
> - The injected tool servers' allow now comes before the deny list, so an explicit deny of the ask tool wins, as on Claude. Before, nothing could remove asking on OpenCode.
> - A `native` pack's config now goes in first, under the adapter's own keys. Before, a pack replaced them and could drop the permission rules, the step limits, `ask_user` or the guard plugin.
> - `run-agent` now asks for `allow_unrestricted_shell: true` for allow entries that glob to `bash`. Before, `allow: ["*"]` gave any shell command with no opt-in and no warning.
> - The guard plugin now checks a `bash` call in its `workdir`. Before, `{"command":"rm -rf foo","workdir":"/tmp"}` got past the `rm` rule.
>
> Decided on 2026-10-22; open to Alex's review.

## Events and usage

`text` and `reasoning` parts are emitted once, when they end (`time.end`); deltas are folded, and synthetic text parts are skipped. A `tool` part gives one `tool_use` and one `tool_result`, both in OpenCode's own names and shapes (`read`, `filePath`, string output); `summary` comes from the shared `adapters/src/agent/summarize.ts`. Parts of user messages are skipped, so the prompt is never shown as the agent's reply. Events of other sessions are ignored; child (subagent) sessions, announced by `session.created` with a parent in the run, count as the run's own. The `result` comes at the root session's `session.idle`.

Usage is the sum of `step-finish` parts, and each one emits a `usage` event with the running totals. `output` includes reasoning tokens, `costUsd` sums OpenCode's cost (priced from models.dev; 0 for an unpriced model), and `numTurns` counts the root session's steps only: subagents' tokens and cost count, their steps do not. A run stopped or failed before its result reports the last running totals, cost included.

> [!check] Changed 2026-10-22
> `numTurns` used to count subagent steps too, and a stopped or failed run reported zero usage. Decided on 2026-10-22; open to Alex's review.

## How runs fail

- `RunResult.error` is the first `error` event's message, and a set `error` fails the run with exit 1. The exceptions are the start-up failures above: a binary that cannot be spawned gives 127, and a server that exits during start-up gives its own code.
- Any assistant-message error or `session.error`, in the root session or a subagent's, fails the run, even if the main agent finishes. The message is `<error name>: <message>`.
- A `session.error` named `ContextOverflowError` is dropped: OpenCode compacts and carries on.
- The limit errors, `max_turns: …` and `max_budget: …`, come before the `result` event; on Claude, the `is_error` error comes after it. A runner can tell them apart only by that text.
- A failing tool gives only a `tool_result` with `ok: false`.
- Tool servers have no time limit: each `mcp` entry's `timeout` and `experimental.mcp_timeout` are 2,147,483,647 ms (about 24.8 days), so `ask_user` can wait for a human (R20 in [[Run Agent CLI Decisions]]). There is no run-level wall clock either, so a hung tool server stalls the run until `stop()`.
- Project instructions are skipped: `OPENCODE_DISABLE_PROJECT_CONFIG=1` keeps the folder's `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `opencode.json` and `.opencode` out of the run (read from the 1.19.3 binary, not tested). Put conventions in `system_prompt` or in the prompt file.

## Isolation and credentials

The server inherits the owner's environment minus every `OPENCODE_*` variable except OpenCode's two credentials, `OPENCODE_API_KEY` and `OPENCODE_AUTH_CONTENT`, and minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, as on the Claude adapter (`adapters/src/agent/opencode/options.ts`). So the owner's settings, such as `OPENCODE_PERMISSION`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_AUTO_SHARE`, `OPENCODE_SERVER_USERNAME` and `OPENCODE_EXPERIMENTAL_*`, never reach the server. The adapter then sets its own: a fresh `XDG_CONFIG_HOME`, so `~/.config/opencode` stays out; `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_CLAUDE_CODE=1` and `OPENCODE_DISABLE_AUTOUPDATE=1`; `OPENCODE_SERVER_PASSWORD`; `OPENCODE_CONFIG_CONTENT`; and `FLOWBOARD_GUARDS` when guards are set.

Still not isolated: admin-managed OpenCode config (a system config folder, macOS managed preferences, an organisation's config), `~/.opencode` and remote well-known config (O9 in [[Provider Implementation Decisions]]), and `XDG_DATA_HOME`. That last one is untouched on purpose: it holds OpenCode's own `auth.json` and the session database that resume needs.

> [!check] Changed 2026-10-22
> Before, the adapter stripped only `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR`, so an inherited `OPENCODE_PERMISSION` could loosen the subagents' rules, and an exported `ANTHROPIC_API_KEY` reached the server. Decided on 2026-10-22; open to Alex's review.

The server password is in the server's env, and OpenCode's shell commands inherit it, along with `OPENCODE_CONFIG_CONTENT` and `FLOWBOARD_GUARDS`. A run whose shell reads its env can therefore reach its own server. The guard plugin and the permission rules cover only the agent's tool calls: the server's `POST /session/{id}/shell` and `POST /pty` endpoints run commands without `tool.execute.before` and without a permission ask, for anyone holding the password. In practice an agent already needs shell access to read its env, so the extra exposure is modest. The sandbox tier, which is not built, is meant to be the floor ([[Providers And Sandboxing]]).

OpenCode 1.19.3 has no Claude Pro/Max login, so this provider runs non-Claude models; on this machine its only credential is an OpenRouter API key, and live runs cost real money. The loader accepts any `providerID/modelID`, and nothing refuses an `anthropic/...` id. Such a model runs only if `auth.json` (or `OPENCODE_AUTH_CONTENT`) holds an Anthropic credential, and then it calls the Anthropic API directly, around the subscription login. An exported `ANTHROPIC_API_KEY` no longer reaches it.

## Verified live

Verified on 2026-10-18 against the installed CLI, with the checks in `adapters/test/opencode-live.test.ts`: a read-and-reply run, a plugin skill invoked by name, and the guard plugin blocking a write outside the worktree under `bypassPermissions` (the plugin loads inside OpenCode and imports `@flowboard/core`). To run only these, from `code/flowboard`: `FLOWBOARD_LIVE=1 FLOWBOARD_OPENCODE_MODEL=openrouter/deepseek/deepseek-v4.1-flash node --test packages/adapters/test/opencode-live.test.ts`. They spend OpenRouter credit, and without `FLOWBOARD_OPENCODE_MODEL` they are skipped. `pnpm test:live` runs four live suites, including Claude's and `run-agent`'s on both adapters, so it also spends Claude subscription quota ([[Testing The Run Agent CLI]]). The normalizer is also tested against a recorded stream, `packages/adapters/test/fixtures/opencode-read.jsonl`.

## Related

- [[Claude Code Adapter]]
- [[Provider SDK Fit Analysis]]
- [[Provider Capabilities]]
- [[Adding A Provider]]
- [[Codex Adapter]]
