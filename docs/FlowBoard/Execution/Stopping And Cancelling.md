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

> [!warning] The shipped code differs
> The two port rows quote the reference port in `docs/old/reference/core/ports/`, which the shipped port (`core/src/ports/`) replaced on 2026-10-18. `ChildHandle` is gone, and `kill(signal?)` with it: `ExecHost.spawn` returns Node's own child process ([[ExecHost Port]]). What exists is `AgentRun.stop()`, with no arguments: *"Stop the run; `result` settles as stopped."*
> - Claude: `stop()` aborts the Agent SDK query. The SDK closes the CLI's stdin and signals the CLI itself, and the adapter terminates the child.
> - OpenCode: `stop()` aborts the session and its event stream, then the adapter terminates its `opencode serve` child.
> - Terminating is SIGTERM, then SIGKILL if the child is still running after a grace (`adapters/src/exec/terminate.ts`, default 5000 ms; [[Provider Implementation Decisions]] C12).
> - A run stopped before its result settles `{ exitCode: 130, error: 'stopped' }`. Since 2026-10-22 it keeps the usage reported so far; on Claude that is tokens without a cost, because Claude prices a run only in its result.
> - The one caller today is `run-agent`. It calls `stop()` on Ctrl+C, SIGTERM or SIGHUP ([[Run Agent CLI Decisions]] R29), and when the event stream fails.

The route sends the signal directly, not through the queue. *Inference:* that does not break PRD §2's *"route handlers must never spawn"* rule, since it signals a process and spawns nothing. But the port's `stop()` lives in the worker that holds the handle, and on the container tier the host pid belongs to the `docker` client, not the agent. As built, a signal sent from outside is not reported as a stop: the run fails with exit 1, not 130 and `stopped`, and OpenCode's pid is its server's. Where Stop should run is [[Monitor Open Questions]] #36; see also [[Agent Run Handle And Result]].

> [!warning] Cancelled or failed?
> The monitor guide: *"Ends that run now. It is recorded as failed, with "stopped by you" as the reason, and the slot is handed to whatever is next in the queue."* The mockup's `stop()` sets the step to `failed` with `err = 'stopped by you'`, so it lands in the needs-you band like any failure (`monitor.html`). `03` §8 and backlog 3.4 say `cancelled`. See [[Monitor Open Questions]] #14 and [[Execution Open Questions]] #27.

> [!question] Would a Stop be retried automatically?
> PRD §7 lists *"process killed by a signal"* as transient, retried automatically up to 3 times. Stop is a SIGTERM, and on every shipped adapter (Claude, OpenCode and Replay) a run stopped before its result settles with `exitCode: 130, error: 'stopped'`. Read literally, a stopped run would be retried. The same applies to runs SIGTERMed by a graceful shutdown. See [[Monitor Open Questions]] #35 and [[Execution Open Questions]] #55.

> [!check] Answered by run-flow, 2026-10-23
> No. run-flow retries nothing by itself; automatic infra retry backoff is on the run-flow plan's Left out list. A run cut off by Ctrl+C reruns only when a person runs `--resume`, and a run stopped by its `timeout_minutes` waits at a *run failed* gate. See [[Run Flow Reference]].

> [!question] Who finalises a stopped run?
> `03` §7 makes the worker *"the only writer of run lifecycle state"*. `03` §8 and backlog 3.4 have the route signal the process and *"finalise as cancelled"*. See [[Monitor Open Questions]] #36 and [[Execution Open Questions]] #56.

