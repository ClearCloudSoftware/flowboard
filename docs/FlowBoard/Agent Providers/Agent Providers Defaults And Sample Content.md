---
tags: [flowboard, agent-providers, seed, samples]
module: Agent Providers
---

# Agent Providers Defaults And Sample Content

## Defaults in the code

What the code does when a setting is left out, on `dev` as of 2026-10-22.

| Default | Value | Where |
|---|---|---|
| Providers | Two real ones, Claude Code (`claude-code`) and OpenCode (`opencode`), plus Replay (`replay`), the test double. Codex is designed, not built. `run-agent` has no default: `adapter` is required | `adapters/src/agent/`; `cli/src/config.ts` |
| Model and effort | `run-agent` requires `model`. `effort` is passed only when set, so the CLI's own default applies | `cli/src/config.ts` |
| Permission mode in `run-agent` | `acceptEdits`. `bypassPermissions` and `auto` need `permissions.allow_unrestricted_shell: true` | `cli/src/config.ts`; [[Run Agent CLI Decisions]] R8 |
| Permission mode in the Claude adapter, when `RunSpec.permissionMode` is unset | `dontAsk` | `claude/options.ts`; [[Provider Implementation Decisions]] C10 |
| Permission mode in the OpenCode adapter, when unset | Every permission request is refused, as under `dontAsk` | `opencode/permissions.ts` (`replyFor`) |
| Kill grace | 5 s from SIGTERM to SIGKILL, on both providers (`killGraceMs` option) | `adapters/src/exec/terminate.ts` (`KILL_GRACE_MS`) |
| OpenCode server start | 30 s. A server that has not printed its URL by then is stopped, and the run fails with exit code 1 | `opencode/server.ts` |
| MCP tool calls | No time limit: 2,147,483,647 ms, about 24.8 days, so a question waits for its answer. There is no run-level wall clock either | `claude/options.ts` (`NO_TIME_LIMIT_MS`, as `MCP_TOOL_TIMEOUT`); `opencode/options.ts` (each server's `timeout`, `experimental.mcp_timeout`) |
| Blocked commands | `DEFAULT_DENY_COMMANDS`, three regexes: `git push`, `git reset --hard` (both also with git's global options before the subcommand, such as `git -C . push`), and `curl` or `wget` piped into `sh`, `bash` or `zsh`. `run-agent` puts them before the YAML's `deny_commands`; an adapter adds nothing by itself | `core/src/guard.ts`; `cli/src/config.ts` |
| Recursive `rm` | Built into the guard whenever `guards` are set, with no list to pass. Operands resolve where the shell is: its current folder on Claude, bash's `workdir` on OpenCode, then any literal `cd` earlier in the command. Denied when an operand lands outside every write root (in `run-agent`, the YAML's `folder`), is a write root itself, or needs the shell to expand it; also a relative operand after a `cd` the guard cannot follow, and an `rm` fed by `xargs` | `core/src/guard.ts` (`rmReason`) |
| ReplayProvider `streamDelayMs` | `0` (*"instant, for tests"*) | `adapters/src/agent/replay/replay-provider.ts` |

> [!check] Changed 2026-10-22
> The recursive-`rm` rule left `DEFAULT_DENY_COMMANDS` and moved into the guard itself, so it applies whenever guards are set. It now checks every operand against the write roots, where the old regex matched a first operand starting with `/`, `~` or `..`.

## Designed defaults

> [!info] Design, not built
> Nothing in this table exists on `dev` as of 2026-10-22: there are no `step_defs`, `agents` or `run_events` tables, no draft mode, and events carry no `v` (decision C10 in [[Provider Implementation Decisions]]). The defaults the code has are in the table above.

| Default | Value | Source |
|---|---|---|
| Provider | Claude Code, the only real adapter in the plan; ReplayProvider is the test double; *"Every model call goes through the `claude` CLI"*. The build added OpenCode; whether it is in v1 is open ([[Agent Providers Open Questions]]) | PRD §17; [[Capability Library Decisions]] D1 |
| `step_defs.model` | `'sonnet'` | PRD §5 |
| `step_defs.effort` | `'medium'` | PRD §5 |
| `step_defs.permission_mode` | `'bypassPermissions'` | PRD §5 |
| `agents.default_model` / `default_effort` | `'sonnet'` / `'medium'` | PRD §5 |
| Draft mode | *"overrides every step to `--model haiku --effort low`"* | PRD §13 |
| `run_events.v` | `1` | PRD §5 |

## Seed flow models

> [!info] Design, not built
> No seed flow exists on `dev` as of 2026-10-22.

The *Software delivery* seed flow (PRD §15) sets the models every v1 run starts with:

| Step | Model | Effort |
|---|---|---|
| `research` | sonnet | medium |
| `grill` | sonnet | medium |
| `plan` | opus | high |
| `explain` | haiku | low |
| `implement` | opus | high |
| `tests` | sonnet | high |
| `check` | — (shell, no provider) | — |
| `review` | opus | high |
| `summarize` | sonnet | medium |

All values are Claude aliases, used as logical ids under [[Capability Library Decisions]] D20. The Claude adapter takes them as they are; OpenCode needs a `provider/model` id, so they would not run there unchanged ([[Logical Model Ids]]). The capability-library mockup gives seeded agents different defaults (for example `scout` `haiku`/`low`, `reviewer` `sonnet`/`medium`); see [[Seeded Capabilities]].

## Sample content

| Sample | Where | What it shows |
|---|---|---|
| ReplayProvider self-check script | `docs/old/reference/adapters/agent/replay/replay-provider.ts`; `07`. In the code it is the test *replays a script* in `adapters/test/replay.test.ts` | `system` `abc-123` → `assistant_text` `hello` → `result` with `input 100, output 50, numTurns 2, costUsd 0.012, outcome 'pass'` |
| `stream-sample.jsonl` | `docs/old/`; the same bytes are the test fixture `adapters/test/fixtures/claude-hello.jsonl` | A real Claude Code `stream-json` run: one turn, `total_cost_usd` `0.45876175`, native model `claude-fable-5-1` |
| `opencode-read.jsonl` | `adapters/test/fixtures/`, recorded by `capture-opencode.ts` | A real OpenCode event stream: `openrouter/deepseek/deepseek-v4.1-flash` asked to *"Read hello.txt and reply with its exact contents."*; the OpenCode normalizer's test input |
| Task `provider-codex`, *"Codex CLI behind the AgentProvider seam"*, repo `flowboard/providers` (whether a repo is a project: [[Projects Open Questions]] #1) | `monitor.html` | A `research` run in state `asking` |
| The same task's question | `inbox.html`, `inbox-guide.html` | *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"* — options *Estimate from tokens* / *Record as unknown*. The guide's walkthrough branches: you answer it in the inbox (*Estimate from tokens* preselected), or a teammate, dana, answers it in Slack and the record reads *"How should we record Codex spend? → Estimate from tokens"*. |
| `PROVIDERS`: `claude` (*Claude Code*), `codex` (*Codex CLI*) | `capability-library.html`, `capability-library-guide.html` | Two providers, a pack per provider; 7 of the 17 sample capabilities have a Codex pack, shown as *"codex packs for 7 of 17"* (computed in the mockup, written out in the guide). The mockups predate the OpenCode adapter |

> [!note] The sample question is the spike's risk point (b)
> The mockups' Codex question restates `01-ports.md`'s *"Codex reports tokens, not dollars"*. The mockup offers *"Record as unknown"* as an option; the architecture's answer is PricingService (`06` §12). See [[Usage And Native Cost]].

## Related

- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Replay Provider]]
- [[Run Config Reference]]
- [[Codex Adapter]]
- [[Cost Defaults And Sample Figures]]
