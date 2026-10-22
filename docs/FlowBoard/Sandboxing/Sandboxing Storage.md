---
tags: [flowboard, sandboxing, storage]
module: Sandboxing
---

# Sandboxing Storage

Files and paths a sandboxed run touches.

| Path | What | Source |
|---|---|---|
| `data/flowboard.db` | Holds `settings.sandbox_profile` and `runs.sandbox`. Never mounted into a sandbox | PRD §3, §11.1; drawio |
| `data/sock/<run_id>.sock` | Per-run unix socket of the `ask_user` broker | PRD §9 |
| `/run/fb/ask.sock` | The same socket inside the sandbox | PRD §9 |
| `/work` | The task worktree inside the sandbox, the only writable bind mount | drawio |
| `/tmp` | `tmpfs` scratch | drawio, `08` |
| `/skills` | Read-only skills mount (older drawio design; see [[Sandbox Mounts]]) | drawio |
| `<repo_path>/.flowboard/skills/<name>/<commit_sha>/` | Plugin dirs mounted read-only (only the step's) | PRD §5, §7 |
| per-run `mcp.json` | Points the CLI at the shim | PRD §7, §9 |
| per-run `settings.json` | `PreToolUse` hooks | PRD §7 |
| `data/runs/<id>/args.json` | Snapshot of the final CLI args | PRD §7 |
| `data/runs/<id>/spec.json` | Snapshot of the resolved `RunSpec` (idea) | `03` §6; drawio *Run records* |

> [!warning] The shipped code differs
> As built (2026-10-18), no `mcp.json`, `settings.json`, `args.json` or `spec.json` is written. Claude gets the ask_user server, the guard hook and `settingSources: []` as Agent SDK options in memory; OpenCode gets one per-run config in `OPENCODE_CONFIG_CONTENT` and a scratch `XDG_CONFIG_HOME` folder, removed after the run ([[Agent Providers Open Questions]] #4). `run-agent`'s broker listens on `ask.sock` in the run's `/tmp/fb-*` folder, which the shim gets as `FLOWBOARD_ASK_SOCKET` ([[Ask User MCP Server]]). `run-agent` logs the launched `RunSpec` as the `start` line of `runs/<stamp>-<adapter>.jsonl` ([[Agent Providers Storage]]).

> [!question] Unstated
> - Where the per-run `mcp.json` and `settings.json` are written, and whether they are mounted into the box or passed another way. (Answered for the host tier: passed another way; see above.)
> - Whether `args.json` records the `docker run` wrapper or only the CLI args. (No `args.json` is built.)
> - Where the CLI's session state lives between a parked run and its resume, when each run gets a fresh container.
> - Where proxy logs (the record of denied hosts) are kept.
> - Where the real model credential the proxy injects is kept ([[Settings And Plumbing Open Questions]] #24).
>
> See [[Sandboxing Open Questions]].

The worktree path itself differs by source (PRD §11 `.vibe-worktrees/task-<id>`, drawio `.flowboard/worktrees/task-<id>`); that belongs to the Workspaces component. See [[Task Workspace]].

## Related

- [[Sandbox Mounts]]
- [[Host-Side Brokers]]
- [[Execution Storage]]
- [[Capability Storage On Disk]]
