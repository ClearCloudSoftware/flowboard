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

As built in run-flow (2026-10-23), there is no database and no worktree. The host works in place in the folder each run names with `--folder` and writes:

- **The run folder**, `runs/<YYYY-MM-DDTHH-MM-SS>-<flow name>/`, beside where the command runs. It is claimed with a non-recursive `mkdir`, so a name already taken, even by another host in the same second, gets `-2`, `-3` and so on. In the flow name, any character but a letter, digit, `_`, `.` or `-` becomes `_`. It holds `flow.json`, the pinned flow (`{ version: 1, config, artifactsDir, maxRuns }`, whose `config` also keeps the run's folder and the flow's budget); `state.json`, the engine's state, written whole through `state.json.<pid>.tmp`; `flow.jsonl`, one line per transition; and per run `<NNN>-<step>.jsonl`, its log, and `<NNN>-<step>.outcome.json`, its `set_outcome` verdict. If a check deletes the run folder, the next save writes `flow.json` and `state.json` again, so the flow can still be resumed; earlier logs and `flow.jsonl` lines are lost.
- **The artifacts**, `<folder>/.flowboard/<run folder name>/<type>.md`.
- **The lock**, `<folder>/.flowboard/lock`, holding `{ pid, runDir }`, the host's pid and its run folder's absolute path, which keeps one `run-flow` per folder. Making it creates only `.flowboard/`, never the folder itself.
- **The broker socket**, `ask.sock`, in a temp folder `/tmp/fb-*` per agent run, with the copied `skills:` folders. A second Ctrl+C removes these folders before it exits.

When `runs/` lies inside the run's folder, agent steps may not write to the run folder. See [[Run Flow Reference#Files written]].

## The database is the only shared state

*"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does"* (PRD §3). The drawio *SQLite* card: *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*. `02` §1: *"keep it the *only* shared-state coupling."*

Because the worker is a separate process, live events go through the database, not memory: the SSE endpoint *"cannot share an in-memory emitter: it tails `run_events` by `seq`"* (PRD §7). `03` §8 calls this a *"deviation from PRD's in-memory emitter — keep it"*, and backlog 3.4 tags it *"PRD (deviation, keep)"*. The label is stale: the current PRD §7 already tails `run_events` ([[Monitor Open Questions]] #40).

## Per-run files

The runner writes, per run:

- `mcp.json`: points the CLI at the `ask_user` shim, with `RUN_ID` and the socket path as env (PRD §9).
- `settings.json`: the `PreToolUse` hooks (PRD §7). Backlog D5 wants an *empty* `--settings` file per run instead; see [[Run Guardrails At Launch]] and [[Execution Open Questions]] #52.
- `args.json`: the final command line (PRD §7).

Where `mcp.json` and `settings.json` are written is not stated. *Proposal:* `data/runs/<id>/` beside `args.json` ([[Execution Open Questions]] #39). How they reach a sandboxed run is not stated either ([[Sandboxing Storage]]).

> [!warning] The shipped code differs
> - No per-run file is written (2026-10-18). The Claude adapter passes Agent SDK options in memory: `mcpServers` with `strictMcpConfig`, `settingSources: []`, and a `PreToolUse` hook callback when `RunSpec.guards` is set. The OpenCode adapter passes one config in `OPENCODE_CONFIG_CONTENT`. The shim reads only `FLOWBOARD_ASK_SOCKET`; there is no `RUN_ID` ([[Agent Providers Open Questions]] #4, #24).
> - No `args.json` either: the runner that would write it is not built, and the SDK builds the CLI's arguments itself. `run-agent` logs the launched `RunSpec` as the `start` line of `runs/<stamp>-<adapter>.jsonl`, and puts the broker socket, `ask.sock`, in a temp folder `/tmp/fb-*` ([[Agent Providers Storage]]).

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

As built in run-flow (2026-10-23), the run folder and the artifacts are never removed. An agent run's temp folder goes when the run ends, and the lock when its host exits, but only while it still holds that host's pid. A host killed with `kill -9`, or quit by a second Ctrl+C, leaves its lock behind; the next run-flow in that folder replaces it and stops what that host left running ([[Worker Lifecycle]]).

## Ignored by git

Backlog 0.3 (**FIX**), for FlowBoard's own repo: *"`.gitignore`: `data/*.db*`, `data/runs`, `.vibe-worktrees`."*

In each managed project's repo, git's local exclude file is used instead: *"Installed plugins live in each managed project's `.flowboard/skills/`, which FlowBoard adds to that repo's `.git/info/exclude`"* (backlog 0.3), and promote should *"append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog 2.1). See [[Parent Repo Hygiene]].

As built in run-flow (2026-10-23), the host does the same for its own files: at start it adds `.flowboard/` to the local exclude file of the repository that holds the run's folder, found with `git rev-parse --git-path info/exclude`. So a `git add -A` during a flow, which an agent might run, leaves the lock and the artifacts out, and the uncommitted-changes check skips `.flowboard` too. `run-flow` never touches `.gitignore` ([[Run Agent CLI Decisions]] R14).

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
