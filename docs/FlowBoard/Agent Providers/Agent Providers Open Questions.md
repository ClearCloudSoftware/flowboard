---
tags: [flowboard, agent-providers, open-questions]
module: Agent Providers
---

# Agent Providers Open Questions

Every place the sources disagree or leave a gap. Items marked **proposal** are inferences, not source facts.

In the questions, `agent-provider.ts`, `events.ts` and `replay-provider.ts` mean the reference port in `docs/old/reference/`. The shipped code is in `code/flowboard/packages/` and is cited by package, as in `core/src/ports/agent-provider.ts`; adapter files are cited from `adapters/src/agent/`, as in `claude/options.ts`. A **Decided** line says how a question was settled and where the code is. Lines dated 2026-10-22 were decided by Claude while fixing a docs audit, and are open to Alex's review.

## The contract

### 1. Is `tool_hooks` a capability?
`01-ports.md` and PRD §7 (*"Hooks are a provider capability (`tool_hooks`)"*) say yes; `agent-provider.ts` omits it. Listed as open drift in [[Capability Library Decisions]]; also [[Execution Open Questions]] #42 and [[Sandboxing Open Questions]] #25. → [[Provider Capabilities]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): yes. `Capability` gains `tool_hooks`; it means the provider enforces `RunSpec.guards` inside the agent.

As built, both real providers declare it and call `checkToolCall` (`core/src/guard.ts`): Claude from an in-process `PreToolUse` hook (`claude/options.ts`), OpenCode from a plugin (`opencode/guard-plugin.ts`); a guarded OpenCode run fails if the plugin did not load. File-edit tools (Claude's Write, Edit, MultiEdit and NotebookEdit; OpenCode's write, edit and apply_patch) are checked against `writeRoots` and `denyPaths`. Shell commands are checked against the recursive `rm` rule and `denyCommands`. Any other shell command an allow rule permits can write anywhere.

