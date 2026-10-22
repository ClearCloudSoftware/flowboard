---
tags: [flowboard, execution, concept, ports, agent-provider]
module: Execution
---

# Agent Launch Contract

How the runner launches an agent without knowing which agent it is. The seam is the **AgentProvider** port, *"The centerpiece"* (`01-ports.md`). The full treatment of providers is in [[Agent Providers Index]] (see [[AgentProvider Port]], [[Run Spec]] and [[Claude Code Adapter]]); this note covers what execution relies on.

## The port

From `docs/old/reference/core/ports/agent-provider.ts`, abridged: the doc comments are shortened into trailing comments, and the `id` comment spells out the `ProviderId` type.

```ts
export interface AgentProvider {
  readonly id: ProviderId;                       // 'claude-code' | 'codex' | 'replay' | …
  readonly capabilities: ReadonlySet<Capability>;
  resolveModel(logical: string): string;         // 'reasoning-high' -> 'opus' | 'o3'
  launch(spec: RunSpec): AgentRun;               // non-blocking
}

export interface AgentRun {
  sessionId: Promise<string>;   // from system/init
  pid: number;
  events: AsyncIterable<NormalizedEvent>;   // the runner tees this to run_events + SSE
  result: Promise<RunResult>;   // resolves on process exit
  stop(): void;                 // SIGTERM the child
}

export interface RunResult {
  usage: Usage;
  exitCode: number;
  outcome?: 'pass' | 'fail';    // Unset is NOT 'pass'
  error?: string;               // stderr tail on failure
}
```

> [!warning] The shipped code differs
> The shipped port (`core/src/ports/agent-provider.ts`, 2026-10-18) changes the handle and the result; see [[Agent Run Handle And Result]].
> - `pid` is a `Promise<number>`: `-1` if nothing was spawned, and on OpenCode the pid of its `opencode serve` server.
> - `stop()` still takes no arguments, but it aborts the provider's run first; then the child gets SIGTERM, and SIGKILL after a grace. A stop before the result settles `{ exitCode: 130, error: 'stopped' }` and keeps the usage so far. A process killed from outside is reported as exit 1, not as a stop.
> - `sessionId` rejects if the run ends without one, `ProviderId` adds `opencode`, and `RunResult.error` is the provider's own error report, else the stderr tail; a set `error` means failed, even at exit 0.

*"An adapter's job is exactly two mappings: 1. RunSpec -> the provider's native CLI flags / config. 2. the provider's native event stream -> NormalizedEvent"* (`agent-provider.ts`).

## `RunSpec`

*"Everything needed to launch one attempt of one step, provider-agnostically."*

| Field | Meaning (reference wording) |
|---|---|
| `prompt: PromptParts` | The six-part prompt, *"passed structured rather than pre-flattened"*. See [[Prompt Assembly]]. |
| `model` | *"Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel()."* |
| `effort?` | *"Dropped by the adapter when `effort` is unsupported."* |
| `toolPolicy?` | *"The runner always appends the ask-user tools so a restrictive list can't lock out HITL."* |
| `tools?` | MCP servers to inject, such as the ask-user shim |
| `capabilities?` | Skills or plugins to mount (`CapabilityPack`) |
| `cwd` | The workspace path |
| `exec?` | The `ExecHost`: *"host by default, or a sandbox"* |
| `resume?` | `{ sessionId, fork? }`; *"`fork` requires the `resume_fork` capability, else context-replay"* |
| `limits?` | `{ maxTurns?, maxBudgetUsd? }` |

