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

> [!warning] The shipped code differs
> - `core/src/ports/events.ts` has the same fields. `numTurns` is the main agent's turns: subagents' tokens and cost count, their turns do not (2026-10-22, [[Agent Providers Open Questions]] #32).
> - The `costUsd` rule changed on 2026-10-22: *"USD as the provider reports it"*. Claude reports it only on the result, so its live `usage` events and a run stopped before the result have none. OpenCode reports it on every event, 0 for a model it has no price for. Absent means "price it from tokens"; no PricingService is built. See [[Normalized Event Envelope]].

In the reference port it travels on one event only: `{ type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }`. As built (2026-10-18), an eighth kind, `{ type: 'usage'; usage: Usage }`, also carries the running totals mid-run ([[Agent Providers Open Questions]] #9). `RunResult` carries the same `usage` (`agent-provider.ts`): the result's totals, or, for a run stopped or failed before its result, the last running totals ([[Agent Run Handle And Result]]). The PRD's `runs` columns mirror it: `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `num_turns` (PRD §5).

Field names follow OpenTelemetry: *"Name fields after the OpenTelemetry GenAI semantic conventions where one exists (model, input and output tokens, tool name), so a tracing backend such as Langfuse can be fed later by a plain OTel exporter"* (PRD §7).

## Native cost is a capability

`agent-provider.ts` lists the capabilities that matter for money:

| Capability | Meaning (source comment) | If absent |
|---|---|---|
| `native_cost` | *"reports cost in USD; else PricingService derives it"* | [[Pricing Service]] prices tokens from a rate table |
| `partial_stream` | *"emits incremental deltas (live token counts) mid-turn"* | No live figure before the result |
| `budget_cap` | *"honours maxBudgetUsd; else it is advisory"* | The step budget is not enforced by the provider. See [[Spend Caps And Limits]] |

`01-ports.md`: *"no `native_cost` → PricingService computes cost from tokens."* The Codex spike lists cost as risk point (b): *"Codex reports tokens, not dollars, so `native_cost` is absent and PricingService is on the critical path"*. `ReplayProvider` declares both `native_cost` and `partial_stream`. As built (2026-10-18), Claude and OpenCode declare all three. Claude honours `maxBudgetUsd` natively (the Agent SDK passes `--max-budget-usd`); on OpenCode the adapter enforces it, aborting the session once the running `costUsd` reaches the cap ([[Provider Capabilities]]).

## What the Claude stream actually carries

PRD §0 asks for a probe first: *"Read the actual events. Write the parser against what you see, not against what you expect. Note especially where cost and token usage appear."* Backlog 0.1: *"note where `total_cost_usd`, `num_turns`, `session_id` and `message_delta.usage` live."* The committed probe is `docs/old/stream-sample.jsonl` (22 lines):

| Line | Event | Money fields |
|---|---|---|
| 13 | `stream_event` / `message_start` | `message.usage`: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` |
| 17 | `assistant` | `message.usage`, same fields |
| 19 | `stream_event` / `message_delta` | `usage` with a higher `output_tokens` and `output_tokens_details.thinking_tokens` |
| 21 | `rate_limit_event` | `rate_limit_info`: `five_hour` and `seven_day` utilisation windows. No dollars |
| 22 | `result` / `success` | `total_cost_usd: 0.45876175`, `num_turns: 1`, `duration_ms`, `usage`, and `modelUsage` keyed by model with `costUSD` and `costBasis: "list"` |

So the Claude stream **does** carry per-message tokens mid-run, but no dollar figure until `result`. As built, the Claude adapter reads these same messages as typed Agent SDK messages, not as stdout lines ([[Stream Parsing And Normalization]]).

Details other notes depend on:

- The probe splits cache writes by lifetime: `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`. `Usage` has a single `cacheWrite`. See [[Cost And Control Open Questions]] #6.
- `modelUsage` is keyed by the id the CLI reports, `claude-fable-5-1`, not by an alias such as `sonnet`. See [[Cost And Control Open Questions]] #24.
- The `result` line carries `is_error: false`. Backlog 3.2 fails a run on *"non‑zero or `is_error`"*. As built, the adapter turns an `is_error` result into an `error` event and sets `RunResult.error`, and a set `error` means failed even on exit 0 ([[Agent Providers Open Questions]] #33).
- `docs/old/stream-sample.stderr` is empty.

No design source writes out the mapping from these fields onto `Usage` or says whether `input` includes cached tokens. The code settles it (`claude/normalize.ts`, [[Agent Providers Open Questions]] #32): `cache_creation_input_tokens` → `cacheWrite` and `cache_read_input_tokens` → `cacheRead`, with `input` taken as reported. The result's tokens are the `modelUsage` entries summed, subagents included, with `result.usage` as the fallback; `numTurns` is `num_turns` and `costUsd` is `total_cost_usd`.

## Parsing rules

| Rule | Source |
|---|---|
| *"`message_delta.usage` is cumulative per message — reset per `message_start`, do not sum across deltas."* | backlog 3.2 (**BUG**), `03` §5 |
| *"`result.total_cost_usd` authoritative; persist `num_turns` per assistant turn so the viewer/board show live numbers."* | backlog 3.2 (**PRD/BUG**) |
| *"`total_cost_usd` authoritative → maps to `Usage.costUsd`; Codex leaves it absent for PricingService."* | `03` §5 |
| *"Accumulate per-message token usage as you stream so the live view shows a running number before the run ends. Verify the actual field names against your `docs/stream-sample.jsonl` probe."* | PRD §7 |
| *"Persist the raw line alongside the normalized event … so a new provider's parser can be debugged against real captures without re-spending."* | `01-ports.md` |

Only two of these are listed as adapter fixes: the `message_delta.usage` reset and the `total_cost_usd` → `Usage.costUsd` mapping (`03` §5: *"every Claude-specific fix the backlog lists moves **into the Claude adapter**, out of the runner"*). The others are not Claude-specific. Persisting `num_turns` per assistant turn is a database write by the runner (see [[Cost Runtime]]), and storing the raw line applies to every provider (*"the schema already has `run_events.raw`"*, `01-ports.md`). Who accumulates live tokens (PRD §7) was open ([[Cost And Control Open Questions]] #2). As built, each adapter does and emits the running totals as `usage` events; the Claude adapter overwrites each message's usage as its cumulative `message_delta` arrives.

> [!warning] Gap: live tokens had no normalized event
> The stream has the tokens and the capability has a name, but the reference `NormalizedEvent` had no usage-delta kind. `Usage` rode only on `result`. `07-ports-in-practice.md` updates live cost only `if (ev.type === 'result')`. See [[Live Cost]], [[Cost And Control Open Questions]] #2 and [[Agent Providers Open Questions]] #9.
> Closed on 2026-10-18 by the `usage` kind. Claude's live `usage` events still carry no `costUsd`, so a live dollar figure on Claude needs pricing from tokens, which is not built.

## Related

- [[Pricing Service]]
- [[Live Cost]]
- [[Event Stream And SSE]]
- [[Provider Coverage And Portability]]
- [[Normalized Event Envelope]]
