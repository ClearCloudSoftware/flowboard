---
tags: [flowboard, agent-providers, adapter, testing]
module: Agent Providers
---

# Replay Provider

*"ReplayProvider — an AgentProvider that replays a scripted event stream. Zero spend, deterministic. Use it to test the engine, runner, park/resume, and cost rollups without touching a real CLI. It is the reference proof that the port is implementable, and the fake-`claude` the backlog asks for."* (`docs/old/reference/adapters/agent/replay/replay-provider.ts`)

Feature map §6: *"A fake provider that replays a recorded session, so the whole system can be tested without spending real money."*

> [!check] Implemented 2026-10-18
> Shipped as `code/flowboard/packages/adapters/src/agent/replay/replay-provider.ts`, a copy of the reference above, and changed on 2026-10-22 (below). It is a test double next to the two real providers, [[Claude Code Adapter]] and [[OpenCode Adapter]]. `run-agent` cannot select it; only tests use it (see [[#Where it is used]]).

## Origin

`01-ports.md`: *"Promote the backlog's fake-`claude` test harness to a first-class adapter: `launch()` replays a recorded `NormalizedEvent` stream (or a captured `stream-sample.jsonl`) with scripted timing. Every engine, park/resume, and cost test runs deterministic and zero-spend."*

The backlog's harness (Story 0.2, **GAP**): *"an integration lane that spawns the real worker against a fake `claude` binary (shell script that replays `docs/stream-sample.jsonl`) so runner/park/resume can be tested without spend."*

## The implementation

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
| `sessionId` | `script.sessionId`, else the first `system` event's `sessionId`. With neither, it rejects with `run ended without a session id`, like a real provider |
| `pid` | A promise of `script.pid ?? -1` |
| `events` | Yields each event, waiting `streamDelayMs` before each one. Remembers the latest totals from a `usage` or `result` event, the `result`'s `outcome`, and the first `error` event's message |
| `result` | On completion: `{ usage, exitCode: 0, outcome }`, or `exitCode: 1` with `error` set when an `error` event was scripted. Usage is all zeros if no `usage` or `result` event came |
| `stop()` | Sets a flag; at the next event the run settles `{ usage, exitCode: 130, outcome, error: 'stopped' }`, with the usage reported so far |

> [!check] Changed 2026-10-22
> A scripted `error` event now fails the run, as the first error does on a real provider. `sessionId` now rejects when no id is scripted; the `'replay-session'` default is gone. `usage` events are now tracked, so a stop keeps the totals. Before, Replay could not express a failed run, so a runner tested on it never saw one. Decided on 2026-10-22; open to Alex's review.

## Self-check

The reference file checked itself when run directly (`node docs/reference/adapters/agent/replay/replay-provider.ts`; the file now lives under `docs/old/reference/`), printing *"ReplayProvider self-check passed"*. The shipped file has no self-check. Its checks are in `adapters/test/replay.test.ts`, part of the free suite (`pnpm test:packages` in `code/flowboard`):

- the reference's self-check: it replays `system` (`abc-123`), `assistant_text` (`hello`) and `result` (`costUsd: 0.012`, `outcome: 'pass'`), and asserts the event order, the session id, `pid` -1, `exitCode 0`, `outcome 'pass'` and `costUsd 0.012`;
- `stop()` settles with exit 130 and `stopped`;
- a scripted `error` gives exit 1 and its message;
- a script with no session id makes `sessionId` reject;
- a stop keeps the usage reported so far.

`07` shows the same as a call site and adds: *"A real `ClaudeCodeProvider` implements the *same* three members … The consumer above does not change."*

## Where it is used

> [!info] Design, not built
> None of the uses in the table exists on `dev` as of 2026-10-22: there is no flow engine, runner or run record for Replay to drive. Today it runs only in tests. `adapters/test/replay.test.ts` checks it, and `cli/test/run.test.ts` uses it as the stand-in provider for `run-agent`'s own tests, passed in through `RunDeps.makeProvider`.

| Use | Source |
|---|---|
| *"ReplayProvider drives whole flows at $0"* | drawio *Harness architecture*, *Test lane* |
| *"Replays recorded stream-json in tests. No CLI, no cost."* | drawio *FlowBoard ideation*, *ReplayProvider* |
| *"makes the entire substrate testable with no spend and deterministic timing"* | `03` §5 |
| Replay any past run: *"snapshot the resolved `RunSpec` to `data/runs/<id>/spec.json`. Reproducibility becomes provider-independent — replay any run through `ReplayProvider` from its spec + captured events."* | `03` §6 (idea); drawio *"Run records / data/runs/<id>/spec.json + raw stream, replayable at $0"* |
| *"a replayable fake-agent for tests"* | `pitch.md` |

## Limits

> [!check] Three harness shapes; the script was chosen
> The sources describe three different test doubles: a `NormalizedEvent` script (`replay-provider.ts`), a raw `stream-sample.jsonl` replay (`01-ports.md`; the drawio's *"Replays recorded stream-json in tests"*), and a fake `claude` binary (backlog 0.2). The script bypasses parsing entirely. The fake binary drives the whole Claude adapter (flags, spawn, parser). A raw-capture replay would need a stream-json parser inside the replay adapter, which no source describes.
>
> [[Agent Providers Open Questions]] #20 decided on 2026-10-18 that Replay stays a `NormalizedEvent` script. The other shapes live in the adapters' own tests instead. The Claude and OpenCode normalizers read recorded streams (`adapters/test/fixtures/claude-hello.jsonl`, `opencode-read.jsonl`). The Claude provider runs against a fake `query()` that spawns a real child, and, for its process paths, against fake `claude` scripts (`fixtures/fake-claude/`). The OpenCode provider runs against a fake server (`fixtures/fake-opencode.mjs`).

- It has no `mcp_tools` or `resume_fork`, so park/resume tests run the fallback paths, not the Claude ones (inference from its fixed set). [[Agent Providers Open Questions]] #21.
- `stop()` takes effect only between events; exit code 130 vs the transient-signal rule: [[Agent Providers Open Questions]] #22.
- From the code: `result` settles only while something iterates `events` (the generator calls `settle`), so a caller that awaits `result` without draining `events` waits forever (C8 in [[Provider Implementation Decisions]]). A `stop()` after the last event is yielded has no effect, so the run settles as if never stopped: exit 0, or 1 after a scripted error.
- It is the only provider that sets `outcome`: it passes through the `outcome` of a scripted `result`. Neither real adapter sets one ([[Agent Providers Open Questions]] #10), so a runner tested on Replay can rely on outcomes that real runs never report.

## Related

- [[Execution Testing]]
- [[AgentProvider Port]]
- [[Agent Providers Storage]]
- [[Agent Providers Defaults And Sample Content]]
