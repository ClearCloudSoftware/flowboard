---
tags: [flowboard, agent-providers, behaviour, sandbox]
module: Agent Providers
---

# Providers And Sandboxing

> [!info] Design, not built
> Only the ExecHost seam and its `host` tier exist on `dev` as of 2026-10-22. The permission gate, the credential proxy, the sandbox tiers and the physical limits below are design. What a run gets today is under [[#As built]].

## The ExecHost seam

*"*Where* a process runs, decoupled from *which* agent runs it. An AgentProvider builds an argv; the ExecHost decides where it executes — host `child_process`, a hardened container, or a microVM. This keeps sandboxing orthogonal to the provider: **any provider × any tier, for free** (2×N, not N×M)."* (`01-ports.md`, *ExecHost and sandboxing*)

`08-sandboxing.md`: *"The sandbox is not a new kind of AgentProvider — it is *where the provider's process runs*."* and *"`ClaudeCodeProvider` spawning through a container `ExecHost` is Claude-in-a-sandbox; the same provider through the host `ExecHost` is today's behavior, no provider change."*

```ts
export type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';

export interface ExecHost {
  readonly id: IsolationTier;
  /** Absent for the `host` tier; present for sandboxed tiers. */
  readonly profile?: SandboxProfile;
  spawn(command: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): ChildProcessWithoutNullStreams;
}
```

(`core/src/ports/exec-host.ts`). The runner *"gets it from `workspace.execHost(task)` and passes it in `RunSpec.exec`; the provider adapter spawns through it instead of importing `child_process`."* (`01-ports.md`).

The reference port (`docs/old/reference/core/ports/exec-host.ts`) returned a `ChildHandle` (`pid`, `stdout`, `stderr`, `exit`, `kill`), *"normalized so the runner tails it the same way at every tier."* The shipped port returns Node's own child process with piped stdio instead. Its reasoning: every tier spawns a local process (the CLI itself, or `docker exec -i …`), and the Claude Agent SDK talks to the CLI over its stdin and stdout.

Backlog Story 3.5 (**NEW**): *"providers spawn through it, not raw `child_process`, so any provider runs sandboxed unchanged."* Both built adapters spawn through `RunSpec.exec`, and fall back to the only implementation, `hostExecHost` (`adapters/src/exec/host.ts`), when it is unset. No Workspace port exists, and `run-agent` never sets `exec`. That a provider runs sandboxed unchanged is untested: the OpenCode guard plugin and the plugin folders load from host paths (O10 in [[Provider Implementation Decisions]]).

## As built

> [!check] Implemented 2026-10-18
> Every run is a child process on the host, in the real folder the run names, with the owner's real credentials.

- **Claude** runs the installed `claude` CLI on its own login: the owner's subscription, not an API key. The CLI gets the whole environment minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, which would switch billing to the API (`adapters/src/agent/claude/options.ts`). `ANTHROPIC_BASE_URL` and the Bedrock and Vertex switches pass through (C6 in [[Provider Implementation Decisions]]).
- **OpenCode** runs one `opencode serve` per run on its own credentials: its `auth.json` under `XDG_DATA_HOME`, or `OPENCODE_API_KEY` or `OPENCODE_AUTH_CONTENT`. The server inherits the environment minus every other `OPENCODE_*` variable and minus the two Anthropic keys, then gets its own isolation settings ([[OpenCode Adapter]]). Admin-managed OpenCode config and `auth.json` are not isolated, so an `anthropic/...` model runs only if `auth.json` (or `OPENCODE_AUTH_CONTENT`) holds an Anthropic credential.
- **The agent's shell sees all of it.** Shell commands run as the owner, with that environment and the owner's files. On OpenCode the environment holds the server password, and the server's `POST /session/{id}/shell` and `POST /pty` endpoints run commands without the guard plugin and without a permission ask. In practice an agent already needs shell access to read the password.

> [!check] Changed 2026-10-22
> The OpenCode environment rule above is a decision taken 2026-10-22, open to Alex's review. Before it, only `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` were stripped: an inherited `OPENCODE_PERMISSION` could loosen the subagents' rules, and an exported `ANTHROPIC_API_KEY` reached an `anthropic/...` model.

What protects a run today:

- **The unrestricted-shell opt-in** (R3 and R4 in [[Run Agent CLI Decisions]]). `run-agent` refuses `bypassPermissions`, `auto` or an allow entry that lets the agent run any shell command, unless `permissions.allow_unrestricted_shell: true` is set, and then prints a warning line. Since 2026-10-22 this also covers OpenCode allow entries that OpenCode's own matcher reads as any shell command, such as `*`, `b*` and `Bash(?*)`. See [[Run Config Reference]].
- **The default modes.** `run-agent` defaults to `acceptEdits`. With no mode set, the Claude adapter uses `dontAsk`, and the OpenCode adapter behaves as in `default`.
- **The in-agent guards** (`core/src/guard.ts`), checked on the agent's tool calls by Claude's `PreToolUse` hook and by OpenCode's guard plugin. A file edit must land inside the write roots (in `run-agent`, the run's folder), links followed, and match no `deny_paths` glob. A recursive `rm` must stay inside the write roots too. A command that matches a `deny_commands` regex is refused; `run-agent` always adds `git push`, `git reset --hard` and piping `curl` or `wget` into a shell. Other shell commands are not checked against paths (C5). The `rm` rule and the link-following date from 2026-10-22, decisions open to Alex's review.

There is no wall-clock limit. Both adapters lift the MCP tool-call limit to about 24.8 days, so a question waits as long as its human takes (R20), and nothing else times a run: a hung tool server stalls it until `stop()`. Turn and budget caps are the providers' own. A hit fails the run with provider-specific text in `RunResult.error`: `error_max_turns:` or `error_max_budget_usd:` on Claude, `max_turns:` or `max_budget:` on OpenCode. A model OpenCode has no price for costs 0, so its budget cap never trips (O12).

## The permission gate

*"the runner refuses `permission_mode='bypassPermissions'` unless the tier is a sandbox (`container`/`gvisor`/`microvm`)."* (`01-ports.md`). *"On `host` tier it downgrades to an approval/auto mode, or fails the step with a readable reason. A correctness rule, not a suggestion."* (`08`). The gate belongs to the runner, not the adapter. The sources word the host-tier outcome four ways (refuse, refuse or downgrade, downgrade, downgrade or fail): [[Execution Open Questions]] #53. That a downgrade needs the provider's `permission_modes` capability is an inference. `08` adds a Claude-specific edge: *"Claude Code even *rejects* `--dangerously-skip-permissions` when launched as root"*; `SandboxProfile.nonRoot` is *"Default true; `bypassPermissions` requires this"* (`exec-host.ts`). See [[Run Guardrails At Launch]].

As built, nothing checks the tier: there is no runner and no sandbox. The nearest thing is `run-agent`'s unrestricted-shell opt-in ([[#As built]]).

## Credentials

*"No real credential is passed in: the CLI's `ANTHROPIC_BASE_URL` points at the egress proxy, which injects it."* (`03` §6). PRD §0 step 3 makes it a probe: *"If the CLI refuses, stop and tell me; the fallback is a short-lived, run-scoped token."*

The drawio *Harness architecture* egress proxy allowlist: *"api.anthropic.com · api.openai.com (later) · npm / PyPI · no git remote"*; external node *"OpenAI / Codex CLI adapter (later)"*. The sandbox image holds *"claude CLI · codex CLI · git · pnpm · toolchains"*.

The drawio's *claude* card in the sandbox says *"ANTHROPIC_BASE_URL → proxy, dummy key"*, but its edge *F* from the CLI to the proxy is labelled *"HTTPS_PROXY"*, a provider-neutral mechanism. `ANTHROPIC_BASE_URL` is Claude's variable; the Codex equivalent is not given: [[Agent Providers Open Questions]] #23. The sources also disagree on what `SandboxProfile.env` may hold: *"never a real credential (the proxy injects it)"* (`01-ports.md`) against *"Run-scoped env (model/CLI auth)"* (`exec-host.ts`); see [[Sandboxing Open Questions]] #26.

As built there is no proxy and no dummy key: each CLI holds the owner's real credentials ([[#As built]]).

**Open design question.** The proxy design suits an API key, not a subscription login. Claude runs on the owner's subscription ([[Provider SDK Fit Analysis]]), so a container tier would need a `claude setup-token` token passed as `CLAUDE_CODE_OAUTH_TOKEN` inside the sandbox, which breaks *"No real credential is passed in"*. The related question for other providers is [[Agent Providers Open Questions]] #23.

## Codex has its own sandbox

*"Codex additionally has its *own* OS sandbox — Seatbelt on macOS, Landlock+seccomp on Linux, network off by default … — so Codex at `host` tier still isn't unsandboxed; a container tier is defense-in-depth."* (`08`). Prior art: *"the sandbox is the structural floor, approvals are the workflow layer."*

No Codex adapter is built; see [[Codex Adapter]].

## Limits

Logical caps (`limits.maxTurns`, `maxBudgetUsd`) map to *"the sandbox's physical `--memory` / `--cpus` / `--pids-limit` / wall-clock backstops"* (`03` §6). Backlog 3.5: *"a limit/timeout hit marks the run failed with reason"*; PRD §7 classes a *"budget or turn cap hit"* as non-transient, so the task blocks. A provider without `budget_cap` makes the budget *"advisory"* (`agent-provider.ts`). Inference: without it nothing stops spend in dollars, since the physical limits cap memory, CPU, processes and wall-clock, not money.

As built, no physical limit exists, and nothing classifies a cap hit: a runner could tell one only by its provider-specific text ([[#As built]]).

## HITL across tiers

*"The MCP side is the same on every tier: a stdio shim the CLI launches, forwarding over a unix socket to a broker in the worker"* (`04` §9). The provider only needs `mcp_tools` to launch the shim; the tier doesn't change the path. Backlog D9 still recommends the artifact-file exchange inside a sandbox: [[Human In The Loop Open Questions]] #9.

As built, on the host tier only: the shim is `packages/ask-user`, and its broker runs inside `run-agent`, not a worker (R18 in [[Run Agent CLI Decisions]]).

## Related

- [[Run Guardrails At Launch]]
- [[Capability Tools And Egress]]
- [[Run Spec]]
- [[Provider Capabilities]]
- [[Claude Code Adapter]]
- [[OpenCode Adapter]]
- [[Run Config Reference]]
- [[Codex Adapter]]
