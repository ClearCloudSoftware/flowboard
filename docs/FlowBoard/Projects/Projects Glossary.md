---
tags: [flowboard, projects, glossary]
module: Projects
---

# Projects Glossary

Terms used across the Projects notes. ⚠ marks a word that means different things in different sources.

| Term | Meaning | Source |
|---|---|---|
| **Project** ⚠ | One row in `projects`: a named, slugged handle on one local git repository, with a default flow and a check command. See [[Project Record]]. **Overloaded:** the architecture also says *"the project's `@/` path alias"* (`07`, `reference/README.md`), meaning FlowBoard's **own** codebase. In these notes *project* always means a managed project. | PRD §5; `07` |
| **Managed project / managed repo** | A project FlowBoard runs agents against, as opposed to FlowBoard's own repo. Backlog wording: *"each managed project's `.flowboard/skills/`"*. | backlog Story 0.3 |
| **Repo** ⚠ | The git repository a project points at. **Overloaded:** in the PRD it is a local absolute path (`repo_path`); in the monitor and task-detail mockups it is an `owner/name` label (`flowboard/api`); in the drawio it is also the remote (*"project remote"*). See [[Project Repository]]. | PRD §5; `monitor.html`; `task-detail.html`; drawio |
| **`repo_path`** | *"absolute path to the git repo"*. The base for worktrees and the capability store. | PRD §5 |
| **Codebase** | Feature-map word for the repo: *"Connect a codebase"*. Memory's project scope is *"one codebase: conventions, gotchas, layout"*. | feature map §1; `09` |
| **Slug** ⚠ | The project's URL key, `UNIQUE` across projects, used in page routes `/p/[slug]`. **Overloaded:** agents have a slug (`UNIQUE (project_id, slug)`), skills have a slug (`/<plugin>:<slug>`), a step has a *key* described as a *"stable slug"*, and import derives `import_key` from `slugify(title)`. | PRD §5, §13; backlog Story 7.3 |
| **Default flow** ⚠ | `projects.default_flow_id`: the flow version new tasks start on. Also called the project's **active flow** (PRD §13 board columns), the **adopted** flow (flow-designer mockup chip *"adopted 12 Sep"*), the **default recipe** (feature map §1). The sources never say these are one thing. See [[Project Default Flow]]. | PRD §5, §13; feature map §1; `flow-designer.html` |
| **Recipe** | Feature-map word for a flow. | feature map §1, §2 |
| **Flow type** | What the new-project dialog offers: *"flow‑type select ("Empty" allowed); choosing one creates flow v1"*. | backlog Story 1.3 |
| **Check command** ⚠ | `projects.check_command`, *"e.g. 'pnpm lint && pnpm test'; what a shell check step runs"*. **Overloaded:** *check step* (a `kind='shell'` step), *check container* (drawio: the sandbox that runs it), *Check for updates* (the library action), and `POST /api/projects/:id/plugins/check-updates`. See [[Project Check Command]]. | PRD §5, §12; drawio |
| **Shell step / check step** | A `kind='shell'` step. Runs `step_defs.command`, or the project's `check_command` when that is null. See [[Check Steps]]. | PRD §5, §7 |
| **Scratch repo** | The throwaway git repo the seed project points at, *"auto‑`git init`ed"*. See [[Seed Project]]. | PRD §14; backlog Story 1.2 |
| **Registering a project** | PRD wording for adding one: *"Registering a project copies the seeds into its store under FlowBoard's commit."* Not otherwise defined; read here as *creating* a project. | PRD §15 |
| **Capability store / project store** | `<repo_path>/.flowboard/skills/<plugin>/<commit>/`, gitignored, per project. See [[Capability Storage On Disk]]. | PRD §5, §13; Capability Library D5 |
| **Worktree / workspace** | A task's private checkout, `<repo_path>/.vibe-worktrees/task-<id>` on `vibe/task-<id>` (PRD). Belongs to a task, lives inside the project's repo. See [[Task Workspace]]. | PRD §11 |
| **Project scope** ⚠ | In memory: `{ kind: 'project'; projectId }`, *"build quirks, naming conventions, where things live"*. **Overloaded:** *project-scoped* also describes API routes under `/api/projects/:id/…` and the per-project library. | `09`; Capability Library API notes |
| **Projects list** | The `/` page: *"Cards with task counts by status and this week's spend."* The design handoff's nav has no such page; its nearest pill is **Boards**. See [[Projects List Page]]. | PRD §13; `docs/old/design/Vibe Kanban.dc.html` |
| **Visibility** | Feature-map idea: who can see a project and its repo. Not in v1. See [[Project Visibility]]. | feature map §1 |
| **Trusted repo** | A repo whose content you trust enough for a weaker isolation tier. *"host only for non-bypass steps or an explicit trusted-repo opt-out."* See [[Repository Trust And Sandboxing]]. | `08` |

## Related

- [[Projects Index]]
- [[Flow Design Glossary]]
- [[Capability Library Glossary]]
- [[Task Detail Glossary]]
