---
tags: [flowboard, flow-design, guardrails, safety]
module: Flow Design
---

# Step Guardrails

> *Guardrails* — A spending cap, a limit on back-and-forth turns, which tools it's allowed, and how many times it may retry before giving up. — feature map §2

The flow-designer guide: *"Each field is a guardrail — the things that decide what a step may spend, how hard it thinks, and how much rope it has when running unattended."*

## The fields

| Guardrail | Column (PRD §5) | Mockup | What it does | Get it wrong and (guide) |
|---|---|---|---|---|
| Budget | `max_budget_usd` | **Budget** ($, step 0.10) | *"The most this step may spend on one attempt. The canvas bar totals these into a ceiling per task."* | *"No ceiling means a looping agent has no financial brake — only the sandbox's time limit."* |
| Turns | `max_turns` | — | Limit on back-and-forth turns | — |
| Tools | `allowed_tools` (JSON; null = unrestricted) | — | Allowed tool list | — |
| Attempts | `max_attempts` (default 3) | **Retries** (0–5) | *"How many attempts before the step gives up and fails the task."* (guide) | *"Set high on a step that fails deterministically and you pay for the same failure several times."* |
| Approval | `advance_mode` | **Approval** | See [[Approval Gates]] | *"No gate on the last step before a merge means nothing human ever sees the result."* |
| Sandbox | no column; `settings.sandbox_profile` is *"overridable per step"* (§11.1). Backlog 1.1 adds optional `step_defs.sandbox_profile` | **Sandbox** | *"How locked down the run is: none, a container, or a sealed container with no network."* | *"**none** on an unattended step is an agent with your machine and your keys, reading untrusted content."* |
| Egress allowlist | no column; the allowlist is part of `settings.sandbox_profile`, *"overridable per step"* (§11.1) | — | Hosts the step's sandbox may reach. Four other mockups call it *"that step's allowlist"* | — |
| Permission mode | `permission_mode` (default `bypassPermissions`) | — | The agent CLI's permission mode | — |

`docs/pitch.md` says *"Every step has a budget and a turn cap"*; in PRD §5 both are nullable with no default ([[Flow Design Open Questions]] #37).

## Logical caps, physical backstops

`max_turns` and `max_budget_usd` are *logical* caps passed to the CLI (`--max-turns`, `--max-budget-usd`). The sandbox adds *physical* ones: *"resource limits (`--memory`, `--cpus`, `--pids-limit`, wall-clock) that physically backstop the logical `max_turns`/`max_budget_usd` caps"* (PRD §11.1). Backlog Story 3.5: *"a limit/timeout hit marks the run failed with reason."*

Whether a provider enforces them depends on capability flags: `budget_cap` — *"honours maxBudgetUsd; else it is advisory"*; `allowed_tools` — *"tool allow/deny is enforced, not advisory"* (`agent-provider.ts`). No `allowed_tools` → *"tool policy becomes advisory / prompt-level"* (`01-ports.md`).

## Tools

- *"When `--allowedTools` is set, always append `mcp__vibe__*` so a restrictive list cannot lock out `ask_user`."* (PRD §7)
- Agents carry their own allowed tools (`agents.allowed_tools`), and skills declare theirs in `SKILL.md`. A step's effective tools are the agent's ∩ the skill's, narrowed by the step's `allowed_tools` when set; the flow editor warns at design time when that drops a tool the skill declares ([[Capability Library Decisions|D28]]). Network-capable tools need hosts on the egress allowlist — see [[Capability Tools And Egress]].

## The egress allowlist

Egress is default-deny with an allowlist (PRD §11.1). The capability library, inbox, monitor and task-detail mockups all treat it as **per step**: *"a step using it will still fail closed until you add the host it needs to that step's allowlist"* (capability-library mockup), and **Allow host & retry** *"adds the blocked host to that step's allowlist"* (inbox guide). The flow designer, the one screen that edits steps, has no allowlist field. Where the per-step list is stored, and whether editing it makes a flow version, is [[Flow Design Open Questions]] #14. See [[Egress Allowlist]] and [[Capability Tools And Egress]].

## The sandbox rule

> **`bypassPermissions` is only allowed when the step runs in a sandbox tier.** On the host tier, refuse it (or downgrade to an approval mode). — PRD §11.1

Backlog decision D7: *"Container + egress allowlist; `host` only for non-bypass or a trusted opt-out."* Feature map §10: *"Fully-autonomous mode (no approval on each action) is only allowed when the agent is inside a box; otherwise FlowBoard refuses it."*

The mockup inspector argues with one combination: no approval gate **and** sandbox `none` shows a chip, *unattended and unsandboxed*. The guide: *"The inspector flags it rather than blocking it — but in the real product that's the combination the sandbox rule refuses outright."*

> [!warning] Two different rules
> The PRD rule pairs **permission mode** with the sandbox tier. The mockup pairs **advance mode** (gate) with the sandbox. The mockup's chip would not flag a gated step on the host running `bypassPermissions`, which the PRD rule refuses (§11.1). See [[Flow Design Open Questions]] #13.

### Proposal: sandbox value mapping

| Mockup | PRD §13 | `08-sandboxing.md` tier |
|---|---|---|
| none | host | `host` |
| container | container | `container` |
| sealed container | microVM | `gvisor` / `microvm` |

*Sealed container* is defined as *"a sealed container with no network"*; the PRD's container already has default-deny egress, so this mapping is a guess. The other reading, a `container` with an empty allowlist, could not reach the model endpoint and so would only suit shell steps ([[Sandboxing Open Questions]] #7). The drawio's *Tiers* card adds a fourth vocabulary: *"host (no box, approval mode only) · container (default when autonomous) · gVisor runsc (untrusted repos, Linux hosts) · microVM / docker sandbox"*. All the vocabularies: [[Isolation Tiers]].

### Steps the host tier refuses

Two PRD §11.1 rules bite at run time on a step whose sandbox is `none` (host): *"On the host tier, a step that mounts a git-installed plugin does not run"* ([[Capability Library Decisions|D15]]), and *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* The mockup does not flag either. Whether the designer should is [[Flow Design Open Questions]] #38.

## Retries versus `max_attempts`

The mockup's **Retries** (default 2) and the PRD's `max_attempts` (default 3, total runs) likely describe the same budget counted differently. **Proposal:** Retries = `max_attempts − 1`. The guide says the step *"fails the task"* at the limit; PRD §8 says *"Escalate, don't fail, when a loop is spent or stuck."* Decision D3: *"escalate to a gate, never auto-fail"*. Also, the counter is spent by the rework **target**, not the failing step. See [[Flow Design Open Questions]] #11 and [[Branching Joining And Loops]].

## Ceiling per task

The canvas bar reads `est. $X ceiling per task`: the sum of every step's budget (`$0.05` per step in draft mode). Loops and retries can exceed it — [[Flow Design Open Questions]] #12.

## Ideas

- *"Team guardrails vs personal defaults — the team can pin rules nobody can quietly lift (a review step must wait for approval, a budget cap holds)"* (feature map §16 ideas).

## Related

- [[Step Definitions]]
- [[Approval Gates]]
- [[Models And Effort]]
- [[Capability Tools And Egress]]
- [[Permission Gate]]
- [[Sandbox Configuration]]
