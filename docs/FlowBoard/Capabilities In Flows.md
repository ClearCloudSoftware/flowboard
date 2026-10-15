---
tags: [flowboard, capability-library, flows]
module: Capability Library
---

# Capabilities In Flows

The library exists for one consumer: **flow design**. Its only edge in the functional diagram is *Capability library → (steps draw on these) → Flow design*.

## How a step references a capability

A step definition has a `kind`:

| `kind` | References | Notes |
|---|---|---|
| `skill` | `skill_id` → skills | Invoked as `/slug` in the prompt |
| `agent` | `agent_id` → agents | Prompt appended as system prompt |
| `shell` | — | A check command (lint, tests); no AI, no capability |
| `manual` | — | A human task |

When adding a step in the flow editor: **choose Skill or Agent, pick from installed skills or defined agents**, then set model, effort, advance mode, requires, produces and limits (PRD; drawio *Add step form*). The editor's inspector carries `kind`, `skill/agent`, model, effort, advance mode, entry, requires, produces, limits, permission mode, allowed tools and prompt template (backlog).

Installed capabilities appear in the **step editor's picker** straight away — which is also why orphans are clutter.

## Validation at save time

Flow validation is pure functions over the graph. Two design-time checks share one engine (`02-core-and-engine.md`):

1. **Artifact contract** — every `requires` is produced by exactly one ancestor.
2. **Capability contract** — every knob a step uses is supported by its target provider.

The library adds the provider-match rule: **a pack's provider has to match the step's**. A step on Codex naming a capability with no Codex pack is a blocking error; Save is disabled. See [[Provider Coverage And Portability]].

## Versioning interaction

- Flows reference capabilities **by id, not by version**. A capability update reaches every flow on its next run.
- Tasks pin a **flow version**, not capability versions.

See [[Updating And Removing Capabilities]].

## "Used by"

Each capability lists the flow versions and steps that draw on it, as `Flow name  @author vN  ·  step <key>` (or *whole pack* for a bundle). Examples from the mockup:

- `code-review` — Software delivery @core v4 (review), Code review @core v7 (review), Code review @team-sec v2 (review), Test and triage @core v4 (triage)
- `scout` — used by five flows across @core, @alex and @growth

The count drives the rail meta (`4 uses`), the rail dot, and the removal block.

## Cost and memory per capability

- **Spend per step definition** — the costs screen answers *"what does `/grill-me` actually cost me?"*; the feature map: *"per step (so you can see what a particular skill really costs you)"*.
- **Agent/skill memory scope** — what a role or skill has picked up across runs, recalled into its next prompt.

## Related

- [[Capability Versus Provider Pack]]
- [[Capability Data Model]]
- [[Capability Runtime Mounting]]
- [[Bundle Packs]]
