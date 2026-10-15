---
tags: [flowboard, projects, security, sandbox]
module: Projects
---

# Repository Trust And Sandboxing

Agents read the project's repo, and the repo is untrusted input. The sandboxing design picks an isolation tier by **how far you trust the repo**, yet no project field records that trust.

## Why the repo matters

> *"Every step runs with `permission_mode='bypassPermissions'` by default — a fully-autonomous agent that reads untrusted content (repo files, the backlog, web pages, prior artifacts)."* (PRD §11.1)

> *"Stated plainly: even a hardened sandbox with `bypassPermissions` cannot stop a malicious repo from exfiltrating whatever is *inside* the sandbox (including any credentials mounted there) to whatever the allowlist permits. Run trusted repos, keep the allowlist tight, mount no host secrets."* (`08`, security profile)

The pitch names the risk: a prompt injection *"can exfiltrate a credential or corrupt a repo"* (`docs/pitch.md`).

## Trust picks the tier

From `08`, *The isolation ladder*: *"Pick the weakest tier that covers the trust level of the repo and the content the step reads."*

| Tier | Use when (`08`) |
|---|---|
| `host` | *"trusted repo **and** not bypassing permissions"* |
| `container` | *"default for headless/bypass runs on trusted-ish repos"* |
| `gvisor` | *"untrusted-ish content"* |
| `microvm` | *"untrusted repos / running unreviewed generated code"* |

Recommendation (`08`): the default tier is `container` *"whenever a step's `permission_mode` is `bypassPermissions`"*; `host` *"only for non-bypass steps or an explicit trusted-repo opt-out"*; and *"`gvisor`/`microvm` opt-in for untrusted repos"*. Backlog decision D7: *"Container + egress allowlist; `host` only for non-bypass or a trusted opt-out"*. D8: *"Docker baseline; gVisor/Firecracker opt-in per untrusted repo"*.

The other sources say the same in their own words:

| Source | Wording |
|---|---|
| PRD §11.1 | *"Optionally run each step inside a **container** (or, for untrusted repos, a gVisor/microVM) instead of a host process."* |
| Drawio *Tiers* | *"host (no box, approval mode only) · container (default when autonomous) · gVisor runsc (untrusted repos, Linux hosts) · microVM / docker sandbox"* |
| Feature map §10 | *"From "no box" (fast, for work you trust) up to strong isolation for untrusted code. You pick based on how much you trust what the agent will read."* |

> [!question] Where does "per repo" live?
> The tier is configured as *"a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step"* (PRD §11.1), with an optional `step_defs.sandbox_profile` (backlog Story 1.1). Nothing is per project, though only D8 says *"per untrusted repo"*; `08` says *"opt-in for untrusted repos"* and allows *"an explicit trusted-repo opt-out"*, D7 *"a trusted opt-out"*, and PRD §11.1 reserves gVisor/microVM *"for untrusted repos"*. **Proposal:** a nullable `projects.sandbox_profile` that overrides the global default and is overridden by the step. See [[Projects Open Questions]] #16 and [[Sandboxing Open Questions]] #5.

## The git boundary

| Control | Source |
|---|---|
| Only the task worktree is writable in the box | *"the only writable bind-mount is the task worktree"* (`08`); drawio *Mounts*: *"rw: task worktree → /work"*; feature map §10: the agent *"only ever sees the one task's files — never your keys or your other projects"* |
| No route to the project remote | egress excludes *"the project's git remote"* (PRD §11.1, backlog Story 3.5) |
| No push, no base-branch moves | PreToolUse hook (PRD §7) |
| Host secrets stay out | *"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* (PRD §11.1) |
| The host does git | PRD §11.1 *"the host does all git work"*; drawio *"host-side push / fetch"*, a dashed (*"optional or later"*) edge |

## Plugins in the project store

The project's capability store holds code from git URLs. On the host tier, *"a step that mounts a git-installed plugin does not run … Seed plugins still run there."* (PRD §11.1; Capability Library D15). See [[Capability Tools And Egress]].

## Related

- [[Project Repository]]
- [[Capability Tools And Egress]]
- [[Run Guardrails At Launch]]
- [[Sandbox Configuration]]
- [[Isolation Tiers]]
- [[Projects Open Questions]]
