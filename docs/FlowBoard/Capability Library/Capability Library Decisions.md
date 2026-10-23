---
tags: [flowboard, capability-library, decisions]
module: Capability Library
decided: 2026-10-15
---

# Capability Library Decisions

The v1 design, settled in a grilling session on 2026-10-15 that worked through [[Capability Library Open Questions]]. Where a decision overrides a source (PRD, backlog, architecture, mockup), the other notes say so and link here.

> [!summary] v1 in one paragraph
> Claude-only, with the provider seam kept in the port. The unit of install is a **plugin** cloned from any git URL into a per-project, gitignored store, one directory per commit. Steps name an agent (who), a skill (how, invoked `/<plugin>:<slug>`) or both. A task pins the plugin commits and agent rows it starts with, so updates never reach a running task. No bundle packs, no provider coverage UI.

## Scope

| # | Decision | Resolves |
|---|---|---|
| D1 | **v1 is Claude-only.** The `CapabilityPack` seam stays in the port; the provider is implied (`claude`) rather than stored, so the schema has no `provider` column (D23). There is no coverage counter, provider filter, provider-packs block or provider-match check. | OQ5, OQ6, OQ13 (moot in v1) |
| D2 | **`CapabilityPack` is data**: the `mount` union (`plugin_dir` / `system_prompt` / `native`) that the adapter interprets. A registry stores rows, not behaviour. | OQ14 |
| D3 | **No bundle packs in v1.** Seeds ship from FlowBoard's own repo instead of a Delivery pack. | OQ7 (moot in v1) |

> [!warning] The shipped code differs
> The build overtook D1: on 2026-10-18 the provider layer gained OpenCode as a second real provider beside Claude Code ([[OpenCode Adapter]]); Codex is designed, not built. Whether OpenCode is in v1, and whether Codex is still next, is [[Agent Providers Open Questions]] #38, which is open. The library parts D1 removes are not built either way.

## Install and storage

| # | Decision | Resolves |
|---|---|---|
| D4 | **The plugin is the unit of install.** A `plugins` row (source, commit, dir) is what gets installed, updated and removed; `skills` rows hang off it; steps reference skills. One commit per plugin. | OQ3 |
| D5 | **Per-project, gitignored store**: `<project>/.flowboard/skills/<plugin>/<commit>/`. Not committed, so no writable copy lands in a task worktree and clones stay out of project history. | OQ1 |
| D6 | **Seeds are copied into each project's store** on project registration and on FlowBoard upgrade, filed under FlowBoard's commit (`<plugin>/<fb-sha>/`). Seeds and git installs share one code path. | OQ1 |
| D7 | **Install accepts any git URL**, including `file:///…`. A local repo gets a real commit; there is no "local" source and no content hashing. A dirty working tree does not install — commit, then update. | — |
| D8 | **Plugin contents are mounted as-is**: hooks, agents, commands and `.mcp.json` included. Containment comes from the sandbox (D14), not from filtering. | — |
| D9 | **Amber also marks plugins with `.mcp.json` or `hooks/`**, alongside the `Bash` / `WebFetch` / `WebSearch` tool set. One file-exists check at install; the preview stays as designed. | OQ12 (partly) |

> [!warning] The shipped code differs
> As built (checked 2026-10-22), a mounted plugin's MCP servers do not start, so D8's `.mcp.json` part does not hold today. The Claude Code adapter sets `strictMcpConfig: true` on every run, and under `--strict-mcp-config` the CLI connects no plugin MCP servers (Agent SDK 0.3.302 docs; Claude Code 2.1.302). OpenCode mounts only a plugin's `skills/` folder. See [[Capability Runtime Mounting]].

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
| D14 | **A run mounts only what the step names**: the plugin of the step's skill, plus the step's `extra_plugin_ids`. A step without a skill mounts only its extras. Mounts are read-only into the container. PRD §7 mounted every installed plugin into every run; this overrides it, and PRD §7 now follows. | OQ15 |
| D15 | **Host tier fails closed for git-sourced plugins.** Without Docker, a step whose plugins (skill or extras) came from a git URL does not run. Seeds still run on the host tier. | — |
| D16 | **Skills are invoked fully qualified**: `/<plugin>:<slug>`, which is how Claude Code namespaces plugin skills. Two plugins may both ship `code-review`. Backlog Story 0.1 (probe the CLI) is to confirm that the qualified form invokes reliably in headless `-p` mode (**DEC**) — open question 19. The build's live test confirmed it on 2026-10-18 ([[Claude Code Adapter]]). | — |

