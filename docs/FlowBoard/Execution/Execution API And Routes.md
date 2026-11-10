---
tags: [flowboard, execution, api, routes]
module: Execution
---

# Execution API And Routes

*"REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12) For execution, *thin* means: write rows, enqueue a job, return. The drawio *API routes + server actions* card: *"zod-validated input → write rows → enqueue a job → return"*.

## In the PRD

| Method | Path | Execution effect |
|---|---|---|
| `POST` | `/api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* |
| `POST` | `/api/tasks/:id/cancel` | stop runs, cancel questions, skip instances (backlog 2.1) |
| `POST` | `/api/step-instances/:id/approve` | outcome pass: *"Approve overrides the agent's `fail` outcome (human wins)"* (`02` §3). PRD §8 says *"approve means pass"* only of the no-outcome gate ([[Execution Open Questions]] #64). Enqueueing `advance_task` is inferred |
| `POST` | `/api/step-instances/:id/reject` | outcome fail + reason; *"reject with no `on_fail` edge fails the task"* (`02` §3, backlog 5.2). Backlog 2.3: the UI must send the reason. |
| `POST` | `/api/step-instances/:id/retry` | one more attempt with a note (PRD §8) |
| `POST` | `/api/questions/:id/answer` | may enqueue a resume `start_run` (PRD §9) |
| `GET` | `/api/runs/:id` | one run |
| `GET` | `/api/runs/:id/stream` | SSE: *"replays existing `run_events` for the run, then streams new ones. Reconnect with `Last-Event-ID`."* |
| `GET` | `/api/projects/:id/board` | *"board projection: columns + cards"* |
| `POST` | `/api/import/backlog` | *"md file -> tasks"*; enqueues an `import_backlog` job for the worker (backlog 7.3). See [[Intake API And Routes]] |

(PRD §12)

## Named elsewhere

| Path | Source |
|---|---|
| `POST /api/tasks/:id/start` | backlog intro: *"the code added `POST /api/tasks/:id/start` with no button"* |
| Stop | `03` §8: *"Stop = SIGTERM by pid from the route"*, path not named |

## Proposed

> [!note] Proposals
> Not in any source, except the `start` path, which the backlog intro records. The task-level paths match [[Task Detail API And Routes]] (and, for demote, [[Workspaces API And Routes]]); the stop path and the retry body follow [[Monitor API And Routes]]. Each is listed in [[Execution Open Questions]] #47.

| Method | Path | For |
|---|---|---|
| `POST` | `/api/tasks/:id/start` | Start, if D1 keeps it separate from promote |
| `POST` | `/api/tasks/:id/demote` | Send to backlog |
| `POST` | `/api/tasks/:id/pause` | Pause (named in feature map §3, defined in the task-detail guide) |
| `POST` | `/api/tasks/:id/fail` | **Fail task** at an escalation gate |
| `POST` | `/api/runs/:id/stop` | Stop a run |
| `POST` | `/api/step-instances/:id/retry` with `{ note?, allowHost? }` | PRD §8's Retry *"carries my note"*; the mockups' **Retry as-is** (no host) and **Allow host & retry** |

Sibling sets propose different shapes for the same actions; pick one ([[Execution Open Questions]] #47):

| Action | [[Task Detail API And Routes]] | [[Monitor API And Routes]] | [[Human In The Loop API And Routes]] | [[Sandboxing API And Routes]] |
|---|---|---|---|---|
| Fail task | `POST /api/tasks/:id/fail` | — | `POST /api/step-instances/:id/fail-task` (or `reject` with `{ failTask: true }`) | — |
| Allow host & retry | — | `retry` with `{ note?, allowHost? }` | `POST /api/step-instances/:id/allow-host` `{ host }` | `POST /api/step-instances/:id/allow-host` `{ host }` |

The proposals agree elsewhere: Stop as `POST /api/runs/:id/stop` (Task Detail, Monitor), demote as `POST /api/tasks/:id/demote` (Task Detail, Workspaces). Clean-up of the workspace, `POST /api/tasks/:id/cleanup`, is proposed by Task Detail and Workspaces; it does not touch execution.

## As built in the app

As built (2026-11-10), the Next.js app has run routes under `app/api/runs/`, keyed by run folder name, not by task or step instance. They read and write run-flow's run folders in `runs/` (or `FLOWBOARD_RUNS_DIR`) through `cli/src/flow-logs.ts` and `cli/src/flow-start.ts`. Every route answers 403 to a request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` (`app/api/flows/local.ts`).

