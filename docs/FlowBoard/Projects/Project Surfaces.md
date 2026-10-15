---
tags: [flowboard, projects, surface]
module: Projects
---

# Project Surfaces

Every screen that shows a project or a repo, apart from the [[Projects List Page]].

| Surface | What it shows | Source | Notes |
|---|---|---|---|
| Board `/p/[slug]` | Header: *"project name 14px/600 · `standard-flow · 8 steps` 11px mono · spacer · `14 tasks · $28.40 today` · a "Flow" outline Button"*. Sample project `billing-svc`. | design handoff 1c (`docs/old/design/README.md`, `Vibe Kanban.dc.html`) | Columns from *"the project's active flow"* (PRD §13). See [[Board Projection]]. |
| Inbox `/inbox` | Batch header carries the *"project slug 11px mono"* after the task title | design handoff 1a | *"Every pending question across all projects"* (PRD §10); drawio *"open questions across projects"*. See [[Inbox Order And Filters]]. |
| Monitor | Each task carries a `repo` (`flowboard/api`, `flowboard/core`, `flowboard/docs`, `flowboard/providers`, `flowboard/runner`, `flowboard/web`); the row detail prints it beside *steps* | `monitor.html` | Six repos on one screen, one flow. See [[Monitor Open Questions]] #2. |
| Task detail | Aside rows **repo & branch** (`flowboard/api` / `flowboard/auth-refactor`) and **workspace** (`~/.flowboard/ws/auth-refactor`, *"its own copy of the repo — kept until you clean it up"*) | `task-detail.html`, `task-detail-guide.html` | See [[Task Workspace]]. |
| Task detail, memory | A `project` row: *"Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window."* | `task-detail.html` | See [[Memory Carried Into A Task]]. |
| Flow designer `/p/[slug]/flow` | Version chip *"adopted 12 Sep"*; guide: *"Your project has adopted Software delivery v4"* | `flow-designer.html`, `flow-designer-guide.html` | See [[Project Default Flow]]. |
| Library `/p/[slug]/library` | *"One screen per project"* | PRD §13 | See [[Capability Library Screen]]. |
| Costs `/costs` | *"spend per project over time (bar chart, Recharts)"*; backlog GAP *"Add project filter and real `from`/`to` (API supports both, UI sends neither)"* | PRD §13; backlog Story 8.1 | See [[Costs Page]]. |
| Run viewer `/runs/[id]` | A link back to the project | backlog Story 3.4 BUG: *"Project link must use slug (today uses id → 404)."* | See [[Live Run Viewer]]. |
| App chrome | Nav pills *Inbox · Boards · Runs · Costs* | `Vibe Kanban.dc.html` | No project switcher is drawn. |

## How each surface names a project

| Surface | Identifier |
|---|---|
| Page routes | `slug` (PRD §13) |
| API routes | `:id` (PRD §12) |
| Inbox batch header | slug (handoff 1a) |
| Board header | name (handoff 1c) |
| Monitor, task detail mockups | `owner/name` repo label, no project at all |

The monitor and task-detail mockups label work by repo and never by project; only the flow-designer guide says *"your project"*. See [[Projects Open Questions]] #1 and #2.

## Related

- [[Projects List Page]]
- [[Cost Surfaces]]
- [[Execution Surfaces]]
- [[Projects API And Routes]]
