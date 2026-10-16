---
tags: [flowboard, workspaces, concept, port]
module: Workspaces
---

# Workspace Port

The interface the core programs against for per-task isolation. One of the five ports that *"carry the whole program"* (architecture README): AgentProvider, Notifier, **Workspace**, ArtifactStore, TaskSource.

> *"Per-task isolation. Git worktree today; a container/microVM adapter adds a security boundary … and fixes the spec's own shared-worktree collision constraint (PRD §11). The Workspace also hands out the ExecHost that decides where a process runs against it."* — `01-ports.md`

## The interface

From `docs/old/reference/core/ports/workspace.ts`:

```ts
/** A task's identity, enough to locate its isolated workspace. Shared with ArtifactStore. */
export interface TaskRef {
  id: string;
}

export interface WorkspaceHandle {
  /** Absolute path used as the run's cwd. */
  path: string;
  /** Branch created for the task, when the adapter is VCS-backed. */
  branch?: string;
}

export interface Workspace {
  readonly id: string;
  create(task: TaskRef): Promise<WorkspaceHandle>;
  cwd(task: TaskRef): string;
  execHost(task: TaskRef): ExecHost;
  destroy(task: TaskRef, opts?: { force?: boolean }): Promise<void>;
}
```

Its doc comment: *"Workspace — per-task isolation behind one port. Git worktree today; a container or microVM adapter adds a security boundary (egress allowlist, dropped caps, resource limits) and removes the shared-worktree collision the spec lists as a known constraint (PRD §11). Cleanup is explicit only — never automatic, and only when the task is done/cancelled/failed."*

## The four calls

| Call | Does | Source wording |
|---|---|---|
| `create(task)` | Makes the task's isolated copy; returns its path and, for a VCS adapter, its branch | `WorkspaceHandle.path`: *"Absolute path used as the run's cwd."* |
| `cwd(task)` | The path a run uses as its working directory | Runner: `cwd: deps.workspace.cwd(task)` (`07`) |
| `execHost(task)` | Where a process runs against this workspace | *"host child_process for the worktree adapter, or inside the sandbox for a container/microVM adapter. AgentProvider adapters spawn the CLI through this, so sandboxing is orthogonal to which provider runs."* |
| `destroy(task, { force })` | Removes the workspace | `01-ports.md`: *"explicit only (PRD §11)"* |

`TaskRef` carries only the task id. The adapter derives everything else from it (the reference worktree adapter computes the folder from `repoPath` and `task.id`, see [[Git Worktree Adapter]]).

## Two versions of the shape

`01-ports.md` sketches the same port with small differences:

```ts
interface Workspace {
  id: 'worktree' | 'container' | 'microvm' | 'remote';
  create(task: TaskRef): Promise<{ path: string; branch?: string }>;
  cwd(task: TaskRef): string;
  execHost(task: TaskRef): ExecHost;    // host child_process, or inside the sandbox
  destroy(task: TaskRef, opts: { force?: boolean }): Promise<void>;  // explicit only (PRD §11)
}
```

| Point | `01-ports.md` | `workspace.ts` |
|---|---|---|
| `id` | `'worktree' \| 'container' \| 'microvm' \| 'remote'` | `string` |
| `destroy` options | required `opts` | optional `opts?` |
| Return of `create` | inline object | named `WorkspaceHandle` |

`01-ports.md` says *"the point is the shape of the seam, not the exact fields"*. The `id` union also differs from `IsolationTier` (`'host' | 'container' | 'gvisor' | 'microvm'`). See [[Workspaces Open Questions]].

## What the port does not own

- **Artifacts.** The ArtifactStore is a separate port (*"two concerns fused today. Separate them"*, `05` §11). It locates files *inside* the workspace. See [[Task Artifacts]].
- **The security profile.** The `ExecHost` the workspace hands out carries the `SandboxProfile`. See [[ExecHost Seam]] and [[Sandbox Security Profile]].
- **The provider.** *"any provider × any tier, for free (2×N, not N×M)"* (`01-ports.md`).

> [!warning] Not a port in the PRD
> PRD §3 lists the port interfaces in `packages/core/ports/` as *"AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource"*, and the adapters as `agent/`, `exec/` (*"host, docker"*), `notify/`, `memory/`. There is no Workspace port and no workspace adapter folder. The drawio *Harness architecture* page agrees (*"packages/adapters: agent · exec · notify · memory"*) and puts a **Workspace manager** inside `apps/worker`. The architecture README's layout has `adapters/workspace/worktree/ container/`. See [[Workspaces Open Questions]].

## Related

- [[Workspaces Index]]
- [[ExecHost Seam]]
- [[Workspace Adapters]]
- [[Workspaces Data Model]]
- [[Agent Launch Contract]]
