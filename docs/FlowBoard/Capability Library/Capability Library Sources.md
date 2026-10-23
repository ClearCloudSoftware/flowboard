---
tags: [flowboard, capability-library, sources]
module: Capability Library
---

# Capability Library Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Which version
> The first grounding pass (2026-10-15) checked an uncommitted working tree. Those edits are committed now; the second pass checked the sources as of commit `49c7d97` on `dev`.

## Decisions

[[Capability Library Decisions]] records the v1 design settled in a grilling session on 2026-10-15. It is not grounded in a file; where it overrides a source below, the notes say so and cite the decision number (D1–D31). The PRD, backlog, `.gitignore` and `08-sandboxing.md` were then updated to match, so notes that cite them describe the corrected text.

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/capability-library.html` | The screen; sample catalogue (7 skills, 7 agents, 3 packs); install dialog; derived values; network-tool set |
| `docs/mockups/capability-library-guide.html` | Field guide: anatomy, capability vs pack, kinds, marks, tools and egress, install walkthrough (both branches), pinning table, every control |
| `docs/flowboard-ideation.drawio` | *Functional components*: Capability library group and its edge to Flow design. *FlowBoard ideation*: Skills & agents (`/skills`, `/agents`), capability packs, the *Out of scope (v1)* box (*"plugin marketplace"*). *Logical components*: Skills & agents → Disk. *Harness architecture*: durable-state store, `ro` `/skills` mount, GitHub install edge |
| `docs/old/architecture/05-environment-and-registry.md` §13 | Skill/Agent registry → Capability packs: the seam, `CapabilityPack`, provider-tagged install, seed idea |
| `docs/old/reference/core/ports/agent-provider.ts` | `CapabilityPack`, mount kinds, open `ProviderId`, `RunSpec.capabilities` and `toolPolicy`, `plugins` capability flag, the six-field `PromptParts` (part 4 as `"/grill-me"`) |
| `.gitignore` | `skills/_installed/` (removed on 2026-10-15) |
| `code/flowboard/packages/{core,adapters,cli}/src` and `adapters/test/`, checked 2026-10-22 | The "as built" notes: the shipped port (`ProviderId` with `opencode`, `tool_hooks`, part 4 fully qualified); how the Claude Code and OpenCode adapters mount packs, pre-approve the `flowboard` ask-user server and place the invocation; `run-agent`'s `local` skills plugin and log; the live `/<plugin>:<slug>` tests. The Agent SDK 0.3.302 docs and the Claude Code 2.1.302 binary for plugin MCP servers under `--strict-mcp-config` |

## Secondary

| File | What it contributes |
|---|---|
| `docs/feature-map.md` §2, §16, §21, *Across everything*, parking lot, appendix | Library features and ideas; skill-or-agent steps; the research pipeline; agent/skill memory; *install skills* as a gated permission; the shareable recipe library; role starter packs |
| `docs/old/PRD.MD` §4, §5, §7, §11, §11.1, §11.2, §12, §13, §14 (M7, M9), §15, §17 | Agent-and/or-skill steps; schema (`plugins`, `skills`, `agents`, `extra_plugin_ids`, `capability_pins`); Claude command (`--plugin-dir`, `--append-system-prompt`, `--strict-mcp-config`, `--settings` hooks) and prompt builder incl. part 7 *before* the closing instruction; the tester's `tests/` scoping; read-only plugin mounts and the host-tier refusal; part 7 *appended at the end*; the v1 API; `/p/[slug]/library` and *Dark-first*; seed data; out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Intro item 6 (*Environment leaks*); Story 0.1 `--plugin-dir` fix and the `/<plugin>:<slug>` probe; Story 0.3 `.flowboard/skills/` in `.git/info/exclude`; Story 1.2 seeds and flow templates; Story 3.2 per-step mounts; Story 3.5 egress; Epic 7 library stories; Story 8.2 inspector and *Reuse…* picker; Story 9.1 light default; decision D5 (empty `--settings`) |
| `docs/old/architecture/README.md` | Component index #13; open decision 2 (ACP) |
| `docs/old/architecture/01-ports.md` | Capability negotiation (incl. `tool_hooks`, warning severity), logical model ids, `toolPolicy`, ACP proposal |
| `docs/old/architecture/02-core-and-engine.md` | `skills` gains `provider` + `format`; capability contract; flows *"exportable across projects"* |
| `docs/old/architecture/03-execution-substrate.md` | §5 `--plugin-dir` fix; §6 PreToolUse in-agent gate, part 7 *appended*, recall cap, `spec.json` snapshot |
| `docs/old/architecture/06-cost-and-platform.md` | Codex-format packs as a step to adding Codex |
| `docs/old/architecture/08-sandboxing.md` | Default-deny egress allowlist, mount only the worktree |
| `docs/old/architecture/09-memory.md` | Agent/skill memory scope (`agentId`), part 7 *before* the closing instruction, its cap |
| `docs/old/stream-sample.jsonl` | The native model id (`claude-fable-5-1`), which is not the `sonnet` alias |
| `docs/pitch.md` | Engineers contribute *flows, agents, and skills*; *"the seeded library shows the shape"* |
| `docs/mockups/task-detail*.html`, `docs/mockups/inbox*.html`, `docs/mockups/monitor.html` | The `$0.48` and `$1.44` egress failures; *Allow host & retry* |
| `docs/mockups/flow-designer*.html` | Flow library rail; domains from role starter packs |
| `docs/mockups/README.md` | Summary of the library mockup and guide |

## Related

- [[Capability Library Index]]
- [[Capability Library Open Questions]]
