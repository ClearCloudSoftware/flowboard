---
tags: [flowboard, agent-providers, decisions, implementation]
module: Agent Providers
date: 2026-10-18
---

# Provider Implementation Decisions

The calls made while building the [[Claude Code Adapter]] and the [[OpenCode Adapter]] on 2026-10-18, and the review findings left for later. Both providers live on branch `feature/agent-providers`, under `code/flowboard/packages/adapters/src/agent/`. Each was built from a plan (`docs/superpowers/plans/2026-10-18-agent-providers-claude-code.md` and `…-opencode.md`) and checked by an independent whole-branch review; the review's critical and important findings were fixed test-first before this note was written.

Port-level decisions (new `RunSpec` fields, the `usage` event, `pid` as a promise, and so on) are recorded against their questions in [[Agent Providers Open Questions]]. This note covers the rest.

## Claude Code provider

### Decisions

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| C1 | Built on the existing branch `feature/agent-providers`, not the plan's `feature/agent-providers-claude` | The owner asked for it | A branch rename |
| C2 | Kept the PRD's CLI flag tables in [[Claude Code Adapter]] and added a *Built on the Agent SDK* section that supersedes them | The notes are source-cited; the tables record what the PRD says | One table to delete |
| C3 | The live guard test asserts the hook's own message (*"Write outside the worktree"*), not just any failed tool call | A test that passes on its first run must prove the hook, not a coincidence | None |
| C4 | `stop()` after the result no longer relabels a finished run as stopped; graded important, not minor | A graceful shutdown would mark completed steps cancelled and re-run them | None |
| C5 | Shell writes outside the worktree (redirects, `cp`, `tee`) are not blocked by the guard | The guard matches commands with regexes; the sandbox tier is the floor | On the host tier, a run can write anywhere the owner can |
| C6 | Only `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are stripped from the run's env; `ANTHROPIC_BASE_URL` and `CLAUDE_CODE_USE_BEDROCK` / `VERTEX` pass through | The sandbox tier will need `ANTHROPIC_BASE_URL` for the egress proxy | A worker env with those set silently reroutes runs |
| C7 | The adapter does not check which provider a `CapabilityPack` was made for | Capability negotiation and pack validation belong to the runner ([[Capability Negotiation]]) | A pack made for another provider gets mounted on Claude |
| C8 | `ReplayProvider.result` still settles only while its `events` are read | It is a test double; the limit is marked in the code | A runner test that never reads events hangs |
| C9 | Resume was not checked for replayed history | Verifying it needs a paid run, and the plan does not exercise resume | A resumed run's viewer may show earlier messages again |
| C10 | No schema version `v` on `NormalizedEvent`, no CLI/SDK version check, `dontAsk` as the default permission mode | Listed as skipped or by design in the plan | Small follow-ups |
| C11 | The destructive-command check catches recursive `rm` of `/`, `~` or `..` however the flags are written (`rm -r -f /`, `rm --recursive --force /`, `rm -f -r -- /`) | Split flags got past the old pattern | Still a regex: a script or `eval` gets around it; the sandbox tier is the floor |
| C12 | Both providers send `SIGKILL` when a child ignores `SIGTERM` for 5 s (`killGraceMs` option; shared helper `adapters/src/exec/terminate.ts`) | A stuck CLI or server kept `result` pending forever | A child that needs more than 5 s to shut down cleanly is cut off |

### Deferred issues

| Issue | Effect | Where |
|---|---|---|
| A file inside the worktree whose name starts with `..` (e.g. `..foo`) is denied | The agent cannot write such a file | `core/src/guard.ts` |
| A child killed by a signal reports exit code 1 | The runner cannot tell an out-of-memory kill (transient, worth retrying) from a plain failure | `claude/provider.ts` |
| The plugin-loaded check resolves relative paths against the worker's cwd and ignores symlinks | A relative or symlinked plugin dir fails the run although it loaded (fails safe) | `claude/provider.ts` |
| The provider's abort listener duplicates the SDK's own kill, and misses a signal that was already aborted | Harmless today; dead code if the SDK keeps killing the child itself | `claude/provider.ts` |
| Importing `@flowboard/adapters` loads the Claude SDK even for replay-only use | Slower imports in runner tests | `adapters/src/index.ts` |

## OpenCode provider

### Decisions

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| O1 | The capture test reads the root session id from the final `session.idle` | The capture subscribed after creating the session, so it has no `session.created` | None |
| O2 | MCP config entries leave out `environment` when a tool server has none | The plan's expected value contradicted its own JSON round-trip test | None |
| O3 | The provider answers every `permission.asked`, not only those of the run's sessions | One server per run means every request is the run's | If servers are ever pooled, filtering by session must come back |
| O4 | The event stream is subscribed with `{ signal, sseMaxRetryAttempts: 1 }`; the provider waits for `server.connected` before prompting, and a dead server aborts the stream | The SDK's stream connects lazily and retries forever | None |
| O5 | `stop()` after the result does nothing; a stop before it reports `stopped` even though the abort makes OpenCode report the session idle | Matches the Claude provider | None |
| O6 | Server start failures are read on `close`, not `exit` | So the server's full error output is in the message | None |
| O7 | Changed *"the only real one"* to *"the first real one"* in [[Claude Code Adapter]] | No longer true | One sentence |
| O8 | Inherited `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` stripping graded important, not minor, and fixed | The plan's isolation rule covers them | None |
| O9 | `~/.opencode` and OpenCode's remote well-known config still load | Accepted by the plan; `~/.opencode` does not exist on this machine | Extra config on another machine |
| O10 | The guard plugin and `@flowboard/core` load from host paths | Same limit as Claude `plugin_dir` mounts | A container `ExecHost` cannot use them; a guarded run there fails loudly instead of running unguarded |
| O11 | Tool-policy patterns pass through as written (`Bash(pnpm *)` here, `Bash(pnpm:*)` in Claude Code) | [[Run Spec]] defines no glob syntax | A pattern may match on one provider and not the other |
| O12 | A model with no listed price reports cost 0, so `maxBudgetUsd` never trips for it | Mirrors Claude | An unpriced model runs with no budget cap |
| O13 | No server pooling, no re-attach after a worker restart | Listed as skipped in the plan | About a second of startup per run |
| O14 | Reading `*.env` and `*.env.*` asks (refused in a headless run unless the mode answers everything); `*.env.example` stays allowed. The rules sit after the allow list, so allowing `Read` does not re-open them | OpenCode's own default; secrets in the project would otherwise go to the model provider | A run that needs a `.env` must use `bypassPermissions` or `auto` |
| O15 | `maxTurns` sets `steps` on `build`, `plan`, `general` and `explore` | Subagents had no step limit, and on an unpriced model the budget cap does not work either | None |
| O16 | `startServer` keeps an `error` listener for the server's whole life, adding the message to the stderr tail | A late child error (e.g. a failed kill) was an uncaught exception | None |

### Deferred issues

| Issue | Effect | Where |
|---|---|---|
| The server password, `OPENCODE_CONFIG_CONTENT` and `FLOWBOARD_GUARDS` are visible to the agent's shell commands and local MCP servers | A run could reach its own server and loosen its own permission rules; the guard plugin still applies. Documented in [[OpenCode Adapter]] | `opencode/options.ts` |
| `--port 0` on the real server tries 4096 first; the fake server picks a random port | The concurrency test does not exercise real port contention | `test/fixtures/fake-opencode.mjs` |
| The MCP permission key does not apply OpenCode's name sanitizing | A tool server name containing `.` or `:` will not match its allow rule | `opencode/permissions.ts` |
| `partial_stream` is advertised, but live text deltas are dropped | Only per-step usage arrives mid-run | `opencode/normalize.ts`, `opencode/provider.ts` |
| A text part cut off by an abort before it ends is dropped | The partial text never reaches the viewer | `opencode/normalize.ts` |

## Related

- [[Run Agent CLI Decisions]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Provider SDK Fit Analysis]]
- [[Agent Providers Open Questions]]
- [[Agent Providers Index]]
