---
tags: [flowboard, agent-providers, adapter, claude]
module: Agent Providers
---

# Claude Code Adapter

The first real provider, built on 2026-10-18. [[OpenCode Adapter]] is the second, built the same day, and [[Replay Provider]] is a test double. The design made this the only v1 adapter ([[Capability Library Decisions]] D1); the build went further, and whether OpenCode is in v1 is not decided ([[Agent Providers Open Questions]]). PRD §1: each step is *"a headless Claude Code session with its own model and effort setting"*. PRD §17: *"Every model call goes through the `claude` CLI."* That holds for this adapter; OpenCode runs other models through `opencode`. The drawio *Logical components* page: *"Claude Code CLI / headless, stream-json"*. PRD §3 lists it under `adapters/agent/` as `claude-cli`; the architecture README's layout calls the folder `adapters/agent/claude/`. The code is in `adapters/src/agent/claude/`.

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

> [!warning] The shipped code differs
> - This command is the PRD's design. The adapter is built on the Agent SDK, which builds the CLI's arguments from options. Nothing writes an `mcp.json` or a `settings.json` ([[Agent Providers Open Questions]] #4). See [[#Built on the Agent SDK]].
> - The sandboxed form does not fit the subscription login the adapter uses. A dummy key behind a credential-injecting proxy works for an API key. A container tier would instead need a `claude setup-token` token passed as `CLAUDE_CODE_OAUTH_TOKEN` inside the sandbox, which breaks the "no real credential in the sandbox" rule. That is an open design question ([[Provider SDK Fit Analysis]], *Authentication decision*; [[Credential Injecting Proxy]]; [[Sandboxing Open Questions]] #26). Today every run is a child process on the host, in the real folder, with the owner's login.

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
| *(none)* | `--permission-mode`, `--settings`, `--append-system-prompt`, `--session-id` | No field in the original port. Since 2026-10-18 `RunSpec` has `permissionMode`, `guards` (in place of the hook settings) and `systemPrompt` ([[Agent Providers Open Questions]] #4). The session id still has none: the provider reports it (#5) |

**Inferred.** This mapping is assembled from PRD §7 and `agent-provider.ts`; no source tabulates it. The fixed flags (`--output-format stream-json`, `--verbose`, `--include-partial-messages`) have no `RunSpec` field because the adapter always passes them. [[Agent Providers Open Questions]] #31.

## Rules the adapter owns

`03` §5: *"every Claude-specific fix the backlog lists moves **into the Claude adapter**, out of the runner — this is the whole payoff"*. The rows cited to `03` §5 are its list; the PRD-only rows are PRD §7 runner rules that this note places in the adapter by the same logic (inference). The last column says what the code does.

| Rule | Source | As built |
|---|---|---|
| *"`--plugin-dir` registers `/slug`; `--add-dir` does not."* | `03` §5; PRD §7; backlog Story 0.1 (**FIX**) | Done: `plugin_dir` packs become the SDK's `plugins`. A plugin dir missing from `system/init` fails the run |
| *"`message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas."* | `03` §5; backlog 3.2 | Done, per message and per subagent (`adapters/src/agent/claude/normalize.ts`) |
| *"Capture `session_id` once from `system/init`, not every line."* | `03` §5; backlog 3.3 | Done |
| *"`total_cost_usd` authoritative → maps to `Usage.costUsd`"* | `03` §5; PRD §7 | Done, on the result only: live `usage` events carry no cost |
| *"Always append `mcp__vibe__*` to `--allowedTools` so a restrictive list can't lock out `ask_user`."* | `03` §5; PRD §7 | Done as `mcp__<name>__*` for every injected tool server, with or without an allow list. An explicit deny still wins |
| *"`--strict-mcp-config` is important: it stops my personal MCP config leaking into runs and keeps them reproducible."* | PRD §7 | Done: `strictMcpConfig: true` |
| Mount only the plugins the step names, at the commit in `tasks.capability_pins` | PRD §7 | Not in the adapter. It mounts the `plugin_dir` packs the caller passes; pinning a commit needs the capability registry and the runner, which are not built |
| Invoke skills fully qualified, `/<plugin>:<slug>` | PRD §7 | Not in the adapter. It passes `invocation` as given, moved first. `run-agent` qualifies a `skills:` folder's `/name` as `/local:name` ([[Run Agent CLI Decisions]] R26) |
| Snapshot the final args to `data/runs/<id>/args.json` | PRD §7 | Not built. The plan left it to the runner (`docs/superpowers/plans/2026-10-18-agent-providers-claude-code.md`, *Skipped on purpose*) |

## In-agent hooks

PRD §7: *"The per-run `settings.json` registers Claude Code `PreToolUse` hooks."* They deny writes outside the worktree, writes to non-goal paths, and destructive commands. *"A denial returns its reason to the agent, so it changes course instead of stalling."* This is the `tool_hooks` capability. See [[Run Guardrails At Launch]].

> [!warning] The shipped code differs
> No `settings.json` is written. When `RunSpec.guards` is set, the adapter registers one in-process `PreToolUse` callback (`adapters/src/agent/claude/options.ts`); without `guards` it registers no hook. The callback runs core's `checkToolCall` (`core/src/guard.ts`) and denies with the reason, which the model sees. It enforces the rules the caller passes, plus two that come with `writeRoots`: writes are checked where they land, and a recursive `rm` must stay inside the roots. For the `rm` rule it passes the hook input's `cwd` as the shell's folder, because a `cd` persists between Bash calls.

| Tool call | Check | Reason the agent sees |
|---|---|---|
| `Write`, `Edit`, `MultiEdit` (`file_path`), `NotebookEdit` (`notebook_path`) | The path must land inside a write root. Links are followed, a dangling one too; a missing tail is kept as written; a leading `~/` is the home folder | `Write outside the worktree: <path>`, or `Write through a link to outside the worktree: <path> -> <where it lands>` |
| The same tools | The path, relative to the resolved folder, must not match a `denyPaths` glob | `Path is a non-goal: <glob>` |
| `Bash` | A recursive `rm` must stay inside the write roots (built in) | `Recursive rm outside the worktree: <operand>`, `Recursive rm of a path the shell expands: <operand>`, `Recursive rm after a cd the guard cannot follow: <operand>`, or `Recursive rm through xargs: …` |
| `Bash` | No `denyCommands` regex may match | `Command blocked by policy: <regex>` |
| Any other tool | None | Allowed |

- **Recursive `rm`.** `-r`, `-R`, any short-flag group holding `r` or `R`, or `--recursive`; options may come before or after the operands, and `--` ends them. Operands resolve where the shell is: the hook's `cwd`, then any literal `cd` or `pushd` earlier in the same command, also after a shell keyword (`if cd /tmp; then rm -rf foo; fi` is denied). An operand is denied when it lands outside every write root after links are followed, or is a write root itself. An absolute path inside the folder is fine, and so is `.`, which `rm` refuses anyway; a link named without a trailing slash is the link itself. Also denied: an operand the shell would expand (it contains `$`, a backtick or `\`, starts with `~`, has a path segment that starts with a dot and holds `*`, `?` or `[`, or has a brace other than a simple list; `{dist,build}` is expanded and each part checked), a relative operand after a `cd` the guard cannot follow (`cd "$X"`, `cd ~`, a `cd` with an option such as `cd -` or `cd -P x`, a bare `cd`), and an `rm` fed by `xargs`. `find … -exec rm -rf {} +` (or `{} \;`) is checked against find's starting points. Redirections are not operands. The command is split on `;`, `&`, `|`, `(`, `)` and newlines, backtick substitutions and line continuations included, with quotes stripped, so `bash -c "rm -rf /"`, `sudo rm`, `/bin/rm` and `\rm` are caught. A script, `eval`, `find -delete`, or another command that deletes (`git clean`, `mv`, `truncate`) gets around it. A plain `rm` and `git rm` are not checked.
- **`denyPaths`** use Node's `path.matchesGlob`. `*` stays in one folder and `**` crosses folders, so `*.lock` covers only top-level lock files and `**/*.lock` covers all of them. Dot names match (`secret/**` covers `secret/.env`, `**/.env` covers `.config/.env`). On macOS and Windows the path and the glob are lower-cased first, so letter case is ignored, as the disk ignores it (`docs/**` covers `DOCS/a.md`); on Linux it counts.
- **`denyCommands`** gets nothing added for you. `run-agent` passes core's `DEFAULT_DENY_COMMANDS` (`git push` and `git reset --hard`, also with git's global options in between such as `git -C . push`; `curl` or `wget` piped into a shell) plus the YAML's `deny_commands`.
- Only file-edit tools and recursive `rm` are checked against paths. Any other shell command that an allow rule permits can still write anywhere (C5 in [[Provider Implementation Decisions]]).

> [!check] Changed 2026-10-22
> The recursive-rm rule was a regex in `DEFAULT_DENY_COMMANDS` that blocked a recursive `rm` whose first operand started with `/`, `~` or `..`. It is now built into the guard, applies whenever guards are set, and resolves operands where the shell is. Writes and write roots are now checked after following links, with `~/` as the home folder; `denyPaths` now match dot names and ignore case on macOS and Windows; and the git rules allow git's global options. Decided on 2026-10-22; open to Alex's review.

## Verify, don't assume

PRD §0 makes three things probes, not assumptions: the `stream-json` shape, `claude --version` on PATH, and that the CLI works through a credential-injecting proxy. *"If any part of this spec turns out to be impossible or wrong given the actual CLI behaviour, stop and say so rather than silently substituting something else."*

Backlog Story 0.1 adds: verify the flags exist (*"`--effort`, `--session-id`, `--strict-mcp-config`, `--plugin-dir`, `--allowedTools`, `--tools`, `--max-turns`, `--max-budget-usd`, `--append-system-prompt`, `--resume`, `--fork-session`"*), confirm `/<plugin>:<slug>` in `-p` mode (**DEC**), and *"Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`)"* (**DEC**). Decision D5's default: *"Empty `--settings` file per run"*. [[Agent Providers Open Questions]] #24; also [[Execution Open Questions]] #52 and [[Sandboxing Open Questions]] #24.

> [!warning] The shipped code differs
> - The stream shape is pinned by a recorded stream, `adapters/test/fixtures/claude-hello.jsonl`, which the normalizer tests read.
> - There is no `claude --version` check. SDK 0.3.302 expects CLI 2.1.302, which is the installed version, but nothing checks that at run time (C10 in [[Provider Implementation Decisions]]).
> - The proxy probe was not run, and the proxy design does not fit the subscription login: see [[#The command]].
> - `/<plugin>:<slug>` runs headless from a mounted plugin: checked live, see [[#Built on the Agent SDK]].
> - Runs are isolated with neither an empty `--settings` file nor `CLAUDE_CONFIG_DIR`: see [[#Built on the Agent SDK]].

## Built on the Agent SDK

> [!check] Implemented 2026-10-18
> The adapter is built on `@anthropic-ai/claude-agent-sdk` 0.3.302, not on hand-built `claude -p` flags. The SDK still runs the installed `claude` CLI (2.1.302) as a child process, so PRD §17 holds. Code: `code/flowboard/packages/adapters/src/agent/claude/` (`options.ts`, `normalize.ts`, `provider.ts`). Why: [[Provider SDK Fit Analysis]]. The flag tables above remain the PRD's CLI form; this table supersedes them.

| `RunSpec` field | SDK option |
|---|---|
| `prompt` | the canonical render, with `invocation` moved first: the CLI only treats a leading `/` as a slash command |
| `model`, `effort`, `cwd` | same names; `resolveModel` is the identity (D20) |
| `toolPolicy.allow` | `allowedTools`, plus `mcp__<name>__*` for each `tools` entry |
| `toolPolicy.deny` | `disallowedTools`, which wins over `allowedTools`: denying `mcp__flowboard__ask_user` removes asking |
| `tools` | `mcpServers` (stdio) with `strictMcpConfig: true` |
| `capabilities` | `plugin_dir` → `plugins: [{ type: 'local', path }]`; `system_prompt` → appended to the system prompt; `native` ignored |
| `systemPrompt` | `systemPrompt: { type: 'preset', preset: 'claude_code', append }` |
| `permissionMode` | `permissionMode`, default `dontAsk`; `bypassPermissions` also sets `allowDangerouslySkipPermissions` |
| `guards` | an in-process `PreToolUse` hook that denies with a reason, registered only when `guards` is set ([[In-Agent Hooks]]; see [[#In-agent hooks]]) |
| `resume` | `resume` + `forkSession` |
| `limits` | `maxTurns`, `maxBudgetUsd` |
| `exec` | `spawnClaudeCodeProcess` spawns through `exec.spawn` (host tier by default) |

Fixed on every run: `pathToClaudeCodeExecutable` (the installed `claude`), `settingSources: []`, `strictMcpConfig: true`, `includePartialMessages: true`, and an env without `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` plus `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `MCP_TOOL_TIMEOUT` (see [[#Run results]]). Runs use the owner's own CLI login, never an API key, and never relocate `CLAUDE_CONFIG_DIR`. This settles [[Agent Providers Open Questions]] #24 for the host tier.

The constructor takes `claudePath` (default `claude`), `env` (default `process.env`), `killGraceMs` (default 5000) and `query`, a stand-in for the SDK's `query()` that the tests use.

Claude does not glob tool names in allow rules, only in deny and ask rules (checked in the Claude Code 2.1.302 binary on 2026-10-22); an MCP rule can still name a whole server, as the adapter's `mcp__<name>__*` does. So `allow: ["*"]` or `["b*"]` allows nothing here, and `run-agent` asks for `allow_unrestricted_shell: true` only for `Bash`, or `Bash(…)` holding only `*`, `:` and spaces. OpenCode globs tool names in allow rules too: see [[OpenCode Adapter]].

Verified live on 2026-10-18 against the installed CLI, with the checks in `adapters/test/claude-live.test.ts`: `apiKeySource` is `none` (the subscription login), `/<plugin>:<slug>` runs headless from a mounted plugin dir, and the guard hook denies a write outside the worktree even under `bypassPermissions`. To run only these, from `code/flowboard`: `FLOWBOARD_LIVE=1 node --test packages/adapters/test/claude-live.test.ts`. They spend subscription quota. `pnpm test:live` runs four live suites, including OpenCode's and `run-agent`'s on both adapters, so it also spends OpenRouter credit ([[Testing The Run Agent CLI]]). A plugin dir missing from `system/init` fails the run, since the CLI skips it silently.

## Run results

- **Exit codes.** A stop before the result gives 130 and `error: 'stopped'`; a stop after it does not relabel the run (C4). A CLI that cannot be spawned gives 127. The CLI's own non-zero code passes through, with the SDK's message and the CLI's stderr tail as `error`. A signal kill, even one from outside rather than `stop()`, shows as 1 with `terminated by signal` in the text, so a runner cannot tell an out-of-memory kill from a plain failure.
- **Errors.** `RunResult.error` is the first `error` event's message. An `error` event comes from an `is_error` result (`error_max_turns: …`, `error_max_budget_usd: …`, `error_during_execution: …`, or the result text of an `is_error` success such as an API error turn), and it follows the `result` event. It also comes from an assistant message error (`assistant error: <kind>`, such as `assistant error: rate_limit`), from `plugin not loaded: <path>`, or from the SDK throwing, with the CLI's stderr tail appended. A set `error` means failed, even at exit 0 ([[Agent Providers Open Questions]] #33). Whether the CLI exits 0 after a cap hit was not checked.
- **Caps and rate limits.** Turn and budget caps show only as that text, so a runner cannot classify them without matching it (OpenCode says `max_turns:` and `max_budget:`). Rate-limit and retry records are dropped (#7), so a rate-limited failure arrives only as error text. A failing tool gives only a `tool_result` with `ok: false`.
- **Usage.** `RunResult.usage` is the result's totals: tokens summed over `modelUsage`, subagents included, or else `result.usage`; `numTurns` is the CLI's `num_turns`; `costUsd` is `total_cost_usd`. Live `usage` events carry running tokens and, as turns, the main agent's finished messages (`message_stop` with no `parent_tool_use_id`). They carry no `costUsd`: Claude prices a run only in its result. A run stopped or failed before its result reports the last live totals, so its cost must be priced from tokens.
- **No MCP time limit.** `MCP_TOOL_TIMEOUT` is 2,147,483,647 ms (about 24.8 days), so `ask_user` can wait for a human (R20 in [[Run Agent CLI Decisions]]). There is no run-level wall clock either, so a hung tool server stalls the run until `stop()`.
- **Project instructions are skipped.** `settingSources: []` loads no settings files, and the SDK reads `CLAUDE.md` only when `settingSources` includes `'project'`. So a run never sees the target folder's `CLAUDE.md`, `.claude/settings.json` or `.claude/settings.local.json`, nor the owner's `~/.claude/settings.json`. Put conventions in `system_prompt` or in the prompt file.
- **Stopping.** `stop()` aborts the SDK query. The SDK first closes the CLI's stdin and waits 2 s. If the CLI is still running, it then sends SIGTERM (and SIGKILL 5 s later) and fires the signal that the adapter's own `terminate()` listens on (SIGTERM, then SIGKILL after `killGraceMs`). So a CLI that ignores its closed stdin is signalled about 2 s after `stop()`, and a `killGraceMs` above 5000 cannot lengthen the grace, because the SDK's SIGKILL comes first (C12).

> [!check] Changed 2026-10-22
> Live `usage` events now count the main agent's turns; before, their `numTurns` was always 0. A stopped or failed run now reports the last live totals; before, it reported zero usage. Decided on 2026-10-22; open to Alex's review.

## Milestone

M3 is this adapter: *"spawn `claude -p` for one hardcoded step, parse stream-json into `run_events`, SSE session viewer, cost captured on the run. **This is the milestone that proves the whole idea.**"* (PRD §14)

> [!info] Design, not built
> Only the adapter part of M3 exists on `dev` as of 2026-10-22: it runs the CLI through the SDK, turns its stream into normalized events, and reports cost on the result. `run_events` storage, the SSE session viewer and the `runs` table are not built. `run-agent` stands in: it prints the events and logs them to `runs/<timestamp>-<adapter>.jsonl` ([[Run Agent CLI Decisions]]).

## Related

- [[Stream Parsing And Normalization]]
- [[Agent Launch Contract]]
- [[Capability Runtime Mounting]]
- [[Provider Capabilities]]
- [[Provider Implementation Decisions]]
- [[Codex Adapter]]
