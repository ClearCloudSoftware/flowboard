---
tags: [flowboard, agent-providers, concept, events]
module: Agent Providers
---

# Normalized Event Envelope

*"The universal seam — already half-present in `run_events.type`. Each adapter parses its native stream (`stream-json` for Claude; Codex's own event format) into exactly these seven kinds. The viewer, cost ledger, and engine never see provider JSON."* (`01-ports.md`, *The normalized event envelope*)

## The seven kinds

```ts
/** The seven normalized event kinds. */
export type NormalizedEvent =
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; summary: string }
  | { type: 'tool_result'; ok: boolean; output: unknown }
  | { type: 'system'; sessionId?: string }
  | { type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }
  | { type: 'error'; message: string };
```

(`docs/old/reference/core/ports/events.ts`; identical in `01-ports.md`)

| Kind | Carries | Consumed by |
|---|---|---|
| `assistant_text` | `text` | Live viewer |
| `thinking` | `text` | Live viewer |
| `tool_use` | `name`, `input`, `summary` | Viewer (collapsible tool calls); summary lines such as *"`Read src/auth/session.ts`, `Bash: pnpm test`"* (PRD §7) |
| `tool_result` | `ok`, `output` | Viewer |
| `system` | `sessionId?` | `AgentRun.sessionId` |
| `result` | `usage`, `outcome?` | Cost ledger, `RunResult` |
| `error` | `message` | Viewer, run error |

PRD §5's `run_events.type` lists the same seven: *"normalised: 'assistant_text'|'thinking'|'tool_use'|'tool_result'|'system'|'result'|'error'"*.

## `Usage`

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

(`events.ts`). `01-ports.md`: *"absent -> PricingService fills it (06)"*. See [[Usage And Native Cost]] and [[Pricing Service]].

## Versioned, standard names

> *"**Versioned, standard names.** This is the most-read contract in the system, so it carries a schema version (`v`, stored as `run_events.v`); readers handle the versions they know and fall back to `raw`. Field names follow the OpenTelemetry GenAI semantic conventions where one exists (model, token usage, tool name), so tracing (Langfuse or any OTel backend) plugs in through a plain exporter later, with no custom bridge."* — `01-ports.md`

PRD §7 repeats it: *"each event carries `v`, starting at 1. A reader handles the versions it knows and falls back to the raw line for the rest."* The drawio *Harness architecture* names the parser output *"NormalizedEvent v1 (versioned, OTel GenAI names)"* and a later *"Langfuse (later) / self-hosted traces via a plain OTel exporter from NormalizedEvent"*.

> [!warning] `events.ts` has no `v`
> The reference type carries no version field; only the comment in `01-ports.md` (*"every event also carries `v: 1`"*) and the `run_events.v` column do. [[Agent Providers Open Questions]] #6.

## Keep the raw line

*"Persist the raw line alongside the normalized event (the schema already has `run_events.raw`) so a new provider's parser can be debugged against real captures without re-spending."* (`01-ports.md`). PRD §5: `raw TEXT NOT NULL, -- the original JSON line`.

## Gaps in the envelope

- **No live usage kind.** `Usage` travels only on `result`, but the runner must *"Accumulate per-message token usage as you stream so the live view shows a running number"* (PRD §7) and the `partial_stream` capability *"emits incremental deltas (live token counts) mid-turn"*. No normalized kind carries those deltas. [[Agent Providers Open Questions]] #9.
- **Where `summary` lives.** Only `tool_use` has a `summary`; PRD §7 gives every `run_events` row a `summary`. [[Agent Providers Open Questions]] #8.
- **Native events with no kind.** See [[Stream Parsing And Normalization]].

## Related

- [[Stream Parsing And Normalization]]
- [[Agent Run Handle And Result]]
- [[Event Stream And SSE]]
- [[Live Run Viewer]]
- [[Usage And Native Cost]]
