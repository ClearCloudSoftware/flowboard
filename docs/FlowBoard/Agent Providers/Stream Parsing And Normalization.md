---
tags: [flowboard, agent-providers, behaviour, events]
module: Agent Providers
---

# Stream Parsing And Normalization

The second of an adapter's two mappings: *"the provider's native event stream -> NormalizedEvent"* (`agent-provider.ts`). Feature map §6: *"Whatever tool runs, its output (messages, tool calls, results, cost) is translated into one common format the rest of the app understands."*

## Rules

| Rule | Source wording |
|---|---|
| Write the parser against a real capture | *"Before writing the event parser, run this and save the output to `docs/stream-sample.jsonl` … Write the parser against what you see, not against what you expect. Note especially where cost and token usage appear."* (PRD §0) |
| Line by line | *"Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`"* (PRD §7) |
| Normalize and summarize | *"Normalise each event into one of the `type` values in the schema and produce a one-line `summary` for the viewer"* (PRD §7) |
| Fold partials | *"Event normalisation into the seven types + one‑line summaries; fold partial deltas."* (backlog Story 3.2) |
| Keep the raw line | *"Persist the raw line alongside the normalized event"* (`01-ports.md`) |
| Version every event | `v`, starting at 1; readers fall back to `raw` (PRD §7) |
| Provider JSON stays in the adapter | *"The viewer, cost ledger, and engine never see provider JSON."* (`01-ports.md`); *"Adding a provider adds a parser, nothing in the viewer."* (`03` §8) |

## Claude-specific parsing fixes

These move *"into the Claude adapter, out of the runner"* (`03` §5):

- *"`message_delta.usage` is cumulative per message → reset per `message_start`, don't sum across deltas."* (backlog Story 3.2, **BUG**)
- *"Capture `session_id` once from `system/init`, not every line."* (backlog Story 3.3, **BUG (perf)**)
- *"`total_cost_usd` authoritative → maps to `Usage.costUsd`"*; PRD §7: *"Take the final result event's total cost as authoritative for `runs.cost_usd`."*
- *"persist `num_turns` per assistant turn so the viewer/board show live numbers."* (backlog Story 3.2)

## What the stream sample shows

`docs/old/stream-sample.jsonl` has 22 lines from one `claude -p "say hello and stop"` probe. Native types, in order:

| Lines | Native `type` / `subtype` | Normalized kind |
|---|---|---|
| 1–10 | `system` / `hook_started`, `hook_response` | not defined |
| 11 | `system` / `init` (carries `session_id`, `model`, `tools`, `mcp_servers`) | `system` |
| 12 | `system` / `status` | not defined |
| 13–16, 18–20 | `stream_event` (`message_start`, `content_block_*`, `message_delta`, `message_stop`) | partials to fold |
| 17 | `assistant` | `assistant_text` (or `thinking`, `tool_use`) |
| 21 | `rate_limit_event` | not defined |
| 22 | `result` / `success` (`total_cost_usd`, `usage`, `num_turns`, `is_error`, `modelUsage`) | `result` |

Every line carries `session_id`, which is why the backlog says to capture it once. The `message_delta` usage includes `cache_creation_input_tokens` and `cache_read_input_tokens`, which map to `Usage.cacheWrite` and `cacheRead` (the mapping is inferred from the field names). The mapping for `hook_*`, `status` and `rate_limit_event` lines is not specified: [[Agent Providers Open Questions]] #7.

> [!note] The probe was not isolated
> The ten `hook_*` lines are `SessionStart` hooks from the operator's personal config, and `init` lists personal MCP servers. That is the leak backlog item 6 describes (*"global `~/.claude` hooks apply to headless runs"*). [[Agent Providers Open Questions]] #24.

## Error lines

*"non‑zero or `is_error` → failed, stderr tail in `runs.error`"* (backlog Story 3.2). The sample's `result` has `is_error: false`.

## Related

- [[Normalized Event Envelope]]
- [[Claude Code Adapter]]
- [[Event Stream And SSE]]
- [[Live Cost]]
- [[Agent Providers Storage]]
