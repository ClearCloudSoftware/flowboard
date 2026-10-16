---
tags: [flowboard, projects, concept, scope]
module: Projects
---

# What Belongs To A Project

The project is the scoping key for most of FlowBoard. This note lists everything scoped by it, and the things that stay global.

## Scoped by project

| Thing | How it is scoped | Unique within the project | Source |
|---|---|---|---|
| **Flows** (every version) | `flows.project_id … ON DELETE CASCADE` | `(project_id, name, version)` | PRD §5 |
| Step definitions and edges | through `flows` | `step_defs (flow_id, key)` | PRD §5 |
| **Tasks** | `tasks.project_id … ON DELETE CASCADE` | `(project_id, import_key)` | PRD §5 |
| Step instances, runs, run events, artifacts, questions | through `tasks` | — | PRD §5 |
| **Plugins** (installed capabilities) | `plugins.project_id … ON DELETE CASCADE` | `(project_id, name)` | PRD §5 |
| Skills | through `plugins` | `(plugin_id, slug)` | PRD §5 |
| **Agents** | `agents.project_id … ON DELETE CASCADE` | `(project_id, slug)` | PRD §5 |
| The capability store on disk | `<repo_path>/.flowboard/skills/` | one dir per plugin commit | PRD §5, §13; [[Capability Storage On Disk]] |
| Task worktrees | `<repo_path>/.vibe-worktrees/task-<id>` | one per task | PRD §11 |
| The board | `/p/[slug]`, `GET /api/projects/:id/board` | — | PRD §12, §13 |
| The flow editor | `/p/[slug]/flow` | — | PRD §13 |
| The library screen | `/p/[slug]/library`, *"One screen per project"* | — | PRD §13 |
| Imported backlog items | upsert on `(project_id, import_key)` | `import_key` | PRD §15; `05` §14 |
| **Memory** | scope `{ kind: 'project'; projectId }` | — | `09`; `reference/core/ports/memory-store.ts` |
| Spend | *"spend per project over time"* | — | PRD §13; [[Spend Rollups]] |

## Global, across projects

| Thing | Why it is global | Source |
|---|---|---|
| The inbox | *"Every pending question across all projects"* | PRD §10 |
| `/costs` | rollups with a `project=` filter | PRD §12 |
| `settings` | draft mode, sandbox profile, theme, escalation threshold, memory block. Feature map §19 calls them *"The global switches"* | Draft mode, sandbox, memory: PRD §11.1, §11.2, §13. Theme and threshold: `04` §10, `06` §15, backlog Stories 6.1, 8.3, feature map §19 (PRD §10 fixes the threshold at 5 minutes). See [[Settings Catalogue]] |
| `jobs` | no `project_id` column; one queue for the worker *(inferred from the schema)* | PRD §5 |
| The `user` memory scope | *"A single-user tool has *one* `user` scope"* | `09` |
| Seeded capabilities, at their source | *"real local plugin dirs under FlowBoard's `./skills/`"*, then copied into each project | PRD §15 |

## Memory's project scope

| Scope | Holds | Written from | Read into |
|---|---|---|---|
| `project` | *"build quirks, naming conventions, where things live"* | *"summaries, review notes, research briefs"* | *"every run on that project"* |

From `09` (*The scopes*). Feature map §21: *"about a *project* (its quirks and layout)"*. Writes stay in their lane: *"every write is **scoped** (a run writes to its own project/agent/task, not another project's)"* (`09`, trust boundary). The task-detail mockup's sample project memory: *"Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window."* See [[Project Memory Scope]] and [[Memory Carried Into A Task]].

Project memory is not necessarily on. The adapter defaults to `none` (PRD §13), scopes are enabled globally (PRD §11.2), `09` recommends *"Recall the `user` scope into every run; `project`/`agent`/`task` per step"*, and feature map §21 leaves it open: *"❓ Which memory to switch on first — just *your* preferences (the cheapest win), or project memory too?"* See [[Projects Open Questions]] #26.

## Why capabilities are per project

The capability library chose a per-project store: *"Flows are already scoped by project (`flows.project_id` in the PRD), so the capabilities they draw on are too."* ([[Capability Storage On Disk]]; Capability Library D5). The drawio *FlowBoard ideation* page still calls the library `/skills /agents`, with no project in the route. See [[Capability Library Decisions]].

## Crossing the boundary

Inside a run, the sandbox keeps other projects out: the agent *"only ever sees the one task's files — never your keys or your other projects"* (feature map §10), and *"the only writable bind-mount is the task worktree"* (`08`).

The sources name three ways something moves between projects, all beyond the PRD:

- **Reuse picker**: *"steps or whole flow from other projects, key uniquified"* (backlog Story 8.2, **NEW**).
- **Flow registry**: *"make them **exportable across projects** (the backlog's "reuse picker" generalized to a **flow registry**)"*, *"keys uniquified on import"* (`02` §2, idea).
- **Shareable recipe library**: *"export a recipe and reuse it across projects, or share it with other people"* (feature map, parking lot).

The flow-designer mockup goes further: a shared, multi-author library a project *adopts* from. See [[Flow Library]] and [[Flow Design Open Questions]] #1.

## Related

- [[Project Record]]
- [[Projects Data Model]]
- [[Project Lifecycle And Deletion]]
- [[Capability Library Decisions]]
- [[Project Memory Scope]]
