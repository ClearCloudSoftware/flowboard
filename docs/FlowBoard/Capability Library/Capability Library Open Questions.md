---
tags: [flowboard, capability-library, decisions]
module: Capability Library
---

# Capability Library Open Questions

Places where the sources disagree or leave a gap. Questions 1–18 were worked through on 2026-10-15; each carries its outcome, and the decisions live in [[Capability Library Decisions]]. The original question text is kept below each outcome. Question 19 needs a probe; 20–26 came out of the second grounding pass and are open.

## 1. Where does the capability store live?

> [!check] **Resolved — D5, D6.** Per-project, gitignored store at `<project>/.flowboard/skills/<plugin>/<commit>/`; seeds copied in under FlowBoard's commit.

`./skills/<slug>` (PRD), `skills/_installed/` (`.gitignore`), `skills/<slug>/…` for seeds (backlog), `~/.flowboard/capabilities` (mockup). Per-repo or per-user? Seeds committed in the repo vs installs in the home directory is a reasonable split, but nothing says so. Note that PRD §13 and Story 7.1 install into `./skills/<slug>`, which the `skills/_installed/` ignore rule does not cover. See [[Capability Storage On Disk]].

## 2. One table or three?

> [!check] **Resolved — D4, D23.** A `plugins` table (the unit of install) with child `skills` rows, plus `agents` scoped by project. No `capability_packs` table in v1.

The PRD has separate `skills` and `agents` tables and no packs. The architecture adds `provider` + `format` to `skills`. The mockup treats skill, agent and pack as kinds of one *capability*, each with several provider packs. Likely shape: a `capabilities` table (kind, author, source, commit) and a `capability_packs` table (capability, provider, version, mount). Undecided. See [[Capability Data Model]].

## 3. What is a pack's version?

> [!check] **Resolved — D1, D4.** One provider and one commit per plugin; the plugin's commit drives *update available*.

The mockup shows per-provider versions (claude 2.1, codex 0.4) but one `commit` per capability. If the Codex pack lives in a different repository, it has its own commit. Which one drives *update available*?

## 4. Should flows pin capability versions?

> [!check] **Resolved — D10.** Flows stay unpinned, but tasks pin plugin commits and agent rows at start, so an update never reaches a running task.

Today: no — an update reaches every flow on its next run, and the UI warns instead. A lockfile-style pin per flow version would make updates safe but would need its own update flow. The current design chooses warning over pinning. Worth confirming deliberately.

## 5. Agents and provider packs

> [!check] **Moot in v1 — D1.** Claude-only, so agents have no pack records.

The mockup gives agents versionless packs, but unevenly: four agents have Claude and Codex packs, three are Claude-only. The architecture says agents are provider-neutral once their default model is a logical id (the PRD stores a Claude alias, `sonnet`, which it now calls *"used as the logical model id"*; see [[Logical Model Ids]]). Does an agent need a pack record at all, or only a model-resolution check?

## 6. How does the pack/step provider check reach the flow editor?

> [!check] **Moot in v1 — D1.** No provider-match check while there is one provider.

Validation is pure functions over graph JSON. It needs the registry's pack list as input. That couples validation to registry state — is that a snapshot passed in, or a port?

## 7. Bundle-pack removal semantics

> [!check] **Moot in v1 — D3.** No bundle packs.

"Removing it leaves behind anything a flow still draws on." Does removing the pack remove its flows? Its unused members? Is the pack's membership kept so a re-install is idempotent?

## 8. Update detection

> [!check] **Resolved — D13.** A manual **Check for updates** per project.

What polls upstream? On demand, on screen open, or scheduled? Network access happens on the host; there is no stated schedule.

## 9. API surface

> [!check] **Resolved — D24.** See [[Capability Library API And Routes]].

The PRD lists four endpoints. The mockup needs preview, confirm, update, delete and usage. See [[Capability Library API And Routes]].

## 10. Define agent UI