| Method | Path | Does | Errors |
|---|---|---|---|
| `GET` | `/api/runs` | The run folders, newest first, each `{ name, flow, status }`; `?flow=` keeps one flow's runs | |
| `POST` | `/api/runs` | `{ flow, folder, task, budgetUsd?, allowDirty? }`: writes the task to `runs/.started/<id>.task.md`, starts a detached `run-flow --page` on `<flows dir>/<flow>.yaml`, and waits up to 20 s for its `-- run folder` line; returns `{ name }` | 400 bad body; 422 with run-flow's own refusal |
| `GET` | `/api/runs/[run]` | The run as the page shows it: status, steps, runs, spend, artifacts, `changes.patch`, open asks, time waited at gates, the sandbox | 404 |
| `GET` | `/api/runs/[run]/logs` | Every step log, a parsed line per event | 404 |
| `GET` | `/api/runs/[run]/artifact?type=` | One artifact's text | 404 |
| `GET` | `/api/runs/[run]/built` | What the run built: its `changes.patch`, else the folder's `git diff HEAD` without `.flowboard/` | 404 |
| `GET` | `/api/runs/[run]/events` | Server-sent events: `data: change` whenever a file in the run folder changes (`fs.watch`, 150 ms debounce), and a comment every 15 s | 404 |
| `POST` | `/api/runs/[run]/answer` | `{ id, answers }`: writes `answers/<id>.json` for an open ask, once each answer fits its question | 400 bad body; 409 when the host does not take page answers, the ask is closed or an answer does not fit |
| `POST` | `/api/runs/[run]/stop` | Writes `<run folder>/stop`; the host stops as on a first Ctrl+C | 409 unless the run is `starting`, `running` or `waiting` |
| `POST` | `/api/runs/[run]/resume` | `{ budgetUsd? }`: starts a detached `run-flow --resume <run folder> --page`, with `--budget-usd` when given, its output appended to `<run folder>/resume.log`; returns `{ ok, pid }` | 400; 404; 409 unless the run is `paused` |

Approve, Send back, Retry, Fail the flow and Allow host & retry are not endpoints: they are values of a gate's `decision` and `allow_host` answers, sent through `/answer`. Stopping a single run, rather than the whole flow, is not built.

> [!warning] Routes that spawn
> `POST /api/runs` and `POST /api/runs/[run]/resume` start a process, which PRD §2 forbids (*"Next.js route handlers must never spawn a long-lived child process"*, [[Job Queue]]), and the routes call `packages/cli`, not `packages/core`. The spawned `run-flow` is detached and runs on its own, so the route returns at once; there is no queue. Nothing records this as a decision; it is open to Alex's review.

## What a route does, step by step

*Illustrative* for Approve:

```mermaid
sequenceDiagram
  participant UI
  participant Route as POST /approve
  participant Core as packages/core
  participant DB as SQLite
  UI->>Route: approve
  Route->>Route: zod validate
  Route->>Core: approve(stepInstanceId)
  Core->>DB: outcome = pass, state = done
  Core->>DB: insert job advance_task
  Route-->>UI: 200 JSON
```

## Rules for every execution route

- *"Every port is called from `src/lib/`, **never from a route**"* (`06` §15). `06` uses the first build's layout (`src/app/api/`, `src/lib/`); in the PRD's layout that is `apps/web/app/api/` calling `packages/core` (PRD §3, §12).
- *"If a route ever needs to know whether it's Claude or Codex, something leaked upward."* (`06` §15)
- Stop is the one route that touches a process (by pid): *"SIGTERM by pid from the route (same machine)"* (backlog 3.4; `03` §8). As built in the app (2026-11-10), the stop route signals nothing: it writes a `stop` file, and the run's host, which holds the processes, stops them and saves the state. A second `stop` is ignored. As built, a signal from outside is reported as a failed run (exit 1), not as a stop, and OpenCode's pid is its server's ([[Agent Run Handle And Result]]). As built in run-flow (2026-10-23), each run's log records its pid as a `pid` line: the agent CLI's, or for a shell step its process group's, which a stop has to signal as a group. The line also holds the process's start time, and run-flow, stopping what a dead host left running, signals a pid only while that still matches, since the pid may be another process's by now (Claude's call, 2026-10-23, open to Alex's review).

## Related

- [[Execution Index]]
- [[Execution Controls]]
- [[Job Queue]]
- [[Task Detail API And Routes]]
- [[Monitor API And Routes]]
- [[Workspaces API And Routes]]
- [[Sandboxing API And Routes]]
- [[Thin Route Handlers]]
