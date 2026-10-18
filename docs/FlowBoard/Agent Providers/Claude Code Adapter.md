---
tags: [flowboard, agent-providers, adapter, claude]
module: Agent Providers
---

# Claude Code Adapter

The v1 adapter, and the only real one. PRD §1: each step is *"a headless Claude Code session with its own model and effort setting"*. PRD §17: *"Every model call goes through the `claude` CLI."* The drawio *Logical components* page: *"Claude Code CLI / headless, stream-json"*. PRD §3 lists it under `adapters/agent/` as `claude-cli`; the architecture README's layout calls the folder `adapters/agent/claude/`.

## The command

PRD §7, for a `start_run` job:

```
claude -p "<prompt>"
  --output-format stream-json
  --verbose
  --include-partial-messages
  --model <step.model>
  --effort <step.effort>
  --permission-mode <step.permission_mode>
  --session-id <generated uuid, stored as runs.claude_session_id>
  --mcp-config <generated per-run mcp.json>
  --settings <generated per-run settings.json with PreToolUse hooks>
  --strict-mcp-config
  --plugin-dir <dir of each plugin the step names: its skill's plugin + extra_plugin_ids>
  [--allowedTools ...]  [--max-turns N]  [--max-budget-usd N]
  [--append-system-prompt <agent.system_prompt, when the step names an agent>]
```

Resume adds `--resume <claude_session_id> --fork-session` (PRD §9). *"Run with `cwd` set to the task's worktree path."*

The drawio *Harness architecture* draws the sandboxed form: *"claude -p … --output-format stream-json / cwd /work · --mcp-config (shim) · --settings (hooks) · --strict-mcp-config · --max-turns · --max-budget-usd · ANTHROPIC_BASE_URL → proxy, dummy key"*.

## `RunSpec` → flags

| `RunSpec` field | Flag | Note |
|---|---|---|
| `prompt` | `-p "<prompt>"` | Rendered in canonical order |
| `model` | `--model` | via `resolveModel` (identity in v1, [[Capability Library Decisions]] D20) |
| `effort` | `--effort` | |
| `toolPolicy.allow` | `--allowedTools` | appended with `mcp__vibe__*` whenever it is set |
| `toolPolicy.deny` | none in PRD §7 | backlog 0.1 also lists a `--tools` flag to verify; the backlog's one use is the importer agent (`--tools ""`, Story 7.3), and no step-level `RunSpec` field maps to it |
| `tools` | `--mcp-config <per-run mcp.json>` + `--strict-mcp-config` | |
| `capabilities` (`plugin_dir`) | `--plugin-dir` per plugin | at the pinned commit |
| `resume` | `--resume … --fork-session` | |
| `limits.maxTurns` / `maxBudgetUsd` | `--max-turns` / `--max-budget-usd` | |
| `cwd` | process cwd | |
| `exec` | spawned through `exec.spawn` | |
| *(none)* | `--permission-mode`, `--settings`, `--append-system-prompt`, `--session-id` | No `RunSpec` field: [[Agent Providers Open Questions]] #4 |

**Inferred.** This mapping is assembled from PRD §7 and `agent-provider.ts`; no source tabulates it. The fixed flags (`--output-format stream-json`, `--verbose`, `--include-partial-messages`) have no `RunSpec` field because the adapter always passes them. [[Agent Providers Open Questions]] #31.

## Rules the adapter owns

`03` §5: *"every Claude-specific fix the backlog lists moves **into the Claude adapter**, out of the runner — this is the whole payoff"*. The rows cited to `03` §5 are its list; the PRD-only rows are PRD §7 runner rules that this note places in the adapter by the same logic (inference):

| Rule | Source |
|---|---|
| *"`--plugin-dir` registers `/slug`; `--add-dir` does not."* | `03` §5; PRD §7; backlog Story 0.1 (**FIX**) |
| *"`message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas."* | `03` §5; backlog 3.2 |
| *"Capture `session_id` once from `system/init`, not every line."* | `03` §5; backlog 3.3 |
| *"`total_cost_usd` authoritative → maps to `Usage.costUsd`"* | `03` §5; PRD §7 |
| *"Always append `mcp__vibe__*` to `--allowedTools` so a restrictive list can't lock out `ask_user`."* | `03` §5; PRD §7 |
| *"`--strict-mcp-config` is important: it stops my personal MCP config leaking into runs and keeps them reproducible."* | PRD §7 |
| Mount only the plugins the step names, at the commit in `tasks.capability_pins` | PRD §7 |
| Invoke skills fully qualified, `/<plugin>:<slug>` | PRD §7 |
| Snapshot the final args to `data/runs/<id>/args.json` | PRD §7 |

