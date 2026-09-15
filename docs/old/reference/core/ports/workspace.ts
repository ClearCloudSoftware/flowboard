import type { ExecHost } from './exec-host';

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

/**
 * Workspace — per-task isolation behind one port. Git worktree today; a
 * container or microVM adapter adds a security boundary (egress allowlist,
 * dropped caps, resource limits) and removes the shared-worktree collision the
 * spec lists as a known constraint (PRD §11). Cleanup is explicit only — never
 * automatic, and only when the task is done/cancelled/failed.
 *
 * See docs/architecture/05-environment-and-registry.md and 08-sandboxing.md.
 */
export interface Workspace {
  readonly id: string;
  create(task: TaskRef): Promise<WorkspaceHandle>;
  cwd(task: TaskRef): string;
  /**
   * How a process runs against this workspace: host child_process for the
   * worktree adapter, or inside the sandbox for a container/microVM adapter.
   * AgentProvider adapters spawn the CLI through this, so sandboxing is
   * orthogonal to which provider runs. See ./exec-host.ts.
   */
  execHost(task: TaskRef): ExecHost;
  destroy(task: TaskRef, opts?: { force?: boolean }): Promise<void>;
}
