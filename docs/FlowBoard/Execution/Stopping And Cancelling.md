---
tags: [flowboard, execution, behaviour, stop, cancel]
module: Execution
---

# Stopping And Cancelling

Four ways work stops before it finishes: Stop a run, Cancel a task, Pause a task, and the worker shutting down. The task-side view is [[Task Actions]].

## Stop a run

| Source | Wording |
|---|---|
| drawio *Functional components* | *"Stop / kill the process"* |
| PRD §13 | *"A Stop button that kills the process."* |
| Feature map §9 | *"**Stop button** — End a run you don't want to keep paying for."* |
| `03` §8 | *"Stop = SIGTERM by pid from the route (same machine), finalize as `cancelled`."* |
| Backlog 3.4 (**PRD**) | *"Stop: SIGTERM by pid from the route (same machine), finalise as cancelled."* |
| `agent-provider.ts` | `AgentRun.stop()`: `/** SIGTERM the child. */ stop(): void;` |
| `exec-host.ts` | `ChildHandle.kill(signal?: string): void;` |

The route sends the signal directly, not through the queue. *Inference:* that does not break PRD §2's *"route handlers must never spawn"* rule, since it signals a process and spawns nothing. But the ports' `stop()` and `kill()` live in the worker that holds the handle, and on the container tier the host pid belongs to the `docker` client, not the agent. Where Stop should run is [[Monitor Open Questions]] #36; see also [[Agent Run Handle And Result]].

> [!warning] Cancelled or failed?
> The monitor guide: *"Ends that run now. It is recorded as failed, with "stopped by you" as the reason, and the slot is handed to whatever is next in the queue."* The mockup's `stop()` sets the step to `failed` with `err = 'stopped by you'`, so it lands in the needs-you band like any failure (`monitor.html`). `03` §8 and backlog 3.4 say `cancelled`. See [[Monitor Open Questions]] #14 and [[Execution Open Questions]] #27.

> [!question] Would a Stop be retried automatically?
> PRD §7 lists *"process killed by a signal"* as transient, retried automatically up to 3 times. Stop is a SIGTERM, and the replay adapter's `stop()` settles with `exitCode: 130, error: 'stopped'`. Read literally, a stopped run would be retried. The same applies to runs SIGTERMed by a graceful shutdown. See [[Monitor Open Questions]] #35 and [[Execution Open Questions]] #55.

> [!question] Who finalises a stopped run?
> `03` §7 makes the worker *"the only writer of run lifecycle state"*. `03` §8 and backlog 3.4 have the route signal the process and *"finalise as cancelled"*. See [[Monitor Open Questions]] #36 and [[Execution Open Questions]] #56.

What the engine does next after a Stop is not stated. A stopped run is neither a work verdict nor an infra failure. *Proposal:* the step instance waits at `awaiting_approval` with reason "stopped", so you choose Retry or Fail task, and nothing is retried automatically ([[Execution Open Questions]] #28, [[Monitor Open Questions]] #35).

**Money.** Monitor guide: *"Everything it had spent moves to wasted — stopping saves the future spend, not the past."*

## Cancel a task

Backlog 2.1 (**FIX**): *"Cancel: SIGTERM live runs, cancel pending questions, mark instances skipped."* PRD §12: `POST /api/tasks/:id/cancel`. Feature map §3: *"cancel it — which stops any running agents and tidies up."*

Task-detail guide: *"Stops any running agents and tidies up. The workspace survives until you clean it up."* and *"Anything in flight becomes wasted."* The worktree is not removed: *"When a task reaches `done` or `cancelled`, offer a "clean up worktree" action; never remove it automatically."* (PRD §11). Feature map §14 and the task-detail guide say the same in their own words (*"only once the task is finished or cancelled"*). Backlog 2.1 also allows it after failure: *"only when done/cancelled/failed"* ([[Execution Open Questions]] #60, [[Cleaning Up A Workspace]]).

From which statuses Cancel works is not stated: PRD §12's `POST /api/tasks/:id/cancel` names none ([[Execution State Machines]]).

## Pause a task

Feature map §3 names it in a heading (*"**Pause, send back, or cancel**"*) without defining it. The task-detail guide gives the rule: *"Stops after the current run rather than mid-flight. The workspace stays."* Cost: *"Stops future spend only."* Its lifecycle note adds *"Pausing and sending back to the backlog both keep the workspace"*. No status, column, endpoint or engine rule backs it. *Proposal:* a flag the engine checks before enqueuing the next `start_run`. See [[Execution Roadmap]].

## Worker shutdown

`03` §7 and backlog 3.3 (**GAP**): *"Graceful shutdown: SIGTERM children, mark runs `cancelled`, not `failed`."* A crash is different. On restart, `03` §7 re-attaches to a live pid or fails a dead one *"with a Retry hint"*; PRD §7 instead treats *"lost on restart"* as transient and retries it ([[Worker Lifecycle]], [[Execution Open Questions]] #30).

> [!question] Shutdown versus "lost on restart"
> PRD §7 lists *"lost on restart"* as **transient**, retried automatically. A graceful shutdown marks runs `cancelled`. Whether those cancelled runs are re-queued when the worker comes back is not stated.

## What each does

| Action | Running processes | Pending questions | Instances | Task status | Workspace |
|---|---|---|---|---|---|
| Stop run | SIGTERM one | not stated | not stated (the monitor mockup: `failed`) | not stated | kept |
| Cancel task | SIGTERM all | cancelled | `skipped` | `cancelled` | kept |
| Pause task (task-detail guide) | left to finish | not stated | not stated | none defined | kept |
| Worker shutdown | SIGTERM all; runs `cancelled` | not stated | not stated | not stated | kept |

## Related

- [[Execution Index]]
- [[Task Actions]]
- [[Worker Lifecycle]]
- [[Live Run Viewer]]
- [[Execution Controls]]
- [[Agent Run Handle And Result]]
- [[Cleaning Up A Workspace]]
