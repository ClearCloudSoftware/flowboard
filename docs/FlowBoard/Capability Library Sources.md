---
tags: [flowboard, capability-library, sources]
module: Capability Library
---

# Capability Library Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/capability-library.html` | The screen; sample catalogue (7 skills, 7 agents, 3 packs); install dialog; derived values; network-tool set |
| `docs/mockups/capability-library-guide.html` | Field guide: anatomy, capability vs pack, kinds, marks, tools and egress, install walkthrough (both branches), pinning table, every control |
| `docs/flowboard-ideation.drawio` | *Functional components*: Capability library group and its edge to Flow design. *FlowBoard ideation*: Skills & agents (`/skills`, `/agents`), capability packs. *Logical components*: Skills & agents → Disk. *Harness architecture*: durable-state store, `ro` `/skills` mount, GitHub install edge, out-of-scope marketplace |
| `docs/old/architecture/05-environment-and-registry.md` §13 | Skill/Agent registry → Capability packs: the seam, `CapabilityPack`, provider-tagged install, seed idea |
| `docs/old/reference/core/ports/agent-provider.ts` | `CapabilityPack`, mount kinds, `RunSpec.capabilities`, `plugins` capability flag |

## Secondary

| File | What it contributes |
|---|---|
| `docs/feature-map.md` §2, §16, appendix | Library features and ideas; skill-or-agent steps; role starter packs |
| `docs/old/PRD.MD` §5, §7, §12, §13, §15 | Schema, runner flags, API, `/skills` and `/agents` UI, seed data |
| `docs/old/REBUILD-BACKLOG.md` | `--plugin-dir` fix, Story 1.2 seeds, Epic 7 library stories |
| `docs/old/architecture/01-ports.md` | Capability negotiation, logical model ids |
| `docs/old/architecture/02-core-and-engine.md` | `skills` gains `provider` + `format`; capability contract |
| `docs/old/architecture/06-cost-and-platform.md` | Codex-format packs as a step to adding Codex |
| `docs/old/architecture/08-sandboxing.md` | Default-deny egress allowlist |
| `docs/mockups/task-detail*.html`, `docs/mockups/inbox-guide.html` | The `$0.48` and `$1.44` egress failures; *Allow host & retry* |
| `docs/mockups/flow-designer*.html` | Flow library rail; domains from role starter packs |
| `docs/mockups/README.md` | Summary of the library mockup and guide |

## Related

- [[Capability Library Index]]