> [!check] **Resolved — D21.** A plain form with the PRD fields; seeded agents read-only with **Duplicate to edit**.

The mockup's **+ Define agent** button only selects `architect` and switches the kind filter to Agents — no form is designed. The PRD lists the fields; the screen design is missing.

## 11. Seed set

> [!check] **Resolved — D22, superseded in part by D27 and D30.** Mockup names with the PRD's contract skills kept. `implement` is `developer` + `/ponytail` (D27); `ask-three` is a test fixture, not a seed (D30).

PRD seeds (`researcher`, `planner`, `ponytail`, `explain-simply`…), plus backlog Story 1.2's research agents, differ from the mockup's Delivery pack (`scout`, `architect`, `developer`, `scribe`…). Which is canonical? See [[Seeded Capabilities]].

## 12. Network tools list

> [!check] **Partly resolved — D9.** Plugins shipping `.mcp.json` or `hooks/` are marked amber too. The tool set itself stays fixed, not data-driven.

The mockup treats `Bash` as network-capable alongside `WebFetch` and `WebSearch`. MCP tools that reach the network are not covered. Should the list be data-driven per provider?

## 13. Provider mismatch: block or warn?

> [!check] **Moot in v1 — D1.** Returns with the second provider.

The capability-library mockup and guide say the flow editor refuses to save a step whose provider has no pack for its capability. `01-ports.md` calls a capability-contract violation a design-time **warning**; only the artifact contract rejects the save. `05` gives the provider-match check no severity, and the flow-designer mockup does not implement it. See [[Provider Coverage And Portability]].

## 14. Data or behaviour: what is a `CapabilityPack`?

> [!check] **Resolved — D2.** Data: the `mount` union the adapter interprets.

`05-environment-and-registry.md` §13 gives it a `mount(spec: RunSpec): void` method; `agent-provider.ts` gives it a data union (`plugin_dir` / `system_prompt` / `native`) that the adapter interprets. See [[Capability Data Model]].

## 15. Is the skills directory mounted into the sandbox?