> [!warning] The shipped code differs
> - The shipped `RunSpec` (2026-10-18) adds `permissionMode`, `systemPrompt` and `guards`. With no mode set, the adapters use `dontAsk`; `run-agent` defaults to `acceptEdits`.
> - The adapter, not the runner, pre-approves each injected tool server, with or without an allow list: `mcp__flowboard__*` on Claude, `flowboard_*` on OpenCode. An explicit deny still wins (2026-10-22).
> - `model` has no shared logical vocabulary: Claude takes an alias or model id as is, and OpenCode a `provider/model` id ([[Agent Providers Open Questions]] #11). See [[Run Spec]].

## Capabilities the engine and runner check

*"The engine and flow editor query `capabilities` before using a knob"* (`01-ports.md`):

| Missing capability | Fallback |
|---|---|
| `effort` | *"adapter drops it; editor greys the field"* |
| `resume_fork` | *"park/resume falls back to **context-replay**"* |
| `mcp_tools` | *"HITL uses the artifact-file fallback"* |
| `native_cost` | *"PricingService computes cost from tokens"* |
| `allowed_tools` | *"tool policy becomes advisory / prompt-level"* |
| `tool_hooks` | *"a provider without them relies on the sandbox alone, and the flow editor says so"* (PRD §7) |
| `budget_cap` | *"else it is advisory"* (`agent-provider.ts`: *"honours maxBudgetUsd; else it is advisory"*) |
| `permission_modes` | none stated. The flag means *"supports a bypass/ask permission mode"* (`agent-provider.ts`); the permission gate needs it ([[Run Guardrails At Launch]]) |

The first five rows are `01-ports.md`'s list. `sessions`, `plugins` and `partial_stream` have no stated fallback either. Per-flag detail is in [[Provider Capabilities]] and [[Capability Negotiation]].

## The Claude adapter's command

PRD §7 gives the command for a `start_run` job (one flag per line there; reflowed here):

```
claude -p "<prompt>"
  --output-format stream-json --verbose --include-partial-messages
  --model <step.model> --effort <step.effort>
  --permission-mode <step.permission_mode>
  --session-id <generated uuid, stored as runs.claude_session_id>
  --mcp-config <generated per-run mcp.json>
  --settings <generated per-run settings.json with PreToolUse hooks>
  --strict-mcp-config
  --plugin-dir <dir of each plugin the step names: its skill's plugin + extra_plugin_ids>
  [--allowedTools ...]  [--max-turns N]  [--max-budget-usd N]
  [--append-system-prompt <agent.system_prompt, when the step names an agent>]
```

A resume adds `--resume <claude_session_id> --fork-session` (PRD §9; `03` §5 lists both flags). See [[Session Resume And Context Replay]].

*"Run with `cwd` set to the task's worktree path. `--strict-mcp-config` is important: it stops my personal MCP config leaking into runs and keeps them reproducible."* (PRD §7)

Fixes that move into the adapter (`03` §5): *"`message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas"*; *"Capture `session_id` once from `system/init`, not every line"*; *"`total_cost_usd` authoritative → maps to `Usage.costUsd`"*; *"Always append `mcp__vibe__*` to `--allowedTools`"*.

> [!warning] The shipped code differs
> - The adapter is built on the Agent SDK 0.3.302, which runs the installed `claude` 2.1.302 and builds its flags from options: `plugins`, `allowedTools` and `disallowedTools`, `permissionMode`, `includePartialMessages`, `resume` and `forkSession`, `maxTurns`, `maxBudgetUsd`, `effort`. The `systemPrompt`, appended to the `claude_code` preset, goes over stdin in the SDK's initialize request, not as a flag. Runs use the owner's subscription login; `ANTHROPIC_API_KEY` is stripped.
> - No `--session-id`: the id comes from the first `system/init` message. No `mcp.json` or `settings.json` is written: the ask-user server goes in as `mcpServers` with `strictMcpConfig`, `settingSources: []` keeps the user, project and local settings and the folder's `CLAUDE.md` out, and the guards are an in-process `PreToolUse` hook, registered only when `RunSpec.guards` is set.
> - The `03` §5 fixes are in the adapter. The server is `flowboard`, not `vibe`, and `mcp__flowboard__*` is pre-approved with or without an allow list; an explicit deny still wins (2026-10-22). `total_cost_usd` becomes `Usage.costUsd` on the result only. See [[Claude Code Adapter]]; OpenCode instead takes one per-run config in `OPENCODE_CONFIG_CONTENT` ([[OpenCode Adapter]]).

## The events

Seven kinds in the design (`01-ports.md`, the reference `events.ts`). Each carries a schema version `v`, starting at 1 (`01-ports.md`; PRD §7; `run_events.v` in PRD §5), though `events.ts` has no `v` field. The kinds: `assistant_text`, `thinking`, `tool_use`, `tool_result`, `system`, `result`, `error`. The runner writes each to `run_events` *"with an incrementing `seq`"* and a one-line `summary` (PRD §7). The raw line is kept too: *"Persist the raw line alongside the normalized event (the schema already has `run_events.raw`)"* (`01-ports.md`), and field names follow the OpenTelemetry GenAI conventions (PRD §7; `01-ports.md`). The viewer side is in [[Event Stream And SSE]]; the parsing side in [[Normalized Event Envelope]] and [[Stream Parsing And Normalization]].

> [!warning] The shipped code differs
> - `core/src/ports/events.ts` (2026-10-18) has eight kinds: `usage` carries the run's running totals mid-run, with no cost on Claude until the result. Any event may carry `raw`, the native message, already parsed. Tool events keep each provider's own tool names and inputs. There is no `v` yet.
> - Nothing parses stdout lines: the Claude adapter reads the Agent SDK's typed messages, and OpenCode its server's SSE events. The adapters build `summary`, on `tool_use` only.
> - `run_events` and `seq` wait for the runner, which is not built; `run-agent` appends every event to `runs/<stamp>-<adapter>.jsonl`. See [[Normalized Event Envelope]].

## Where the sources disagree

> [!warning] Three versions of the contract
> - `01-ports.md`'s `Capability` includes `tool_hooks`; the reference `agent-provider.ts` (`docs/old/reference/`) does not. The shipped port (`core/src/ports/agent-provider.ts`, 2026-10-18) has it, with the rules in `RunSpec.guards`; Claude Code and OpenCode declare it and enforce the guards in-agent ([[Agent Providers Open Questions]] #1).
> - `01-ports.md`'s `RunSpec` sketch has no `exec`; the reference and `01-ports.md`'s own ExecHost section (*"passes it in `RunSpec.exec`"*) do. Through `exec`, the reference carries the sandbox tier (`ExecHost.id`, `SandboxProfile.tier`); the sketch carries none ([[Agent Providers Open Questions]] #3).
> - Neither `RunSpec` carries the permission mode, the agent's system prompt or the per-run hook settings, all of which the PRD §7 command needs ([[Agent Providers Open Questions]] #4). The shipped port adds `permissionMode`, `systemPrompt` and `guards`, so no hook settings file is written.
> - Who makes the session id: PRD §7 has the runner generate a uuid and pass `--session-id`; `AgentRun.sessionId` *"Resolves once the provider emits its session id (from system/init)"* (`agent-provider.ts`). See [[Agent Providers Open Questions]] #5. Decided 2026-10-18: the provider reports it, and no adapter passes one. Claude reads it from the first `system/init`, OpenCode from its session create or fork response.
> - `PromptParts` has six fields and no slot for the memory part 7 ([[Prompt Assembly]]).
> - `events.ts`' `NormalizedEvent` has no `v`, which `01-ports.md` and PRD §7 require ([[Agent Providers Open Questions]] #6). Decided 2026-10-18: skipped for now (C10 in [[Provider Implementation Decisions]]). The shipped type has no `v` either, and `run_events.v` waits for the runner.
> - `Usage` arrives only on the `result` event, yet PRD §7 wants a running cost from per-message tokens ([[Monitor Open Questions]] #38; [[Agent Providers Open Questions]] #9). Decided 2026-10-18: an eighth kind, `usage`, carries running totals; Claude's have no cost until the result.
>
> Listed in [[Execution Open Questions]] #42 and #62.

## Related

- [[Execution Index]]
- [[Runner Pipeline]]
- [[Prompt Assembly]]
- [[Run Guardrails At Launch]]
- [[Capability Runtime Mounting]]
- [[Agent Providers Index]]
- [[Run Spec]]
