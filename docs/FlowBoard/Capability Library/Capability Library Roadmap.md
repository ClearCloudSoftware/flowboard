---
tags: [flowboard, capability-library, roadmap]
module: Capability Library
---

# Capability Library Roadmap

## v1 scope

From the feature map (§16 *The library*), the PRD milestone **M7 — Library and import**, and backlog **Epic 7**:

- [ ] **Install skills** from a GitHub URL; FlowBoard reads the description and makes the skill available in steps
- [ ] Update and remove (with confirm)
- [ ] **Define agents** — CRUD form; builtin agents read-only
- [ ] **A starter set** of skills and agents so sample recipes work
- [ ] Loading and empty states (backlog BUG)
- [ ] Show stored frontmatter or stop storing it (backlog GAP)
- [ ] One error-handling style for agent create and update (backlog BUG)

Prerequisite already found the hard way: `--plugin-dir`, not `--add-dir`, registers `/slug` (backlog Story 0.1 *Probe the CLI*, FIX — verify before building).

## Designed in the mockup, beyond the PRD

- Single library screen for skills, agents and packs
- **Provider packs** per capability and the Codex coverage ratio
- **Bundle packs** (skills + agents + flows as one unit)
- Preview-before-install dialog with tool and provider checks
- Amber network-tool marks tied to the egress allowlist
- **Update available** detection against the installed commit, with an update note
- **Used by** and blocked removal

## Ideas (feature map)

- **A shared, governed library** — teammates publish flows, agents and skills the whole team draws from, with an owner who controls who can change the "golden" recipes.
- **Team guardrails vs personal defaults** — team-pinned rules nobody can quietly lift, separate from personal preferences.
- **Role starter packs** — a bundle per function (UX/UI, business analyst, cloud/DevOps, QA, marketing…). See [[Bundle Packs]].
- **Permissions** — the teams foundation names *install skills* as one of the actions roles gate.
- **Agent/skill memory** — a memory scope per agent or skill: what that role has picked up across runs.

## Adding a second provider

To run flows on Codex (`06-cost-and-platform.md`), one of four steps is: *Codex-format `CapabilityPack`s for any skills used by flows targeting it.* The seeded Claude plugin dirs are the reference implementation for that format.

## Out of scope (v1)

The PRD and the drawio *Out of scope (v1)* box both exclude a **plugin marketplace**. Install is from a pasted GitHub URL only.

## Adjacent direction: knowledge assets

The harness diagram shows *Knowledge assets (later)* next to the capability library in durable state: repomix pack, Serena index, `graphify-out/`, stamped with the build SHA and refreshed by scheduled shell-step flows. Not part of the library, but stored alongside it.

## Related

- [[Capability Library Overview]]
- [[Capability Library Open Questions]]
- [[Seeded Capabilities]]
