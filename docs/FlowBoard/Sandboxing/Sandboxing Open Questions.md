---
tags: [flowboard, sandboxing, open-questions]
module: Sandboxing
---

# Sandboxing Open Questions

Every place the sources disagree or leave a gap. Several overlap questions already raised in other components; those are cross-referenced rather than repeated in full.

## Policy

### 1. What does the gate do on the host tier?
Refuse (PRD §7, `01-ports.md`), refuse or downgrade (PRD §11.1), downgrade (`03` §6, drawio), downgrade or fail (`08`, backlog 3.5 **NEW/DEC**). Separately, with no Docker: fall back to host and disable bypass, *"(or warn)"* (`08` *Recommendation* #4). → [[Permission Gate]]; [[Execution Open Questions]] #53.

### 2. Which tiers satisfy the gate?
`03` §6 says *"(container/microVM)"*; `08`, `01-ports.md` and the drawio include gVisor. → [[Permission Gate]]

### 3. Is the sandbox on or off by default?
PRD §11.1 *"optional"*, `08` *"off by default for trusted local repos"*, yet every step defaults to `bypassPermissions` (PRD §5), which needs a sandbox. The pitch says *"each step runs in a **sandbox**"* by default and sets *"**Zero autonomous runs happen unsandboxed**"* as a success metric. Architecture README open decision 3 and feature map §10 (*"❓ How strong a box to use by default"*) leave it open; backlog D7 recommends container. → [[Sandbox Defaults]]

### 4. Gate rule versus mockup rule
The PRD pairs permission mode with the tier. The flow-designer mockup pairs the approval gate with the sandbox and has no permission-mode field. → [[Flow Design Open Questions]] #13

### 5. Where is the trusted-repo opt-out set?
`08` allows *"an explicit trusted-repo opt-out"* (D7: *"a trusted opt-out"*); no field or screen holds it. → [[Sandbox Configuration]]; [[Projects Open Questions]] #16 proposes a per-project profile.

## Vocabulary

### 6. Six names for the tiers
`host|container|gvisor|microvm` (`08`, ports), *"host / container / microVM"* (PRD §13), `host, docker` (PRD §3), *"host · docker · gVisor"* (drawio Workspace manager), `worktree|container|microvm|remote` (`01-ports.md` `Workspace.id`), `none|container|sealed container` (mockup). → [[Isolation Tiers]]; [[Flow Design Open Questions]] #13; [[Workspaces Open Questions]] #28.

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
Global profile, step override, or the flow version (flows are immutable versions, PRD §4)? Does a running task see it? → [[Flow Design Open Questions]] #14; [[Human In The Loop Open Questions]] #26; [[Monitor Open Questions]] #13; [[Execution Open Questions]] #24; **proposed** endpoint in [[Sandboxing API And Routes]].

### 12. Limit values and the logical-to-physical mapping
No defaults for `--memory`, `--cpus`, `--pids-limit` or wall-clock anywhere. `03` §6 says the runner *"maps"* budget and turns to them; no formula. → [[Resource Limits]]

### 13. Which registries?
`08`: *"npm/pnpm"*. drawio: *"npm / PyPI"*. Whether registries are on by default or per step (*"the package registries the step needs"*) is unclear. → [[Egress Allowlist]]

## Failure behaviour

### 14. Is an egress denial an attempt, and how is it classified?
Mockups count it (*"Attempt 3 of 3"*); PRD §7 treats non-zero exits as infrastructure failures that never count. Does a denial even end the run, or only fail a tool call? → [[Egress Denials]]; [[Execution Open Questions]] #22; [[Monitor Open Questions]] #11; [[Task Detail Open Questions]] #12.

### 15. How does a physical limit hit get classified?
Backlog 3.5: *"marks the run failed with reason."* PRD §7's transient list does not name it, but does list *"process killed by a signal or lost on restart"*; an out-of-memory or wall-clock kill is a signal kill, so (inference) PRD §7 would retry it as transient. For a shell step a non-zero exit is an outcome, so an out-of-memory kill would loop as `fail`. → [[Resource Limits]], [[Infra Retries]]; [[Execution Open Questions]] #68, #41.

As built (2026-10-18), the result does not show the signal: both adapters report a process killed from outside as exit 1 with an error text, so a runner cannot tell an out-of-memory kill from a plain failure ([[Agent Run Handle And Result]]).

### 16. How does the runner learn the denied host?
The failure cards name it; no source says where it comes from (proxy log, stderr). → [[Egress Denials]]

## Lifecycle

### 17. One container per run, or per task?
PRD §7 *"inside the task's container"* versus *"one per run"* everywhere else. → [[Sandboxed Run Lifecycle]]; [[Execution Open Questions]] #61; [[Workspaces Open Questions]] #23.

### 18. Session state across park and resume
A parked run's resume is a new `start_run`, so a new container. Where the CLI session that `--resume` needs is kept is not stated. → [[Sandboxed Run Lifecycle]]

### 19. Stop and restart recovery in a container
Stop is *"SIGTERM by pid"* (backlog 3.4); re-attach after restart is *"by pid"* (backlog 3.3). Neither is described for a container. → [[Sandboxed Run Lifecycle]]

As built (2026-10-18), Stop is `AgentRun.stop()`, which ends what `ExecHost.spawn` started; a SIGTERM by pid from outside is reported as a failure (exit 1), not a stop ([[Agent Run Handle And Result]]). The port has no way to re-attach ([[Agent Providers Open Questions]] #30).

### 20. Do check containers get egress?
*"no model, no API key"* (drawio); a check that installs packages would need registries. → [[Sandboxed Run Lifecycle]], [[Shell Step Execution]]; [[Execution Open Questions]] #40.

### 21. How does the container workspace remove the worktree collision?
`07` and backlog 3.5 claim it does, while parallel steps still share the task worktree as a bind mount. → [[Sandbox Mounts]]; [[Workspaces Open Questions]] #22.

## Mounts, hooks and credentials

### 22. Whole skills dir or only the step's plugins?
drawio *"ro: skills/ → /skills"* versus `08`, PRD §7 and Capability Library D14 (only the step's pinned plugin dirs). The mount target is unstated. → [[Sandbox Mounts]]

### 23. *"the declared artifact dir"*
`08` mounts it too; mode and path are not given, and artifacts live inside the worktree (`.vibe/task-<id>/`, PRD §6), so it may be redundant. PRD §11.1 says *"the only other mounts are the step's plugin dirs"*, which leaves out both this dir and the socket PRD §9 bind-mounts. → [[Sandbox Mounts]]

### 24. Empty `--settings` or the hooks file?
Backlog D5 versus PRD §7. → [[In-Agent Hooks]]; [[Execution Open Questions]] #52; [[Settings And Plumbing Open Questions]] #29; [[Agent Providers Open Questions]] #24.

> [!check] Implemented 2026-10-18
> Answered by the code for the host tier: neither. No settings file is written. Claude runs get `settingSources: []`: no user, project or local settings, so the operator's `~/.claude` hooks stay out (managed policy is still read). The guard hook is registered in process. OpenCode runs get a fresh `XDG_CONFIG_HOME` ([[Agent Providers Open Questions]] #24).

### 25. The two port sketches disagree
`tool_hooks` is in the `01-ports.md` `Capability` union, not in the reference `agent-provider.ts` (`docs/old/reference/`). `01-ports.md` says the runner *"passes it in `RunSpec.exec`"*, but only `agent-provider.ts` declares the field. → [[In-Agent Hooks]], [[ExecHost Port]]

> [!check] Implemented 2026-10-18
> The `tool_hooks` part is answered by the shipped port (`core/src/ports/agent-provider.ts`): `Capability` has `tool_hooks`, and `RunSpec.guards` carries the rules. Claude Code and OpenCode both declare `tool_hooks` and enforce the guards in-agent ([[Agent Providers Open Questions]] #1). The shipped port declares `RunSpec.exec` too ([[Agent Providers Open Questions]] #3).

### 26. Credential rules for `env`
`01-ports.md`: *"never a real credential"*. `exec-host.ts`: *"Run-scoped env (model/CLI auth)"*. → [[Credential Injecting Proxy]]

### 27. Does a host-tier run use the proxy?
`03` §6 says no real credential is passed, without naming a tier. On the host, the CLI could reach anything directly. → [[Credential Injecting Proxy]]

As built (2026-10-18), no: no proxy exists, and a host run holds the owner's real credentials ([[Providers And Sandboxing]], *As built*). What a host run should do once a proxy exists is still open.

### 28. Key injection for Codex
`ANTHROPIC_BASE_URL` is Claude-only; the drawio lists `api.openai.com (later)`. → [[Credential Injecting Proxy]]; [[Agent Providers Open Questions]] #23.

The second provider built is OpenCode (2026-10-18), not Codex, and the same question applies to it; on the host it uses its own credentials. Codex is designed, not built ([[Agent Providers Open Questions]] #23, #38).

### 29. The illustrative `docker run`
`--rm`, the `--user` / `--read-only` / `--tmpfs` spellings, the dummy-key env var name and the plugin mount target in [[Sandbox Security Profile]] are **proposals**. So are the `sandbox_profile` JSON shape and its limit values in [[Sandboxing Data Model]], and the endpoints in [[Sandboxing API And Routes]].

## Runtime and scope

### 30. HITL in a sandbox: D9 is stale
Decided as the host-side broker (`08`, PRD §9, architecture README); backlog D9 and Story 3.5 still offer the artifact-file path; feature map §10 still asks. → [[Host-Side Brokers]]; [[Human In The Loop Open Questions]] #9.

### 31. Docker or Podman; macOS and gVisor
Backlog 0.1 leaves the runtime open (*"Docker (or Podman)"*). The drawio says gVisor needs Linux hosts, and the host is macOS with Docker Desktop. → [[Sandboxing Runtime]]

### 32. The image
`flowboard-runner` and its contents appear only in the drawio. Build, versioning and update are not described. → [[Sandboxing Runtime]]

### 33. No milestone
PRD §14 has none; backlog puts it in M3 (Story 3.5); the pitch counts *"the cost/sandbox views"* among *"its eight build milestones"*. The drawio draws the container adapter as not in v1 (*Logical components*) and the agent sandbox as *"optional or later"* (*Harness architecture*). → [[Sandboxing Roadmap]]

### 34. Settings story omits the sandbox
PRD §13 asks for a sandbox section; backlog Story 8.3 and `06` §15's settings list do not have one. No settings API exists (PRD §12). → [[Sandbox Configuration]], [[Sandboxing API And Routes]]; [[Settings And Plumbing Open Questions]] #1, #2.

### 35. Status bars show one posture
With per-step tiers, a single *"sandbox container"* may be wrong; with no Docker it should read *host*. → [[Sandboxing In The UI]]; [[Monitor Open Questions]] #25; [[Settings And Plumbing Open Questions]] #8.

### 36. Testing is thin
Only egress and the gate have tests in the backlog; hooks, mounts, limits and non-root have none. → [[Sandboxing Testing]]

### 37. Seccomp profile
`08`: *"a `seccomp` profile"*. Backlog 3.5: *"seccomp default"*. Custom or Docker's default? → [[Sandbox Security Profile]]

### 38. Is Docker out of scope?
The drawio ideation scope card: *"Not building / Auth, accounts, roles, deployment, Docker, multi-machine, plugin marketplace."* It lists *Docker* apart from *deployment*. PRD §17 rules out only *"shipping or *deploying* FlowBoard itself in a container"* and keeps sandboxing *"in scope but optional"*. Whether the card means the sandbox or only deployment is not stated. → [[Sandboxing Roadmap]]; [[Settings And Plumbing Open Questions]] #30.

### 39. Per-step tier through a per-task call
`execHost(task)` sees no step, but the profile is *"overridable per step"* (PRD §11.1) and PRD §7 reads *"the step's sandbox tier"*. → [[ExecHost Port]], [[Sandbox Configuration]]; [[Workspaces Open Questions]] #25.

### 40. Host paths or `/work`?
The worktree is `/work` inside the box (drawio); `cwd(task)` returns the host path, and the prompt lists artifacts by absolute path (PRD §7). No source says the paths are rewritten. → [[Sandbox Mounts]]; [[Workspaces Open Questions]] #24.

### 41. Where the real credential lives
The proxy *"swaps in the real credential"* (PRD §11.1); no source says where it is stored or configured. → [[Credential Injecting Proxy]]; [[Settings And Plumbing Open Questions]] #24.

### 42. A host-tier agent and the local API
On the `host` tier the agent runs as the user with no egress wall, and the API has no auth (PRD §2). The hooks do not deny calls to it. → [[Sandbox Threat Model]]; [[Settings And Plumbing Open Questions]] #25.

## Related

- [[Sandboxing Index]]
- [[Sandboxing Roadmap]]
- [[Sandboxing Sources]]
