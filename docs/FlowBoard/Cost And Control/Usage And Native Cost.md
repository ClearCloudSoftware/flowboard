---
tags: [flowboard, cost-and-control, concept, usage]
module: Cost And Control
---

# Usage And Native Cost

Every cost figure starts as a `Usage` record that a provider adapter produces from its native stream.

## The `Usage` type

From `docs/old/reference/core/ports/events.ts`:

```ts
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  numTurns: number;
  /** Absent when the provider lacks `native_cost`; PricingService fills it from tokens. */
  costUsd?: number;
}
```

It travels on one event only: `{ type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }`. `RunResult` carries the same `usage` (`agent-provider.ts`). The PRD's `runs` columns mirror it: `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `num_turns` (PRD §5).

Field names follow OpenTelemetry: *"Name fields after the OpenTelemetry GenAI semantic conventions where one exists (model, input and output tokens, tool name), so a tracing backend such as Langfuse can be fed later by a plain OTel exporter"* (PRD §7).

## Native cost is a capability

`agent-provider.ts` lists the capabilities that matter for money:

| Capability | Meaning (source comment) | If absent |
|---|---|---|
| `native_cost` | *"reports cost in USD; else PricingService derives it"* | [[Pricing Service]] prices tokens from a rate table |
| `partial_stream` | *"emits incremental deltas (live token counts) mid-turn"* | No live figure before the result |
| `budget_cap` | *"honours maxBudgetUsd; else it is advisory"* | The step budget is not enforced by the provider. See [[Spend Caps And Limits]] |

`01-ports.md`: *"no `native_cost` → PricingService computes cost from tokens."* The Codex spike lists cost as risk point (b): *"Codex reports tokens, not dollars, so `native_cost` is absent and PricingService is on the critical path"*. `ReplayProvider` declares both `native_cost` and `partial_stream`.

## What the Claude stream actually carries

PRD §0 asks for a probe first: *"Read the actual events. Write the parser against what you see, not against what you expect. Note especially where cost and token usage appear."* Backlog 0.1: *"note where `total_cost_usd`, `num_turns`, `session_id` and `message_delta.usage` live."* The committed probe is `docs/old/stream-sample.jsonl` (22 lines):

| Line | Event | Money fields |
|---|---|---|
| 13 | `stream_event` / `message_start` | `message.usage`: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` |
| 17 | `assistant` | `message.usage`, same fields |
| 19 | `stream_event` / `message_delta` | `usage` with a higher `output_tokens` and `output_tokens_details.thinking_tokens` |
| 21 | `rate_limit_event` | `rate_limit_info`: `five_hour` and `seven_day` utilisation windows. No dollars |
| 22 | `result` / `success` | `total_cost_usd: 0.45876175`, `num_turns: 1`, `duration_ms`, `usage`, and `modelUsage` keyed by model with `costUSD` and `costBasis: "list"` |

So the Claude stream **does** carry per-message tokens mid-run, but no dollar figure until `result`.

## Parsing rules

| Rule | Source |
|---|---|
| *"`message_delta.usage` is cumulative per message — reset per `message_start`, do not sum across deltas."* | backlog 3.2 (**BUG**), `03` §5 |
| *"`result.total_cost_usd` authoritative; persist `num_turns` per assistant turn so the viewer/board show live numbers."* | backlog 3.2 (**PRD/BUG**) |
| *"`total_cost_usd` authoritative → maps to `Usage.costUsd`; Codex leaves it absent for PricingService."* | `03` §5 |
| *"Accumulate per-message token usage as you stream so the live view shows a running number before the run ends. Verify the actual field names against your `docs/stream-sample.jsonl` probe."* | PRD §7 |
| *"Persist the raw line alongside the normalized event … so a new provider's parser can be debugged against real captures without re-spending."* | `01-ports.md` |

All of these sit inside the Claude adapter: *"every Claude-specific fix the backlog lists moves **into the Claude adapter**, out of the runner"* (`03` §5).

> [!warning] Gap: live tokens have no normalized event
> The stream has the tokens and the capability has a name, but `NormalizedEvent` has no usage-delta kind. `Usage` rides only on `result`. `07-ports-in-practice.md` updates live cost only `if (ev.type === 'result')`. See [[Live Cost]] and [[Cost And Control Open Questions]] #2.

## Related

- [[Pricing Service]]
- [[Live Cost]]
- [[Event Stream And SSE]]
- [[Provider Coverage And Portability]]
