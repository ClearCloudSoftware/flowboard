---
tags: [flowboard, agent-providers, concept, events]
module: Agent Providers
---

# Normalized Event Envelope

*"The universal seam — already half-present in `run_events.type`. Each adapter parses its native stream (`stream-json` for Claude; Codex's own event format) into exactly these seven kinds. The viewer, cost ledger, and engine never see provider JSON."* (`01-ports.md`, *The normalized event envelope*)

> [!warning] The shipped code differs
> - There are eight kinds: `usage` was added on 2026-10-18 ([[Agent Providers Open Questions]] #9), and any event may carry `raw`.
> - No adapter parses lines. Claude iterates the typed messages that the Agent SDK's `query()` yields (the SDK reads the CLI's `stream-json` itself). OpenCode reads its server's SSE events.
> - There is no `seq` and no `run_events` table: both belong to the runner, which is not built. `run-agent` writes each event, `raw` included, as an `event` line in `runs/<stamp>-<adapter>.jsonl`.
> - Tool events keep each provider's own names and shapes (see *Tool events stay provider-shaped*).

## The eight kinds

```ts
/**
 * The eight normalized event kinds. `usage` carries running totals for the run
 * so far, emitted mid-run so the live view shows a running number. `raw`
 * carries the native message the event came from, for `run_events.raw`; an
 * error the adapter raises with no native message behind it (a thrown
 * exception, a limit it enforces) has none.
 */
export type NormalizedEvent = (
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; summary: string }
  | { type: 'tool_result'; ok: boolean; output: unknown }
  | { type: 'system'; sessionId?: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }
  | { type: 'error'; message: string }
) & { raw?: unknown };
```

(`core/src/ports/events.ts`. The reference file `docs/old/reference/core/ports/events.ts` and `01-ports.md` have the first seven kinds and no `raw`.)

`core/src/ports/events.ts` opens: *"Normalized run telemetry — shared by the AgentProvider port, the runner, the live viewer, and the cost ledger. Every provider adapter parses its native stream into these types. Tool events are the exception: `tool_use.name`, `tool_use.input` and `tool_result.output` keep the provider's own tool names and shapes (Claude's `Read` with `file_path`; OpenCode's `read` with `filePath`)."* The reference file ended instead with *"nothing downstream sees provider-specific JSON"*. The architecture README counts the envelope among what the spec already got right: *"`run_events.type` normalizes to 7 event kinds → *already the provider seam*"*.

