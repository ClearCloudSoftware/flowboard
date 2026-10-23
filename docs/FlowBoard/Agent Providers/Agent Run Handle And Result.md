---
tags: [flowboard, agent-providers, concept, contract]
module: Agent Providers
---

# Agent Run Handle And Result

`launch()` is non-blocking. It returns an `AgentRun`, *"A live handle on one running attempt"*, whose promises settle as the run proceeds (`core/src/ports/agent-provider.ts`).

> [!check] Implemented 2026-10-18
> Both types are in `core/src/ports/agent-provider.ts`. On 2026-10-18 `pid` became a promise ([[Agent Providers Open Questions]] #37), `stop()` and `RunResult.error` got the meanings below, and `sessionId` learned to reject. The [[Claude Code Adapter]], the [[OpenCode Adapter]] and the [[Replay Provider]] implement them.

## `AgentRun`

```ts
export interface AgentRun {
  /** Resolves once the provider emits its session id (from system/init); rejects if the run ends without one. */
  sessionId: Promise<string>;
  /** Resolves once the process is spawned; `-1` if it never was. */
  pid: Promise<number>;
  /** Normalized event stream; the runner tees this to run_events + SSE. */
  events: AsyncIterable<NormalizedEvent>;
  /** Resolves when the run is over and its process has exited. */
  result: Promise<RunResult>;
  /** Stop the run; `result` settles as stopped. */
  stop(): void;
}
```

What each provider does:

| Member | Claude Code | OpenCode | Replay |
|---|---|---|---|
| `sessionId` | The first `system/init`; a fork gets a new id | The session create or fork response, or the resumed id, emitted as a synthesized `system` event | `script.sessionId`, else the first scripted `system` event; settles at launch |
| `pid` | The `claude` CLI's | The `opencode serve` server's, one server per run | `script.pid`, else `-1` |
| `stop()` before the result | Aborts the SDK query. The SDK closes the CLI's stdin; about 2 s later the CLI gets SIGTERM, and SIGKILL if it is still alive 5 s after that | Aborts the session and the event stream, then sends the server SIGTERM, and SIGKILL after 5 s | Settles at the next scripted event, and only while `events` is being read |
| `stop()` after the result | Changes nothing: the result decides | Does nothing | — |

- `sessionId` rejects when the run ends without one, with the run's `error` if it has one, else *run ended without a session id*. Replay rejects at launch, with that text, when its script holds no id (since 2026-10-22; before, it resolved `'replay-session'`). Each provider attaches a no-op handler, so a caller that never awaits `sessionId` sees no unhandled rejection.
- `pid` resolves to `-1` when nothing was spawned: the binary was missing, or OpenCode failed before its server came up (a model id it cannot resolve, for one).
- The providers' own grace before SIGKILL is their `killGraceMs` option, 5 s by default ([[Provider Implementation Decisions]] C12). On Claude the SDK also sends its own SIGKILL 5 s after its SIGTERM, so a longer `killGraceMs` does not lengthen the grace there.

Who uses each member, in the design:

> [!info] Design, not built
> None of the callers in this table exists on `dev` as of 2026-10-22. The only caller today is `run-agent` (`cli/src/run.ts`). It reads `events`, printing each one and logging it to `runs/<stamp>-<adapter>.jsonl`, awaits `result`, and calls `stop()` on Ctrl+C, SIGTERM or SIGHUP. It does not read `sessionId` or `pid`.

| Member | Used by | Source |
|---|---|---|
| `sessionId` | Park and resume (`--resume <claude_session_id>`); stored on the run | PRD §5, §9 |
| `pid` | Restart recovery: *"re-attach by pid before failing"*; Stop: *"SIGTERM by pid from the route"* | `03` §7, §8; backlog 3.3, 3.4 |
| `events` | The runner writes each to `run_events` and the SSE tail | `03` §6, §8 |
| `result` | The engine's advancement rules; the cost ledger | `02` §3; `06` §12 |
| `stop()` | No caller is named. Graceful worker shutdown (*"SIGTERM children, mark runs `cancelled`"*) runs in the worker that holds the handle, so it could use `stop()` (inference). The viewer's Stop button (*"A Stop button that kills the process"*) goes through a route, which holds no `AgentRun`: it SIGTERMs by pid | `03` §7, §8; backlog 3.3 (**GAP**), 3.4; PRD §13 |

> [!warning] Two ways to stop a run
> `AgentRun.stop()` lives with whoever holds the handle, the worker in the design; the Stop route signals a pid from `apps/web`. The two do not end the same way. A process killed from outside is not reported as a stop: the run fails with exit 1, and `error` reads *Claude Code process terminated by signal …* on Claude, or *opencode server ended the run early: …* on OpenCode, whose pid is the server's. `ExecHost.spawn` returns Node's own child process; there is no `ChildHandle`. Where Stop should run is [[Monitor Open Questions]] #36; who finalises the stopped run is [[Execution Open Questions]] #56.

## `RunResult`

```ts
export interface RunResult {
  /** The run's totals; for a run that ended before its result, the last running totals (Claude: tokens, no cost). */
  usage: Usage;
  exitCode: number;
  /** Drives conditional edges; read from the produced JSON or set_outcome. Unset is NOT 'pass': the engine parks the step at a human gate. */
  outcome?: 'pass' | 'fail';
  /**
   * Set when the run failed: the provider's own error report (e.g. Claude's
   * `is_error` result) or the stderr tail. A set `error` means failed, even
   * when `exitCode` is 0.
   */
  error?: string;
}
```

- **`usage`** is the `result` event's totals when a result arrived. Otherwise it is the last running totals from `usage` events. Claude's running totals carry tokens and turns but no `costUsd`, because Claude prices a run only in its result, so a Claude run that ends early has to be priced from tokens. OpenCode's carry its cost. Replay keeps the last scripted `usage` the same way.
- **`exitCode`**: see *Exit codes*.
- **`outcome`**: see *Where `outcome` comes from*.
- **`error`** is the first `error` event's message, so the provider's own report wins. On Claude, the CLI's stderr tail is appended when the SDK threw, and a non-zero exit with no `error` event gives the stderr tail, or `exit code <n>`. A stop before the result sets it to `stopped`. A set `error` means failed, even when `exitCode` is 0 ([[Agent Providers Open Questions]] #33, decided 2026-10-18).

> [!check] Changed 2026-10-22
> A run stopped or failed before its result used to report zero usage, even after spending money. It now reports the last running totals. Decided 2026-10-22 and open to Alex's review ([[Agent Providers Open Questions]] #33).

> [!important] An unset outcome is never a pass
> *"Unset is NOT 'pass': the engine parks the step at a human gate."* (`core/src/ports/agent-provider.ts`). `03` §6: *"**No default:** an unset outcome on a step with conditional edges goes to a human gate, never to `pass` (PRD §8)."* See [[Run Outcomes]].

`RunResult` is the one shape every executor returns: *"RunResult identical across executors"* (`02` §3, `StepExecutor` sketch). A shell step produces it without a provider.

## Exit codes

| Provider | Exit code |
|---|---|
| Claude Code | The CLI's own exit code; a CLI killed by a signal from outside the run shows as 1. 127 when the binary cannot be spawned. If nothing was spawned: 1 when an `error` arrived, else 0 |
| OpenCode | 0 when the root session went idle with no `error`, else 1, including a server that died mid-run. During start-up: the server's own exit code if it exits, 127 if the binary cannot be spawned, 1 after the 30 s start-up timeout |
| Replay | 1 when the script holds an `error` event (since 2026-10-22), else 0 |
| All three | 130, with `error: 'stopped'`, when `stop()` comes before the result |

## How runs fail

- The first `error` event fails the run. Later ones are still emitted, but `error` keeps the first.
- **Claude.** An `is_error` result emits its `error` after the `result` event. Its text is the result's own message for an API-error turn, else `<subtype>: <errors>`, such as `error_max_turns: …` or `error_max_budget_usd: …`. An assistant message with an error gives `assistant error: <kind>`, such as `assistant error: rate_limit`. A plugin folder the CLI did not load gives `plugin not loaded: <folder>`.
- **OpenCode.** Any assistant-message error or `session.error`, in the root session or a subagent's, fails the run, even when the main agent finishes. A `ContextOverflowError` is dropped, because OpenCode compacts and carries on. The adapter's own limits emit before the result: `max_turns: reached the limit of <n> steps` and `max_budget: spent $<x> of $<y>`.
- A failing tool call does not fail the run. It gives a `tool_result` with `ok: false`.
- Neither adapter emits rate-limit or retry records. A rate-limited failure, and a turn or budget cap, reach the caller only as `error` text, which a runner would have to match to classify.

## How exit codes are read

> [!info] Design, not built
> The runner that classifies exits is not built as of 2026-10-22. `run-agent` turns a result into its own exit code: 130 when `error` is `stopped`, 0 when `error` is unset and `exitCode` is 0, else 1 ([[Run Config Reference]]).

In the design, classification belongs to the runner (`03` §6, PRD §7):

| Exit | Meaning | Who decides |
|---|---|---|
| `0` | `succeeded`; scan artifacts, apply §8 | runner |
| non-zero, transient (*"rate limited, overloaded, network error, process killed by a signal or lost on restart"*) | same attempt re-run, max 3, backoff 30 s / 2 min / 8 min, `wasted = 1`, not counted toward `max_attempts` | runner |
| non-zero, anything else, *"or a 4th transient failure (budget or turn cap hit, auth error, bad config, unknown)"* | task `blocked` | runner |

Backlog Story 3.2 adds a second failure signal: *"non‑zero or `is_error` → failed"*. As built, the adapter turns `is_error` into an `error` event and sets `RunResult.error`, and a set `error` means failed ([[Agent Providers Open Questions]] #33). A cap hit is a provider-side stop too; PRD §7 classes it as non-transient. A signal kill shows only as exit 1 with *terminated by signal* in the text, so a runner cannot tell an out-of-memory kill from a plain failure by the code ([[Provider Implementation Decisions]], deferred issues).

*"A non-zero exit from an agent run is an **infrastructure failure**, never a verdict on the work, because work verdicts arrive as outcomes."* (PRD §7). See [[Infra Retries]].

All three providers settle a stop before the result as `{ exitCode: 130, error: 'stopped' }`. Whether that counts as *"killed by a signal"* (transient) is open: [[Agent Providers Open Questions]] #22.

## Where `outcome` comes from

`RunResult.outcome` is documented as *"read from the produced JSON or set_outcome"*, both of which the runner sees, not the CLI. Yet the `result` event also carries `outcome?`, which the adapter emits. Which side sets it is not stated: [[Agent Providers Open Questions]] #10. Which artifact carries the outcome is [[Execution Open Questions]] #7.

As built, neither real adapter sets `outcome`. Their `result` events never carry one, so every Claude or OpenCode run ends with it unset, which the port says parks the step at a human gate. Only Replay passes one through, from a scripted `result` event; a stopped Replay run keeps it too. Structured output, which the [[Provider SDK Fit Analysis]] proposed as the outcome's one source, was skipped on purpose: both 2026-10-18 plans call it the Execution component's call. Nothing reads produced JSON, and the ask-user shim has no `set_outcome` tool.

## Related

- [[AgentProvider Port]]
- [[Run Spec]]
- [[Normalized Event Envelope]]
- [[Runner Pipeline]]
- [[Stopping And Cancelling]]
