---
tags: [flowboard, sandboxing, concept, security]
module: Sandboxing
---

# Sandbox Threat Model

## The configuration that needs a box

`08-sandboxing.md` *Why — the threat model*:

> FlowBoard runs agents **headless** with `permission_mode='bypassPermissions'` by default (PRD §5) — no human reviews each tool call. Those agents then read **untrusted content**: repo files, web pages, the backlog markdown, issue/PR text, prior artifacts. Any of it can carry a **prompt injection** that redirects the agent to exfiltrate secrets, corrupt the repo, or run arbitrary commands. On the host the blast radius *is* the host: the whole filesystem, every network destination, and the user's credentials.

PRD §11.1 says the same in fewer words: *"Running that directly on the host is the dangerous configuration."*

| Ingredient | Source |
|---|---|
| No approval per tool call | `step_defs.permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions'` (PRD §5) |
| Untrusted input | *"repo files, the backlog, web pages, prior artifacts"* (PRD §11.1) |
| Attack | Prompt injection: *"exfiltrate secrets, corrupt the repo, or run arbitrary commands"* (`08`) |
| Blast radius on the host | *"the whole filesystem, every network destination, and the user's credentials"* (`08`) |

## The single most valuable control

> The single most valuable control is **network egress restriction**, because it is enforced below the agent's reasoning: *prompt injection can change what the agent asks for, but it cannot change what the firewall permits.* — `08-sandboxing.md`

*"A default-deny egress allowlist holds even when tool-approval is bypassed — exactly FlowBoard's default posture."* (`08`). Hence the conclusion: *"So **`bypassPermissions` and a sandbox are one package.** Fully-autonomous agents without one is the dangerous configuration."* See [[Egress Allowlist]] and [[Permission Gate]].

## What each control answers

| Threat | Control | Note |
|---|---|---|
| Exfiltrate data to an attacker's host | [[Egress Allowlist]] | Default-deny |
| Steal the API key from the environment | [[Credential Injecting Proxy]] | Dummy key inside |
| Read `~/.ssh`, cloud credentials, the DB | [[Sandbox Mounts]] | Never mounted |
| Escape via the Docker socket | [[Sandbox Mounts]] | `docker.sock` never mounted |
| Gain root or new capabilities | [[Sandbox Security Profile]] | Non-root, `--cap-drop ALL`, `no-new-privileges` |
| Fork bomb, memory blow-up, endless loop | [[Resource Limits]] | `--pids-limit`, `--memory`, wall-clock |
| Push code, `rm -rf`, write to non-goals | [[In-Agent Hooks]] | Denied with a reason |
| Contaminate the next run | [[Sandboxed Run Lifecycle]] | One container per run, destroyed |
| Kernel exploit from agent-run code | [[Isolation Tiers]] | Only `gvisor` / `microvm` resist it |
| A git-installed plugin's hooks or MCP servers running as the user | [[Permission Gate]] | Host tier refuses such steps (PRD §11.1) |
| Poisoned memory | [[Host-Side Brokers]] | Commit only from declared artifacts and answers (`08`, `09-memory.md`) |

## Residual risk

> [!warning] Stated plainly
> *"even a hardened sandbox with `bypassPermissions` cannot stop a malicious repo from exfiltrating whatever is *inside* the sandbox (including any credentials mounted there) to whatever the allowlist permits. Run trusted repos, keep the allowlist tight, mount no host secrets."* — `08-sandboxing.md`

Other limits the sources name:

- **Shared kernel.** *"Plain containers share the host kernel — a kernel exploit in agent-run code escapes the container."* (`08`)
- **Memory is a new trust channel.** *"A prompt injection can still poison *what a run proposes to remember*"* (`08`).
- **Allowlisted hosts are reachable.** Anything on the list, including package registries, is a possible destination.

The backlog wants the residual risk documented: *"README/security: sandbox tiers and the egress allowlist; the caveat that `bypassPermissions` + sandbox still can't stop exfiltration *within* the sandbox — trusted repos only, no host-secret mounts"* (Story 10.2).

## Later: an injection scan

The drawio *Harness architecture* page has a dashed (later) node: *"Injection scan (later) / LLM Guard over artifacts before the next step or memory trusts them"*. Feature map *Parking lot*: *"Check for hidden manipulation — scan the files agents produce (and the untrusted things they read) for prompt-injection before the next step trusts them."* See [[Sandboxing Roadmap]].

## Related

- [[Sandboxing Overview]]
- [[Egress Allowlist]]
- [[Permission Gate]]
- [[Sandboxing Prior Art]]
