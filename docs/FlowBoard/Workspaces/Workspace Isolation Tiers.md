---
tags: [flowboard, workspaces, concept, isolation]
module: Workspaces
---

# Workspace Isolation Tiers

The ladder of `ExecHost` tiers a workspace can hand out. `05` §11: *"Workspace adapters climb an isolation ladder: `host` (worktree) → `container` → `gvisor` → `microvm` (Firecracker/Kata)."*

This note covers the tiers only as a property of the workspace. The tiers themselves, the threat model and the security profile belong to the Sandboxing set: [[Isolation Tiers]], [[Sandbox Threat Model]], [[Sandbox Security Profile]] and [[Permission Gate]].

## The ladder

From `08-sandboxing.md`:

| Tier | Boundary | Startup | Use when |
|---|---|---|---|
| `host` | none (process on host, worktree cwd) | instant | trusted repo **and** not bypassing permissions |
| `container` | Linux namespaces + cgroups (shared kernel) | ~ms | default for headless/bypass runs on trusted-ish repos |
| `gvisor` | user-space kernel, syscall interception | fast, 10–30% I/O overhead | untrusted-ish content; kernel-escape resistance without a VM |
| `microvm` (Firecracker/Kata) | dedicated kernel in KVM | ~125–200ms | untrusted repos / running unreviewed generated code |

*"Pick the weakest tier that covers the trust level of the repo and the content the step reads."*

The drawio *Harness architecture* page draws the same ladder in its *Tiers* card: *"host (no box, approval mode only) · container (default when autonomous) · gVisor runsc (untrusted repos, Linux hosts) · microVM / docker sandbox"*. Its *Workspace manager* card lists only *"ExecHost per tier: host · docker · gVisor"*, and PRD §13's settings list only *"host / container / microVM"*. The Sandboxing set compares all the tier vocabularies: [[Sandboxing Open Questions]] #6.

## Rules that tie the tier to the workspace

| Rule | Wording | Source |
|---|---|---|
| Bypass needs a box | *"`bypassPermissions` requires a sandbox tier."* | `05` §11 |
| Host-tier fallback | *"On `host` tier it downgrades to an approval/auto mode, or fails the step with a readable reason."* | `08` |
| Default when autonomous | *"Default tier = `container` whenever a step's `permission_mode` is `bypassPermissions`; `host` only for non-bypass steps or an explicit trusted-repo opt-out."* | `08`, backlog D7 |
| No Docker | *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* | PRD §11.1 |
| Git plugins on the host | *"On the host tier, a step that mounts a git-installed plugin does not run"* | PRD §11.1 |
| Audit | *"`runs.sandbox` records the tier that actually ran"* | PRD §11.1 |

`01-ports.md` and `08` name the sandbox tiers that pass the gate as `container`/`gvisor`/`microvm`; `03` §6 writes *"(container/microVM)"*. See [[Sandboxing Open Questions]] #2.

## Configuration

PRD §11.1: *"a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step"*. Backlog 1.1 adds *"an optional `step_defs.sandbox_profile` override"*. PRD §13 puts a sandbox section in settings: *"the default isolation tier (host / container / microVM), the container image, the network egress allowlist, and the resource limits."* The flow-designer mockup has a per-step **Sandbox** field with the values `none`, `container` and `sealed container`. See [[Sandbox Configuration]].

> [!question] Where the tier is chosen
> PRD §5's `settings` table is a global key/value store (no `project_id`), with a per-step override. The port call is `execHost(task)`, which sees no step. The drawio *Mounts* and *Permission gate* cards describe a per-run container. Which object decides the tier for one run is not stated. The trust the tier answers to is the repo's (`08`, backlog D8 *"opt-in per untrusted repo"*), yet nothing stores a tier per project. See [[Workspaces Open Questions]] #25 and #31.

## Two lifetimes

The tier is per run. The workspace is per task.

| Thing | Lives | Source |
|---|---|---|
| Git worktree and branch | from create until you clean up | PRD §11 |
| Sandbox container | *"One container per run/attempt, destroyed on completion"* | `08` |

PRD §7 *Sandboxed runs* says the runner launches the command *"inside the task's container"*, which reads as one per task. See [[Sandboxed Run Lifecycle]], [[Sandboxing Open Questions]] #17 and [[Execution Open Questions]] #61.

## Related

- [[Workspaces Index]]
- [[ExecHost Seam]]
- [[Workspace Adapters]]
- [[Isolation Tiers]]
- [[Run Guardrails At Launch]]
- [[Step Guardrails]]
