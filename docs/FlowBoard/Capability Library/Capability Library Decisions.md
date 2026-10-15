---
tags: [flowboard, capability-library, decisions]
module: Capability Library
decided: 2026-10-15
---

# Capability Library Decisions

The v1 design, settled in a grilling session on 2026-10-15 that worked through [[Capability Library Open Questions]]. Where a decision overrides a source (PRD, backlog, architecture, mockup), the other notes say so and link here.

> [!summary] v1 in one paragraph
> Claude-only, with the provider seam kept in the port. The unit of install is a **plugin** cloned from any git URL into a per-project, gitignored store, one directory per commit. Steps reference skills (invoked `/<plugin>:<slug>`) or agents. A task pins the plugin commits and agent rows it starts with, so updates never reach a running task. No bundle packs, no provider coverage UI.

## Scope

| # | Decision | Resolves |
|---|---|---|
| D1 | **v1 is Claude-only.** The `CapabilityPack` seam stays in the port and `provider` is stored on plugin rows, but there is no coverage counter, provider filter, provider-packs block or provider-match check. | OQ5, OQ6, OQ13 (moot in v1) |
| D2 | **`CapabilityPack` is data**: the `mount` union (`plugin_dir` / `system_prompt` / `native`) that the adapter interprets. A registry stores rows, not behaviour. | OQ14 |
| D3 | **No bundle packs in v1.** Seeds ship from FlowBoard's own repo instead of a Delivery pack. | OQ7 (moot in v1) |

## Install and storage

| # | Decision | Resolves |
|---|---|---|
| D4 | **The plugin is the unit of install.** A `plugins` row (source, commit, dir) is what gets installed, updated and removed; `skills` rows hang off it; steps reference skills. One commit per plugin. | OQ3 |
| D5 | **Per-project, gitignored store**: `<project>/.flowboard/skills/<plugin>/<commit>/`. Not committed, so no writable copy lands in a task worktree and clones stay out of project history. | OQ1 |
| D6 | **Seeds are copied into each project's store** on project registration and on FlowBoard upgrade, filed under FlowBoard's commit (`<plugin>/<fb-sha>/`). Seeds and git installs share one code path. | OQ1 |
| D7 | **Install accepts any git URL**, including `file:///…`. A local repo gets a real commit; there is no "local" source and no content hashing. A dirty working tree does not install — commit, then update. | — |
| D8 | **Plugin contents are mounted as-is**: hooks, agents, commands and `.mcp.json` included. Containment comes from the sandbox (D14), not from filtering. | — |
| D9 | **Amber also marks plugins with `.mcp.json` or `hooks/`**, alongside the `Bash` / `WebFetch` / `WebSearch` tool set. One file-exists check at install; the preview stays as designed. | OQ12 (partly) |

## Versioning

| # | Decision | Resolves |
|---|---|---|
| D10 | **Tasks pin capabilities.** At task start the task records `capability_pins`: the commit of every plugin it can mount and a copy of every agent row it can use. Every step of that task runs those versions. Flows stay unpinned: an update reaches every flow on its next *task*, never mid-task. | OQ4 |
| D11 | **Garbage collection.** A commit dir is deleted once no non-terminal task pins it and it is not the installed commit. Checked after each update and each task reaching a terminal state. | — |
| D12 | **Seed changes arrive as updates.** A FlowBoard upgrade stages the new seed commit and shows the amber *update available* dot; nothing changes until you click. Seeded agents are files in FlowBoard's repo and take the same path. | — |
| D13 | **Updates are checked manually**: one **Check for updates** action per project. No polling, no fetch on screen open. | OQ8 |

## Running

| # | Decision | Resolves |
|---|---|---|
| D14 | **A run mounts only what the step names**: the plugin of the step's skill, plus the step's `extra_plugin_ids`. Agent steps mount only their extras. Mounts are read-only into the container. PRD §7 mounts every installed plugin into every run; this overrides it. | OQ15 |
| D15 | **Host tier fails closed for git-sourced plugins.** Without Docker, a step whose plugins (skill or extras) came from a git URL does not run. Seeds still run on the host tier. | — |
| D16 | **Skills are invoked fully qualified**: `/<plugin>:<slug>`, which is how Claude Code namespaces plugin skills. Two plugins may both ship `code-review`. Add to backlog Story 0.1 (probe the CLI): confirm the qualified form invokes reliably in headless `-p` mode. | — |

