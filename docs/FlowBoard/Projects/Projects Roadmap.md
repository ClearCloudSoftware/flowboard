---
tags: [flowboard, projects, roadmap]
module: Projects
---

# Projects Roadmap

## v1 scope

From the PRD and the backlog items tagged **PRD**.

| Milestone / story | Item | Source |
|---|---|---|
| M1 | `projects` table in the Drizzle schema and migrations | PRD §5, §14 |
| M1 | *"Seed a project pointing at a scratch git repo. Projects list page renders."* | PRD §14 |
| Story 1.2 | *"Seed project pointing at an auto‑`git init`ed scratch repo."* | backlog |
| Story 1.3 | *"Cards: counts per status, this‑week spend (decide rolling 7 d vs calendar week)."* | backlog (**PRD/DEC**) |
| M2 | Promotion creates the worktree under `repo_path` | PRD §11, §14 |
| M5 | Shell check steps fall back to `check_command`; the seed's check exists in the scratch repo | PRD §5, §14, §15 |
| M7 | The per-project library `/p/[slug]/library` and its `/api/projects/:id/…` routes | PRD §12, §13, §14 |
| M8 | Spend per project on `/costs` | PRD §13, §14 |
| API | `GET` and `POST /api/projects`, `GET /api/projects/:id/board` | PRD §12 |

- [ ] Projects list page with cards
- [ ] New-project dialog
- [ ] Seed project on a scratch repo
- [ ] Bugs: project links use the slug (Story 3.4); non-JSON error bodies on submit (Story 1.3)
- [ ] Decide this week's spend: rolling 7 days or calendar week (Story 1.3 **DEC**)

## Designed beyond the PRD

| Item | Source |
|---|---|
| New-project dialog with a flow-type select, *Empty* allowed, creating flow v1 | backlog Story 1.3 (**NEW**) |
| Empty state and submit error handling | backlog Story 1.3 (**BUG**) |
| `.git/info/exclude` hygiene for `.vibe-worktrees/` and `.flowboard/skills/` | backlog Stories 0.3 (**FIX**), 2.1 (**PRD/FIX**) |
| Per-project, gitignored capability store; seeds copied on registration | Capability Library D5, D6 |
| Saving a flow points the project at the new version; adopting a library flow | `flow-designer-guide.html` |
| *"Reuse… picker (steps or whole flow from other projects, key uniquified)"* | backlog Story 8.2 (**NEW**) |
| *"Start from flow type"* in the flow editor | backlog Story 8.2 (**NEW**) |
| Project filter and real `from`/`to` on `/costs` | backlog Story 8.1 (**GAP**) |
| Worktrees under `<repo>/.flowboard/worktrees/` on `fb/task-<id>` | drawio *Harness architecture* |

## Ideas

| Idea | Source |
|---|---|
| **Who can see each project** | feature map §1. See [[Project Visibility]]. |
| Teams & collaboration: *"who can … open a repo"* | feature map, *Across everything* |
| A shared team tier with *"per-repo access"* | feature map, parking lot |
| Flows *"exportable across projects"*, a flow registry | `02` §2 |
| *"A shareable recipe library — export a recipe and reuse it across projects"* | feature map, parking lot |
| *"Spend by person and team"* alongside per project | feature map §18 |
| *"Run agents in the cloud, not just your laptop"* | feature map, parking lot |
| Knowledge assets beside the project repo: *"repomix pack · Serena index · graphify-out/ … refreshed by scheduled shell-step flows"* | drawio *Harness architecture* (dashed, *later*) |
| TaskSource adapters (*"GitHub Issues, Linear, Jira, webhook"*) feeding a project's backlog | `05` §14; drawio *FlowBoard ideation*, *Architecture · ports & adapters* |

## Out of scope

| Item | Source |
|---|---|
| Authentication, user accounts, roles, multi-machine support | PRD §17; drawio *Out of scope (v1)* |
| *"No auth, no multi-tenancy, no user table. Do not add them 'for later'"* | PRD §2 |
| Deploying FlowBoard in a container | PRD §17 |

## Related

- [[Projects Index]]
- [[Projects Open Questions]]
- [[Flow Design Roadmap]]
- [[Capability Library Roadmap]]
