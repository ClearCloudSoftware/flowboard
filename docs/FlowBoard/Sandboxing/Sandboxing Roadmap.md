---
tags: [flowboard, sandboxing, roadmap]
module: Sandboxing
---

# Sandboxing Roadmap

## v1 scope

PRD §17: *"**Sandboxing agent execution** in a container/microVM (§11.1) is in scope but optional — it isolates the agent on the same single machine; it is not multi-tenancy or remote execution."*

| In v1 | Source |
|---|---|
| `ExecHost` seam; host and docker exec adapters. Built 2026-10-18: the seam and the host tier only (`adapters/src/exec/host.ts`); both adapters spawn through it ([[ExecHost Port]]) | PRD §3; backlog 3.5 |
| Container workspace: ephemeral container per run, hardened | PRD §11.1; backlog 3.5 |
| gVisor/microVM for untrusted repos: *"(or, for untrusted repos, a gVisor/microVM)"* | PRD §11.1, §13 (*"host / container / microVM"*), §17 |
| Egress proxy with default-deny allowlist | PRD §11.1; backlog 3.5 |
| Credential-injecting proxy, dummy key | PRD §0, §11.1; backlog 3.5 |
| Permission gate | PRD §7, §11.1; backlog 3.5 |
| `PreToolUse` hooks in a per-run `settings.json`. Built 2026-10-18 without the file: an in-process `PreToolUse` callback on Claude Code, a guard plugin on OpenCode, both set up from `RunSpec.guards` ([[Claude Code Adapter]], [[OpenCode Adapter]]) | PRD §7 |
| `tool_hooks` provider capability; without it *"the flow editor says so"*. Built 2026-10-18: Claude Code and OpenCode declare it. No flow editor reads it yet ([[Agent Providers Open Questions]] #1) | PRD §7 |
| Host-side `ask_user` broker on every tier. Built 2026-10-18 on the host tier only: the shim is `packages/ask-user`, and its broker runs inside `run-agent`, not a worker ([[Ask User MCP Server]]) | PRD §9 |
| Logical caps mapped to physical limits | backlog 3.5 |
| `runs.sandbox`, `settings.sandbox_profile`, optional step override | PRD §11.1; backlog 1.1 |
| Docker probe at startup | PRD §11.1; backlog 0.1 |
| Settings sandbox section | PRD §13 |
| README security caveat | backlog 10.2 |

> [!warning] No milestone
> PRD §14's build order (M1–M9) never mentions the sandbox. The backlog puts it in Epic 3 (*Runner and worker*, M3) as Story 3.5, tagged **NEW**. The drawio's *Logical components* page draws the container workspace adapter dashed: *"dashed = not in v1"*; the *Harness architecture* page draws the agent sandbox dashed, *"optional or later"*. The pitch counts *"the cost/sandbox views"* among *"its eight build milestones"*. The ideation page's scope card reads *"Not building / Auth, accounts, roles, deployment, Docker, multi-machine, plugin marketplace."*: it names *Docker* apart from *deployment*, while PRD §17 limits the Docker exclusion to *"shipping or *deploying* FlowBoard itself in a container"*. Reading the card as deployment only is an inference. See [[Sandboxing Open Questions]] #33 and #38.

## Designed beyond the PRD

| Item | Source |
|---|---|
| `gvisor` as a tier value of its own; Docker baseline with *"`gvisor`/`microvm` opt-in for untrusted repos"* | `08` *Recommendation* #3; backlog D8 |
| Codex runs through the same seam; its own OS sandbox is defense-in-depth | `08` |
| `api.openai.com (later)` on the allowlist | drawio |
| `tool_hooks` in the `Capability` union. Built 2026-10-18 in `core/src/ports/agent-provider.ts` ([[Agent Providers Open Questions]] #1) | `01-ports.md` |
| Snapshot `RunSpec` to `data/runs/<id>/spec.json`. Not built (no runner); `run-agent` logs the launched `RunSpec` as the `start` line of its run log ([[Agent Providers Storage]]) | `03` §6 idea; drawio |
| Mem0 on `fb-memory`, reachable from the host only | drawio; `09-memory.md` |

## Ideas

- **A `remote` tier** on a managed sandbox platform (E2B, Daytona, Modal) (`08` *Prior art*).
- **Run agents in the cloud** (feature map *Parking lot*: *"so a big job doesn't tie up your machine"*).
- **Injection scan**: *"LLM Guard over artifacts before the next step or memory trusts them"* (drawio, dashed); *"Check for hidden manipulation"* (feature map *Parking lot*).
- **Deterministic gates**: *"semgrep · gitleaks · trivy · eslint / ruff as extra shell steps"* (drawio, dashed). As shell steps they would inherit the sandbox (inferred from PRD §7).
- **Team guardrails**: *"the team can pin rules nobody can quietly lift"* (feature map §16 ideas, quoted in [[Step Guardrails]]).
- Feature map §10 *💡 Ideas* and *Across everything → Safety & trust* are empty slots.

## Out of scope

- Shipping or deploying FlowBoard itself in a container (PRD §17).
- Multi-tenancy and remote execution (PRD §17); multi-machine support (PRD §17).
- Open-web research steps in v1: *"The `researcher` web-research template is out of v1 until open-web egress has an answer."* (backlog 1.2; Capability Library D31).

## Related

- [[Sandboxing Open Questions]]
- [[Sandboxing Index]]
- [[Execution Roadmap]]
