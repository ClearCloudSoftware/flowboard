/**
 * Workspace — a task's private copy of the code, so parallel tasks never trip
 * over each other. Git worktree today; a container or remote adapter later.
 * Cleanup is explicit only: nothing removes a workspace on its own.
 *
 * The reference port also hands out `cwd(task)` and `execHost(task)`. Here the
 * handle carries the path, and a flow's `sandbox` picks the ExecHost, so both
 * are left out until a second adapter needs them.
 *
 * See docs/FlowBoard/Workspaces/Workspace Port.md.
 */

/** A task's identity, enough to locate its workspace. */
export interface TaskRef {
  id: string;
}

export interface WorkspaceHandle {
  /** Absolute path of the task's copy. */
  path: string;
  /** The task's branch, when the adapter is VCS-backed. */
  branch?: string;
  /** True when the workspace was already there and is being used again. */
  reused: boolean;
}

export interface Workspace {
  readonly id: string;
  /** Makes the task's workspace, or hands back the one it already has. */
  create(task: TaskRef): Promise<WorkspaceHandle>;
  /** Removes it. Refuses uncommitted work unless `force`. */
  destroy(task: TaskRef, opts?: { force?: boolean }): Promise<{ branchKept?: string }>;
}
