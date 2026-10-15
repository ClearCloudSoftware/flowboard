---
tags: [flowboard, sandboxing, glossary]
module: Sandboxing
---

# Sandboxing Glossary

| Term | Meaning |
|---|---|
| **Sandbox** | The security boundary a step's process runs in: a container or microVM. Every tier except `host` (`08-sandboxing.md`). |
| **Isolation tier** | `IsolationTier = 'host' \| 'container' \| 'gvisor' \| 'microvm'` (`exec-host.ts`). How strong the boundary is. See [[Isolation Tiers]]. |
| **Sandbox tier** | Any tier other than `host`. The only tiers on which `bypassPermissions` is allowed. |
| **Isolation ladder** | The tiers ordered weakest to strongest: `host` → `container` → `gvisor` → `microvm` (`05-environment-and-registry.md` §11). |
| **ExecHost** | The port that decides *where* a process runs: host `child_process`, a container, or a microVM. See [[ExecHost Port]]. |
| **SandboxProfile** | The security knobs an `ExecHost` applies: tier, image, egress allowlist, limits, mounts, env, non-root (`exec-host.ts`). |
| **`sandbox_profile`** | The settings entry that holds the global profile (*"tier, image, egress allowlist, limits"*), *"overridable per step"* (PRD §11.1). |
| **`runs.sandbox`** | The tier that actually ran, recorded for audit (PRD §11.1). |
| **`bypassPermissions`** | The agent CLI's fully autonomous permission mode: no approval on each tool call. The default `step_defs.permission_mode` (PRD §5). |
| **Permission gate** | The runner rule that refuses `bypassPermissions` unless the tier is a sandbox. See [[Permission Gate]]. |
| **Egress** | Outbound network traffic from inside the sandbox. |
| **Egress allowlist** | The hosts the sandbox may reach. Default-deny; `[]` = fully offline (`01-ports.md`). Field `egressAllow`. |
| **Egress proxy** | Squid or tinyproxy on an internal-only Docker network: the only route out, and the place the real API key is added (PRD §11.1). |
| **Credential-injecting proxy** | The same proxy, named for its second job. See [[Credential Injecting Proxy]]. |
| **Dummy key** | The fake API key the CLI holds inside the box (PRD §11.1). |
| **`fb-sandbox`** | The internal Docker network the sandbox sits on (drawio *Harness architecture*). |
| **`flowboard-runner`** | The sandbox image: *"node · claude CLI · codex CLI · git · pnpm · toolchains"* (drawio). |
| **Security profile** | The hardening a container applies: non-root, `--cap-drop ALL`, `no-new-privileges`, seccomp, read-only root, limits. See [[Sandbox Security Profile]]. |
| **Physical limits** | `--memory`, `--cpus`, `--pids-limit`, wall-clock. The backstop to the *logical* caps `max_turns` and `max_budget_usd`. See [[Resource Limits]]. |
| **In-agent hooks** | Claude Code `PreToolUse` hooks in a per-run `settings.json` that deny out-of-scope tool calls. See [[In-Agent Hooks]]. |
| **`tool_hooks`** | The provider capability flag meaning the provider supports such hooks (`01-ports.md`, PRD §7). |
| **Dual encoding** | Drawio harness concept 5: the prompt states the rules, and two gates (hooks inside, box outside) enforce them. |
| **Host-side broker** | A worker process that talks to the database or memory store on behalf of the sealed agent. See [[Host-Side Brokers]]. |
| **`ask.sock`** | The per-run unix socket, `data/sock/<run_id>.sock` on the host, bind-mounted as `/run/fb/ask.sock` (PRD §9). |
| **Check container** | The container a shell step runs in: *"same image and mounts, no model, no API key"* (drawio). |
| **Container workspace** | The Workspace adapter whose `execHost` returns a container `ExecHost` (`07-ports-in-practice.md`). |
| **Docker probe** | The startup check for Docker; if absent, fall back to `host` and disable `bypassPermissions` (PRD §11.1). |
| **Allow host & retry** | The inbox and monitor action that adds a blocked host to a step's allowlist and re-queues the run. See [[Egress Denials]]. |
| **Sealed container** | Flow-designer mockup value: *"a sealed container with no network"*. Not a term in the PRD or architecture. |

> [!warning] Overloaded words
> - **"Sandbox"** names the boundary in the architecture, but the flow-designer mockup uses *Sandbox* as a step field with values `none`, `container`, `sealed container`. *none* there means the `host` tier.
> - **"Container"** is a tier (`container`), a Workspace adapter id (`'container'` in `01-ports.md`), and in the mockup also half of *sealed container*.
> - **"Hooks"** means two things. FlowBoard's own `PreToolUse` hooks are a safety gate. A plugin's `hooks/` directory is third-party code that the library marks as network-capable (PRD §13). The operator's global `~/.claude` hooks are a third thing that must be kept out of runs (backlog D5).
> - **"Gate"** means the [[Permission Gate]] here, but an approval gate (`advance_mode='approval'`) in flow design. The flow-designer mockup mixes the two in its *unattended and unsandboxed* chip.
> - **"Host"** means the `host` tier, the user's machine, and a network host on the allowlist (`api.stripe.com`).
> - **"Tier"** also appears in memory (*"the shared/remote tier"*, `09-memory.md`), which is a deployment choice, not an isolation tier.

## Related

- [[Sandboxing Index]]
- [[Isolation Tiers]]
- [[Execution Glossary]]
- [[Capability Library Glossary]]
