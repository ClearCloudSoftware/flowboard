---
tags: [flowboard, sandboxing, prior-art]
module: Sandboxing
---

# Sandboxing Prior Art

From `08-sandboxing.md` *Prior art (what others do)*, with the source tags `08` cites.

| System | What it does | FlowBoard borrows |
|---|---|---|
| **Claude Code dev container** `[cc-devcontainer][cc-sandbox]` | *"Docker container, repo bind-mounted, non-root, optional `init-firewall.sh` egress allowlist (npm, GitHub, Anthropic API) via `NET_ADMIN`/`NET_RAW`; makes `--dangerously-skip-permissions` reasonable; `permissions.disableBypassPermissionsMode` forbids it centrally. Also ships a built-in Bash sandbox and OS-level sandboxing."* | Non-root, bypass paired with a firewall, the in-container firewall as an alternative to the proxy |
| **OpenAI Codex** `[codex]` | *"sandboxed *by default*: Seatbelt (macOS) / Landlock+seccomp (Linux), workspace-write with **network off by default**, approval policy layered on top"* | *"A clean model: the sandbox is the structural floor, approvals are the workflow layer."* |
| **Docker** `[docker][docker-sandbox]` | *"`--cap-drop ALL`, seccomp, `no-new-privileges`, ephemeral/read-only volumes, default-deny egress, non-root, hardened base images; Docker Desktop's microVM-backed `docker sandbox`"* | The hardening flags; `docker sandbox` as a microVM tier |
| **Managed sandbox platforms** `[northflank-e2b]` | *"E2B and Daytona (Firecracker / container microVMs, ~90–150ms cold start), Modal (gVisor)"* | *"the cloud version of this, if FlowBoard ever grows a `remote` tier"* |

`08` also cites Northflank for the shared-kernel warning and ephemerality `[northflank]`, and a dev.to article for egress as the key control `[egress-audit]`.

## The Claude Code stance

*"This mirrors Claude Code's own stance: its dev container runs Claude as non-root, confines execution to the container, and pairs `--dangerously-skip-permissions` with an egress firewall."* (`08`)

## Links `08` lists

- Claude Code — Development containers (`cc-devcontainer`)
- Claude Code — Sandbox environments (`cc-sandbox`)
- OpenAI Codex — Agent approvals & security (`codex`)
- Docker — Secure AI Agents at Runtime (`docker`)
- Running AI agents safely in a microVM using docker sandbox (`docker-sandbox`)
- Northflank — How to sandbox AI agents in 2026 (`northflank`)
- Audit an AI Coding Agent's Network Egress Before It Gets a Shell (`egress-audit`)
- Daytona vs E2B in 2026 (`northflank-e2b`)

The URLs are in `docs/old/architecture/08-sandboxing.md` *Sources*.

## Related

- [[Isolation Tiers]]
- [[Sandbox Security Profile]]
- [[Sandbox Threat Model]]
- [[Sandboxing Sources]]
