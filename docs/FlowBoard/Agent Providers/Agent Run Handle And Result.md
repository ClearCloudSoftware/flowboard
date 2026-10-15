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
| `pid` | Restart recovery: *"re-attach by pid before failing"*; Stop: *"SIGTERM by pid from the route"* | `03` §7, §8; backlog 3.3, 3.4 |
| `events` | The runner writes each to `run_events` and the SSE tail | `03` §6, §8 |
| `result` | The engine's advancement rules; the cost ledger | `02` §3; `06` §12 |
| `stop()` | No caller is named. Graceful worker shutdown (*"SIGTERM children, mark runs `cancelled`"*) runs in the worker that holds the handle, so it could use `stop()` (inference). The viewer's Stop button (*"A Stop button that kills the process"*) goes through a route, which holds no `AgentRun`: it SIGTERMs by pid | `03` §7, §8; backlog 3.3 (**GAP**), 3.4; PRD §13 |

> [!warning] Two ways to stop a run
> `AgentRun.stop()` (*"SIGTERM the child"*) and `ChildHandle.kill()` (`exec-host.ts`) live in the worker; the Stop route signals a pid from `apps/web`. Where Stop should run is [[Monitor Open Questions]] #36; who finalises the stopped run is [[Execution Open Questions]] #56.

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
| non-zero, transient (*"rate limited, overloaded, network error, process killed by a signal or lost on restart"*) | same attempt re-run, max 3, backoff 30 s / 2 min / 8 min, `wasted = 1`, not counted toward `max_attempts` | runner |
| non-zero, anything else, *"or a 4th transient failure (budget or turn cap hit, auth error, bad config, unknown)"* | task `blocked` | runner |

Backlog Story 3.2 adds a second failure signal: *"non‑zero or `is_error` → failed"*. Claude reports `is_error` on its `result` line, so a run can exit 0 and still have failed. `RunResult` carries only `exitCode` and `error`, and no source says how the adapter reports `is_error`: [[Agent Providers Open Questions]] #33. A cap hit is a provider-side stop too (`--max-turns`, `--max-budget-usd`); PRD §7 classes it as non-transient.

*"A non-zero exit from an agent run is an **infrastructure failure**, never a verdict on the work, because work verdicts arrive as outcomes."* (PRD §7). See [[Infra Retries]].

The [[Replay Provider]] settles a stopped run as `{ exitCode: 130, error: 'stopped' }`. Whether that counts as *"killed by a signal"* (transient) is open: [[Agent Providers Open Questions]] #22.

## Where `outcome` comes from

`RunResult.outcome` is documented as *"read from the produced JSON or set_outcome"*, both of which the runner sees, not the CLI. Yet the `result` event also carries `outcome?`, which the adapter emits. Which side sets it is not stated: [[Agent Providers Open Questions]] #10. Which artifact carries the outcome is [[Execution Open Questions]] #7.

## Related

- [[AgentProvider Port]]
- [[Run Spec]]
- [[Normalized Event Envelope]]
- [[Runner Pipeline]]
- [[Stopping And Cancelling]]
