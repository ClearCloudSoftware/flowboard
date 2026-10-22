---
tags: [flowboard, agent-providers, behaviour, events]
module: Agent Providers
---

# Stream Parsing And Normalization

The second of an adapter's two mappings: *"the provider's native event stream -> NormalizedEvent"* (`agent-provider.ts`). Feature map §6: *"Whatever tool runs, its output (messages, tool calls, results, cost) is translated into one common format the rest of the app understands."*

> [!check] Implemented 2026-10-18
> Each built adapter has its own normalizer. `adapters/src/agent/claude/normalize.ts` maps the typed messages that the Agent SDK's `query()` yields. `adapters/src/agent/opencode/normalize.ts` maps the OpenCode server's SSE events. Neither parses stdout lines, and neither writes `run_events` or a `seq`: that table belongs to the runner, which is not built. An unknown message type produces no event. A malformed record of a known type throws inside the normalizer, and the provider reports that as the run's error.

## Rules

| Rule | Source wording | As built |
|---|---|---|
| Write the parser against a real capture | *"Before writing the event parser, run this and save the output to `docs/stream-sample.jsonl` … Write the parser against what you see, not against what you expect. Note especially where cost and token usage appear."* (PRD §0) | Done. The Claude normalizer is tested against `adapters/test/fixtures/claude-hello.jsonl`, which is byte-identical to the sample below; the OpenCode one against a recorded stream, `opencode-read.jsonl` |
| Line by line | *"Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`"* (PRD §7) | The adapters parse no lines: the SDK hands the Claude adapter typed messages, and the OpenCode adapter reads SSE events. No `run_events`, no `seq` |
| Normalize and summarize | *"Normalise each event into one of the `type` values in the schema and produce a one-line `summary` for the viewer"* (PRD §7) | Eight kinds ([[Normalized Event Envelope]]). A `summary` only on `tool_use`, from `adapters/src/agent/summarize.ts` ([[Agent Providers Open Questions]] #8) |
| Fold partials | *"Event normalisation into the seven types + one‑line summaries; fold partial deltas."* (backlog Story 3.2) | Claude takes the full text from the `assistant` message and ignores text deltas. OpenCode emits a text or reasoning part once, when it ends |
| Keep the raw line | *"Persist the raw line alongside the normalized event"* (`01-ports.md`) | `raw` on every event: the native message, not a line. Absent on most errors an adapter raises itself; Claude's `plugin not loaded` carries the `system/init` message |
| Version every event | `v`, starting at 1; readers fall back to `raw` (PRD §7) | Not built: no `v` ([[Provider Implementation Decisions]] C10; [[Agent Providers Open Questions]] #6) |
| Provider JSON stays in the adapter | *"The viewer, cost ledger, and engine never see provider JSON."* (`01-ports.md`); *"Adding a provider adds a parser, nothing in the viewer."* (`03` §8) | Except tool events: `tool_use` and `tool_result` keep each provider's tool names and input and output shapes (`core/src/ports/events.ts`) |

## Claude-specific parsing fixes

These move *"into the Claude adapter, out of the runner"* (`03` §5):

- *"`message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas."* (`03` §5; backlog Story 3.2, **BUG**: *"reset per `message_start`, do not sum across deltas"*)
- *"Capture `session_id` once from `system/init`, not every line."* (`03` §5; backlog Story 3.3, **BUG (perf)**: *"parse once from the `system/init` event, not every line"*)
- *"`total_cost_usd` authoritative → maps to `Usage.costUsd`"* (`03` §5); PRD §7: *"Take the final result event's total cost as authoritative for `runs.cost_usd`."*

All three are implemented as written in `claude/normalize.ts`. A `message_delta` overwrites its message's usage. Messages are keyed by `parent_tool_use_id`, so parallel subagents' figures stay apart.

Backlog Story 3.2 also asks to *"persist `num_turns` per assistant turn so the viewer/board show live numbers."* Live `usage` events carry a turn count:

> [!check] Changed 2026-10-22
> `numTurns` means the main agent's turns (model calls) on both providers. Subagents' tokens and cost count, but their turns do not. This was decided on 2026-10-22 and is open to Alex's review.
> - Claude: a live `usage` event counts the main agent's finished messages, each a `message_stop` with no `parent_tool_use_id`. The result uses the CLI's `num_turns`. Before, live events always said 0.
> - OpenCode: counts the `step-finish` parts of the root session only. Before, it counted subagents' steps too.

## What the stream sample shows

`docs/old/stream-sample.jsonl` has 22 lines from one `claude -p "say hello and stop"` probe. Native types, in order, and what the Claude adapter makes of them ([[Agent Providers Open Questions]] #7 decided the dropped ones):

| Lines | Native `type` / `subtype` | Normalized kind |
|---|---|---|
| 1–10 | `system` / `hook_started`, `hook_response` | none: dropped |
| 11 | `system` / `init` (carries `session_id`, `model`, `tools`, `mcp_servers`) | `system`, from the first `init` only |
| 12 | `system` / `status` | none: dropped |
| 13–16, 18–20 | `stream_event` (`message_start`, `content_block_*`, `message_delta`, `message_stop`) | `usage` on `message_start` and `message_delta`; nothing for the others (`message_stop` closes the message's usage) |
| 17 | `assistant` | `assistant_text` (or `thinking`, `tool_use`), plus `error` when the message carries one |
| 21 | `rate_limit_event` | none: dropped |
| 22 | `result` / `success` (`total_cost_usd`, `usage`, `num_turns`, `is_error`, `modelUsage`) | `result`, plus `error` when `is_error` |

On this sample the adapter emits `system`, `usage`, `assistant_text`, `usage`, `result` (`adapters/test/claude-normalize.test.ts`).

Every line carries `session_id`, which is why the backlog says to capture it once. The `message_start`, `assistant` and `message_delta` usage objects carry `input_tokens`, `output_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`; `result` repeats them plus `modelUsage` keyed by model.

### Usage mapping

What the code does; this answers [[Agent Providers Open Questions]] #32 for the built providers.

| `Usage` | Claude `result` | Claude live `usage` | OpenCode `step-finish` parts |
|---|---|---|---|
| `input` | `inputTokens`, summed over `modelUsage` | `input_tokens` | `tokens.input` |
| `output` | `outputTokens` | `output_tokens` | `tokens.output` + `tokens.reasoning` |
| `cacheRead` | `cacheReadInputTokens` | `cache_read_input_tokens` | `tokens.cache.read` |
| `cacheWrite` | `cacheCreationInputTokens` | `cache_creation_input_tokens` | `tokens.cache.write` |
| `numTurns` | `num_turns` | the main agent's finished messages | the root session's `step-finish` parts |
| `costUsd` | `total_cost_usd` | absent | `cost`; 0 for a model with no listed price |

- **Claude result.** Sums `modelUsage` over every model, which includes subagents. Falls back to `result.usage` only when `modelUsage` is empty.
- **Claude live.** A `usage` event on each `message_start` and `message_delta` carries the running totals: the finished messages plus those still streaming. It has no `costUsd`, because Claude prices a run only in its result.
- **OpenCode.** Sums the `step-finish` parts of the root session and its subagent sessions, with one `usage` event per part. The `result`, at the root session's `session.idle`, carries the same totals.
- **Unverified.** Each field is copied as the provider reports it. Whether `input` includes cached tokens was not checked.

A run that ends before its result reports the last live totals, so a stopped Claude run has tokens but no cost. This changed on 2026-10-22, by a decision open to Alex's review; before, such a run reported zero ([[Agent Run Handle And Result]]).

### Rate limits

Both adapters drop every rate-limit and retry record: Claude's `rate_limit_event` and `system` / `api_retry`, and OpenCode's `retry` parts and `retry` session status. The sample's `rate_limit_event` carries `rate_limit_info` (five-hour and seven-day windows), and `api_retry` carries the kind of error being retried, but no event keeps either. A rate-limited failure therefore reaches a runner only as error text, such as Claude's `assistant error: rate_limit`, so the *"rate limited"* transient class can be told apart only by matching that text.

> [!note] The probe was not isolated
> The ten `hook_*` lines are `SessionStart:startup` hooks, two of which inject the text of personal plugins (`ponytail`, `superpowers`) into the run; `init` lists eight personal plugins and five MCP servers, `permissionMode: "auto"` and `apiKeySource: "none"`. That is the leak backlog preamble item 6 describes (*"global `~/.claude` hooks apply to headless runs"*); the PRD §0 probe command passes no `--settings` or `--strict-mcp-config`. [[Agent Providers Open Questions]] #24. The built adapter runs with `settingSources: []` and `strictMcpConfig: true` ([[Claude Code Adapter]]).

## Where the parser lives

The port puts parsing in the adapter (mapping 2 in `agent-provider.ts`; `03` §5). The drawio disagrees in two places: the *Logical components* page gives the core's *Run orchestrator* the job *"spawns run, parses stream-json, emits events"* (inside *"Core · no adapter imports"*), and the *Harness architecture* page draws the *Stream parser* (*"stream-json → NormalizedEvent v1 … → run_events · live token and cost"*) as its own worker node, fed by edge *G* straight from `claude`'s stdout rather than through the *AgentProvider port* node. [[Agent Providers Open Questions]] #34.

As built, the parsers live in the adapters, as the port says: `claude/normalize.ts` and `opencode/normalize.ts`. `core` has none.

## Error lines

*"non‑zero or `is_error` → failed, stderr tail in `runs.error`"* (backlog Story 3.2). The sample's `result` has `is_error: false`.

As built, a failure becomes an `error` event, and `RunResult.error` is the first one's message. A set `error` means failed, even at exit 0 ([[Agent Run Handle And Result]]).

- **Claude.**
  - An `is_error` result gives `result`, then `error`. The message is the result text for an `is_error` success, such as an API error turn. Otherwise it is `<subtype>: <errors>`, such as `error_max_turns: …` or `error_max_budget_usd: …`.
  - An `assistant` message with an `error` gives `assistant error: <kind>`.
  - When `query()` throws, its message is the error if none came before, and `RunResult.error` also gets the CLI's stderr tail. A non-zero exit with no error event gives the stderr tail, or `exit code <n>`.
  - A plugin dir missing from `system/init` gives `plugin not loaded: <path>`.
- **OpenCode.**
  - An assistant message's `error`, or a `session.error`, gives `<name>: <message>`. This holds in the root session and in subagents, and fails the run even if the main agent finishes.
  - A `ContextOverflowError` is dropped, because OpenCode compacts and carries on.
  - The adapter adds its own: `max_turns: …` and `max_budget: …` (both before the `result`), `guard plugin not loaded`, and `opencode server ended the run early: …`.
- **Both.** A failing tool gives only a `tool_result` with `ok: false`.

## Related

- [[Normalized Event Envelope]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Event Stream And SSE]]
- [[Live Cost]]
- [[Agent Providers Storage]]
