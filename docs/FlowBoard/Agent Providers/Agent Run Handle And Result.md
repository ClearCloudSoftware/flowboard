---
tags: [flowboard, agent-providers, concept, contract]
module: Agent Providers
---

# Agent Run Handle And Result

`launch()` is non-blocking. It returns an `AgentRun`, *"A live handle on one running attempt"*, whose promises settle as the run proceeds (`agent-provider.ts`).

## `AgentRun`

```ts
export interface AgentRun {
  /** Resolves once the provider emits its session id (from system/init). */
  sessionId: Promise<string>;
  pid: number;
  /** Normalized event stream; the runner tees this to run_events + SSE. */
  events: AsyncIterable<NormalizedEvent>;
  /** Resolves on process exit. */
  result: Promise<RunResult>;
  /** SIGTERM the child. */
  stop(): void;
}
```

| Member | Used by | Source |
|---|---|---|
| `sessionId` | Park and resume (`--resume <claude_session_id>`); stored on the run | PRD §5, §9 |
| `pid` | Restart recovery: *"re-attach by pid before failing"*; Stop: *"SIGTERM by pid from the route"* | `03` §7, §8 |
| `events` | The runner writes each to `run_events` and the SSE tail | `03` §6, §8 |
| `result` | The engine's advancement rules; the cost ledger | `02` §3; `06` §12 |
| `stop()` | The run viewer's Stop button, graceful shutdown | PRD §13; backlog Story 3.3 |

## `RunResult`

```ts
export interface RunResult {
  usage: Usage;
  exitCode: number;
  /** Drives conditional edges; read from the produced JSON or set_outcome. Unset is NOT 'pass': the engine parks the step at a human gate. */
  outcome?: 'pass' | 'fail';
  /** stderr tail on failure. */
  error?: string;
}
```

> [!important] An unset outcome is never a pass
> *"Unset is NOT 'pass': the engine parks the step at a human gate."* (`agent-provider.ts`). `03` §6: *"**No default:** an unset outcome on a step with conditional edges goes to a human gate, never to `pass` (PRD §8)."* See [[Run Outcomes]].

`RunResult` is the one shape every executor returns: *"RunResult identical across executors"* (`02` §3, `StepExecutor` sketch). A shell step produces it without a provider.

## How exit codes are read

The port only reports `exitCode`. Classification belongs to the runner (`03` §6, PRD §7):

| Exit | Meaning | Who decides |
|---|---|---|
| `0` | `succeeded`; scan artifacts, apply §8 | runner |
| non-zero, transient (*"rate limited, overloaded, network error, process killed by a signal or lost on restart"*) | same attempt re-run, max 3, backoff 30 s / 2 min / 8 min, `wasted = 1` | runner |
| non-zero, anything else | task `blocked` | runner |

*"A non-zero exit from an agent run is an **infrastructure failure**, never a verdict on the work, because work verdicts arrive as outcomes."* (PRD §7). See [[Infra Retries]].

The [[Replay Provider]] settles a stopped run as `{ exitCode: 130, error: 'stopped' }`. Whether that counts as *"killed by a signal"* (transient) is open: [[Agent Providers Open Questions]] #22.

## Where `outcome` comes from

`RunResult.outcome` is documented as *"read from the produced JSON or set_outcome"*, both of which the runner sees, not the CLI. Yet the `result` event also carries `outcome?`, which the adapter emits. Which side sets it is not stated: [[Agent Providers Open Questions]] #10.

## Related

- [[AgentProvider Port]]
- [[Run Spec]]
- [[Normalized Event Envelope]]
- [[Runner Pipeline]]
- [[Stopping And Cancelling]]
