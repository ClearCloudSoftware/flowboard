---
tags: [flowboard, execution, storage]
module: Execution
---

# Execution Storage

Where execution's state and by-products live on disk.

The drawio *Logical components* page splits it in two: **Database** holds *"flows, tasks, steps, runs, questions, costs"*; **Disk** holds *"worktrees, artifacts, skills, session logs"*. No source gives a path for the session logs.

| What | Where | Source |
|---|---|---|
| All execution state | `data/flowboard.db` (SQLite, WAL, `busy_timeout = 5000`) | PRD §3. Backlog 1.1 and `02` §1 open it via `VIBE_DB_PATH` (see [[Database And Connection]]) |
| Run args snapshot | `data/runs/<id>/args.json` | PRD §7 |
| Resolved spec and raw stream (idea) | `data/runs/<id>/spec.json` | `03` §6; drawio *Run records*: *"data/runs/<id>/spec.json + raw stream, replayable at $0"* ([[Execution Open Questions]] #38) |
| Broker socket | `data/sock/<run_id>.sock`, mounted as `/run/fb/ask.sock` | PRD §9 |
| Task worktree | `<repo_path>/.vibe-worktrees/task-<id>`, branch `vibe/task-<id>` | PRD §11 |
| Artifacts | `<worktree>/.vibe/task-<task-id>/` | PRD §6 |
| Installed plugins | `<repo_path>/.flowboard/skills/<name>/<commit_sha>/` | PRD §5 |
| CLI stream probe | `docs/stream-sample.jsonl` (PRD's path; the capture now sits at `docs/old/stream-sample.jsonl`, with `docs/old/stream-sample.stderr`) | PRD §0 |

## The database is the only shared state

*"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does"* (PRD §3). The drawio *SQLite* card: *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*. `02` §1: *"keep it the *only* shared-state coupling."*

Because the worker is a separate process, live events go through the database, not memory: the SSE endpoint *"cannot share an in-memory emitter: it tails `run_events` by `seq`"* (PRD §7). `03` §8 calls this a *"deviation from PRD's in-memory emitter — keep it"*, and backlog 3.4 tags it *"PRD (deviation, keep)"*. The label is stale: the current PRD §7 already tails `run_events` ([[Monitor Open Questions]] #40).

## Per-run files

The runner writes, per run:

- `mcp.json`: points the CLI at the `ask_user` shim, with `RUN_ID` and the socket path as env (PRD §9).
- `settings.json`: the `PreToolUse` hooks (PRD §7). Backlog D5 wants an *empty* `--settings` file per run instead; see [[Run Guardrails At Launch]] and [[Execution Open Questions]] #52.
- `args.json`: the final command line (PRD §7).

Where `mcp.json` and `settings.json` are written is not stated. *Proposal:* `data/runs/<id>/` beside `args.json` ([[Execution Open Questions]] #39). How they reach a sandboxed run is not stated either ([[Sandboxing Storage]]).

## What never enters the sandbox

*"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* (PRD §11.1). The drawio *Mounts* card (line breaks shown as `/`): *"rw: task worktree → /work / ro: skills/ → /skills / socket: ask.sock / never: ~/.ssh, cloud credentials, flowboard.db, docker.sock"*.

The read-only mount differs: the drawio mounts all of `skills/`, while PRD §11.1 allows *"the step's plugin dirs, read-only (§7)"* and PRD §7 says *"Mount only the plugins the step names, never every installed one"*. See [[Sandbox Mounts]].

## Lifetimes

| Item | Removed |
|---|---|
| Run container | *"one per run, destroyed on completion"* (PRD §11.1). PRD §7's *Sandboxed runs* paragraph says *"the task's container"* ([[Execution Open Questions]] #61). |
| Worktree | *"never remove it automatically"*; a clean-up action once `done` or `cancelled` (PRD §11). Backlog 2.1: *"only when done/cancelled/failed"*. Task-detail guide: *"Only offered once the task is finished or cancelled"* ([[Execution Open Questions]] #60). |
| Run records, events | not stated. PRD §5 deletes them with their task (`ON DELETE CASCADE` from `tasks` through `step_instances` and `runs`), but no source deletes a task |
| Jobs | not stated |

## Ignored by git

Backlog 0.3 (**FIX**), for FlowBoard's own repo: *"`.gitignore`: `data/*.db*`, `data/runs`, `.vibe-worktrees`."*

In each managed project's repo, git's local exclude file is used instead: *"Installed plugins live in each managed project's `.flowboard/skills/`, which FlowBoard adds to that repo's `.git/info/exclude`"* (backlog 0.3), and promote should *"append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog 2.1). See [[Parent Repo Hygiene]].

## Where the sources disagree

> [!warning] Worktree path and branch
> PRD §11 and backlog 2.1: `<repo_path>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`. The drawio *Harness architecture* card: *"<repo>/.flowboard/worktrees/task-<id> on branch fb/task-<id>"*. The artifact folder stays `.vibe/task-<id>` in both. See [[Execution Open Questions]] #3, [[Workspace Naming]] and [[Task Storage On Disk]].

## Related

- [[Execution Index]]
- [[Execution Data Model]]
- [[Task Storage On Disk]]
- [[Execution Runtime]]
- [[Workspaces Storage]]
- [[Sandboxing Storage]]
- [[Agent Providers Storage]]
