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
 * See docs/FlowBoard/Agent Providers/Providers And Sandboxing.md.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';

/** The security knobs a container/microVM ExecHost applies. Provider-independent — it wraps the process. */
export interface SandboxProfile {
  tier: IsolationTier;
  /** Base image for container/microVM tiers. */
  image?: string;
  /** Domains reachable from inside; default-deny everything else. `[]` = fully offline; `['*']` = open, until the egress proxy exists. */
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

export interface ExecHost {
  readonly id: IsolationTier;
  /** Absent for the `host` tier; present for sandboxed tiers. */
  readonly profile?: SandboxProfile;
  /** A host folder the process sees at the same path: where a provider puts files the process must read. Absent: the host's temp folder. */
  readonly tmpDir?: string;
  /**
   * Every tier spawns a local process (the CLI itself, or `docker exec -i …`),
   * so a Node child process with piped stdio is the handle. Providers need
   * stdin: the Claude Agent SDK speaks to the CLI over stdio.
   */
  spawn(
    command: string,
    args: string[],
    /** `ports`: the process listens on these, and this machine must reach them on 127.0.0.1 at the same numbers. */
    opts: { cwd: string; env?: NodeJS.ProcessEnv; ports?: number[] },
  ): ChildProcessWithoutNullStreams;
  /** Where a file of FlowBoard's own code is inside the box; absent: the same path. */
  mapPath?(hostPath: string): string;
  /** Whether a file exists inside the box; absent: the box shares this disk. */
  exists?(path: string): Promise<boolean>;
  /** How this machine reaches a port the process listens on; absent: 127.0.0.1 (published, for docker). */
  endpoint?(port: number): Promise<{ url: string; headers?: Record<string, string> }>;
  /**
   * For a sandbox that cannot dial this machine: connections to `boxSocket` inside it reach `hostSocket` here.
   * Absent where the box can reach this machine itself.
   */
  tunnel?(boxSocket: string, hostSocket: string): Promise<{ close(): void }>;
}
