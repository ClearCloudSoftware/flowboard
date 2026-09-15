/**
 * ExecHost — WHERE a process runs, decoupled from WHICH agent runs it.
 *
 * An AgentProvider builds an argv; the ExecHost decides where it executes: a
 * plain host child_process, a hardened container, or a microVM. This keeps
 * sandboxing orthogonal to the provider — any provider × any isolation tier,
 * for free (2×N, not N×M). The Workspace port hands the runner an ExecHost
 * (`workspace.execHost(task)`); the provider adapter spawns through it instead
 * of importing child_process directly.
 *
 * See docs/architecture/08-sandboxing.md.
 */

export type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';

/** The security knobs a container/microVM ExecHost applies. Provider-independent — it wraps the process. */
export interface SandboxProfile {
  tier: IsolationTier;
  /** Base image for container/microVM tiers. */
  image?: string;
  /** Domains reachable from inside; default-deny everything else. `[]` = fully offline. */
  egressAllow: string[];
  /** Physical backstop to the logical max_turns / max_budget_usd caps. */
  limits?: { memoryMb?: number; cpus?: number; pids?: number; wallClockMs?: number };
  /** Extra mounts beyond the task worktree. Never mount host secrets or the Docker socket. */
  mounts?: Array<{ source: string; target: string; readOnly?: boolean }>;
  /** Run-scoped env (model/CLI auth). Never bake secrets into the image. */
  env?: Record<string, string>;
  /** Default true; `bypassPermissions` requires this. */
  nonRoot?: boolean;
}

/** A spawned process, normalized so the runner tails it the same way at every tier. */
export interface ChildHandle {
  pid: number;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  /** Resolves with the exit code. */
  exit: Promise<number>;
  kill(signal?: string): void;
}

export interface ExecHost {
  readonly id: IsolationTier;
  /** Absent for the `host` tier; present for sandboxed tiers. */
  readonly profile?: SandboxProfile;
  spawn(command: string, args: string[], opts: { cwd: string; env?: Record<string, string> }): ChildHandle;
}