> [!check] **Resolved — D14.** Yes. `claude` runs inside the task's container (PRD §7 *Sandboxed runs*), so the step's plugin dirs are mounted read-only. `08-sandboxing.md` and PRD §11.1 now list the mount. The mount target is still unstated ([[Sandboxing Open Questions]] #22).

The harness diagram mounts `ro skills/ → /skills`. `08-sandboxing.md` says *mount only the worktree (and the declared artifact dir)* and lists no skills mount. If the agent CLI runs inside the sandbox, it needs the plugin dirs. See [[Capability Runtime Mounting]].

## 16. Does ACP change how packs mount?

> [!check] **Deferred.** Revisit if the `AgentProvider` port becomes ACP.

`01-ports.md`, the architecture README (open decision 2), feature map §6 and the drawio propose checking whether the `AgentProvider` port should *be* the Agent Client Protocol. If it does, pack mounting has to be re-checked against what ACP exposes rather than a per-vendor adapter.

## 17. Source documents drift from each other

> [!question] **Partly resolved.** The source docs were fixed on 2026-10-15; the drift below remains. See [[Capability Library Decisions#Source docs to fix]].

- **Where recalled memory (prompt part 7) goes.** Before the closing headless instruction: PRD §7 (*"inserted just before the closing instruction"*) and `09-memory.md` (*"just before the closing headless instruction"*). At the end: PRD §11.2 (*"append them to the prompt as a final part"*), `03` §6 (*"append the hits as a **7th prompt part**"*) and the drawio *Prompt builder* card, which lists *"+7 recalled memory"* after *"6 headless: use ask_user"*. `PromptParts` in `agent-provider.ts` has six fields and no slot for part 7. Same as [[Execution Open Questions]] #51 and [[Memory Open Questions]] #6.
- `01-ports.md` adds the `tool_hooks` flag; `agent-provider.ts` lacks it. Same as [[Agent Providers Open Questions]] #1.
- `agent-provider.ts` still documents prompt part 4 as `Slash invocation for kind='skill', e.g. "/grill-me".`; PRD §7 now invokes `/<plugin>:<slug>` for any step that names a skill (D16, D27).
- PRD §13 blocks Remove for *"any version a running task pins"*; D17 counts versions pinned by any **non-terminal** task, which includes blocked and parked ones.

## 18. Which seeds does D22 leave out?

> [!check] **Resolved — D25–D31.** The seeds are exactly what the seed flow uses. `explain-simply` stays as the `explain` approval step; `backlog-importer` is internal to import; the research template and its agents are out of v1; `ask-three` is a test fixture. Settling it also let a step name an agent and a skill together (D27). See [[Seeded Capabilities]].

D22 settles the seed set as mockup names with the PRD's contract skills, but four PRD/backlog seeds were never discussed:

- `explain-simply`: the seed flow's `explain` step, an **approval** step. Keep it, or cover the step with another skill or agent?
- `backlog-importer`: the builtin agent behind markdown backlog import (Story 7.3). It is needed whatever the library decides, so the only question is its name and whether it is a seed like the others.
- `web-researcher`, `research-summarizer`, `fact-checker`: the agents of backlog Story 1.2's second flow template. Rename them to fit the mockup roles (`scout`, `scribe`…), or keep them as their own roles?

The PRD seed flow (§15) and backlog Story 1.2 now carry the decided names. See [[Seeded Capabilities]].

## 19. Does `/<plugin>:<slug>` invoke reliably in headless mode?

> [!question] **Open — needs a probe, not a decision.** Tracked in backlog Story 0.1.

D16 invokes every plugin skill fully qualified, because Claude Code namespaces plugin skills and two plugins may ship the same slug. Nothing yet confirms that `claude -p` with `--plugin-dir` resolves `/<plugin>:<slug>` in the prompt the way interactive mode does. If it doesn't, one possible fallback (a proposal; D16 records no alternative) is bare `/slug`, with slugs unique per project and colliding installs refused. That would put a `UNIQUE (project_id, slug)` constraint back on `skills`. See [[Capability Runtime Mounting]].

## 20. Can a step or flow travel to another project?

> [!question] **Open.**

Plugins, skills and agents belong to one project (D5, D23), and a step's `skill_id`, `agent_id` and `extra_plugin_ids` point at that project's rows. Yet `02-core-and-engine.md` §2 wants flows *"exportable across projects"*, backlog Story 8.2 asks for a *"Reuse… picker (steps or whole flow from other projects, key uniquified)"* (**NEW**), and the feature map's parking lot has *"A shareable recipe library — export a recipe and reuse it across projects"*. No source says what happens to a reused step whose plugin or agent the target project lacks: map by plugin name and agent slug, offer to install, or refuse the save. The rule in [[Capabilities In Flows]] that validation rejects an extra plugin not installed in the project is a proposal that only covers the simplest case.

## 21. What do an agent's default model and effort do?

> [!question] **Open.**

PRD §4 calls an agent *"a system prompt and defaults"* and PRD §5 gives it `default_model` and `default_effort`. But `step_defs.model` and `step_defs.effort` are `NOT NULL` with their own defaults (`'sonnet'`, `'medium'`), and PRD §7 builds `--model <step.model> --effort <step.effort>`, so an agent's defaults never reach a run unless something copies them into the step. The mockup's agent defaults also differ from the PRD §15 steps those agents serve: `scout` haiku/low vs `research` sonnet/medium, `reviewer` sonnet/medium vs `review` opus/high, `tester` sonnet/medium vs `tests` sonnet/high, `scribe` haiku/low vs `summarize` sonnet/medium (only `architect` and `developer` match). **Proposal:** picking an agent prefills the step editor's model and effort, and each seeded agent carries the values of the seed step it serves. See [[Agent Capabilities]] and [[Seeded Capabilities]].

## 22. Do agents shipped inside a plugin become library agents?

> [!question] **Open.**

D8 mounts a plugin as-is, *"hooks, agents, commands and `.mcp.json` included"*, so a plugin's own agent definitions reach Claude Code. The library's agents are `agents` rows (PRD §5), defined in the form (D21) or seeded (D12). Install parses `skills/*/SKILL.md` (backlog Story 7.1: *"parse every `skills/*/SKILL.md`"*; PRD §12: *"clone to staging, parse, return what was found"*) and takes the plugin name from `plugin.json` (PRD §5: *"plugin.json name, else the repo name"*). No source says it reads a plugin's agent definitions, so nothing says whether a plugin's agents are listed, become rows a step can name, or stay invisible. In the mockup, agents arrived inside bundle packs, which are deferred (D3). See [[Agent Capabilities]].

## 23. Whose allowlist does an amber mark point at?

> [!question] **Open.**

The library mockup and guide say a network-capable capability *"still needs the host on its allowlist"* and that egress is *"default-deny at the step"*; the inbox's **Allow host & retry** *"adds the blocked host to that step's allowlist"*. PRD §11.1 keeps one allowlist in `settings.sandbox_profile`, *"overridable per step"*, with no per-step column. Same as [[Sandboxing Open Questions]] #10; what **Allow host & retry** edits is #11 there. See [[Capability Tools And Egress]].

## 24. Light or dark?

> [!question] **Open.**

PRD §13: *"Dark-first, dense, keyboard-friendly. Use shadcn defaults; do not build a design system."* The library mockup and guide are light only (`color-scheme:light`), as is the drawio *Harness architecture* tech card (*"light, zero radius, IBM Plex"*); backlog Story 9.1 says *"light default"*. The old design handoff (`docs/old/design/README.md`) is dark — *"Dark (the designed default)"* — with a *"1f — Light mode"* variant. Feature map §19 offers *"Light, dark, or follow the system"* and backlog Story 8.3 *"theme light/dark/system"*. Same as [[Flow Design Open Questions]] #34 and [[Settings And Plumbing Open Questions]] #7. See [[Capability Library Screen]].

## 25. Proposals in these notes that no source or decision states

> [!question] **Open.** Listed so they are not mistaken for sourced facts.

- **Check for updates** runs `git ls-remote` against each plugin's remote ([[Updating And Removing Capabilities]]). D13 says only that the check is manual and per project.
- **Open on GitHub** shows only for plugins with a remote web URL, so not for seeds (`repo_url` is null) or `file://` installs ([[Capability Library Controls]]).
- The step editor's picker lists skills as `plugin:slug` ([[Capabilities In Flows]]), following D16.
- Validation rejects an extra plugin that is not installed in the project ([[Capabilities In Flows]]); see #20.
- An agent's defaults prefill the step editor ([[Seeded Capabilities]]); see #21.
- The install button reads **+ Install from git** ([[Installing A Capability From GitHub]], [[Capability Library Controls]], [[Capability Library Screen]]). D7 says what install accepts, not the label; the mockup reads *"+ Install from GitHub"*.
- The status bar's store path reads `<project>/.flowboard/skills` ([[Capability Library Screen]]). D5 places the store, not the label; the mockup reads *"store ~/.flowboard/capabilities"*.

## 26. Where does a plugin's author come from?

> [!question] **Open.**

The mockup's rail shows an author on every row (`@flowboard/core`, `@team-sec`), and search *"Matches name, author and description together. Type an author to see everything they published."* The v1 `plugins` table has `name`, `source`, `repo_url` and `commit_sha` but no author (PRD §5). Derive it from the repository owner, read it from `plugin.json`, or drop author search? See [[Capability Library Controls]].

## Related

- [[Capability Library Decisions]]
- [[Seeded Capabilities]]
- [[Capability Library Index]]
- [[Capability Library Roadmap]]
- [[Recalled Memory In The Prompt]]
- [[Sandboxing Open Questions]]
