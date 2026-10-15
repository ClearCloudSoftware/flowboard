---
tags: [flowboard, capability-library, sources]
module: Capability Library
---

# Capability Library Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Working tree, not HEAD
> When these notes were checked (2026-10-15), the PRD, backlog, feature map, several architecture docs and the drawio had uncommitted edits — the whole *Harness architecture* drawio page among them. The notes follow the working tree.

## Decisions

[[Capability Library Decisions]] records the v1 design settled in a grilling session on 2026-10-15. It is not grounded in a file; where it overrides a source below, the notes say so and cite the decision number (D1–D24).

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/capability-library.html` | The screen; sample catalogue (7 skills, 7 agents, 3 packs); install dialog; derived values; network-tool set |
| `docs/mockups/capability-library-guide.html` | Field guide: anatomy, capability vs pack, kinds, marks, tools and egress, install walkthrough (both branches), pinning table, every control |
| `docs/flowboard-ideation.drawio` | *Functional components*: Capability library group and its edge to Flow design. *FlowBoard ideation*: Skills & agents (`/skills`, `/agents`), capability packs. *Logical components*: Skills & agents → Disk. *Harness architecture*: durable-state store, `ro` `/skills` mount, GitHub install edge, out-of-scope marketplace |
| `docs/old/architecture/05-environment-and-registry.md` §13 | Skill/Agent registry → Capability packs: the seam, `CapabilityPack`, provider-tagged install, seed idea |
| `docs/old/reference/core/ports/agent-provider.ts` | `CapabilityPack`, mount kinds, open `ProviderId`, `RunSpec.capabilities` and `toolPolicy`, `plugins` capability flag |
| `.gitignore` | `skills/_installed/` |

## Secondary

| File | What it contributes |
|---|---|
| `docs/feature-map.md` §2, §16, appendix | Library features and ideas; skill-or-agent steps; role starter packs |
| `docs/old/PRD.MD` §5, §7, §11.2, §12, §13, §15, §17 | Schema; Claude command (`--plugin-dir`, `--append-system-prompt`, `--strict-mcp-config`, `--settings` hooks) and prompt builder incl. the memory part; API; `/skills` and `/agents` UI; seed data; out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Story 0.1 and 3.2 `--plugin-dir` fix, Story 1.2 seeds and flow templates, Story 3.5 egress, Epic 7 library stories, Story 8.2 inspector |
| `docs/old/architecture/01-ports.md` | Capability negotiation (incl. `tool_hooks`, warning severity), logical model ids, `toolPolicy`, ACP proposal |
| `docs/old/architecture/02-core-and-engine.md` | `skills` gains `provider` + `format`; capability contract |
| `docs/old/architecture/03-execution-substrate.md` | PreToolUse in-agent gate, memory recall cap |
| `docs/old/architecture/06-cost-and-platform.md` | Codex-format packs as a step to adding Codex |
| `docs/old/architecture/08-sandboxing.md` | Default-deny egress allowlist, mount only the worktree |
| `docs/old/architecture/09-memory.md` | Agent/skill memory scope, placement and cap of the recalled-memory part |
| `docs/mockups/task-detail*.html`, `docs/mockups/inbox-guide.html` | The `$0.48` and `$1.44` egress failures; *Allow host & retry* |
| `docs/mockups/flow-designer*.html` | Flow library rail; domains from role starter packs |
| `docs/mockups/README.md` | Summary of the library mockup and guide |

## Related

- [[Capability Library Index]]