What the engine does next after a Stop is not stated. A stopped run is neither a work verdict nor an infra failure. *Proposal:* the step instance waits at `awaiting_approval` with reason "stopped", so you choose Retry or Fail task, and nothing is retried automatically ([[Execution Open Questions]] #28, [[Monitor Open Questions]] #35).

> [!check] Answered by run-flow, 2026-10-23
> run-flow has no Stop for one run. Ctrl+C stops every run: each cut-off run is recorded `error: 'interrupted'` and wasted, uses no attempt, and leaves its step `running`, so `--resume` reruns it at the same attempt without asking. The one stop of a single run, `timeout_minutes`, lands where the proposal puts a Stop: a *run failed* gate offering Retry this step (the same attempt) and Fail the flow. A Stop of one run, should the Monitor add it, would land at that gate too, since every live run that ends with an error does. See [[Run Flow Reference]].

**Money.** Monitor guide: *"Everything it had spent moves to wasted — stopping saves the future spend, not the past."*

As built in run-flow (2026-10-23), a run cut off by Ctrl+C, or because the flow has spent its budget, keeps what it cost and counts as wasted, as does a run a rework or an escalation superseded. A run that *Fail the flow* stopped counts as spent but not wasted, and one the host never launched cost nothing and is not wasted. A stopped OpenCode run records its running dollars. A Claude run stopped before its result has tokens but no price, so its cost is unknown (`costUsd: null`): the totals count it as nothing and add `, cost unknown for 1 run`.

## Cancel a task

Backlog 2.1 (**FIX**): *"Cancel: SIGTERM live runs, cancel pending questions, mark instances skipped."* PRD §12: `POST /api/tasks/:id/cancel`. Feature map §3: *"cancel it — which stops any running agents and tidies up."*

Task-detail guide: *"Stops any running agents and tidies up. The workspace survives until you clean it up."* and *"Anything in flight becomes wasted."* The worktree is not removed: *"When a task reaches `done` or `cancelled`, offer a "clean up worktree" action; never remove it automatically."* (PRD §11). Feature map §14 and the task-detail guide say the same in their own words (*"only once the task is finished or cancelled"*). Backlog 2.1 also allows it after failure: *"only when done/cancelled/failed"* ([[Execution Open Questions]] #60, [[Cleaning Up A Workspace]]).

From which statuses Cancel works is not stated: PRD §12's `POST /api/tasks/:id/cancel` names none ([[Execution State Machines]]).

As built in run-flow (2026-10-23), there is no Cancel (the run-flow plan's Left out list). The nearest control is **Fail the flow**, offered at every gate. It stops every live and queued run, takes down the other open gate prompts, marks every `pending`, `running` or gated step `failed` (not `skipped`), and ends the flow `failed`, with exit 1. The runs it stops are recorded `error: 'stopped'` and count as spent but not wasted, unlike the guide's *"Anything in flight becomes wasted"*; a run still queued is `not launched`. Agents' open questions are withdrawn as their runs stop. The folder and its artifacts stay.

## Pause a task

Feature map §3 names it in a heading (*"**Pause, send back, or cancel**"*) without defining it. The task-detail guide gives the rule: *"Stops after the current run rather than mid-flight. The workspace stays."* Cost: *"Stops future spend only."* Its lifecycle note adds *"Pausing and sending back to the backlog both keep the workspace"*. No status, column, endpoint or engine rule backs it. *Proposal:* a flag the engine checks before enqueuing the next `start_run`. See [[Execution Roadmap]].

As built in run-flow (2026-10-23), there is no Pause: no control lets live runs finish while starting nothing new. Ctrl+C, SIGTERM or SIGHUP stops runs mid-flight and counts their spend as wasted; the host reports that as `stopped`, with exit 130. It says `paused`, with exit 3, when a gate waits with no terminal to answer it and nothing else can run, and when the flow has spent its budget (`budget_usd` in the flow file, or `--budget-usd`; the ceiling is Alex's call, 2026-10-23, and pausing at it Claude's, open to Alex's review): then it stops the live runs mid-flight and takes down any open gate prompt, as Ctrl+C does, and prints `-- the budget is spent: $<spent> of $<budget>`. Both continue with `pnpm run-flow --resume <run folder>`, which asks such a gate again; after a spent budget, `--resume` refuses until `--budget-usd` gives a ceiling above what is spent, or `0` for none. Neither is stored as a status: `state.json` shows them as a step at a gate with nothing live, or a step `running` with no live run (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). A budget pause can leave the second shape, as Ctrl+C does; then only its spend, against `flow.json`'s `config.budgetUsd`, tells the two apart.

## Worker shutdown

`03` §7 and backlog 3.3 (**GAP**): *"Graceful shutdown: SIGTERM children, mark runs `cancelled`, not `failed`."* A crash is different. On restart, `03` §7 re-attaches to a live pid or fails a dead one *"with a Retry hint"*; PRD §7 instead treats *"lost on restart"* as transient and retries it ([[Worker Lifecycle]], [[Execution Open Questions]] #30).

> [!question] Shutdown versus "lost on restart"
> PRD §7 lists *"lost on restart"* as **transient**, retried automatically. A graceful shutdown marks runs `cancelled`. Whether those cancelled runs are re-queued when the worker comes back is not stated.

As built in run-flow (2026-10-23), SIGTERM and SIGHUP stop the host as Ctrl+C does, and `--resume` reruns each cut-off run at the same attempt. A second press more than 300 ms later quits at once: it kills (SIGKILL) every run still going, each check's process group and each agent's CLI process, removes the live agent runs' `/tmp/fb-*` folders, and leaves the folder's lock behind. So the next run-flow there warns `-- warning: a run-flow (pid <n>) ended without cleaning up`, and stops whatever the run logs show still running, as after a `kill -9` ([[Worker Lifecycle]]).

## What each does

| Action | Running processes | Pending questions | Instances | Task status | Workspace |
|---|---|---|---|---|---|
| Stop run | SIGTERM one | not stated | not stated (the monitor mockup: `failed`) | not stated | kept |
| Cancel task | SIGTERM all | cancelled | `skipped` | `cancelled` | kept |
| Pause task (task-detail guide) | left to finish | not stated | not stated | none defined | kept |
| Worker shutdown | SIGTERM all; runs `cancelled` | not stated | not stated | not stated | kept |
| run-flow: Ctrl+C | stops all; runs `interrupted`, wasted | withdrawn | stay `running`, rerun by `--resume` | none stored; `stopped`, exit 130 | kept |
| run-flow: budget spent | stops all; runs `interrupted`, wasted | withdrawn | stay `running`, rerun by `--resume --budget-usd <more>` | none stored; `paused`, exit 3 | kept |
| run-flow: Fail the flow | stops all; runs `stopped`, not wasted | withdrawn | `failed` | flow `failed`, exit 1 | kept |
| run-flow: timeout | stops one; run failed, wasted | none open: the clock stops while one waits | at a *run failed* gate | none stored | kept |

## Related

- [[Execution Index]]
- [[Task Actions]]
- [[Worker Lifecycle]]
- [[Live Run Viewer]]
- [[Execution Controls]]
- [[Agent Run Handle And Result]]
- [[Cleaning Up A Workspace]]