## Removal and usage

| # | Decision | Resolves |
|---|---|---|
| D17 | **"Used by" counts** each flow's latest version, plus any flow version pinned by a non-terminal task. Old, unpinned flow versions do not block removal. `extra_plugin_ids` count as uses. | — |
| D18 | **Remove asks for confirmation** (backlog Story 7.1: *"remove with confirm"*; PRD §13 now follows), and stays disabled while anything uses the plugin. | — |
| D19 | **An update that drops an in-use skill is refused.** The update preview lists added and removed skills; if a removed skill is in use (D17), the update is blocked, same rule as Remove. | — |

## Agents and seeds

| # | Decision | Resolves |
|---|---|---|
| D20 | **`default_model` stores Claude aliases** (`opus` / `sonnet` / `haiku`) and treats them as the logical ids; `resolveModel` passes them through for Claude. The mapping arrives with the second provider. As built, OpenCode, the second provider built, resolves through its own `models` table, which `run-agent` leaves empty, so no shared mapping exists ([[Logical Model Ids]]). | — |
| D21 | **Define agent is a plain form** with the PRD fields: name, description, prompt, default model, default effort, allowed tools. Seeded agents are read-only, with **Duplicate to edit**. | OQ10 |
| D22 | **Seed set: mockup names, PRD contracts.** Mockup roles (`scout`, `architect`, `developer`, `tester`, `reviewer`, `scribe`) with the PRD skills that encode engine contracts kept: `ask-three`, `grill-me` (`ask_user_batch`, `no_answer_yet`), `code-review` (must call `set_outcome`). ~~The seed flow's `implement` step stays the skill `/ponytail`.~~ Superseded by D27: `implement` is `developer` + `/ponytail`. `ask-three` moved out of the seeds by D30. | OQ11 |

## Seeds and steps

Settled in a second grilling session on 2026-10-15, working through open question 18.

| # | Decision | Resolves |
|---|---|---|
| D25 | **The seeds are exactly what the seed flow uses.** Nothing ships unused, so no seed starts with a hollow *used by nothing* dot telling a new user to remove it. | OQ18 |
| D26 | **The seed flow is *Software delivery*:** the PRD's nine steps with the mockup's role names, keeping the `explain` approval gate (the cheap point to stop a bad plan before two opus-high steps run) and the PRD step keys. | OQ18 |
| D27 | **A step can name an agent, a skill, or both.** `step_defs.kind` becomes `ai \| shell \| manual`; an `ai` step sets `agent_id`, `skill_id` or both. The agent supplies the system prompt (who), the skill the slash invocation (how). Pairs: `plan` = `architect` + `/plan-implementation`, `implement` = `developer` + `/ponytail`, `review` = `reviewer` + `/code-review`; `research` = `scout`, `tests` = `tester`, `summarize` = `scribe`; `grill` and `explain` are skill-only. A step naming both counts as a use of each. | OQ18 |
| D28 | **Tools are agent ∩ skill**, narrowed further by the step's `allowed_tools` when set. The flow editor warns at design time when the intersection drops a tool the skill declares; `mcp__vibe__*` is always appended (as built, `mcp__flowboard__*`, added by the adapter: [[Claude Code Adapter]]). `tester` writes tests for the acceptance criteria; `check` runs them. | — |
| D29 | **`scout` gets `Read, Grep` only.** It researches the repo, so the first step of every task never fails closed on egress. | OQ18 |
| D30 | **Not seeds:** `backlog-importer` is internal to markdown import and never appears in the library; `ask-three` is a test fixture. | OQ18 |
| D31 | **The `researcher` flow template is out of v1**, with `web-researcher`, `research-summarizer` and `fact-checker`, until open-web research has an egress answer (for example a search-API host on the allowlist). | OQ18 |