## Removal and usage

| # | Decision | Resolves |
|---|---|---|
| D17 | **"Used by" counts** each flow's latest version, plus any flow version pinned by a non-terminal task. Old, unpinned flow versions do not block removal. `extra_plugin_ids` count as uses. | — |
| D18 | **Remove asks for confirmation** (PRD), and stays disabled while anything uses the plugin. | — |
| D19 | **An update that drops an in-use skill is refused.** The update preview lists added and removed skills; if a removed skill is in use (D17), the update is blocked, same rule as Remove. | — |

## Agents and seeds

| # | Decision | Resolves |
|---|---|---|
| D20 | **`default_model` stores Claude aliases** (`opus` / `sonnet` / `haiku`) and treats them as the logical ids; `resolveModel` passes them through for Claude. The mapping arrives with the second provider. | — |
| D21 | **Define agent is a plain form** with the PRD fields: name, description, prompt, default model, default effort, allowed tools. Seeded agents are read-only, with **Duplicate to edit**. | OQ10 |
| D22 | **Seed set: mockup names, PRD contracts.** Mockup roles (`scout`, `architect`, `developer`, `tester`, `reviewer`, `scribe`) with the PRD skills that encode engine contracts kept: `ask-three`, `grill-me` (`ask_user_batch`, `no_answer_yet`), `code-review` (must call `set_outcome`). The seed flow's `implement` step stays the skill `/ponytail`. | OQ11 |

## Schema

D23 — as written in [[Capability Data Model#v1 schema (decided)]]: `plugins`, `skills` (child of a plugin), `agents` scoped by project, `step_defs.extra_plugin_ids`, `tasks.capability_pins`. `install_path` and `frontmatter` are dropped: the dir is derived and the disk is the source of truth. Resolves OQ2 and the backlog's *"show stored frontmatter or stop storing it"*.

## API

D24 — derived from the decisions above; see [[Capability Library API And Routes]]. Resolves OQ9.

## Deferred

- **A second provider** (Codex): provider packs, the coverage counter, the provider filter, the provider-match check and its block-vs-warn severity. See [[Provider Coverage And Portability]].
- **Bundle packs** and role starter packs. See [[Bundle Packs]].
- **ACP** (OQ16): re-check pack mounting if the `AgentProvider` port becomes the Agent Client Protocol.
- The roadmap ideas: governed shared library, team guardrails, install permissions, agent/skill memory.

## Source docs to fix

The decisions leave these source documents wrong or stale:

- PRD §7 (`--plugin-dir <each installed skill's install_path>`) and backlog Story 3.2 mount every installed plugin; D14 mounts only the step's.
- PRD §5 `skills.slug UNIQUE` is global; D23 scopes skills by plugin and plugins by project.
- PRD §13 / Story 7.1 install into `./skills/<slug>` from a GitHub URL; D5 moves installs to `<project>/.flowboard/skills/`, and D7 accepts any git URL. Drop the root `.gitignore` rule `skills/_installed/` (and backlog Story 0.3's mention of it).
- PRD §7 prompt slot 4 writes bare `/slug`; D16 invokes `/<plugin>:<slug>`.
- PRD §5 `agents.default_model DEFAULT 'sonnet'` is fine under D20, but `agents` needs `project_id`.
- `08-sandboxing.md` lists no skills mount; D14 adds read-only plugin mounts.
- Remaining drift from OQ17 (drawio memory order, `tool_hooks` missing from `agent-provider.ts`) is unchanged by these decisions. The `--add-dir`, eight-step and git-remote drift was fixed in commits `198e7de` and `c4b01fd`.

## Related

- [[Capability Library Open Questions]]
- [[Capability Library Index]]
- [[Capability Library Roadmap]]
- [[Capability Data Model]]
