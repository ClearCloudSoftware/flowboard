---
tags: [flowboard, flow-design, decisions]
module: Flow Design
---

# Flow Design Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Questions settled by the [[Capability Library Decisions]] (2026-10-15) carry their outcome. Anything another note labels a **proposal** is listed here too.

## Where flows live and who owns them

### 1. Per project, or one shared library?

The PRD makes a flow belong to a project: `flows.project_id`, the route `/p/[slug]/flow`, and *"Editing a project's flow never moves an in-flight task"* (§4). Backlog Story 8.2 adds a *"Reuse… picker (steps or whole flow from other projects, key uniquified)"*. Story 1.3 creates flow v1 from a flow type when a project is made. The flow-designer mockup instead shows one shared, multi-author library (`@core`, `@alex`, `@team-sec`, `@pm-guild`, `@growth`) that a project *adopts* from. The capability-library mockup ships flows inside bundle packs. The monitor mockup runs one `v4` flow across tasks from six repos (`flowboard/api`, `core`, `docs`, `providers`, `runner`, `web`). See [[Flow Library]] and [[Flows And Flow Versions]].

### 2. What is an author, and what identifies a flow?

The PRD says *"No auth, no multi-tenancy, no user table. Do not add them 'for later'"* (§2), and its key is `UNIQUE (project_id, name, version)`. The mockups identify a flow by **name + author + version** (`Software delivery @core v4`, preview slug `@core/software-delivery`). Authors need identities. The feature map calls identities the one new foundation the teams ideas need (*Across everything → Teams & collaboration*).

### 3. Library metadata has no home in the schema

The library rail shows a domain, description, ★ org default, *forked from*, a difference line, runs, last used, ~$/task, steps, gates and a shape glyph. None of these is a PRD column. **Proposal** in [[Flow Data Model]]: store domain, description, org default, fork lineage and difference line on the flow. Derive steps, gates, shape, runs, last used and cost from the graph, the tasks and the cost ledger.

### 4. Editing someone else's flow

In the mockup, **Use this flow** copies the previewed flow and keeps its author and version, so saving makes `v(n+1)` under that same author. Should adopting create a fork under your name? The rail already shows `forked from @core v5`, but no source says how a fork is made. Separately, the capability-library guide's walkthrough wires a new step into `Code review @team-sec v2` and the version stays `v2`. That contradicts *"editing the graph forks a new version"* (architecture README). See [[Adopting And Adapting A Flow]].

## Versions and pinning

### 5. Persist node positions?

The flow-designer guide: *"Position is for your reading comfort, and it's saved with the version so the recipe looks the same to whoever opens it next."* Backlog decision **D4** and the drawio card *D4 · Don't persist node positions* (page *FlowBoard ideation*): *"No; dagre is deterministic."* Backlog Story 8.2 still lists *"**Decide** whether to persist node positions (needs a layout column)."* See [[Canvas Layout And Board Order]].

### 6. Does a layout-only change make a new version?

In the mockup, dragging a step marks the recipe unsaved (*"any change — even dragging a step — marks the recipe unsaved"*). Saving after a drag creates a version that runs exactly like the last. Follows from #5.

### 7. When does a task pin its version — promote or start?

**Pin at promotion** (backlog → todo):

- PRD §5, `tasks.flow_id`: *"null while in backlog, pinned on promotion"*.
- PRD §12: `POST /api/tasks/:id/promote -- backlog -> todo, pin flow, create worktree`.
- Backlog Story 2.1: *"Pin `tasks.flow_id` at promotion; project flow edits never move in‑flight tasks."*

**Pin at start** (todo → running):

- PRD §4: *"Flows are version-pinned at task start."*
- The architecture README: *"a task pins its version at start"*.
- Drawio *Functional components*: card *Start task / pin flow version*. Drawio *FlowBoard ideation*: card *Flow = versioned DAG*, *"Tasks pin flow_id at start"*.
- Feature map §3: *"Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow."*

The two only differ if promote and Start are separate actions. Decision **D1** recommends that they are (*"Explicit Start button on card + sheet; promote stays cheap"*), but D1 is only a default recommendation, not decided (D3 is marked *"Decided 2026-10-15"*), and Story 2.1 still says *"decide auto‑start on promote vs explicit Start"*. PRD §5 splits even within one table: `tasks.flow_id` is *"pinned on promotion"*, while `tasks.capability_pins` is *"set when the task starts"* ([[Capability Library Decisions|D10]]). With a separate Start, a task's flow version and its capability versions would be fixed at different moments, and a flow saved between promote and Start would not reach a task already in Todo. Which column the pin reads (presumably `projects.default_flow_id`) is not stated either. See [[Version Pinning]], [[Starting A Task]], [[Promoting A Task]] and [[Projects Open Questions]] #7.

