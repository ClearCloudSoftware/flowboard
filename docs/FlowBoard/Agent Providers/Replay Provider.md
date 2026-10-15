---
tags: [flowboard, agent-providers, adapter, testing]
module: Agent Providers
---

# Replay Provider

*"ReplayProvider — an AgentProvider that replays a scripted event stream. Zero spend, deterministic. Use it to test the engine, runner, park/resume, and cost rollups without touching a real CLI. It is the reference proof that the port is implementable, and the fake-`claude` the backlog asks for."* (`docs/old/reference/adapters/agent/replay/replay-provider.ts`)

Feature map §6: *"A fake provider that replays a recorded session, so the whole system can be tested without spending real money."*

## Origin

`01-ports.md`: *"Promote the backlog's fake-`claude` test harness to a first-class adapter: `launch()` replays a recorded `NormalizedEvent` stream (or a captured `stream-sample.jsonl`) with scripted timing. Every engine, park/resume, and cost test runs deterministic and zero-spend."*

The backlog's harness (Story 0.2, **GAP**): *"an integration lane that spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend."*

## The reference implementation

```ts
export interface ReplayScript {
  events: NormalizedEvent[];
  sessionId?: string;
  pid?: number;
  /** Delay between events, to simulate streaming. 0 (default) = instant, for tests. */
  streamDelayMs?: number;
}
```

| Member | Behaviour |
|---|---|
| `id` | `'replay'` |
| `capabilities` | `sessions`, `partial_stream`, `native_cost` |
| `resolveModel` | *"Replay ignores the model; it echoes the logical id back."* |
| `launch(_spec)` | Ignores the spec; streams `script.events` |
| `sessionId` | `script.sessionId`, else the first `system` event's `sessionId`, else `'replay-session'` |
| `pid` | `script.pid ?? -1` |
| `events` | Yields each event, waiting `streamDelayMs` between them; remembers `usage` and `outcome` from a `result` event |
| `result` | On completion: `{ usage, exitCode: 0, outcome }`; usage is all zeros if no `result` event |
| `stop()` | Sets a flag; at the next event the run settles `{ usage, exitCode: 130, outcome, error: 'stopped' }` |

## Self-check

`node docs/reference/adapters/agent/replay/replay-provider.ts` (the file now lives under `docs/old/reference/`). It replays `system` (`abc-123`), `assistant_text` (`hello`), `result` (`costUsd: 0.012`, `outcome: 'pass'`) and asserts the event order, the session id, `exitCode 0`, `outcome 'pass'` and `costUsd 0.012`, printing *"ReplayProvider self-check passed"*. *"No toolchain required — Node 24 strips the types and runs them directly"* (`reference/README.md`).

`07` shows the same as a call site and adds: *"A real `ClaudeCodeProvider` implements the *same* three members … The consumer above does not change."*

## Where it is used

| Use | Source |
|---|---|
| *"ReplayProvider drives whole flows at $0"* | drawio *Harness architecture*, *Test lane* |
| *"Replays recorded stream-json in tests. No CLI, no cost."* | drawio *FlowBoard ideation*, *ReplayProvider* |
| *"makes the entire substrate testable with no spend and deterministic timing"* | `03` §5 |
| Replay any past run: *"snapshot the resolved `RunSpec` to `data/runs/<id>/spec.json`. Reproducibility becomes provider-independent — replay any run through `ReplayProvider` from its spec + captured events."* | `03` §6 (idea); drawio *"Run records / data/runs/<id>/spec.json + raw stream, replayable at $0"* |
| *"a replayable fake-agent for tests"* | `pitch.md` |

## Limits

> [!warning] Three harness shapes
> The sources describe three different test doubles: a `NormalizedEvent` script (`replay-provider.ts`), a raw `stream-sample.jsonl` replay (`01-ports.md`; the drawio's *"Replays recorded stream-json in tests"*), and a fake `claude` binary (backlog 0.2). The script bypasses parsing entirely. The fake binary drives the whole Claude adapter (flags, spawn, parser). A raw-capture replay would need a stream-json parser inside the replay adapter, which no source describes. [[Agent Providers Open Questions]] #20.

- It has no `mcp_tools` or `resume_fork`, so park/resume tests run the fallback paths, not the Claude ones (inference from its fixed set). [[Agent Providers Open Questions]] #21.
- `stop()` takes effect only between events; exit code 130 vs the transient-signal rule: [[Agent Providers Open Questions]] #22.
- From the code: `result` settles only while something iterates `events` (the generator calls `settle`), so a caller that awaits `result` without draining `events` waits forever; and a `stop()` after the last event is yielded has no effect, so the run settles with `exitCode: 0`.

## Related

- [[Execution Testing]]
- [[AgentProvider Port]]
- [[Agent Providers Storage]]
- [[Agent Providers Defaults And Sample Content]]
