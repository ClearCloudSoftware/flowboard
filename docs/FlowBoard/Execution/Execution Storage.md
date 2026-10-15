---
tags: [flowboard, execution, storage]
module: Execution
---

# Execution Storage

Where execution's state and by-products live on disk.

| What | Where | Source |
|---|---|---|
| All execution state | `data/flowboard.db` (SQLite, WAL, `busy_timeout = 5000`) | PRD §3 |
| Run args snapshot | `data/runs/<id>/args.json` | PRD §7 |
| Resolved spec (idea) | `data/runs/<id>/spec.json` | `03` §6; drawio *Run records*: *"spec.json + raw stream, replayable at $0"* |
| Broker socket | `data/sock/<run_id>.sock`, mounted as `/run/fb/ask.sock` | PRD §9 |
| Task worktree | `<repo_path>/.vibe-worktrees/task-<id>`, branch `vibe/task-<id>` | PRD §11 |
| Artifacts | `<worktree>/.vibe/task-<task-id>/` | PRD §6 |
| Installed plugins | `<repo_path>/.flowboard/skills/<name>/<commit_sha>/` | PRD §5 |
| CLI stream probe | `docs/stream-sample.jsonl` (PRD's path; the capture now sits at `docs/old/stream-sample.jsonl`, with `docs/old/stream-sample.stderr`) | PRD §0 |

## The database is the only shared state

*"Only `apps/web` and `apps/worker` open the SQLite file; the MCP shim never does"* (PRD §3). The drawio *SQLite* card: *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*. `02` §1: *"keep it the *only* shared-state coupling."*

Because the worker is a separate process, live events go through the database, not memory: the SSE endpoint *"cannot share an in-memory emitter: it tails `run_events` by `seq`"* (PRD §7). `03` §8 calls this a *"deviation from PRD's in-memory emitter — keep it"*.

## Per-run files

The runner writes, per run:

- `mcp.json`: points the CLI at the `ask_user` shim, with `RUN_ID` and the socket path as env (PRD §9).
- `settings.json`: the `PreToolUse` hooks (PRD §7).
- `args.json`: the final command line (PRD §7).

Where `mcp.json` and `settings.json` are written is not stated. *Proposal:* `data/runs/<id>/` beside `args.json`.

## What never enters the sandbox

*"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* (PRD §11.1). The drawio *Mounts* card: *"rw: task worktree → /work / ro: skills/ → /skills / socket: ask.sock / never : ~/.ssh, cloud credentials, flowboard.db, docker.sock"*.

## Lifetimes

| Item | Removed |
|---|---|
| Run container | *"one per run, destroyed on completion"* (PRD §11.1) |
| Worktree | *"never remove it automatically"*; a clean-up action once `done` or `cancelled` (PRD §11) |
| Run records, events | not stated |
| Jobs | not stated |

## Ignored by git

Backlog 0.3 (**FIX**): *"`.gitignore`: `data/*.db*`, `data/runs`, `.vibe-worktrees`."*

## Where the sources disagree

> [!warning] Worktree path and branch
> PRD §11 and backlog 2.1: `<repo_path>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`. The drawio *Harness architecture* card: *"<repo>/.flowboard/worktrees/task-<id> on branch fb/task-<id>"*. The artifact folder stays `.vibe/task-<id>` in both. See [[Execution Open Questions]] and [[Task Storage On Disk]].

## Related

- [[Execution Index]]
- [[Execution Data Model]]
- [[Task Storage On Disk]]
- [[Execution Runtime]]
