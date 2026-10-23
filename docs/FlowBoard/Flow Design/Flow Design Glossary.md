---
tags: [flowboard, flow-design, glossary]
module: Flow Design
---

# Flow Design Glossary

| Term | Meaning |
|---|---|
| **Flow** | The recipe a task follows: a versioned DAG of step definitions (PRD §4). The mockups and the feature map also call it a **recipe**. In run-flow, a reusable recipe: the flow file names no folder or task, which each run gives with `--folder` and `--task` (Alex's call, 2026-10-23). |
| **Flow version** | One immutable snapshot of a flow. Editing creates the next version (`Save as v5`). Shown as `v4`. run-flow has none: each run pins its loaded flow file in `flow.json`, and a hash of the recipe, which would identify a version, is not recorded yet (Claude's call). |
| **Adopted** | The version a project currently points at. The chip reads `adopted 12 Sep`. Read as the PRD's `projects.default_flow_id` (an inference: the PRD gives the column no comment, and stores no adoption date — [[Flow Design Open Questions]] #36). |
| **Pinned** | A task's fixed reference to its flow version (`tasks.flow_id`). Pinned at promotion or at start, depending on the source ([[Flow Design Open Questions]] #7). See [[Version Pinning]]. |
| **Capability pins** | `tasks.capability_pins`: the plugin commits and agent rows a task runs, *"set when the task starts"* (PRD §5; [[Capability Library Decisions\|D10]]). A flow version names capabilities but pins none. |
| **Step definition** | A node in the flow: *"Code review, Sonnet, high effort, waits for my approval."* Belongs to a flow version (PRD §4). Table `step_defs`. |
| **Step instance** | *"one task's occupancy of one step definition. Has state and artifacts."* (PRD §4). A run-time concept. |
| **Run** | *"one attempt at a step instance. Rework loops create attempt 2, 3, 4 against the same step instance."* (PRD §4) |
| **Step key** | A stable slug for a step inside a flow, e.g. `code_review` (PRD) or `threat-model` (mockup). Unique per flow version. In run-flow, a step's key under `steps:` is its only name, matching `^[a-z0-9][a-z0-9_-]*$` (Claude's call). |
| **Kind** | What executes a step: `ai`, `shell`, `manual` (PRD §5, after [[Capability Library Decisions\|D27]]). An `ai` step names an agent, a skill or both. The PRD first had `skill`, `agent`, `shell`, `manual`. See [[Step Kinds]]. run-flow has two: a step with `shell:` is a shell step and any other an agent step; manual steps are left out (Claude's call). |
| **Check step** | The feature map's name for a `kind='shell'` step: a plain command, no AI, exit code is the verdict. See [[Check Steps]]. |
| **Edge / route / connection** | A link from one step to the next. *Edge* in the schema (`step_edges`), *route* in the mockup, *connection* in the feature map. |
| **Condition** | When an edge fires: `always`, `on_pass`, `on_fail` (PRD). The mockup labels them *passed* and *failed ↺*; the guide says *on passed* and *on failed*. |
| **Outcome** | `pass` or `fail`, set by a step's run. Drives conditional edges. *"A missing outcome is never a pass."* (PRD §8) |
| **Fan-out** | One step feeding several, which then run at the same time. Also **branching** (feature map) and **split** (board). |
| **Join** | A step with several incoming edges. It waits for all of them. In run-flow only forward routes count, and the join waits for each only while that step can still run. |
| **Rework loop** | An `on_fail` edge pointing back to an earlier step. Also **loop back**, **send back**, **retry path** (monitor). In run-flow, an `on_fail` route to its own step, or to a step that reaches it along `always` and `on_pass` routes (the run-flow plan, Execution #9); every other route is forward, and forward routes may not loop. |
| **Branch (shape)** | In the library's shape glyph, a flow that splits into a pass path and a fail path that do not rejoin. Not the same as a git branch. |
| **Approval gate** | A step with `advance_mode='approval'`: it stops when done and waits for you. Shown with pause bars. See [[Approval Gates]]. |
| **Advance mode** | `auto` or `approval` (PRD §5). The drawio adds *wait for answers* as a third advance behaviour. |
| **Requires / needs** | The artifact types a step must be given. `requires` in the PRD, **needs** in the mockup. |
| **Produces** | The artifact types a step writes. |
| **Artifact contract** | The rule that every `requires` is produced by an ancestor step. See [[Artifact Contract]]. |
| **Capability contract** | The rule that every knob a step uses is supported by its provider (`02` §2). |
| **Entry step** | The step a flow starts at (`step_defs.is_entry`). In run-flow, the step a top-level `entry:` names, or else the one step no route points to; a flow that loops back to its first step has no such step and must name it with `entry:` (Claude's call). |
| **`board_order`** | A step's column position on the board: *"layered topological order, `on_fail` edges ignored for layout"* (`02` §2). |
| **`max_attempts`** | Total runs a step may have, first try included (default 3). The counter lives on the rework *target* (PRD §8). In run-flow, how many times rework may run the step, counting the first run: a person's Retry can go past it, and setting it on a step that no rework route leads back to is an error. |
| **Budget** | `max_budget_usd`: *"The most this step may spend on one attempt."* (flow-designer guide) In run-flow, `limits.budget_usd`, optional; in a flow with no ceiling, `--check` warns about an agent step with neither it nor `limits.max_turns`. |
| **Ceiling per task** | The canvas bar's sum of every step's budget. run-flow states one instead: the flow's required `budget_usd`, the most the whole flow may spend, `0` for none (Alex's call, 2026-10-23, Flow Design #12). Each agent run may spend only what is left, and once it is spent the flow pauses (Claude's call). See [[Step Guardrails#Ceiling per task]]. |
| **Model alias / logical id** | `haiku`, `sonnet`, `opus` are Claude aliases, not native ids (the CLI reports ids like `claude-fable-5-1`). In v1 the alias is the logical id (D20). See [[Models And Effort]] and [[Logical Model Ids]]. run-flow takes native ids per adapter: a Claude alias or id, OpenCode's `provider/model` (Claude's call). |
| **Draft mode** | A switch that forces every step onto the cheapest model while you iterate on the recipe. Not a version. |
| **Library** | All flows you can start from, filtered by domain and grouped by name. See [[Flow Library]]. |
| **Domain** | The job a flow does — Analysis, PO / PM, SDLC, QA, Platform, Design, Marketing — taken from the role starter packs. |
| **Author** | Who published a flow: `@core`, `@alex`, `@team-sec`, `@pm-guild`, `@growth`. |
| **Variant** | One author's flow under a shared name. |
| **★ Org default** | The variant someone decided everybody should use. Also **golden** (mockup code, feature map *"golden" recipes*). |
| **Fork** | A flow that started as another author's version and diverged: `forked from @core v5`. |
| **Difference line** | *"The one sentence on what this variant actually does differently."* |
| **Shape glyph** | A tiny DAG drawing per library entry: straight, fans out, loops back, both, branches. |
| **Preview** | Viewing a library flow on the canvas, ghosted and read-only. |
| **Flow type / flow template** | A ready-made flow to start from (backlog: *"Start from flow type"* in Story 8.2, *"Flow template as JSON"* in Story 1.2). |
| **Role starter pack** | A ready-made flow per job function, with that role's skills and tools. See [[Role Starter Flows]]. |

*Claude's call* above marks a decision taken on 2026-10-23 and open to Alex's review; see [[Run Flow Reference#Rules this command settles]].

> [!warning] Overloaded words
> - **"Retries"** — the mockup's **Retries** field is *"How many attempts before the step gives up and fails the task"* (guide). Reading it as attempts after the first (`max_attempts − 1`) is a proposal ([[Flow Design Open Questions]] #11). In the runner, *infra retries* are automatic re-runs after a transient failure that do *not* count toward `max_attempts` (PRD §7). The inbox's **Retry** grants one more attempt after escalation.
> - **"Version"** — a *flow version* (`v4`) is not a *capability version*. *"tasks are pinned to a flow version, **flows are not pinned to a capability version**"* (mockups README). A task does pin capability versions, in `capability_pins` (D10).
> - **"Allowlist"** — the PRD keeps one egress allowlist in `settings.sandbox_profile`, *"overridable per step"* (§11.1). Four mockups speak of a per-step allowlist (*"that step's allowlist"*, *"this step's egress allowlist"*). The flow designer has no allowlist field ([[Flow Design Open Questions]] #14).
> - **"Branch"** — a fan-out branch, a branch-shaped flow, and the task's git branch are three different things.
> - **"Pack"** — a *role starter pack* is a seeded flow plus its toolbox; a *bundle pack* in the Capability Library installs skills, agents and flows together; a *provider pack* is a capability's packaging for one CLI. See [[Capability Library Glossary]]. Whether role starter packs are bundle packs is open ([[Flow Design Open Questions]] #35).
> - **"Flow editor" / "flow designer"** — the same screen. The PRD, backlog and two drawio pages say *editor*; the mockup and the *Harness architecture* page say *designer*.

## Related

- [[Flow Design Index]]
- [[Flow Design Overview]]
- [[Capability Library Glossary]]