### 8. Can a saved version fail validation?

The mockup opens with the chip reading *adopted 12 Sep* (nothing edited), yet the strip says *won't save — 1 problem* (`threat-model` needs `design.md`). A saved version should never be invalid. One can become invalid later, if the validation rules change or a capability is removed. Removal protects only some versions: Remove *"is disabled while any step uses the plugin (counting each flow's latest version and any version a running task pins)"* (PRD §13), and [[Capability Library Decisions|D17]] adds *"Old, unpinned flow versions do not block removal."* So an older version that no task pins can name a skill that is gone (see [[Version Pinning]]). What does the designer show for an adopted version that no longer validates, and can tasks still start on it?

## Steps

### 9. Does a step name its provider?

> [!check] **Moot in v1 — D1.** v1 is Claude-only, so no step needs a provider field. Returns with the second provider.

The capability-library guide: *"Steps name their provider individually — one flow can mix them."* `01-ports.md` and `05` §13 assume a step has a *target provider*. Neither the PRD `step_defs` table, backlog Story 8.2's inspector list, nor the flow-designer mockup has a provider field. The same question, with a proposed nullable `step_defs.provider`, is [[Agent Providers Open Questions]] #14.

### 10. Step kind and capability in the designer

> [!check] **Model resolved — D27.** `kind` is `ai | shell | manual`; an `ai` step names an agent, a skill or both. Still open: the flow-designer inspector needs agent and skill pickers and the shell and manual kinds.

Before D27, the PRD and the backlog gave a step a `kind` (`skill | agent | shell | manual`) and one `skill_id` or `agent_id`. Since `8561b85` both read `ai | shell | manual` (PRD §5, §13; backlog Story 8.2). The flow-designer inspector has only a free-text **Agent** field. It has no kind, no skill picker, no check step and no manual step. The capability-library mockup's *used by* data has steps that use **both** a skill and an agent: `plan` uses skill `plan-implementation` and agent `architect`, and `review` uses skill `code-review` and agent `reviewer`. One `kind` cannot express that. See [[Step Kinds]].

### 11. Retries versus `max_attempts`, and what happens at the cap

The mockup's **Retries** field (0–5, default 2) is *"How many attempts before the step gives up and fails the task."* The PRD's `max_attempts` (default 3) *"counts total runs of the step, first try included"*. Its counter lives on the rework **target**, and at the cap FlowBoard escalates instead of failing (§8, decision **D3**, decided 2026-10-15). **Proposal:** Retries = `max_attempts − 1`. Several sources still fail the task at the cap: the monitor guide (*"Retries are capped, then the task fails"*, `monitor-guide.html:691`), the task-detail guide (*"Retries are capped. After the limit the engine gives up and fails the task"*, `task-detail-guide.html:567`), PRD §16 itself (*"three failed attempts fail the task"*, `PRD.MD:671`), backlog Story 10.1 (*"three failures fail the task"*) and the drawio card *D3 · max_attempts = attempts allowed* (*"Fail on the 4th (default 3)"*, page *FlowBoard ideation*). See [[Step Guardrails]].

### 12. Is the per-task cost ceiling really a ceiling?

The canvas bar shows *est. $X ceiling per task*: the sum of every step's budget. Budget is *"the most this step may spend on one attempt"*, so retries, rework loops and infra retries can all go past the figure. In draft mode the mockup counts a flat `$0.05` per step, which no other source states.

### 13. Sandbox levels, and the unattended rule

Sandbox values differ by source:

- Mockup: `none | container | sealed container`
- PRD §13 settings: `host / container / microVM`
- `08-sandboxing.md`, `01-ports.md`: `host | container | gvisor | microvm`
- Drawio *Harness architecture*, card *Tiers*: *"host (no box, approval mode only) · container (default when autonomous) · gVisor runsc (untrusted repos, Linux hosts) · microVM / docker sandbox"*; card *Workspace manager*: *"host · docker · gVisor"*

