---
tags: [flowboard, capability-library, roadmap]
module: Capability Library
---

# Capability Library Roadmap

## v1 scope

From the feature map (§16 *The library*), the PRD milestone **M7 — Library and import**, and backlog **Epic 7**:

- [ ] **Install skills** — feature map: *"Add a skill from a public repository; FlowBoard reads its description and makes it available to use in steps"*; M7: *"Skills install from GitHub"*
- [ ] Update and remove (with confirm)
- [ ] **Define agents** — CRUD form; builtin agents read-only, with Duplicate to edit (backlog Story 7.2)
- [ ] **A starter set** of skills and agents so sample recipes work
- [ ] Loading and empty states (backlog BUG)
- [ ] Stop storing frontmatter: read `SKILL.md` from the plugin dir when shown (backlog GAP)
- [ ] One error-handling style for agent create and update (backlog BUG)

Settled on 2026-10-15 ([[Capability Library Decisions]]), v1 also takes on:

- [ ] **Plugins as the unit of install**, from any git URL, into `<project>/.flowboard/skills/<plugin>/<commit>/` (D4, D5, D7)
- [ ] **Task capability pins** and commit-dir garbage collection (D10, D11)
- [ ] **Check for updates**, update preview with added/removed skills, refusal when an in-use skill is dropped (D13, D19)
- [ ] Mount only the step's plugins, read-only; fail closed on the host tier for git plugins (D14, D15)
- [ ] Fully qualified invocation `/<plugin>:<slug>` — verify in backlog Story 0.1 (D16); the headless probe passed on 2026-10-18 ([[Capability Library Open Questions]] #19)
- [ ] Amber for `.mcp.json` / `hooks/` (D9)
- [ ] **Duplicate to edit** for seeded agents (D21)

M7 and Epic 7 also cover markdown backlog import (Story 7.3). That half is not a library feature and is left out here.

Prerequisite already found the hard way: `--plugin-dir`, not `--add-dir`, registers `/slug` (backlog Story 0.1 *Probe the CLI*, FIX — verify before building). As built (2026-10-18), the Claude Code adapter mounts plugins this way, through the Agent SDK's `plugins` option, and fails a run whose plugin does not load ([[Claude Code Adapter]]).

## Designed in the mockup, beyond the PRD

Of these, v1 builds the single screen, preview-before-install, amber marks, update detection (manual, D13), used-by and blocked removal. Provider packs and the coverage ratio (D1) and bundle packs (D3) are deferred.

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
- **Role starter packs** — a seed flow plus toolbox per function (UX/UI, business analyst, cloud/DevOps, QA, marketing…). Whether each one is a bundle pack is open: [[Flow Design Open Questions]] #35. See [[Bundle Packs]].
- **Permissions** — the teams foundation names *install skills* as one of the actions roles gate.
- **Agent/skill memory** — a memory scope per agent or skill: what that role has picked up across runs (feature map §21, PRD §11.2, M9). See [[Agent Memory Scope]].
- **Team contributions** — the pitch's investment model: *"engineers contribute flows, agents, and skills (the seeded library shows the shape)"* (emphasis dropped).
- **Reuse across projects** — flows *"exportable across projects"* (`02` §2), the backlog's *Reuse…* picker (Story 8.2) and the feature map's *shareable recipe library*. With a per-project store this needs a rule for missing plugins and agents: [[Capability Library Open Questions]] #20.

## Adding a second provider

To run flows on Codex (`06-cost-and-platform.md`), one of four steps is: *Codex-format `CapabilityPack`s for any skills used by flows targeting it.* The seeded Claude plugin dirs are the reference implementation for that format.

As built, the provider layer's second provider is OpenCode (2026-10-18), and it needed no new pack format: it reads a Claude plugin dir's `skills/` folder. Codex is designed, not built. Whether OpenCode is in v1, and whether Codex is still next, is [[Agent Providers Open Questions]] #38.

## Out of scope (v1)

The PRD (§17) and the drawio *Out of scope (v1)* box both exclude a **plugin marketplace**. Install is from a pasted git URL only: GitHub or `file://` (D7).

## Adjacent direction: knowledge assets

The harness diagram shows *Knowledge assets (later)* next to the capability library in durable state: repomix pack, Serena index, `graphify-out/`, stamped with the build SHA and refreshed by scheduled shell-step flows. Not part of the library, but stored alongside it.

## Related

- [[Capability Library Decisions]]
- [[Capability Library Overview]]
- [[Capability Library Open Questions]]
- [[Seeded Capabilities]]
- [[Memory Roadmap]]
