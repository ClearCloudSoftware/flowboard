---
tags: [flowboard, sandboxing, concept, mounts, filesystem]
module: Sandboxing
---

# Sandbox Mounts

> *"**Mount only the worktree** (and the declared artifact dir), plus the plugin dirs the step names, read-only — the agent CLI runs inside the box and needs them to register skills. Never mount `~/.ssh`, cloud credential files, the host SQLite DB, or the Docker socket."* — `08-sandboxing.md`

## What is mounted

| Mount | Mode | Inside the box | Source |
|---|---|---|---|
| Task worktree | read-write, *"the only writable bind-mount"* | `/work` (the `cwd`) | `08`; PRD §11.1; drawio *Mounts* (*"rw: task worktree → /work"*) |
| Declared artifact dir | not stated | not stated | `08` (*"and the declared artifact dir"*) |
| Plugin dirs the step names | read-only | not stated | `08`; PRD §11.1 (*"the only other mounts are the step's plugin dirs, read-only (§7)"*) |
| `ask.sock` | socket | `/run/fb/ask.sock` | PRD §9; drawio (*"socket: ask.sock"*) |
| `tmpfs` scratch | read-write, in memory | `/tmp` | `08`; drawio (*"read-only root + tmpfs /tmp"*) |

The type allows more: `mounts?: Array<{ source: string; target: string; readOnly?: boolean }>`, *"Extra mounts beyond the task worktree. Never mount host secrets or the Docker socket."* (`exec-host.ts`)

## What is never mounted

| Never | Why (source) |
|---|---|
| `~/.ssh` | host secret (`08`, PRD §11.1) |
| Cloud credential files | host secret (`08`, PRD §11.1) |
| The host SQLite DB (`flowboard.db`) | *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"* (drawio *SQLite* card) |
| The Docker socket (`docker.sock`) | `08`, PRD §11.1, `01-ports.md` (*"never host secrets / docker.sock"*) |

Drawio *Mounts* card: *"never : ~/.ssh, cloud credentials, flowboard.db, docker.sock"*.

## Plugin mounts

> [!note] Only the step's plugins
> Capability Library decision D14: *"A run mounts only what the step names: the plugin of the step's skill, plus the step's `extra_plugin_ids`. … Mounts are read-only into the container."* PRD §7: *"Mount only the plugins the step names, never every installed one: plugins are mounted as-is, hooks and MCP servers included, so they should run only where a step asked for them."* Each dir is the commit pinned in the task's `capability_pins` (PRD §7).

The drawio still shows the older design: *"ro: skills/ → /skills"*, which mounts the whole skills directory. See [[Sandboxing Open Questions]] and [[Capability Runtime Mounting]].

## Why a mount, not a copy

*"the agent CLI runs inside the box and needs them to register skills"* (`08`). `--plugin-dir` registers a plugin's skills; `--add-dir` only grants file access (PRD §7).

## Side effect: the worktree collision

`07-ports-in-practice.md`: a `containerWorkspace` adapter *"removes the shared-worktree collision (PRD §11) and needs no engine change."* Backlog Story 3.5 says the same. How it does so while the worktree is bind-mounted read-write into every parallel step of the task is not explained. See [[Sandboxing Open Questions]].

## Related

- [[Sandbox Security Profile]]
- [[Host-Side Brokers]]
- [[Sandboxing Storage]]
- [[Capability Runtime Mounting]]
- [[Task Workspace]]
