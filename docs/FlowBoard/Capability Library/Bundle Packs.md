---
tags: [flowboard, capability-library, pack]
module: Capability Library
---

# Bundle Packs

A **bundle pack** (kind `pack`) is skills, agents and flows bundled and shareable as one installable unit. The drawio names the function *"Bundle capability pack — skills + agents + flows as one unit"*.

> [!note] Not a provider pack
> A bundle pack is a *kind* of capability. A provider pack is a *packaging* of any capability for one agent CLI. A bundle pack itself has provider packs (the Delivery pack has a claude 1.0 and a codex 0.5 packaging). See [[Capability Library Glossary]].

## Rules

- **A pack is a bundle, not a wrapper.** Installing one installs every skill, agent and flow inside it.
- **Removing it leaves behind anything a flow still draws on.** The library will not pull the rug out from under a running recipe.
- "Used by" for a pack is per flow, shown as *whole pack* rather than a step name.

## Detail pane

- **contains** — three lists: skills, agents, flows
- the note *"Installing the pack installs all of it. Removing it leaves anything a flow still draws on."*
- packs per provider, source, used by

## Example packs in the mockup

| Pack | Author | Providers | Skills | Agents | Flows |
|---|---|---|---|---|---|
| Delivery pack | @flowboard/core (seeded) | claude 1.0, codex 0.5 | code-review, grill-me, plan-implementation | architect, developer, reviewer, tester, scout, scribe | Software delivery, Code review |
| Security pack | @team-sec | claude 2.0 | secret-scan, threat-model | sec-analyst | Code review, Incident response |
| Marketing pack | @growth | claude 1.2 | release-notes | scout, scribe | Launch campaign, Positioning sprint |

The Delivery pack is *"the starter set. Everything the built-in software pipeline needs, installed as one unit."* The Security pack is *"what the security team expects on anything touching auth or payments."*

## Role starter packs

The feature map describes **role starter packs**, and reading them as an extension of bundle packs is an inference: the feature map never links the two ([[Flow Design Open Questions]] #35). There is one per function (business analyst, UX/UI, cloud/DevOps, QA, marketing…), each carrying that role's flow already wired plus the **skills, tools and design system** the role reaches for, with default models and guardrails.

- Packs are **seed flows, not screenshots** — versioned and editable once adopted.
- The arrows *between* roles are handoffs; one role's output becomes the next role's inbox item.
- The flow designer's library rail files flows by **domain**, and *"domains come from the role starter packs"*.

## Related

- [[Capability Kinds]]
- [[Seeded Capabilities]]
- [[Capability Library Roadmap]]
- [[Capabilities In Flows]]
