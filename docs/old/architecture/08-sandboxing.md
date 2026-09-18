# 08 — Sandboxed agent execution

Running each agent step inside a security boundary — a container or microVM — instead of directly on the host.
Optional, off by default for trusted local repos, but the **recommended default whenever `bypassPermissions`
is on**.

Cross-cutting: touches Workspace ([11](./05-environment-and-registry.md#11-artifact-store--workspace--two-ports)),
AgentProvider ([5](./03-execution-substrate.md#5-agentprovider-abstraction)), the runner
([6](./03-execution-substrate.md#6-runner--execution-host)), settings
([15](./06-cost-and-platform.md#15-settings-draft-mode-api)), and the HITL protocol
([9](./04-hitl-and-notify.md#9-human-in-the-loop-protocol)).

← back to [README](./README.md)

## Why — the threat model

FlowBoard runs agents **headless** with `permission_mode='bypassPermissions'` by default (PRD §5) — no human
reviews each tool call. Those agents then read **untrusted content**: repo files, web pages, the backlog
markdown, issue/PR text, prior artifacts. Any of it can carry a **prompt injection** that redirects the agent
to exfiltrate secrets, corrupt the repo, or run arbitrary commands. On the host the blast radius *is* the host:
the whole filesystem, every network destination, and the user's credentials.

The single most valuable control is **network egress restriction**, because it is enforced below the agent's
reasoning: *prompt injection can change what the agent asks for, but it cannot change what the firewall
permits.* [egress-audit] A default-deny egress allowlist holds even when tool-approval is bypassed — exactly
FlowBoard's default posture.

So **`bypassPermissions` and a sandbox are one package.** Fully-autonomous agents without one is the dangerous
configuration. This mirrors Claude Code's own stance: its dev container runs Claude as non-root, confines
execution to the container, and pairs `--dangerously-skip-permissions` with an egress firewall. [cc-devcontainer]

## The isolation ladder

Pick the weakest tier that covers the trust level of the repo and the content the step reads. Higher tiers cost
startup time and complexity.

| Tier | Boundary | Startup | Use when |
|---|---|---|---|
| `host` | none (process on host, worktree cwd) | instant | trusted repo **and** not bypassing permissions |
| `container` | Linux namespaces + cgroups (shared kernel) | ~ms | default for headless/bypass runs on trusted-ish repos |
| `gvisor` | user-space kernel, syscall interception | fast, 10–30% I/O overhead | untrusted-ish content; kernel-escape resistance without a VM |
| `microvm` (Firecracker/Kata) | dedicated kernel in KVM | ~125–200ms | untrusted repos / running unreviewed generated code |

Plain containers share the host kernel — a kernel exploit in agent-run code escapes the container. [northflank]
For genuinely untrusted code, gVisor or a microVM is the honest choice; for a single-user tool working on the
user's own repos, a hardened container with egress control is a reasonable default and the microVM is an opt-in.

## The security profile

The knobs a container/microVM `ExecHost` applies. All are provider-independent — they wrap the process, not
the CLI.

- **Egress allowlist (load-bearing).** Default-deny outbound; allow only the model/CLI endpoint, the package
  registries the step needs, and the project's git remote. Implement with an in-container firewall
  (`NET_ADMIN`+`NET_RAW`, an `init-firewall` script like Claude's [cc-devcontainer]) or an egress proxy the
  container is forced through [egress-audit]. `[]` = fully offline.
- **Non-root.** Run as an unprivileged user; Claude Code even *rejects* `--dangerously-skip-permissions` when
  launched as root. [cc-devcontainer]
- **Drop capabilities:** `--cap-drop ALL`, add back only what a build needs. [docker]
- **No privilege escalation:** `--security-opt no-new-privileges`; a `seccomp` profile. [docker]
- **Read-only root filesystem** + `tmpfs` scratch; the only writable bind-mount is the task worktree.
- **Mount only the worktree** (and the declared artifact dir). Never mount `~/.ssh`, cloud credential files,
  the host SQLite DB, or the Docker socket. [cc-devcontainer][docker]
- **Resource limits:** `--memory`, `--cpus`, `--pids-limit`, and a wall-clock timeout — the *physical* backstop
  to the *logical* `max_turns` / `max_budget_usd` caps. A runaway or looping agent is contained at the OS level,
  not only at the token level.
- **Secrets at runtime, run-scoped.** Pass model/CLI auth via env at launch; never bake into the image; prefer
  short-lived tokens. [cc-devcontainer]
- **Ephemeral.** One container per run/attempt, destroyed on completion — clean state, no cross-run
  contamination. [northflank]

Stated plainly: even a hardened sandbox with `bypassPermissions` cannot stop a malicious repo from exfiltrating
whatever is *inside* the sandbox (including any credentials mounted there) to whatever the allowlist permits.
Run trusted repos, keep the allowlist tight, mount no host secrets. [cc-devcontainer]

## How it fits the architecture

**One seam: `ExecHost`, owned by the Workspace.** The sandbox is not a new kind of AgentProvider — it is *where
the provider's process runs*. The provider builds an argv; the `ExecHost` decides where it executes (host
`child_process` vs `docker run`/`exec` vs microVM). Interface: [01 — ports](./01-ports.md#exechost-and-sandboxing).

This keeps the matrix **2×N instead of N×M — any provider × any tier for free.** `ClaudeCodeProvider` spawning
through a container `ExecHost` is Claude-in-a-sandbox; the same provider through the host `ExecHost` is today's
behavior, no provider change. (Codex additionally has its *own* OS sandbox — Seatbelt on macOS, Landlock+seccomp
on Linux, network off by default [codex] — so Codex at `host` tier still isn't unsandboxed; a container tier is
defense-in-depth.)

- **The runner** ([6](./03-execution-substrate.md#6-runner--execution-host)) gets the `ExecHost` from
  `workspace.execHost(task)` and passes it in the `RunSpec`; the provider adapter spawns through it. Sandboxing
  is invisible to the engine, board, cost ledger, and viewer.
- **The gate:** the runner refuses `bypassPermissions` unless the resolved tier is `container`/`gvisor`/`microvm`.
  On `host` tier it downgrades to an approval/auto mode, or fails the step with a readable reason. A correctness
  rule, not a suggestion.
- **HITL in a sandbox** ([9](./04-hitl-and-notify.md#9-human-in-the-loop-protocol)): the `ask_user` MCP server
  currently opens the host SQLite file — which a sealed sandbox (no host mounts, egress denied) cannot reach.
  Two answers, both already in the design:
  1. **Artifact-file park/resume** (preferred for strong isolation): the agent writes `questions.json` into the
     bind-mounted worktree and parks; the host watches the produced path; no DB or network access from inside.
     This is *why* the HITL primitive is the file exchange and MCP is only an optimization.
  2. **Host-side broker:** run the `ask_user` server on the host and expose it to the container over a
     bind-mounted unix socket (or an internal-only network) — the container talks to a scoped broker, never the
     DB directly.
- **Cost/limits** ([12](./06-cost-and-platform.md#12-cost--usage-ledger--pricingservice)): the sandbox's
  physical limits complement the budget caps; `runs.sandbox` records the tier for audit alongside
  `runs.model`/`runs.effort`.
- **Memory** ([09](./09-memory.md)): the runner does recall/commit **on the host**, before and after the run — so
  the sandboxed agent never opens a connection to the memory store, and **memory adds nothing to the egress
  allowlist**. Same reasoning as the `ask_user` broker: keep the sealed process talking only to the host. Memory
  does open a *new cross-run trust channel*, so it is fenced the same way as everything else the agent reads:
  recalled text is labelled **context, not instructions** and is only ever the operator's own prior memory;
  writes are committed **from declared artifacts/answers only** (not raw agent chatter), **scoped** (a run writes
  its own project/agent/task, never another's), and **audited** (`run_memories` records what was recalled). A
  prompt injection can still poison *what a run proposes to remember* — which is exactly why commit is narrowed to
  structured, declared output and self-hosting keeps the store local.

## Prior art (what others do)

- **Claude Code dev container** — Docker container, repo bind-mounted, non-root, optional `init-firewall.sh`
  egress allowlist (npm, GitHub, Anthropic API) via `NET_ADMIN`/`NET_RAW`; makes `--dangerously-skip-permissions`
  reasonable; `permissions.disableBypassPermissionsMode` forbids it centrally. Also ships a built-in Bash sandbox
  and OS-level sandboxing. [cc-devcontainer][cc-sandbox]
- **OpenAI Codex** — sandboxed *by default*: Seatbelt (macOS) / Landlock+seccomp (Linux), workspace-write with
  **network off by default**, approval policy layered on top, `--dangerously-bypass-approvals-and-sandbox` to
  opt out. A clean model: the sandbox is the structural floor, approvals are the workflow layer. [codex]
- **Docker** — official guidance: `--cap-drop ALL`, seccomp, `no-new-privileges`, ephemeral/read-only volumes,
  default-deny egress, non-root, hardened base images; Docker Desktop's microVM-backed `docker sandbox` for
  stronger isolation. [docker][docker-sandbox]
- **Managed sandbox platforms** — E2B and Daytona (Firecracker / container microVMs, ~90–150ms cold start),
  Modal (gVisor): the cloud version of this, if FlowBoard ever grows a `remote` tier. [northflank-e2b]

## Recommendation for FlowBoard

Single-user, local-first, mostly the user's own repos:

1. **Default tier = `container`** whenever a step's `permission_mode` is `bypassPermissions`; **`host`** only for
   non-bypass steps or an explicit trusted-repo opt-out.
2. **Egress allowlist on** by default (the `claude` CLI's model endpoint + npm/pnpm + the project git remote);
   editable in settings.
3. **Docker as the baseline runtime**; `gvisor`/`microvm` opt-in for untrusted repos, behind the same `ExecHost`
   port.
4. **Probe Docker at startup**; if absent, fall back to `host` and disable `bypassPermissions` (or warn). See
   backlog Epic 0.

## Sources

- [Claude Code — Development containers](https://code.claude.com/docs/en/devcontainer) `[cc-devcontainer]`
- [Claude Code — Sandbox environments](https://code.claude.com/docs/en/sandbox-environments) `[cc-sandbox]`
- [OpenAI Codex — Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) `[codex]`
- [Docker — Secure AI Agents at Runtime](https://www.docker.com/blog/secure-ai-agents-runtime-security/) `[docker]`
- [Running AI agents safely in a microVM using docker sandbox](https://andrewlock.net/running-ai-agents-safely-in-a-microvm-using-docker-sandbox/) `[docker-sandbox]`
- [Northflank — How to sandbox AI agents in 2026](https://northflank.com/blog/how-to-sandbox-ai-agents) `[northflank]`
- [Audit an AI Coding Agent's Network Egress Before It Gets a Shell](https://dev.to/jaryn_123/audit-an-ai-coding-agents-network-egress-before-it-gets-a-shell-4k69) `[egress-audit]`
- [Daytona vs E2B in 2026](https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes) `[northflank-e2b]`
