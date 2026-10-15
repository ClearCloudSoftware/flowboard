---
tags: [flowboard, capability-library, concept]
module: Capability Library
---

# Capability Kinds

The library holds three kinds of capability. The rail groups by kind, and the kind filter narrows to one.

> [!check] v1 has two kinds
> v1 ships `skill` and `agent` only; `pack` is deferred ([[Capability Library Decisions|D3]]). Skills arrive inside a **plugin**, the unit of install (D4): a plugin row carries the source and commit, and its skills hang off it. Agents are defined in the library or seeded from FlowBoard's repo.

| Kind | Is | Carries | Reach for it when |
|---|---|---|---|
| `skill` | A packaged instruction, invoked like a slash command | A `SKILL.md` declaring what it does, what it produces, and the tools it may use | A step needs a repeatable **procedure** — review this diff, scan for secrets, write a plan |
| `agent` | A named role | A prompt, default model and effort, and an allowed-tools list. Meant to be provider-neutral apart from the model id, which should be a logical id the adapter maps (the PRD still stores a native one) | A step needs a **who** rather than a **how** — the reviewer, the architect, the scout |
| `pack` | A bundle | Skills, agents and flows bundled as one installable unit | You want a whole way of working at once — the delivery starter set, or the security team's expectations |

## Visual identity

In the detail header each kind has a chip:

- `skill` — teal (the "run" colour)
- `agent` — ink outline
- `pack` — amber

## What the detail pane shows per kind

| Section | skill | agent | pack |
|---|---|---|---|
| Packs per provider | yes | yes | yes |
| `SKILL.md` manifest, invoked-as, format | yes | — | — |
| Defaults (model, effort) | — | yes | — |
| Prompt | — | yes | — |
| Contains (skills / agents / flows) | — | — | yes |
| Tools it may use | yes | yes | — |
| Source (repository, commit) | yes — the plugin's | — (the record has none; a pack it came in carries the source) | yes |
| Used by | per step | per step | whole pack |

## Related

- [[Skill Capabilities]]
- [[Agent Capabilities]]
- [[Bundle Packs]]
- [[Capability Library Screen]]