The *Consumed by* column below is inferred from those four consumers and the fields each kind carries; no source assigns kinds to readers ([[Agent Providers Open Questions]] #35).

| Kind | Carries | Consumed by |
|---|---|---|
| `assistant_text` | `text` | Live viewer |
| `thinking` | `text` | Live viewer |
| `tool_use` | `name`, `input`, `summary` | Viewer (collapsible tool calls); summary lines such as *"`Read src/auth/session.ts`, `Bash: pnpm test`"* (PRD §7) |
| `tool_result` | `ok`, `output` | Viewer |
| `system` | `sessionId?` | `AgentRun.sessionId` |
| `usage` | `usage`, the running totals | Live viewer's running number; `RunResult.usage` for a run that ends before its result |
| `result` | `usage`, `outcome?` | Cost ledger, `RunResult` |
| `error` | `message` | Viewer, run error |

PRD §5's `run_events.type` lists the first seven: *"normalised: 'assistant_text'|'thinking'|'tool_use'|'tool_result'|'system'|'result'|'error'"*.

Where each kind comes from:

| Kind | Claude Code (SDK messages) | OpenCode (server events) |
|---|---|---|
| `assistant_text`, `thinking` | each text or thinking block of an `assistant` message; stream deltas are ignored | a text or reasoning part, once it ends; deltas are folded, and synthetic text parts and the prompt's own parts are skipped |
| `tool_use` | each `tool_use` block | a tool part, once it leaves `pending` |
| `tool_result` | each `tool_result` block of a `user` message; `ok` is `!is_error` | a tool part that completed (`ok: true`) or failed (`ok: false`) |
| `system` | the first `system/init` only | made by the adapter from the session create, fork or resume |
| `usage` | `message_start` and `message_delta` stream events | each `step-finish` part |
| `result` | the `result` message | the root session's `session.idle` |
| `error` | an `is_error` result, emitted just after `result`; an assistant message error (`assistant error: rate_limit`); a thrown SDK error; a plugin that did not load | an assistant-message error or `session.error` in any of the run's sessions, except `ContextOverflowError`; the adapter's `max_turns:` and `max_budget:`, before `result`; a failure of the adapter's own, such as a server that would not start, a guard plugin that did not load, or a server that ended the run early |

OpenCode counts a subagent's session as the run's own. Both adapters emit nothing for a native message they do not map, such as hook, status and rate-limit records ([[Agent Providers Open Questions]] #7; [[Stream Parsing And Normalization]]).

The [[Replay Provider]] emits its scripted events unchanged, and reads them as a real provider would. A scripted `error` fails the run, `usage` events set the totals a stop keeps, and the session id comes from `script.sessionId` or the first `system` event. Before 2026-10-22, a scripted `error` still ended the run with exit 0 and no `error`. This was decided on 2026-10-22 and is open to Alex's review ([[Agent Providers Open Questions]] #20).

## Tool events stay provider-shaped

`tool_use.name`, `tool_use.input` and `tool_result.output` are the provider's own: `Read`, `file_path` and content blocks on Claude; `read`, `filePath` and strings on OpenCode. `summary` keeps the provider's tool name too (`Bash: pnpm test` on Claude, `bash: pnpm test` on OpenCode). So a reader that looks inside a tool event, such as a viewer that shows the file path, has to know the provider. The other kinds' fields are provider-neutral; only `raw` is the provider's own, by design.

## `Usage`

```ts
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** The main agent's turns (model calls); subagents' tokens and cost count, their turns do not. */
  numTurns: number;
  /**
   * USD as the provider reports it. Claude reports it only on the result, so its live `usage` events (and a run
   * stopped before the result) have none; OpenCode reports it on every event, with 0 for a model it has no price
   * for. Absent means "price it from tokens".
   */
  costUsd?: number;
}
```

(`core/src/ports/events.ts`). `01-ports.md`: *"absent -> PricingService fills it (06)"*. The reference file said *"Absent when the provider lacks `native_cost`"*, which is not the real rule: Claude declares `native_cost`, yet its live events carry no cost. PricingService is not built. See [[Usage And Native Cost]] and [[Pricing Service]].

- **Claude, live.** Each message's usage, overwritten as its `message_delta` arrives (the delta is cumulative), summed over finished messages and those still streaming, subagents' included. No cost.
- **Claude, result.** Tokens summed over `modelUsage`, which covers every model and subagent, with `result.usage` as the fallback; `numTurns` is the CLI's `num_turns`; `costUsd` is `total_cost_usd`.
- **OpenCode.** Running sums over the run's `step-finish` parts: `output` includes reasoning tokens, and `costUsd` sums OpenCode's own cost. The `result` repeats the last totals.

> [!check] Changed 2026-10-22
> `numTurns` now means the main agent's turns on both providers, decided 2026-10-22 and open to Alex's review ([[Agent Providers Open Questions]] #32). Claude's live `usage` events count the main agent's finished messages (a `message_stop` with no `parent_tool_use_id`); before, they always said 0. OpenCode counts only the root session's `step-finish` parts; before, it counted subagent steps too. The `costUsd` rule above replaced the reference's. A run that ends before its result now keeps the last running totals ([[Agent Run Handle And Result]]).

## Versioned, standard names

> *"**Versioned, standard names.** This is the most-read contract in the system, so it carries a schema version (`v`, stored as `run_events.v`); readers handle the versions they know and fall back to `raw`. Field names follow the OpenTelemetry GenAI semantic conventions where one exists (model, token usage, tool name), so tracing (Langfuse or any OTel backend) plugs in through a plain exporter later, with no custom bridge."* — `01-ports.md`

PRD §7 repeats it: *"each event carries `v`, starting at 1. A reader handles the versions it knows and falls back to the raw line for the rest."* The drawio *Harness architecture* names the parser output *"NormalizedEvent v1 (versioned, OTel GenAI names)"* and a later *"Langfuse (later) / self-hosted traces via a plain OTel exporter from NormalizedEvent"*.

> [!warning] `events.ts` has no `v`
> Neither the reference type nor the shipped one carries a version field; only the comment in `01-ports.md` (*"every event also carries `v: 1`"*) and the `run_events.v` column do. Skipping `v` for now was decision C10 in [[Provider Implementation Decisions]]. The envelope also has no model field, and nothing exports it to OTel. [[Agent Providers Open Questions]] #6; also [[Monitor Open Questions]] #39 and [[Execution Open Questions]] #62.

## Keep the raw line

*"Persist the raw line alongside the normalized event (the schema already has `run_events.raw`) so a new provider's parser can be debugged against real captures without re-spending."* (`01-ports.md`). PRD §5: `raw TEXT NOT NULL, -- the original JSON line`.

> [!warning] The shipped code differs
> `raw` is optional and typed `unknown`. It holds the native message the event came from, as the adapter received it, already parsed: the SDK message on Claude, the SSE event on OpenCode, and the session object for OpenCode's own `system` event. It is absent on errors an adapter raises itself, such as a thrown SDK error, a server that ended the run early, and OpenCode's `max_turns:` and `max_budget:`; Claude's *plugin not loaded* error does carry its `system/init` message. No `run_events` table exists yet. `run-agent` keeps `raw` in its log and leaves it off the screen.

## Gaps in the envelope

- **Live usage.** Closed on 2026-10-18 by the `usage` kind ([[Agent Providers Open Questions]] #9). Neither adapter emits text deltas, though: text arrives whole, per message on Claude and per part on OpenCode, so `partial_stream` buys running usage only.
- **Where `summary` lives.** Only `tool_use` has a `summary`; PRD §7 gives every `run_events` row a `summary`. The adapters build it with one shared helper (`adapters/src/agent/summarize.ts`): `<tool>: <command>` for a shell call, `<tool> <target>` when the input names a path, pattern or URL, else the tool name, cut at 120 characters. [[Agent Providers Open Questions]] #8.
- **Native events with no kind.** See [[Stream Parsing And Normalization]].

## Related

- [[Stream Parsing And Normalization]]
- [[Agent Run Handle And Result]]
- [[Replay Provider]]
- [[Event Stream And SSE]]
- [[Live Run Viewer]]
- [[Usage And Native Cost]]