## In-agent hooks

*"The per-run `settings.json` registers Claude Code `PreToolUse` hooks."* They deny writes outside the worktree, writes to non-goal paths, and destructive commands. *"A denial returns its reason to the agent, so it changes course instead of stalling."* (PRD §7). This is the `tool_hooks` capability. See [[Run Guardrails At Launch]].

## Verify, don't assume

PRD §0 makes three things probes, not assumptions: the `stream-json` shape, `claude --version` on PATH, and that the CLI works through a credential-injecting proxy. *"If any part of this spec turns out to be impossible or wrong given the actual CLI behaviour, stop and say so rather than silently substituting something else."*

Backlog Story 0.1 adds: verify the flags exist (*"`--effort`, `--session-id`, `--strict-mcp-config`, `--plugin-dir`, `--allowedTools`, `--tools`, `--max-turns`, `--max-budget-usd`, `--append-system-prompt`, `--resume`, `--fork-session`"*), confirm `/<plugin>:<slug>` in `-p` mode (**DEC**), and *"Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`)"* (**DEC**). Decision D5's default: *"Empty `--settings` file per run"*. [[Agent Providers Open Questions]] #24; also [[Execution Open Questions]] #52 and [[Sandboxing Open Questions]] #24.

## Built on the Agent SDK

> [!check] Implemented 2026-10-18
> The adapter is built on `@anthropic-ai/claude-agent-sdk` 0.3.302, not on hand-built `claude -p` flags. The SDK still runs the installed `claude` CLI (2.1.302) as a child process, so PRD §17 holds. Code: `code/flowboard/packages/adapters/src/agent/claude/` (`options.ts`, `normalize.ts`, `provider.ts`). Why: [[Provider SDK Fit Analysis]]. The flag tables above remain the PRD's CLI form; this table supersedes them.

| `RunSpec` field | SDK option |
|---|---|
| `prompt` | the canonical render, with `invocation` moved first: the CLI only treats a leading `/` as a slash command |
| `model`, `effort`, `cwd` | same names; `resolveModel` is the identity (D20) |
| `toolPolicy.allow` | `allowedTools`, plus `mcp__<name>__*` for each `tools` entry |
| `toolPolicy.deny` | `disallowedTools` |
| `tools` | `mcpServers` (stdio) with `strictMcpConfig: true` |
| `capabilities` | `plugin_dir` → `plugins: [{ type: 'local', path }]`; `system_prompt` → appended to the system prompt; `native` ignored |
| `systemPrompt` | `systemPrompt: { type: 'preset', preset: 'claude_code', append }` |
| `permissionMode` | `permissionMode`, default `dontAsk`; `bypassPermissions` also sets `allowDangerouslySkipPermissions` |
| `guards` | an in-process `PreToolUse` hook that denies with a reason ([[In-Agent Hooks]]) |
| `resume` | `resume` + `forkSession` |
| `limits` | `maxTurns`, `maxBudgetUsd` |
| `exec` | `spawnClaudeCodeProcess` spawns through `exec.spawn` (host tier by default) |

Fixed on every run: `pathToClaudeCodeExecutable` (the installed `claude`), `settingSources: []`, `includePartialMessages: true`, and an env without `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` plus `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Runs use the owner's own CLI login, never an API key, and never relocate `CLAUDE_CONFIG_DIR`. This settles [[Agent Providers Open Questions]] #24 for the host tier.

Verified live (`pnpm test:live`) against the installed CLI: `apiKeySource` is `none` (the subscription login), `/<plugin>:<slug>` runs headless from a mounted plugin dir, and the guard hook denies a write outside the worktree even under `bypassPermissions`. A plugin dir missing from `system/init` fails the run, since the CLI skips it silently.

## Milestone

M3 is this adapter: *"spawn `claude -p` for one hardcoded step, parse stream-json into `run_events`, SSE session viewer, cost captured on the run. **This is the milestone that proves the whole idea.**"* (PRD §14)

## Related

- [[Stream Parsing And Normalization]]
- [[Agent Launch Contract]]
- [[Capability Runtime Mounting]]
- [[Provider Capabilities]]
- [[Codex Adapter]]