**Decided 2026-10-22** (open to Alex's review):
- A recursive `rm` must stay inside the write roots, the PRD's *"`rm -rf` outside the worktree"* ([[In-Agent Hooks]]). The rule is built into `checkToolCall` and derived from `writeRoots`, so it applies whenever guards are set; it is not a regex callers opt into. Operands resolve where the shell is: Claude's hook passes the shell's current folder, OpenCode's plugin passes bash's `workdir`, and a literal `cd` earlier in the command is followed. It still reads command text, so a script, `eval`, `find -delete` or another command that deletes (`git clean`, `mv`, `truncate`) can get around it. `DEFAULT_DENY_COMMANDS` keeps `git push`, `git reset --hard` and a download piped into a shell, and applies only when the caller passes it (`run-agent` does).
- A file-edit write is checked where it lands, after following links. Write roots are resolved the same way. A leading `~/` is the home folder.
- `denyPaths` keeps Node's `path.matchesGlob` on the path relative to the folder, with dot-files matched: `*` stays in one folder, `**` crosses folders. On macOS and Windows the path and the glob are lower-cased first, so letter case is ignored there, as the disk ignores it.

The OpenCode plugin sees only the agent's tool calls. The server's `POST /session/{id}/shell` and `POST /pty` run commands without it and without a permission ask. Anyone with the server password can call them, and a run whose shell may read its environment can read the password, so in practice the agent needs shell access first. The sandbox tier is the floor.

### 2. `CapabilityPack`: data or behaviour?
`agent-provider.ts`: a `mount` data union. `05` §13: `mount(spec: RunSpec): void`. **Resolved** by [[Capability Library Decisions]] D2: data. → [[Run Spec]]

As built, each adapter reads `mount` in its own terms. Claude mounts `plugin_dir` as SDK `plugins` (and fails the run if one did not load), appends `system_prompt` text to the system prompt, and ignores `native` (`claude/options.ts`). OpenCode mounts a `plugin_dir`'s `skills/` folder through `skills.paths`, puts `system_prompt` text in the prompt's `system`, and applies `native` config (`opencode/options.ts`). Neither checks which provider a pack was made for (decision C7 in [[Provider Implementation Decisions]]).

**Decided 2026-10-22** (open to Alex's review): a `native` pack's config is applied first, and the OpenCode adapter's own keys (`permission`, `experimental`, and when set `mcp`, `skills`, `agent` and `plugin`) replace the pack's. No pack can drop the permission rules, the guard plugin, `ask_user` or the step limits. Keys the adapter does not set are kept. The replace is shallow, so a pack's own `mcp` servers or `plugin` entries are lost when the run sets those keys too. `run-agent` never builds `native` packs.

### 3. Does `RunSpec` carry `exec`?
`01-ports.md`'s sketch has no `exec`; its own ExecHost section and `agent-provider.ts` do. → [[Run Spec]]

**Decided 2026-10-18** (as built; recorded 2026-10-22): yes, `RunSpec.exec?: ExecHost` (`core/src/ports/agent-provider.ts`). Both adapters spawn through it and fall back to `hostExecHost`, a plain child process on the host (`adapters/src/exec/host.ts`): Claude through the SDK's `spawnClaudeCodeProcess`, OpenCode for `opencode serve`. `ExecHost.spawn` takes a `NodeJS.ProcessEnv` and returns Node's `ChildProcessWithoutNullStreams`, because the SDK talks to the CLI over stdin (`core/src/ports/exec-host.ts`). Nothing passes `exec` yet; `run-agent` runs on the host.

### 4. Launch inputs `RunSpec` has no field for
PRD §7's command needs `--permission-mode`, `--settings` (hooks), `--append-system-prompt` (agent prompt) and `--session-id`. The tier is only implicit in `exec`. The runner, not the adapter, writes the Claude-format `mcp.json` and hook `settings.json` (`03` §6; PRD §9; drawio *Runner*). **Proposal:** add `permissionMode` and `systemPrompt` to `RunSpec`, and treat hook settings as adapter-generated from a provider-neutral rule set. → [[Run Spec]], [[Claude Code Adapter]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): `RunSpec` gains `permissionMode`, `systemPrompt` and `guards: GuardRules` (provider-neutral rules; `core/src/guard.ts` checks them). The SDK takes all three as options, so the runner writes no Claude-format `settings.json`. On OpenCode they become permission rules and answers to permission requests, the prompt's `system`, and a guard plugin listed in `OPENCODE_CONFIG_CONTENT`. Neither adapter writes a `settings.json` or `mcp.json`: `RunSpec.tools` becomes SDK `mcpServers` on Claude and config `mcp` on OpenCode.

### 5. Who creates the session id?
`agent-provider.ts`: `sessionId` *"Resolves once the provider emits its session id (from system/init)"*. PRD §7: the runner generates a uuid and passes `--session-id`. → [[Session Resume And Context Replay]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the provider reports it, and no adapter passes one. Claude reads it from the first `system/init`; a fork reports its new id there. OpenCode cannot take a caller-chosen id: it takes the id from the session create or fork response (a plain resume keeps the stored id) and emits it as a synthesized `system` event. `AgentRun.sessionId` rejects if the run ends without one (`core/src/ports/agent-provider.ts`). Since 2026-10-22 Replay does the same: it uses `script.sessionId` or its first `system` event, else it rejects (#20).

## Events

### 6. Event version `v`
`01-ports.md` and PRD §7 put `v` on every event; `events.ts` has no `v` field. Same as [[Monitor Open Questions]] #39 and [[Execution Open Questions]] #62. → [[Normalized Event Envelope]]

**Decided 2026-10-18** (decision C10 in [[Provider Implementation Decisions]]): skipped for now. The shipped `NormalizedEvent` has no `v` either (`core/src/ports/events.ts`). `run_events` and its `v` column wait for the runner, which is not built.

### 7. Native events with no normalized kind
The stream sample has `system/hook_started`, `hook_response`, `status` and `rate_limit_event` lines. No source says whether they map to `system`, are dropped, or are kept only as raw. → [[Stream Parsing And Normalization]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): dropped. They produce no normalized event. Text deltas are dropped too: Claude takes each text from the full `assistant` message and ignores the deltas (`claude/normalize.ts`), and OpenCode emits a text or reasoning part once, whole, when it ends (`opencode/normalize.ts`). `message_start` and `message_delta` become `usage` events (#9). Both adapters drop rate-limit and retry records, so a rate-limited failure reaches the caller only as error text.

### 8. Where `summary` lives
`events.ts` puts `summary` on `tool_use` only; PRD §5/§7 give every `run_events` row a `summary` *"for the viewer"*. Adapter or runner? Also [[Monitor Open Questions]] #39. → [[Normalized Event Envelope]]

**Half answered 2026-10-18** (as built; recorded 2026-10-22): the adapters build `summary`, but only for `tool_use`, with the shared `summarizeTool` (`adapters/src/agent/summarize.ts`). It is one line such as `Bash: pnpm test` or `Read src/a.ts`, in the provider's own tool name (`bash: pnpm test` on OpenCode). Who writes a summary for the other seven kinds is open; the runner that writes `run_events` is not built.

### 9. Live usage mid-run
`Usage` arrives only on `result`; PRD §7 wants a running number from per-message usage; `partial_stream` promises *"live token counts"*. No kind carries them. Same as [[Monitor Open Questions]] #38, [[Execution Open Questions]] #62 and [[Cost And Control Open Questions]] #2. **Proposal:** a `usage_delta` kind, or `Usage` on `assistant_text`. → [[Normalized Event Envelope]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): an eighth kind, `usage`, carrying running totals for the run. Claude emits it on each `message_start` and `message_delta`; OpenCode on each `step-finish` part, subagents' steps included. Every kind also has an optional `raw`, the native message it came from. It is absent on an error the adapter raises with no native message behind it, such as a thrown exception or OpenCode's `max_budget:` (`core/src/ports/events.ts`).

**Changed 2026-10-22** (the port comment, to match both adapters): `costUsd` is USD as the provider reports it. Claude reports it only on the result, so its live `usage` events, and a run stopped before the result, have none. OpenCode reports it on every event, with 0 for a model it has no price for. Absent means "price it from tokens". The old rule, absent when the provider lacks `native_cost`, is gone.

### 10. Who sets `outcome`?
`RunResult.outcome` is *"read from the produced JSON or set_outcome"* (runner-side facts), yet the adapter-emitted `result` event carries `outcome?`. Claude's native `result` has no outcome field. → [[Agent Run Handle And Result]]

Still open. As built, neither real adapter sets `outcome`; only Replay passes a scripted one through. Every Claude or OpenCode run therefore ends with `outcome` unset, which the port says parks the step at a human gate. Structured output ([[Provider SDK Fit Analysis]], change 5) was skipped on purpose in both 2026-10-18 plans as *"the Execution component's call"*, and the `set_outcome` tool is not built.

## Models

### 11. Which logical vocabulary?
`reasoning-high` / `fast-cheap` / `default` (`01-ports.md`, `06` §15) vs Claude aliases as logical ids (PRD §5; [[Capability Library Decisions]] D20). Decided for v1 (aliases); open for the second provider. Also [[Flow Design Open Questions]] #15. → [[Logical Model Ids]]

**Decided 2026-10-18** (as built; recorded 2026-10-22): there is no shared logical vocabulary; each provider takes its own ids. Claude's `resolveModel` returns the id unchanged, so a Claude run takes an alias or any id the CLI accepts (`claude/provider.ts`). OpenCode's looks the id up in a `models` table given to its constructor, and passes a `providerID/modelID` id through (`opencode/provider.ts`). `run-agent` gives it an empty table (`cli/src/run.ts`), so an OpenCode run names its model as `providerID/modelID`. Nothing maps `reasoning-high` and the like.

### 12. The resolution table and what is recorded
No table is written out; where it lives (adapter code, settings, DB) and what an unknown id does are unstated. `runs.model` could hold the logical id, the resolved native id, or the stream's reported id (`claude-fable-5-1` in the sample). `06` §15 says *"resolved"*. → [[Logical Model Ids]]

**Decided 2026-10-18** (as built; recorded 2026-10-22), for the table: it lives in adapter code, as the `models` option of `OpencodeProvider`; Claude has none. Claude hands an unknown id to the CLI as is. OpenCode throws `no OpenCode model for logical id '<id>'` for an unmapped id without a `/`, which fails the run with exit 1; `run-agent` refuses such an id before launch (`cli/src/config.ts`). What is recorded is still open: there is no `runs` table. `run-agent`'s log keeps the id as written in the YAML, and the id Claude's CLI reports appears only in `raw` (`system/init`, `result.modelUsage`).

### 13. Draft mode target
`haiku`/`low` (PRD §13, drawio, backlog) vs `fast-cheap`/`low` (`06` §15). See [[Execution Open Questions]] #45. → [[Draft Mode And Spec Transforms]]

## Choosing a provider

### 14. How does a step pick its provider?
The capability-library guide: *"Steps name their provider individually — one flow can mix them."* `02` §2 validates against the step's *"target provider"*. `07`: the provider is constructed *"in the composition root"*, one per runner. `step_defs` has no provider column (PRD §5). Moot in v1 (D1). **Proposal:** a nullable `step_defs.provider` defaulting to a project or global setting. → [[Capability Negotiation]], [[Adding A Provider]]

The build overtook "moot in v1": D1 in [[Capability Library Decisions]] makes v1 Claude-only, yet two real providers exist. No flow or step exists yet to pick one. `run-agent` takes the provider per run from its YAML (`adapter: claude-code` or `opencode`) and constructs it for that run (`cli/src/run.ts`). Whether this matters for v1 is #38.

### 15. Provider ids
`claude-code` (port), `claude-cli` (PRD §3 folder), `claude` (capability-library mockup); `codex` vs `codex-cli`. The port's union is open in `agent-provider.ts`, closed in `01-ports.md`. → [[AgentProvider Port]]

As built, the ids are `claude-code`, `opencode` and `replay`, and the union stays open with `codex` in it (`core/src/ports/agent-provider.ts`). `run-agent`'s `adapter:` takes `claude-code` or `opencode`.

### 16. Run columns
PRD §5 has `runs.claude_session_id` and no `provider`, `model`, `effort` or `sandbox`. `02` §1 renames and adds `provider`; backlog 1.1 adds `model`/`effort`; PRD §11.1 prose names `runs.sandbox` *"alongside `runs.model`/`runs.effort`"*, as do `08`, backlog 1.1 and the drawio. Also [[Cost And Control Open Questions]] #14, [[Settings And Plumbing Open Questions]] #22. → [[Agent Providers Data Model]]

### 17. Is Codex in v1?
The drawio *Logical components* legend says *"dashed = not in v1"* and draws *Codex CLI* solid; the capability-library mockup treats Codex as live. PRD §3, the drawio *Harness architecture* and D1 say later. → [[Codex Adapter]]

OpenCode, not Codex, was built second. See #38.

## Validating the port

### 18. ACP or a hand-written port?
Open decision 2 in the architecture README. → [[Agent Client Protocol Option]]

**Overtaken 2026-10-18** ([[Provider SDK Fit Analysis]]): both SDKs give typed access to every need ACP was meant to cover, so the hand-written port stays viable, and the branch built it with the Claude Code and OpenCode adapters. ACP is deferred, not chosen. No ACP code or spike exists, and the OpenCode plan lists ACP as out of scope (`docs/superpowers/plans/2026-10-18-agent-providers-opencode.md`). Whether to revisit or drop it is not decided.

### 19. The Codex spike's risk points
Unresolved: (a) resume semantics, (b) cost, (c) MCP injection. `04` §9 already states *"Claude *and* Codex speak MCP"*, which (c) asks to confirm. → [[Codex Adapter]]

The premise changed: the port's second implementation is OpenCode, not a Codex spike (#38). The OpenCode build exercised the same three points. (a) A fork is `session.fork` with the run's permission rules re-applied, and a plain resume continues the stored session; no test covers the plain resume, and no caller passes `resume` yet. (b) Native cost arrives per step, 0 for an unpriced model. (c) Tool servers are injected as config `mcp`, and `ask_user` was checked live on both adapters (R20 in [[Run Agent CLI Decisions]]). For Codex the three points are still open.

### 20. Which replay harness?
A `NormalizedEvent` script (`replay-provider.ts`), a raw `stream-sample.jsonl` (`01-ports.md`; drawio *"Replays recorded stream-json"*), or a fake `claude` binary (backlog 0.2). The binary exercises the whole Claude adapter; the script skips parsing; the raw replay needs a parser inside the replay adapter that no source describes. → [[Replay Provider]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the replay provider stays a `NormalizedEvent` script; the Claude normalizer is tested against the recorded `stream-sample.jsonl`, and the provider against a fake `query()` that spawns a real child.

**Decided 2026-10-22** (open to Alex's review): Replay can fail like a real provider. A scripted `error` event fails the run (`exitCode: 1`, `error` is the first error's message). `sessionId` rejects when neither `script.sessionId` nor a `system` event gives one; the `'replay-session'` default is gone. Scripted `usage` events are tracked, so a stop keeps the last totals (`adapters/src/agent/replay/replay-provider.ts`).

### 21. Replay's fixed capability set
`sessions`, `partial_stream`, `native_cost` only, so replayed park/resume and HITL take the fallback paths. **Proposal:** let `ReplayScript` declare capabilities. → [[Replay Provider]]

### 22. Is a replay stop transient?
`stop()` settles with exit code 130; PRD §7 treats *"process killed by a signal"* as transient. Same as [[Execution Open Questions]] #55 and [[Monitor Open Questions]] #35. → [[Agent Run Handle And Result]]

Still open. As built, all three providers settle a stop before the result as `{ exitCode: 130, error: 'stopped' }`. A process killed from outside is not a stop: Claude and OpenCode report exit 1 with an error.

## Environment

### 23. Credentials for non-Claude providers
`ANTHROPIC_BASE_URL` → proxy is Claude's mechanism. The drawio lists *"api.openai.com (later)"* on the allowlist and labels the CLI-to-proxy edge *"HTTPS_PROXY"*; the Codex injection mechanism is unstated. Same as [[Sandboxing Open Questions]] #28. → [[Providers And Sandboxing]]

On the host tier, as built, OpenCode uses its own credentials: `auth.json` under `XDG_DATA_HOME`, or an inherited `OPENCODE_API_KEY` or `OPENCODE_AUTH_CONTENT` (`opencode/options.ts`). No proxy exists.

### 24. Isolating headless runs from personal config
Backlog 0.1 **DEC**: empty `--settings` or `CLAUDE_CONFIG_DIR`. D5 recommends *"Empty `--settings` file per run"* (backlog; the drawio D5 card: *"D5 · Hook isolation / Empty --settings file per headless run."*), but PRD §7 uses `--settings` for the hook file, so it cannot be empty. The stream sample itself shows personal `SessionStart` hooks injecting plugin text, plus personal plugins and MCP servers. Same as [[Execution Open Questions]] #52 and [[Sandboxing Open Questions]] #24. → [[Claude Code Adapter]]

**Decided 2026-10-18** (as built; recorded 2026-10-22), for the host tier: neither a `--settings` file nor `CLAUDE_CONFIG_DIR`. Claude runs get `settingSources: []`, `strictMcpConfig: true`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and the owner's environment minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (`claude/options.ts`). The guards are an in-process hook, so no settings file is needed. OpenCode runs get a fresh `XDG_CONFIG_HOME`, `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_CLAUDE_CODE=1` and `OPENCODE_DISABLE_AUTOUPDATE=1` (`opencode/options.ts`). A side effect: a Claude run does not read the folder's own `CLAUDE.md`, which needs the `project` setting source.

**Decided 2026-10-22** (open to Alex's review): an OpenCode run inherits no `OPENCODE_*` variable except the credentials `OPENCODE_API_KEY` and `OPENCODE_AUTH_CONTENT`, and, as on Claude, no `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. Still not isolated: on Claude, `~/.claude.json` and managed policy ([[Provider SDK Fit Analysis]]); on OpenCode, admin-managed config, `~/.opencode` (decision O9 in [[Provider Implementation Decisions]]) and `auth.json`, which holds the credentials.

### 25. No capability for `maxTurns`
`budget_cap` covers `maxBudgetUsd`; nothing covers `maxTurns`. → [[Provider Capabilities]]

Still no capability. As built, both real adapters honour `limits.maxTurns`: Claude passes `maxTurns`, and OpenCode sets `steps` on its `build`, `plan`, `general` and `explore` agents and fails a run the limit cut off (R16 in [[Run Agent CLI Decisions]]).

### 26. Capability data at design time
Validation and greying happen in `apps/web` and the browser; providers are adapters core may not import; PRD §12 has no capabilities route. **Proposal:** static capability descriptors per provider id in `core/ports`. → [[Capability Negotiation]], [[Agent Providers API And Routes]]

Nothing reads `provider.capabilities` yet: the runner and the flow editor are not built.

## Minor

### 27. "Three members"
`07` says *"the same three members"* and lists four. → [[AgentProvider Port]]

### 28. Gemini CLI
Named once (architecture README table), nowhere else. → [[Adding A Provider]]

## Models and environment, continued

### 29. Effort on other providers
`Effort` adds `xhigh` and `max`; the flow-designer mockup offers `low`/`medium`/`high` (also [[Flow Design Open Questions]] #15). How effort maps to Codex is unstated. → [[Logical Model Ids]]

As built for OpenCode: the effort is sent as the model's variant only when the model has a variant of exactly that name; otherwise it is dropped without a message (`pickVariant` in `opencode/options.ts`; R7 in [[Run Agent CLI Decisions]]). Codex is still unstated.

### 30. Re-attaching after restart
Restart recovery re-attaches by pid (`03` §7), but the port only gives a stream through `launch()`. How a new worker re-reads a live process's output is unstated. Same as [[Execution Open Questions]] #31. → [[Agent Providers Runtime]]

Not built on either provider (decision O13 in [[Provider Implementation Decisions]]). `pid` is now a promise (#37).

## Mappings and failures

### 31. The Claude adapter's capability set and flag mapping
No source writes out the Claude adapter's `capabilities` set or a `RunSpec` → flag table; both in these notes are **inferred** from PRD §7 and `03` §5. Gaps the inference exposes: `toolPolicy.deny` has no Claude flag in PRD §7; backlog 0.1 asks to verify a `--tools` flag whose one backlog use is the importer agent (*"haiku, `--tools ""`"*, Story 7.3; #36), with no step-level `RunSpec` field mapping to it; `--include-partial-messages` implies `partial_stream`, yet no live-usage event exists (#9). → [[Claude Code Adapter]], [[Provider Capabilities]]

**Decided 2026-10-18** (as built; recorded 2026-10-22): both are in code. Claude and OpenCode each declare all eleven capabilities (`claude/provider.ts`, `opencode/provider.ts`), OpenCode several only in part ([[Provider SDK Fit Analysis]], *Capability sets*); Replay declares three. The mappings are `buildQuery` (`claude/options.ts`) and, for OpenCode, `buildLaunch` and `toPermissionRules` (`opencode/options.ts`, `opencode/permissions.ts`). `toolPolicy.deny` maps to the SDK's `disallowedTools` on Claude and to deny rules on OpenCode. The live-usage event exists (#9). Nothing sets the SDK's `tools` option, where `[]` turns off the built-in tools, so the importer's `--tools ""` still has no `RunSpec` field (#36).

**Decided 2026-10-22** (open to Alex's review): an explicit deny of the ask tool wins on both adapters, as `disallowedTools` already did on Claude. Each injected tool server is still pre-approved, so no allow list, and no missing one, can lock out asking. On OpenCode the injected servers' allow rule now comes before the deny list (`opencode/permissions.ts`).

### 32. Mapping Claude's usage fields onto `Usage`
**Inferred, not sourced:** `cache_creation_input_tokens` → `cacheWrite`, `cache_read_input_tokens` → `cacheRead`, `num_turns` → `numTurns`. Unstated: whether `input` includes cached tokens, and whether `result.usage` or `modelUsage` is the authority. PRD §7: *"Verify the actual field names against your `docs/stream-sample.jsonl` probe."* Whether the cost is a bill at all (`costBasis: "list"`) is [[Cost And Control Open Questions]] #7. → [[Stream Parsing And Normalization]]

**Decided 2026-10-18** (as built; recorded 2026-10-22), in `claude/normalize.ts`: `modelUsage` is the authority. The result's tokens are its entries summed (`inputTokens` → `input`, `outputTokens` → `output`, `cacheReadInputTokens` → `cacheRead`, `cacheCreationInputTokens` → `cacheWrite`), which includes subagents. `result.usage` is the fallback when `modelUsage` is empty, with the mapping above. `costUsd` is `total_cost_usd`. `input` is taken as reported; no cached tokens are added to it. OpenCode sums its `step-finish` parts, with reasoning tokens counted in `output` (`opencode/normalize.ts`). Whether the cost is a bill is still open.

**Decided 2026-10-22** (open to Alex's review): `numTurns` is the main agent's turns (model calls) on both providers; subagents' tokens and cost count, their turns do not. On Claude the result uses the CLI's `num_turns`, and the live `usage` events count the main agent's finished messages (`message_stop` with no `parent_tool_use_id`). OpenCode counts the `step-finish` parts of the root session only. Before, Claude's live events always said 0 and OpenCode counted subagent steps too.

### 33. `is_error` on a zero exit
Backlog 3.2: *"non‑zero or `is_error` → failed"*. `RunResult` has `exitCode` and `error` but no flag for a CLI-reported error on exit 0. **Proposal:** the adapter emits an `error` event and sets `error` on `RunResult`, and the runner treats a set `error` as failed. → [[Agent Run Handle And Result]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the proposal. A set `RunResult.error` means failed, even when `exitCode` is 0.

**Decided 2026-10-22** (open to Alex's review): a stopped or failed run reports the usage it reached. `RunResult.usage` is the result's totals when a result arrived, and otherwise the last running totals from `usage` events (`claude/provider.ts`, `opencode/provider.ts`). On Claude those carry tokens and turns but no `costUsd`, so a stopped Claude run needs pricing from tokens; on OpenCode they carry cost. Before, a stopped or crashed run reported zero.

## Placement and inference

### 34. Where the stream parser lives
The port puts it in the adapter (`agent-provider.ts`; `03` §5). The drawio puts it in the core's *Run orchestrator* (*"spawns run, parses stream-json, emits events"*, *Logical components*) and in a separate worker *Stream parser* node fed straight from `claude`'s stdout (*Harness architecture*, edge *G*). → [[Stream Parsing And Normalization]], [[Provider Boundary Rules]]

**Decided 2026-10-18** (as built; recorded 2026-10-22): in the adapters, as the port says. `claude/normalize.ts` maps the SDK's typed messages and `opencode/normalize.ts` the server's events. Nothing parses stdout lines, and no separate stream parser exists.

### 35. Other inferred mappings in these notes
Labelled in place, listed here so none reads as sourced: which component consumes each event kind ([[Normalized Event Envelope]]); who performs each degradation ([[Capability Negotiation]]); port field → column and column → `RunSpec` field ([[Agent Providers Data Model]]); what each PRD §12 route returns ([[Agent Providers API And Routes]]); the ACP needs → port mapping ([[Agent Client Protocol Option]]); the launch sequence ([[Agent Providers Runtime]]).

### 36. Agent calls outside a step
The backlog's import agent (Story 7.3: *"haiku, `--tools ""`"*, *"Isolate the importer from global hooks"*) is a Claude call with no step. Whether it goes through the `AgentProvider` port is [[Intake And Import Open Questions]] #12. → [[Provider Boundary Rules]]

## The run handle

### 37. Is `AgentRun.pid` known at launch?
`agent-provider.ts` gives the handle a plain `pid: number`; restart recovery re-attaches by pid (#30), and backlog 3.4 stops a run by pid. But the Claude Agent SDK spawns the CLI only after `launch()` returns, and OpenCode runs a server rather than one process per attempt ([[Provider SDK Fit Analysis]], change 2). → [[Agent Run Handle And Result]]

**Decided 2026-10-18** (Claude adapter plan, *Port decisions*; recorded 2026-10-22): `AgentRun.pid` is a `Promise<number>` that resolves once the process is spawned, or to `-1` if nothing was (`core/src/ports/agent-provider.ts`). Claude's is the CLI's pid, taken in the SDK's `spawnClaudeCodeProcess`. OpenCode's is the `opencode serve` pid, known once the server is listening. Replay's is `script.pid`, else `-1`.

## Scope

### 38. Is OpenCode in v1, and is Codex still next?
The plan: v1 is Claude-only (D1 in [[Capability Library Decisions]]), and Codex comes later (PRD §3; the drawio *Harness architecture*; #17). The build: OpenCode was built on 2026-10-18 as the second real provider, on non-Claude models, as [[Provider SDK Fit Analysis]] recommended, and `run-agent` runs either one. That build already exercised the Codex spike's three risk points on OpenCode (#19). Codex is designed ([[Codex Adapter]]) but not built: `codex` is only a name in `ProviderId`. The [[Agent Providers Index]], [[Agent Providers Overview]], [[Agent Providers Roadmap]], [[Codex Adapter]] and [[Adding A Provider]] now describe what is built and point here. Not decided; Alex owns it. The answer bears on D1 and on #14, #17 and #19. → [[OpenCode Adapter]]

## Related

- [[Agent Providers Index]]
- [[Agent Providers Sources]]
- [[Provider Implementation Decisions]]
- [[Run Agent CLI Decisions]]
- [[Execution Open Questions]]
- [[Capability Library Open Questions]]