*Sealed container* is defined only as *"a sealed container with no network"* (guide). It could be a stronger tier ([[Step Guardrails]]'s proposal) or a `container` with an empty allowlist; a container with no network at all could not reach the model endpoint, so the second reading only fits shell steps ([[Sandboxing Open Questions]] #7). Full vocabulary list: [[Isolation Tiers]].

Backlog Story 1.1 adds an optional `step_defs.sandbox_profile` override. PRD §11.1 says the settings `sandbox_profile` is *"overridable per step"* (`PRD.MD:515`) but has no step column for it. The mockup flags a step with no gate and no sandbox as *unattended and unsandboxed*, and the guide says the real product *"refuses outright"*. The PRD rule is narrower: *"`bypassPermissions` is only allowed when the step runs in a sandbox tier"* (§11.1). The mockup has no `permission_mode` field. **Proposal** mapping in [[Step Guardrails]]. The rule itself is [[Permission Gate]].

### 14. Per-step egress edits made outside the designer

The monitor and the inbox offer **Allow host & retry**, which *"adds api.stripe.com to this step's egress allowlist"* so that *"the next task down this flow will not pay the same toll"*. That changes a step definition from outside the designer. Does it create a flow version? Partly answered: the PRD keeps the allowlist in `settings.sandbox_profile` (*"tier, image, egress allowlist, limits"*), *"overridable per step"* (§11.1, `PRD.MD:515`), so a per-step allowlist is expected. Whether that override lives on the flow version is still open.

The flow designer cannot show or edit it. Four other mockups speak of a per-step list: the capability library (*"a step using it will still fail closed until you add the host it needs to that step's allowlist"*), the monitor (sample task *"Default-deny egress allowlist, per step"*), the inbox (*"api.stripe.com was not on this step's allowlist"*) and task detail (*"npmjs.org is now on this step's allowlist"*). The flow-designer inspector has a **Sandbox** select and no allowlist field. Which list a step uses (global, replaced or merged per step) is [[Sandboxing Open Questions]] #10. See [[Egress Allowlist]] and [[Egress Denials]].

### 15. Model ids and effort values

The PRD and every mockup use the Claude aliases `haiku`, `sonnet` and `opus`. They are not native ids: PRD §5 comments `agents.default_model` as *"a Claude alias, used as the logical model id"*, and the CLI reports a native id such as `claude-fable-5-1` (`docs/old/stream-sample.jsonl`). `01-ports.md`: *"Step defs reference logical ids (`reasoning-high`, `fast-cheap`, `default`)"*. `06` §15 draft mode sets `model: 'fast-cheap'`. For v1, [[Capability Library Decisions|D20]] makes the aliases the logical ids; the abstract names are open until a second provider ([[Logical Model Ids]], [[Agent Providers Open Questions]] #11). Effort: the mockup offers `low | medium | high`; the PRD and `agent-provider.ts` allow `low | medium | high | xhigh | max`. See [[Models And Effort]].

### 16. Prompt template placeholders

PRD §7 and `03` §6 list `{{task_title}} {{task_body}} {{acceptance_criteria}} {{non_goals}} {{artifact:<type>}} {{worktree}}`. Backlog Story 3.2 lists only `{{task_title}} {{task_body}} {{artifact:<type>}} {{worktree}}`. The `PromptParts.preamble` comment says *"task title + body"*. The mockup has no prompt-template field.

## Routes and topology

### 17. Editing routes on the canvas

The feature map promises *"drag steps, draw connections"* (§2). Backlog Story 8.2: *"drag‑to‑connect, edge label cycles `always → on_pass → on_fail`"*. The mockup has no way to draw, select, relabel or delete a route. Routes only appear with **+ Step** and disappear with **Delete this step**.

### 18. Where **+ Step** wires a new step

The mockup wires the new `step-n` off `review` on the passed route, whatever is selected. It adds that edge even when `review` no longer exists. It reads as a placeholder. **Proposal:** add the step unwired (the validator then flags it unreachable), or after the selected step.

### 19. Joins behind conditional routes

PRD §8: a join *"starts only once every upstream step instance for this task is `done`"*. Backlog Story 5.2: *"join waits for every non‑`on_fail` upstream instance"*. Neither says what happens when an upstream route is conditional and never fires. That is the same root cause as the backlog BUG that strands a task in `running`. Should validation warn about a join behind a conditional route? See [[Branching Joining And Loops]].

### 20. Downstream attempts on rework

Backlog Story 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."*

### 21. StepExecutor generalisation

Architecture README, open decision 1: `shell` is in scope. *"Still open: make `step_defs.kind` an executor interface so a step can also be an HTTP call, pure transform, or human task."* The drawio card *StepExecutor generalization* is amber, not v1. See [[Step Kinds]].

## Validation

### 22. Does an `on_fail` back-edge count as ancestry?

PRD §6: every `requires` entry *"is produced by some ancestor step in the DAG"*. A flow with a rework loop is not strictly acyclic. The mockup's `ancestors()` follows every edge, `fail` included, so `build` counts `review` as an ancestor through the back-edge. `board_order` ignores `on_fail` edges (`02` §2), and so do joins (backlog Story 5.2). On rework the new run also reads the failing step's artifacts (PRD §8) without declaring them. **Proposal:** compute ancestry over forward edges only, and treat rework inputs as implicit. See [[Artifact Contract]].

### 23. "Exactly one entry" or "exactly one producer"?

Backlog Story 5.1: *"every `requires` produced by an ancestor, exactly one entry, known types"*. `02` §2: *"every `requires` entry is produced by some ancestor; exactly one producer; known types"*. 5.1's *"exactly one entry"* reads two ways:

- **One entry step.** Backlog Story 8.2's inspector lists a field *entry* (*"advance mode, entry, requires"*), and the PRD has an `is_entry` column. On this reading the two sources state two rules: one entry step, and one producer per artifact type.
- **Each `requires` entry.** `02` §2 has *"exactly one producer"* where 5.1 has *"exactly one entry"*, so 5.1 may mean that each `requires` entry has exactly one producer.

[[Execution Open Questions]] #65 weighs the same two readings. The mockup checks neither. It takes the first step with no incoming route as the entry and flags every other such step as unreachable. See [[Flow Validation]].

### 24. Artifact type keys or filenames?

The PRD uses type keys (`research_brief`, `plan`, `check_output`) stored as `NN-<type>.<ext>`. The mockups use filenames (`brief.md`, `plan.md`, `changes.patch`). The capability-library mockup's `SKILL.md` manifests declare `produces: plan.md`. A *known types* check needs a type registry either way.

### 25. Which artifact types are seeded?

PRD §6 seeds ten: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary`. Backlog Story 1.1: *"the nine PRD types + `sources`, `grounding_report`"*. PRD §6 lists ten and the backlog says nine, so the backlog count probably predates `check_output`.

### 26. Provider-match severity

> [!check] **Moot in v1 — D1.** No provider-match check while there is one provider.

The capability-library mockup and guide say the flow editor refuses to save a step whose provider has no pack for its capability. `01-ports.md` calls a capability-contract violation a design-time **warning**. The flow-designer mockup has no provider check at all. Same question as [[Capability Library Open Questions]] #13. See [[Flow Validation]].

## Screen, content and API

### 27. List editor or canvas?

PRD §13: *"A node graph is nice but not required for v1. A vertical list of steps with an 'add step' button and a connections panel is acceptable."* The drawio *Flow editor* card agrees (*"A node graph is nice, not required for v1."*). The original design brief is in between: *"a pure vertical list understates the structure. But a full node-graph editor is expensive to build. Propose the cheapest thing that communicates branching honestly"*. The flow-designer mockup, the drawio *Harness architecture* page (*"xyflow canvas"*) and backlog Story 8.2 (*React Flow canvas*) design a canvas. The feature map wants both: *"on a canvas … or as a simple list"*.

### 28. Draft mode: global switch or designer toggle?

PRD §13 and feature map §19 make draft mode a global setting, and `docs/pitch.md` calls it *"a global **draft mode**"*. The drawio puts the toggle on the costs screen (*FlowBoard ideation* group *Costs & settings*; *Logical components*: *Costs /costs — "rollups and draft-mode toggle"*) and, on the *Harness architecture* page, under *Library · Costs · Settings*. The mockup puts a **draft mode** toggle in the designer's topbar. Does it flip the global setting? The guide calls it *"a switch on how runs execute, not an edit to the flow"*. The mockup forces only the model (`haiku`), not the effort. See [[Draft Mode Setting]] and [[Draft Mode]].

### 29. The seeded flow

> [!check] **Resolved — D26.** *Software delivery*: the PRD's nine steps (check step and both gates kept) with the mockup's role names and agent + skill pairs. See [[Seeded Flows]].

PRD §15 seeds nine steps (research, grill, plan, explain, implement, tests, check, review, summarize), with gates on `explain` and `review`. Backlog Story 1.2 agrees: *"Flow template as JSON: *Software delivery* (the 9‑step table, exact agent/skill pairs, models/efforts/gates/edges)"*. The old design handoff shows `standard-flow · 8 steps` and *"Plan needs approval"*. The mockups use *Software delivery @core v4*: six steps (research, plan, build, tests, review, summarize), only `review` gated, and no check step. That is the library row and the monitor. The flow-designer canvas opens it with seven, adding the borrowed `threat-model` step. See [[Seeded Flows]].

### 30. API for the library

The PRD has three flow endpoints. The mockup also needs to list the library with stats, preview a version, adopt or fork, and set a project's flow. **Proposal** in [[Flow Design API And Routes]].

## Naming and seed details

### 31. Edge condition names

The schema uses `always | on_pass | on_fail`. The mockup's data uses `always | pass | fail` and labels routes *passed* and *failed ↺*; the guide says *on passed* and *on failed*. **Proposal:** `pass` → `on_pass`, `fail` → `on_fail`, and keep *passed* / *failed ↺* as display labels. See [[Connections And Routes]].

### 32. The `researcher` template

> [!check] **Out of v1 — D31.** Web research conflicts with default-deny egress; the template returns when open-web research has an egress answer.

The current backlog Story 1.2 says only that *"The `researcher` web-research template is out of v1 until open-web egress has an answer."* Its shape was given, before commit `8561b85`, as *"scope → web research → summarize → grounding ✋, `on_fail` loop"*. The loop's target, each step's kind, model, `requires` and `produces` were never stated. [[Seeded Flows]] draws the loop back to `summarize` as a guess. The feature map still promises *"a research pipeline"* (§2).

### 33. Dependencies the contract cannot see

The seeded `check` step requires nothing but must run after `implement` and `tests`: it reads the worktree, not an artifact. A validator that only checks `requires` cannot tell whether a check step is wired after the code it checks. Should a check step implicitly require the code-producing steps, or should validation ignore this? See [[Check Steps]].

## Look and packaging

### 34. Light or dark?

PRD §13: *"Dark-first, dense, keyboard-friendly."* (`PRD.MD:575`). The old design handoff (`docs/old/design/README.md`) draws dark artboards (e.g. header background `#0c0c0e`) and adds *"1f — Light mode"* as a variant. Every mockup is light only (`color-scheme:light`), as is the drawio *Harness architecture* tech card (*"shadcn/ui + Tailwind (light, zero radius, IBM Plex)"*). Backlog 9.1 says *"light default"*, and Story 8.3 and feature map §19 offer a light / dark / system switch. Does the flow designer ship light only, or light by default with a dark theme?

### 35. Are role starter packs bundle packs?

The feature map's role starter packs bundle *"the skills, tools, and design system that role reaches for"* with a seed flow (§2 ideas, appendix). It never links them to the capability library's bundle packs (*"skills + agents + flows as one unit"*, drawio). [[Bundle Packs]] used to read them as an extension of bundle packs; that is an inference. The counts differ too: the feature map has six packs, with business analyst and product owner combined, while the flow-designer guide has seven domains (*"Analysis, PO/PM, SDLC, QA, Platform, Design, Marketing"*). See [[Role Starter Flows]].

## Added in the second grounding pass

### 36. Where does the adoption date live?

The version chip reads `adopted 12 Sep` and, after **Use this flow**, `adopted just now`. PRD §5's `projects` row has `default_flow_id` and `created_at`, and `flows` has its own `created_at`, but nothing records when a project switched to a version. [[Flow Data Model]] proposes a new column such as `projects.default_flow_adopted_at`. Alternatives: show the version's `created_at` instead (wrong after adopting an old version), or derive it from an audit log no source defines. See [[Project Default Flow]].

### 37. Must every step have a budget and a turn cap?

`docs/pitch.md`: *"Every step has a budget and a turn cap"*. PRD §5 makes both optional: `max_turns INTEGER` and `max_budget_usd REAL`, nullable, with no default. The flow-designer guide warns that *"No ceiling means a looping agent has no financial brake"*, and the mockup's **Budget** accepts `0` and has no "none" value; it has no turn field at all. Should validation require both on `ai` steps, or should settings supply defaults? See [[Step Guardrails]] and [[Spend Caps And Limits]].

### 38. Steps that cannot run on the host tier

PRD §11.1: *"On the host tier, a step that mounts a git-installed plugin does not run"* ([[Capability Library Decisions|D15]]), and *"Probe for Docker at startup; if absent, fall back to the host tier and disable `bypassPermissions`."* So a step with sandbox `none`, or any step on a machine without Docker, can be valid in the designer and refused at run time. No source says whether the designer warns about this (a design-time check, like the PRD's *"the flow editor says so"* for missing hooks, §7) or only the run fails. See [[Step Guardrails]] and [[Permission Gate]].

### 39. What does a manual step do?

`kind='manual'` is in the schema and the step form (PRD §5, §13; backlog Story 8.2), but no source says how a manual step starts, who completes it, how it finishes, or which outcome it sets for conditional edges. The feature map's ideas (*"a manual or approval step can name who does it"*) and the StepExecutor's *"human task"* (#21) point at it without defining it. See [[Step Kinds]].

## Related

- [[Flow Design Index]]
- [[Flow Design Sources]]
- [[Capability Library Open Questions]]
