---
tags: [flowboard, capability-library, providers]
module: Capability Library
---

# Provider Coverage And Portability

> [!check] Deferred: not in v1
> v1 is Claude-only ([[Capability Library Decisions|D1]]). The coverage counter, provider filter, per-provider packs block and provider-match check below are not built until a second provider arrives. This note describes the designed behaviour for that point.

## The rule

**A pack's provider has to match the step's provider.** A capability with no Claude pack cannot run on a Claude step, and vice versa. Steps name their provider individually, so one flow can mix providers (guide). No PRD table has a provider column yet ([[Agent Providers Open Questions]] #14).

The architecture states the same rule as validation: *"the flow editor references them by id; validation checks the pack's provider matches the step's provider"* (`05-environment-and-registry.md` §13).

## Where it is enforced

**In the flow editor, at design time — not at run time.** You find out while designing, not when a task is halfway through.

> [!warning] Blocking in the mockup, a warning in the ports doc
> The capability-library mockup and guide say a step set to run on Codex CLI can't use a capability with no Codex pack, and the flow editor refuses to save that combination; the guide adds *"It is not a soft warning; the recipe will not save."* `01-ports.md` calls a capability-contract violation a design-time **warning**; only the artifact contract rejects the save (`02-core-and-engine.md`). `05` gives the provider-match check no severity, and the flow-designer mockup does not implement it. Moot in v1; decide when the second provider arrives (OQ13).

## How the library shows it

- **Detail pane, packs block** — one row per provider:
  - `Claude Code — installed v1.3 · 2 Sep` with a solid teal `claude` mark
  - `Codex CLI — not packaged for this provider` with a dashed `codex` mark
- **Callout** — either *"No Codex CLI pack. A step set to run on Codex CLI can't use this…"* (amber) or *"Packaged for both providers. Any step can use it, whichever agent CLI it runs on."* (teal)
- **Rail row meta** — the providers it is packaged for, e.g. `claude · codex`
- **Provider filter** — `Any` / `Claude Code` / `Codex CLI`, each with a count
- **Status bar** — `codex packs for 7 of 17`

## The portability budget

`codex packs for N of M` is how much of the library survives switching a flow to another agent CLI. Most capabilities start life packaged for one provider, so **every one-provider install spends that budget** — installing `dependency-audit` (Claude only) turns *7 of 17* into *7 of 18*.

## Three ways out when a step refuses

1. **Switch the step to Claude.** Steps name their provider individually.
2. **Package it for Codex.** Same logical capability, a second pack in that provider's format.
3. **Use something else.** Filter the rail to `Codex CLI` and see what the portable capabilities can do instead.

None of these is a workaround — they are the three honest options.

## Supporting machinery

- **Capability negotiation.** Providers advertise a set of capability flags. `plugins` means *can mount CapabilityPacks as plugin dirs*; without it a pack must use the `system_prompt` or `native` mount kind. The Codex adapter may lack `plugins` (`06-cost-and-platform.md`).
- **Capability contract.** Flow validation's second check: every knob a step uses is supported by its target provider (`02-core-and-engine.md`). Provider-match of packs is the library-facing counterpart, though `01-ports.md` makes capability-contract violations warnings.
- **Adding Codex** requires, among four items, *"Codex-format `CapabilityPack`s for any skills used by flows targeting it"*, and zero changes to engine, board, HITL, notifier, costs, viewer and API.
- **ACP.** `01-ports.md` proposes first checking whether the `AgentProvider` port should *be* the Agent Client Protocol, which has adapters for Claude Code and Codex. If adopted, how packs mount needs re-checking — see [[Capability Library Open Questions]] #16.
- **Seeded skills as reference implementation** — the seeded plugin dirs double as the reference for a second provider's pack format.

## Related

- [[Capability Library Decisions]]
- [[Capability Versus Provider Pack]]
- [[Capabilities In Flows]]
- [[Capability Runtime Mounting]]
- [[Installing A Capability From GitHub]]
- [[Capability Negotiation]]
- [[Adding A Provider]]
