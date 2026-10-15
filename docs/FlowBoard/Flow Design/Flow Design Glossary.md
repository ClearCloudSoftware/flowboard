---
tags: [flowboard, flow-design, glossary]
module: Flow Design
---

# Flow Design Glossary

| Term | Meaning |
|---|---|
| **Flow** | The recipe a task follows: a versioned DAG of step definitions (PRD §4). The mockups and the feature map also call it a **recipe**. |
| **Flow version** | One immutable snapshot of a flow. Editing creates the next version (`Save as v5`). Shown as `v4`. |
| **Adopted** | The version a project currently points at. The chip reads `adopted 12 Sep`. In the PRD this is `projects.default_flow_id`. |
| **Pinned** | A task's fixed reference to the flow version it started on (`tasks.flow_id`). See [[Version Pinning]]. |
| **Step definition** | A node in the flow: *"Code review, Sonnet, high effort, waits for my approval."* Belongs to a flow version (PRD §4). Table `step_defs`. |
| **Step instance** | *"one task's occupancy of one step definition. Has state and artifacts."* (PRD §4). A run-time concept. |
| **Run** | *"one attempt at a step instance. Rework loops create attempt 2, 3, 4 against the same step instance."* (PRD §4) |
| **Step key** | A stable slug for a step inside a flow, e.g. `code_review` (PRD) or `threat-model` (mockup). Unique per flow version. |
| **Kind** | What executes a step: `skill`, `agent`, `shell`, `manual` (PRD §5). See [[Step Kinds]]. |
| **Check step** | The feature map's name for a `kind='shell'` step: a plain command, no AI, exit code is the verdict. See [[Check Steps]]. |
| **Edge / route / connection** | A link from one step to the next. *Edge* in the schema (`step_edges`), *route* in the mockup, *connection* in the feature map. |
| **Condition** | When an edge fires: `always`, `on_pass`, `on_fail` (PRD). The mockup labels them *passed* and *failed ↺*; the guide says *on passed* and *on failed*. |
| **Outcome** | `pass` or `fail`, set by a step's run. Drives conditional edges. *"A missing outcome is never a pass."* (PRD §8) |
| **Fan-out** | One step feeding several, which then run at the same time. Also **branching** (feature map) and **split** (board). |
| **Join** | A step with several incoming edges. It waits for all of them. |
| **Rework loop** | An `on_fail` edge pointing back to an earlier step. Also **loop back**, **send back**, **retry path** (monitor). |
| **Branch (shape)** | In the library's shape glyph, a flow that splits into a pass path and a fail path that do not rejoin. Not the same as a git branch. |
| **Approval gate** | A step with `advance_mode='approval'`: it stops when done and waits for you. Shown with pause bars. See [[Approval Gates]]. |
| **Advance mode** | `auto` or `approval` (PRD §5). The drawio adds *wait for answers* as a third advance behaviour. |
| **Requires / needs** | The artifact types a step must be given. `requires` in the PRD, **needs** in the mockup. |
| **Produces** | The artifact types a step writes. |
| **Artifact contract** | The rule that every `requires` is produced by an ancestor step. See [[Artifact Contract]]. |
| **Capability contract** | The rule that every knob a step uses is supported by its provider (`02` §2). |
| **Entry step** | The step a flow starts at (`step_defs.is_entry`). |
| **`board_order`** | A step's column position on the board: *"layered topological order, `on_fail` edges ignored for layout"* (`02` §2). |
| **`max_attempts`** | Total runs a step may have, first try included (default 3). The counter lives on the rework *target* (PRD §8). |
| **Budget** | `max_budget_usd`: *"The most this step may spend on one attempt."* (flow-designer guide) |
| **Ceiling per task** | The canvas bar's sum of every step's budget. |
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
| **Flow type / flow template** | A ready-made flow to start from (backlog: *"Start from flow type"*, *"Flow templates as JSON"*). |
| **Role starter pack** | A ready-made flow per job function, with that role's skills and tools. See [[Role Starter Flows]]. |

> [!warning] Overloaded words
> - **"Retries"** — the mockup's **Retries** field is *"How many attempts before the step gives up and fails the task"* (guide). Reading it as attempts after the first (`max_attempts − 1`) is a proposal ([[Flow Design Open Questions]] #11). In the runner, *infra retries* are automatic re-runs after a transient failure that do *not* count toward `max_attempts` (PRD §7). The inbox's **Retry** grants one more attempt after escalation.
> - **"Version"** — a *flow version* (`v4`) is not a *capability version*. *"Tasks are pinned to a flow version, flows are not pinned to a capability version"* (mockups README).
> - **"Branch"** — a fan-out branch, a branch-shaped flow, and the task's git branch are three different things.
> - **"Pack"** — a *role starter pack* is a seeded flow plus its toolbox; a *bundle pack* in the Capability Library installs skills, agents and flows together; a *provider pack* is a capability's packaging for one CLI. See [[Capability Library Glossary]]. Whether role starter packs are bundle packs is open ([[Flow Design Open Questions]] #35).
> - **"Flow editor" / "flow designer"** — the same screen. The PRD, backlog and two drawio pages say *editor*; the mockup and the *Harness architecture* page say *designer*.

## Related

- [[Flow Design Index]]
- [[Flow Design Overview]]
- [[Capability Library Glossary]]