## Schema

D23 — as written in [[Capability Data Model#v1 schema (decided)]]: `plugins`, `skills` (child of a plugin), `agents` scoped by project, `step_defs.extra_plugin_ids`, `tasks.capability_pins`. `install_path` and `frontmatter` are dropped: the dir is derived and the disk is the source of truth. Resolves OQ2 and the backlog's *"show stored frontmatter or stop storing it"* (Story 7.1 now reads *"Stop storing frontmatter"*).

## API

D24 — derived from the decisions above; see [[Capability Library API And Routes]]. Resolves OQ9.

## Deferred

- **A second provider** (Codex): provider packs, the coverage counter, the provider filter, the provider-match check and its block-vs-warn severity. See [[Provider Coverage And Portability]]. The provider layer built OpenCode second instead (see the note under D1).
- **Bundle packs** and role starter packs. See [[Bundle Packs]].
- **ACP** (OQ16): re-check pack mounting if the `AgentProvider` port becomes the Agent Client Protocol.
- The roadmap ideas: governed shared library, team guardrails, install permissions, agent/skill memory ([[Agent Memory Scope]]), reuse across projects (OQ20).

## Source docs to fix

The source documents were brought in line with these decisions on 2026-10-15:

- **PRD §5** — `skills` replaced by `plugins` + `skills` (scoped by plugin, no global slug, no `install_path` or `frontmatter`); `agents` gains `project_id` and `UNIQUE (project_id, slug)`; `step_defs.extra_plugin_ids`; `tasks.capability_pins` (D23).
- **PRD §7** — `--plugin-dir` per plugin the step names, at the pinned commit (D10, D14); prompt slot 4 invokes `/<plugin>:<slug>` (D16).
- **PRD §11.1** — plugin dirs mounted read-only; host tier refuses git-installed plugins (D14, D15).
- **PRD §12, §13, §15** — the v1 API (D24), the per-project library screen (D4–D9, D13, D17–D21), seeds copied per project and updated by click (D6, D12).
- **Backlog** — Story 0.1 probes qualified invocation (D16); Story 0.3 drops `skills/_installed`; Story 3.2 mounts per step; Stories 7.1 and 7.2 follow the library screen.
- **`.gitignore`** — `skills/_installed/` removed.
- **`08-sandboxing.md`** — read-only plugin mounts (D14).

Still open:

- *(Resolved)* The seed decisions D25–D31 were applied to PRD §4, §5, §7, §13, §15 and backlog Stories 1.2 and 8.2 the same day.
- Drift from OQ17 that the decisions do not touch: where recalled memory (prompt part 7) goes — before the closing instruction in PRD §7 and `09-memory.md`, at the end in PRD §11.2, `03` §6 and the drawio *Prompt builder* card; `tool_hooks` missing from the reference `agent-provider.ts` (`docs/old/reference/`; the shipped port has it since 2026-10-18, [[Agent Providers Open Questions]] #1); the reference `PromptParts` still documenting part 4 as `/grill-me` (the shipped port documents it fully qualified, e.g. `/grill-me:grill-me`, since 2026-10-18); and PRD §13's *"running task"* against D17's non-terminal task. The `--add-dir`, eight-step and git-remote drift was fixed in commits `198e7de` and `c4b01fd`.

## Related

- [[Capability Library Open Questions]]
- [[Capability Library Index]]
- [[Capability Library Roadmap]]
- [[Capability Data Model]]
