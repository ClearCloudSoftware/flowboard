---
tags: [flowboard, workspaces, concept, adapters]
module: Workspaces
---

# Workspace Adapters

The implementations behind the [[Workspace Port]]. v1 has one.

| Adapter | Status | What it is | Sources |
|---|---|---|---|
| **Git worktree** | v1 | One `git worktree` per task, on its own branch; host `ExecHost` | PRD §11, `07`, drawio *Logical components* (*"Git worktree / one per task"*) |
| **Container workspace** | later (dashed in the drawio) | Same interface against a devcontainer or sandbox; its `execHost` returns a container `ExecHost` | `07`, backlog 3.5, drawio (*"Container workspace / devcontainer · Docker sandbox · remote host"*) |
| devcontainer | later | Named as a Workspace adapter | architecture README ports table, drawio *FlowBoard ideation* (*"Workspace adapters / devcontainer, Docker sandbox, remote."*) |
| Docker sandbox | later | Named as a Workspace adapter | same |
| microVM | later | A Workspace `id` and an isolation tier | `01-ports.md`, `08-sandboxing.md` |
| remote | later, out of v1 | A Workspace `id`; *"remote host"* on the drawio | `01-ports.md`, drawio, PRD §17 |

The architecture README's ports table:

| Port | Today (only adapter) | Unlocks |
|---|---|---|
| **Workspace** | git worktree | devcontainer, Docker sandbox, remote |

## Git worktree

The reference implementation is in `07-ports-in-practice.md`. See [[Git Worktree Adapter]].

## Container workspace

> *"A `containerWorkspace` adapter implements the same interface against a devcontainer/sandbox; its `execHost` returns a container `ExecHost` that applies the security profile (egress allowlist, non-root, caps, limits — 08). It removes the shared-worktree collision (PRD §11) and needs no engine change."* — `07`

Backlog Story 3.5 (**NEW**) specifies it: *"ephemeral container per run, task worktree bind-mounted as `cwd`, non-root, `--cap-drop ALL`, `--security-opt no-new-privileges`, seccomp default, read-only rootfs + `tmpfs`, `--memory`/`--cpus`/`--pids-limit` + wall-clock. Also removes the shared-worktree collision (2.2)."*

So the container adapter still uses the task's git worktree. It changes where processes run, not where the files live. The drawio *Mounts* card: *"rw: task worktree → /work / ro: skills/ → /skills / socket: ask.sock / never : ~/.ssh, cloud credentials, flowboard.db, docker.sock"*.

> [!question] Does it really remove the collision?
> Four sources say the container adapter removes the shared-worktree collision (`01-ports.md`, `07`, `workspace.ts`, backlog 3.5). But each container is per run and bind-mounts the **same** task worktree read-write. Two parallel runs in two containers would still write the same files. No source explains how the collision goes away. See [[Shared Worktree Within A Task]] and [[Workspaces Open Questions]].

## Remote

`01-ports.md` lists `'remote'` as a Workspace `id`. The drawio adds *"remote host"* to the container workspace node. PRD §17 rules out *"multi-machine support"* and calls a remote workspace a later, separate decision: the Mem0 managed cloud *"is the later shared/remote tier, the same decision as a remote workspace."* The pitch: *"The workspace and provider seams are the honest path to a shared or remote tier later without a rewrite"*.

## Adapter or tier?

The sources use two lists. Adapters: worktree, devcontainer, Docker sandbox, remote. Tiers: `host`, `container`, `gvisor`, `microvm`. `05` §11 joins them: *"Workspace adapters climb an isolation ladder: `host` (worktree) → `container` → `gvisor` → `microvm` (Firecracker/Kata)."* See [[Isolation Tiers]].

## Related

- [[Workspaces Index]]
- [[Workspace Port]]
- [[Git Worktree Adapter]]
- [[Isolation Tiers]]
- [[Workspaces Roadmap]]
