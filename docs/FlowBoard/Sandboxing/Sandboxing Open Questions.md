---
tags: [flowboard, sandboxing, open-questions]
module: Sandboxing
---

# Sandboxing Open Questions

Every place the sources disagree or leave a gap. Several overlap questions already raised in other components; those are cross-referenced rather than repeated in full.

## Policy

### 1. What does the gate do on the host tier?
Refuse (PRD §7, `01-ports.md`), refuse or downgrade (PRD §11.1), downgrade (`03` §6, drawio), downgrade or fail (`08`, backlog 3.5 **NEW/DEC**), or warn (`08` *Recommendation* #4). → [[Permission Gate]]; [[Execution Open Questions]] #53.

### 2. Which tiers satisfy the gate?
`03` §6 says *"(container/microVM)"*; `08`, `01-ports.md` and the drawio include gVisor. → [[Permission Gate]]

### 3. Is the sandbox on or off by default?
PRD §11.1 *"optional"*, `08` *"off by default for trusted local repos"*, yet every step defaults to `bypassPermissions` (PRD §5), which needs a sandbox. Architecture README open decision 3 and feature map §10 (*"❓ How strong a box to use by default"*) leave it open; backlog D7 recommends container. → [[Sandbox Defaults]]

### 4. Gate rule versus mockup rule
The PRD pairs permission mode with the tier. The flow-designer mockup pairs the approval gate with the sandbox and has no permission-mode field. → [[Flow Design Open Questions]] #13

### 5. Where is the trusted-repo opt-out set?
`08` and D7 allow *"an explicit trusted-repo opt-out"*; no field or screen holds it. → [[Sandbox Configuration]]

## Vocabulary

### 6. Five names for the tiers
`host|container|gvisor|microvm` (`08`, ports), *"host / container / microVM"* (PRD §13), `host, docker` (PRD §3), *"host · docker · gVisor"* (drawio Workspace manager), `none|container|sealed container` (mockup). → [[Isolation Tiers]]

### 7. What is a *sealed container*?
Defined only as *"a sealed container with no network"* (flow-designer guide). **Proposal A:** a `container` with `egressAllow: []`. **Proposal B:** a stronger tier, as [[Step Guardrails]] proposes. A sealed container with no network could not reach the model endpoint, so A only fits shell steps unless the proxy is still allowed. Unresolved.

## Configuration and data

### 8. Per-step override has no column
PRD §11.1 *"overridable per step"*; backlog 1.1 adds `step_defs.sandbox_profile`; PRD §5 has no such column. → [[Sandboxing Data Model]]

### 9. `runs.sandbox` has no column
Named in PRD §11.1, backlog 1.1 and 3.5, and the drawio, but absent from PRD §5 (like `runs.model`, `runs.effort`). → [[Cost And Control Open Questions]]

### 10. Global allowlist or per-step allowlist?
PRD §11.1 holds one allowlist in `settings.sandbox_profile`, overridable per step. Every mockup speaks of *"this step's allowlist"*. Merge rules (replace or union) are unstated. **Proposal** shape in [[Sandboxing Data Model]].

### 11. What does Allow host & retry edit?
Global profile, step override, or the flow version (flows are immutable versions, PRD §4)? Does a running task see it? → [[Flow Design Open Questions]] #14; [[Human In The Loop Open Questions]]; **proposed** endpoint in [[Sandboxing API And Routes]].

### 12. Limit values and the logical-to-physical mapping
No defaults for `--memory`, `--cpus`, `--pids-limit` or wall-clock anywhere. `03` §6 says the runner *"maps"* budget and turns to them; no formula. → [[Resource Limits]]

### 13. Which registries?
`08`: *"npm/pnpm"*. drawio: *"npm / PyPI"*. Whether registries are on by default or per step (*"the package registries the step needs"*) is unclear. → [[Egress Allowlist]]

## Failure behaviour

### 14. Is an egress denial an attempt, and how is it classified?
Mockups count it (*"Attempt 3 of 3"*); PRD §7 treats non-zero exits as infrastructure failures that never count. Does a denial even end the run, or only fail a tool call? → [[Egress Denials]]; [[Execution Open Questions]] #22; [[Monitor Open Questions]] #11; [[Task Detail Open Questions]] #12.

### 15. How does a physical limit hit get classified?
Backlog 3.5: *"marks the run failed with reason."* PRD §7's transient list does not mention it. → [[Resource Limits]], [[Infra Retries]]

### 16. How does the runner learn the denied host?
The failure cards name it; no source says where it comes from (proxy log, stderr). → [[Egress Denials]]

## Lifecycle

### 17. One container per run, or per task?
PRD §7 *"inside the task's container"* versus *"one per run"* everywhere else. → [[Sandboxed Run Lifecycle]]; [[Execution Open Questions]] (shell step container).

### 18. Session state across park and resume
A parked run's resume is a new `start_run`, so a new container. Where the CLI session that `--resume` needs is kept is not stated. → [[Sandboxed Run Lifecycle]]

### 19. Stop and restart recovery in a container
Stop is *"SIGTERM by pid"* (backlog 3.4); re-attach after restart is *"by pid"* (backlog 3.3). Neither is described for a container. → [[Sandboxed Run Lifecycle]]

### 20. Do check containers get egress?
*"no model, no API key"* (drawio); a check that installs packages would need registries. → [[Sandboxed Run Lifecycle]], [[Shell Step Execution]]

### 21. How does the container workspace remove the worktree collision?
`07` and backlog 3.5 claim it does, while parallel steps still share the task worktree as a bind mount. → [[Sandbox Mounts]]

## Mounts, hooks and credentials

### 22. Whole skills dir or only the step's plugins?
drawio *"ro: skills/ → /skills"* versus `08`, PRD §7 and Capability Library D14 (only the step's pinned plugin dirs). The mount target is unstated. → [[Sandbox Mounts]]

### 23. *"the declared artifact dir"*
`08` mounts it too; mode and path are not given, and artifacts live inside the worktree (`.vibe/task-<id>/`, PRD §6), so it may be redundant. → [[Sandbox Mounts]]

### 24. Empty `--settings` or the hooks file?
Backlog D5 versus PRD §7. → [[In-Agent Hooks]]; [[Execution Open Questions]] #52.

### 25. `tool_hooks` missing from the reference port
In `01-ports.md`, not in `agent-provider.ts`. → [[In-Agent Hooks]]

### 26. Credential rules for `env`
`01-ports.md`: *"never a real credential"*. `exec-host.ts`: *"Run-scoped env (model/CLI auth)"*. → [[Credential Injecting Proxy]]

### 27. Does a host-tier run use the proxy?
`03` §6 says no real credential is passed, without naming a tier. On the host, the CLI could reach anything directly. → [[Credential Injecting Proxy]]

### 28. Key injection for Codex
`ANTHROPIC_BASE_URL` is Claude-only; the drawio lists `api.openai.com (later)`. → [[Credential Injecting Proxy]]

### 29. The illustrative `docker run`
`--rm`, the dummy-key env var name and the plugin mount target in [[Sandbox Security Profile]] are **proposals**.

## Runtime and scope

### 30. HITL in a sandbox: D9 is stale
Decided as the host-side broker (`08`, PRD §9, architecture README); backlog D9 and Story 3.5 still offer the artifact-file path; feature map §10 still asks. → [[Host-Side Brokers]]; [[Human In The Loop Open Questions]] #9.

### 31. Docker or Podman; macOS and gVisor
Backlog 0.1 leaves the runtime open (*"Docker (or Podman)"*). The drawio says gVisor needs Linux hosts, and the host is macOS with Docker Desktop. → [[Sandboxing Runtime]]

### 32. The image
`flowboard-runner` and its contents appear only in the drawio. Build, versioning and update are not described. → [[Sandboxing Runtime]]

### 33. No milestone
PRD §14 has none; backlog puts it in M3 (Story 3.5). The drawio draws the container adapter as not in v1. → [[Sandboxing Roadmap]]

### 34. Settings story omits the sandbox
PRD §13 asks for a sandbox section; backlog Story 8.3 does not list it. No settings API exists (PRD §12). → [[Sandbox Configuration]], [[Sandboxing API And Routes]]

### 35. Status bars show one posture
With per-step tiers, a single *"sandbox container"* may be wrong; with no Docker it should read *host*. → [[Sandboxing In The UI]]; [[Monitor Open Questions]] #25.

### 36. Testing is thin
Only egress and the gate have tests in the backlog; hooks, mounts, limits and non-root have none. → [[Sandboxing Testing]]

### 37. Seccomp profile
`08`: *"a `seccomp` profile"*. Backlog 3.5: *"seccomp default"*. Custom or Docker's default? → [[Sandbox Security Profile]]

## Related

- [[Sandboxing Index]]
- [[Sandboxing Roadmap]]
- [[Sandboxing Sources]]
