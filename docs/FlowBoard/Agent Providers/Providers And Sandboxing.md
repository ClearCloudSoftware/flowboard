---
tags: [flowboard, agent-providers, behaviour, sandbox]
module: Agent Providers
---

# Providers And Sandboxing

## The ExecHost seam

*"*Where* a process runs, decoupled from *which* agent runs it. An AgentProvider builds an argv; the ExecHost decides where it executes — host `child_process`, a hardened container, or a microVM. This keeps sandboxing orthogonal to the provider: **any provider × any tier, for free** (2×N, not N×M)."* (`01-ports.md`, *ExecHost and sandboxing*)

`08-sandboxing.md`: *"The sandbox is not a new kind of AgentProvider — it is *where the provider's process runs*."* and *"`ClaudeCodeProvider` spawning through a container `ExecHost` is Claude-in-a-sandbox; the same provider through the host `ExecHost` is today's behavior, no provider change."*

```ts
export type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';

export interface ExecHost {
  readonly id: IsolationTier;
  /** Absent for the `host` tier; present for sandboxed tiers. */
  readonly profile?: SandboxProfile;
  spawn(command: string, args: string[], opts: { cwd: string; env?: Record<string, string> }): ChildHandle;
}
```

(`exec-host.ts`). The runner *"gets it from `workspace.execHost(task)` and passes it in `RunSpec.exec`; the provider adapter spawns through it instead of importing `child_process`."* (`01-ports.md`). `ChildHandle` (`pid`, `stdout`, `stderr`, `exit`, `kill`) is *"normalized so the runner tails it the same way at every tier."*

Backlog Story 3.5 (**NEW**): *"providers spawn through it, not raw `child_process`, so any provider runs sandboxed unchanged."*

## The permission gate

*"the runner refuses `permission_mode='bypassPermissions'` unless the tier is a sandbox (`container`/`gvisor`/`microvm`)."* (`01-ports.md`). *"On `host` tier it downgrades to an approval/auto mode, or fails the step with a readable reason. A correctness rule, not a suggestion."* (`08`). The gate belongs to the runner, not the adapter. The sources word the host-tier outcome four ways (refuse, refuse or downgrade, downgrade, downgrade or fail): [[Execution Open Questions]] #53. That a downgrade needs the provider's `permission_modes` capability is an inference. `08` adds a Claude-specific edge: *"Claude Code even *rejects* `--dangerously-skip-permissions` when launched as root"*; `SandboxProfile.nonRoot` is *"Default true; `bypassPermissions` requires this"* (`exec-host.ts`). See [[Run Guardrails At Launch]].

## Credentials

*"No real credential is passed in: the CLI's `ANTHROPIC_BASE_URL` points at the egress proxy, which injects it."* (`03` §6). PRD §0 step 3 makes it a probe: *"If the CLI refuses, stop and tell me; the fallback is a short-lived, run-scoped token."*

The drawio *Harness architecture* egress proxy allowlist: *"api.anthropic.com · api.openai.com (later) · npm / PyPI · no git remote"*; external node *"OpenAI / Codex CLI adapter (later)"*. The sandbox image holds *"claude CLI · codex CLI · git · pnpm · toolchains"*.

The drawio's *claude* card in the sandbox says *"ANTHROPIC_BASE_URL → proxy, dummy key"*, but its edge *F* from the CLI to the proxy is labelled *"HTTPS_PROXY"*, a provider-neutral mechanism. `ANTHROPIC_BASE_URL` is Claude's variable; the Codex equivalent is not given: [[Agent Providers Open Questions]] #23. The sources also disagree on what `SandboxProfile.env` may hold: *"never a real credential (the proxy injects it)"* (`01-ports.md`) against *"Run-scoped env (model/CLI auth)"* (`exec-host.ts`); see [[Sandboxing Open Questions]] #26.

## Codex has its own sandbox

*"Codex additionally has its *own* OS sandbox — Seatbelt on macOS, Landlock+seccomp on Linux, network off by default … — so Codex at `host` tier still isn't unsandboxed; a container tier is defense-in-depth."* (`08`). Prior art: *"the sandbox is the structural floor, approvals are the workflow layer."*

## Limits

Logical caps (`limits.maxTurns`, `maxBudgetUsd`) map to *"the sandbox's physical `--memory` / `--cpus` / `--pids-limit` / wall-clock backstops"* (`03` §6). Backlog 3.5: *"a limit/timeout hit marks the run failed with reason"*; PRD §7 classes a *"budget or turn cap hit"* as non-transient, so the task blocks. A provider without `budget_cap` makes the budget *"advisory"* (`agent-provider.ts`). Inference: without it nothing stops spend in dollars, since the physical limits cap memory, CPU, processes and wall-clock, not money.

## HITL across tiers

*"The MCP side is the same on every tier: a stdio shim the CLI launches, forwarding over a unix socket to a broker in the worker"* (`04` §9). The provider only needs `mcp_tools` to launch the shim; the tier doesn't change the path. Backlog D9 still recommends the artifact-file exchange inside a sandbox: [[Human In The Loop Open Questions]] #9.

## Related

- [[Run Guardrails At Launch]]
- [[Capability Tools And Egress]]
- [[Run Spec]]
- [[Provider Capabilities]]
- [[Codex Adapter]]
