---
tags: [flowboard, capability-library, flows]
module: Capability Library
---

# Capabilities In Flows

The library exists for one consumer: **flow design**. Its only edge in the functional diagram is *Capability library → (steps draw on these) → Flow design*.

## How a step references a capability

A step definition has a `kind` ([[Capability Library Decisions|D27]]):

| `kind` | References | Notes |
|---|---|---|
| `ai` | `agent_id` → agents, `skill_id` → skills — either or both | The agent is **who** (its prompt is appended as the system prompt); the skill is **how** (invoked as `/<plugin>:<slug>` in the prompt, D16). *The `reviewer` running `/code-review`.* |
| `shell` | — | A check command (lint, tests); no AI, no capability |
| `manual` | — | A human task |

The PRD first had `kind = 'skill' | 'agent'`, one or the other. The mockup's used-by data already paired them — `plan` uses `architect` **and** `/plan-implementation`, `review` uses `reviewer` **and** `/code-review` — and the schema already had both columns, so D27 drops the exclusivity.

**Allowed tools with both** (D28): the intersection of the agent's list and the skill's `allowed-tools`, narrowed further by the step's `allowed_tools` when set. The flow editor warns at design time when the intersection drops a tool the skill declares. An agent's restrictions (*reads only*, *never edits code*) are the role's guarantee, so a skill cannot widen them silently.

When adding a step in the flow editor: **pick an agent, a skill or both**, then set model, effort, advance mode, requires, produces and limits (PRD §13). The drawio *Add step form* card (*"Skill or Agent → model, effort, advance mode, requires, produces, limits"*), the *Author steps* card and feature map §2 (*"A step can run a saved skill … or a defined agent"*) still offer one or the other; D27 settled on either or both. The editor's inspector carries `kind`, agent and/or skill, model, effort, advance mode, entry, requires, produces, limits, permission mode, allowed tools and prompt template (backlog Story 8.2).

Installed capabilities appear in the **step editor's picker** straight away (*"it becomes selectable in the step editor straight away"*, mockup) — which is also why orphans are clutter. Listing skills there as `plugin:slug` is a proposal that follows D16 ([[Capability Library Open Questions]] #25).

A step can also name **extra plugins** (`step_defs.extra_plugin_ids`) to mount alongside its own, so its prompt template can invoke a second `/<plugin>:<slug>` ([[Capability Library Decisions|D14]]). Extras count as uses (D17). That validation rejects an extra plugin not installed in the project is a proposal; what happens when a step is reused in another project is open ([[Capability Library Open Questions]] #20).

## Validation at save time

Flow validation is pure functions over the graph. Two design-time checks share one engine (`02-core-and-engine.md`):

1. **Artifact contract** — every `requires` entry is produced by some ancestor; exactly one producer; known types. A violation rejects the save.
2. **Capability contract** — every knob a step uses is supported by its target provider. `01-ports.md` calls a violation a design-time **warning**, same machinery as the artifact contract.

The library adds the provider-match rule: **a pack's provider has to match the step's** (`05-environment-and-registry.md` §13, which gives no severity). The capability-library mockup and guide say the flow editor *refuses to save* that combination. The flow-designer mockup has no provider check yet, and `01-ports.md` treats capability-contract violations as warnings. Blocking vs warning is **moot in v1**, which is Claude-only (D1); it returns with the second provider — see [[Provider Coverage And Portability]].

## Versioning interaction

- Flows reference capabilities **by id, not by version**. A capability update reaches every flow on its next **task**.
- Tasks pin a **flow version** and, at start, the **plugin commits and agent rows** they can use (`tasks.capability_pins`, D10). An update never reaches a running task.

See [[Updating And Removing Capabilities]].

## "Used by"

Each capability lists the flow versions and steps that draw on it — each flow's latest version, plus any version a non-terminal task pins (D17) — as `Flow name  @author vN  ·  step <key>` (or *whole pack* for a bundle). Examples from the mockup:

- `code-review` — Software delivery @core v4 (review), Code review @core v7 (review), Code review @team-sec v2 (review), Test and triage @core v4 (triage)
- `scout` — used by five flows across @core, @alex and @growth

A step that names both an agent and a skill counts as a use of each. The count drives the rail meta (`4 uses`), the rail dot, and the removal block.

## Cost and memory per capability

- **Spend per step definition** — the drawio card *Spend per step definition* (page *FlowBoard ideation*) asks *"what does `/grill-me` actually cost me?"*; the feature map: *"per step (so you can see what a particular skill really costs you)"*.
- **Agent/skill memory scope** — what a role or skill has picked up across runs, recalled into its next prompt as part 7 (where in the prompt is [[Capability Library Open Questions]] #17). See [[Agent Memory Scope]].

## Related

- [[Capability Library Decisions]]
- [[Capability Versus Provider Pack]]
- [[Capability Data Model]]
- [[Capability Runtime Mounting]]
- [[Bundle Packs]]
- [[Step Kinds]]
