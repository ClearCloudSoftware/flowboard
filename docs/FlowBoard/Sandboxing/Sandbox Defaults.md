---
tags: [flowboard, sandboxing, defaults, seed]
module: Sandboxing
---

# Sandbox Defaults

No source gives a seeded `sandbox_profile` value. This note collects every default the sources do state.

## Recommended defaults

`08-sandboxing.md` *Recommendation for FlowBoard* (*"Single-user, local-first, mostly the user's own repos"*):

1. *"**Default tier = `container`** whenever a step's `permission_mode` is `bypassPermissions`; **`host`** only for non-bypass steps or an explicit trusted-repo opt-out."*
2. *"**Egress allowlist on** by default (the model endpoint via the credential-injecting proxy + npm/pnpm; no git remote); editable in settings."*
3. *"**Docker as the baseline runtime**; `gvisor`/`microvm` opt-in for untrusted repos, behind the same `ExecHost` port."*
4. *"**Probe Docker at startup**; if absent, fall back to `host` and disable `bypassPermissions` (or warn)."*

Backlog decisions:

| # | Decision | Default recommendation |
|---|---|---|
| D7 | *"Default isolation tier when `bypassPermissions` is on"* | *"Container + egress allowlist; `host` only for non-bypass or a trusted opt-out"* |
| D8 | *"Container strength: plain Docker vs gVisor/microVM"* | *"Docker baseline; gVisor/Firecracker opt-in per untrusted repo"* |

The drawio tier card: *"container (default when autonomous)"*.

## Defaults by field

| Field | Default | Source |
|---|---|---|
| `step_defs.permission_mode` | `bypassPermissions` | PRD §5 |
| Tier | `container` when bypassing (recommendation) | `08`, D7 |
| `nonRoot` | `true` | `exec-host.ts` |
| Egress | default-deny; model endpoint + package registries | `08`, PRD §11.1 |
| Image | `flowboard-runner` (named only in the drawio) | drawio |
| Limits | none given | — |
| Hooks | always written per run. As built (2026-10-18) nothing is written: each adapter sets the guards up in memory when `RunSpec.guards` is set, and `run-agent` always sets it ([[In-Agent Hooks]]) | PRD §7 |

> [!warning] Off by default, or on by default?
> PRD §11.1 is titled *"Sandboxed execution (optional, recommended for headless runs)"*; `08` says *"Optional, off by default for trusted local repos"*. But every step defaults to `bypassPermissions` (PRD §5), and bypass needs a sandbox. So with the sandbox off, every seeded step trips the [[Permission Gate]]. The pitch says the opposite of *off by default*: *"FlowBoard makes the safe path the default: each step runs in a **sandbox**"*, and *"**Zero autonomous runs happen unsandboxed**"* (`docs/pitch.md`). The architecture README lists the default tier as open decision 3, and feature map §10 asks *"❓ How strong a box to use by default"*. See [[Sandboxing Open Questions]].

## Seeded behaviour that depends on egress

- *"`scout` gets `Read, Grep` only: it researches the repo, so the first step of every task never fails closed on egress."* (PRD §15)
- *"The `researcher` web-research template is out of v1 until open-web egress has an answer."* (backlog Story 1.2; Capability Library D31)
- Seed plugins still run on the host tier; git-installed plugins do not (PRD §11.1).

## Mockup sample values

| Mockup | Value |
|---|---|
| `flow-designer.html` | Every sample step and every library-built step: `sandbox:'sealed container'` |
| `monitor.html`, `task-detail.html` status bars | *"sandbox **container**, egress **default-deny**"* |
| `monitor.html` row detail | *"Sandbox · container · default-deny egress"* |

## Related

- [[Sandbox Configuration]]
- [[Isolation Tiers]]
- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Settings Defaults]]
