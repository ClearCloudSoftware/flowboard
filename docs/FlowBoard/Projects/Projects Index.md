---
tags: [flowboard, projects, index]
module: Projects
---

# Projects Index

A **project** is FlowBoard's handle on one codebase: a name, a URL slug, the absolute path of a local git repository, a default flow (read as the flow new tasks start on, an inference; see [[Project Default Flow]]), and the command a check step runs. Almost everything else hangs off it: flows, tasks, installed plugins, agents, the board, the per-project library, a memory scope and a line in every cost rollup.

> [!important] The one idea to get right first
> A project is a **thin record that scopes everything else**. The PRD gives it five working columns (`name`, `slug`, `repo_path`, `default_flow_id`, `check_command`) and no behaviour of its own. Its weight comes from what points at it: four tables carry `project_id … ON DELETE CASCADE`, and the repo it names is where worktrees and the capability store live. See [[Project Record]] and [[What Belongs To A Project]].

> [!check] Built, 2026-11-12
> Projects are built without a database, in the app's file-based style: `projects.json` in FlowBoard's data folder (`FLOWBOARD_DATA_DIR`, else `code/flowboard/data/`) holds `id`, `name`, `slug`, `repoPath`, `defaultFlow`, `baseBranch`, `createdAt`, `type`, `source` and `overrides` (`packages/cli/src/projects.ts`).
> - **Check command:** not on the record but `check_command` in the repo's `.flowboard.yaml`, beside the sandbox limits; an empty `shell:` runs it ([[Run Flow Reference#Project file]]). OQ #6: the designer's check warns about an empty `shell:`, a project whose default flow has one and whose repo sets no check command shows a warning, and a run there is refused.
> - **Flows by type:** a project runs its type's library flows as they are (*Software*: `delivery`, `review-loop`); `defaultFlow` is the type's first one in the library, and the project page can still pick another for New run. The earlier per-project flow copy (`flowType`) is gone.
> - **Registration** resolves the repo's top folder (400 if not a git repo; 409 for a repo or slug already used), adds `.flowboard/` to `.git/info/exclude`, and records the checked-out branch as `baseBranch` (OQ #14). Cards and the page warn about no commits, a detached HEAD, another branch checked out, and uncommitted changes.
> - **Cards** count **runs** by status (there are no tasks yet) and their spend over the last seven days (OQ #11).
> - **Pages:** `/` (cards, New project), `/p/<slug>` (settings, the settings pages, the repo's runs, New run, Remove), `/settings` (the app's settings, a section per page beside a sidebar, as GitHub's are: *General*, the projects folder; *Connections*, GitHub through `gh`, with GitLab, Bitbucket, Azure Repos and Slack *coming soon*; *Agents*, Claude Code and OpenCode: what each installed CLI reports (version, login) and the program, default model and effort to run it with, saved but not yet read by runs; *Defaults*, what projects inherit). **API:** `GET`/`POST /api/projects`, `PATCH`/`DELETE /api/projects/:id`, `GET`/`POST /api/projects/clone`, `GET /api/projects/clone/:job`, `GET`/`PATCH /api/settings`, `GET /api/agents`, `GET /api/github`, `GET /api/github/repos?owner=`, `POST /api/github/switch`. Remove is refused while a run in the repo is going and only forgets the record: runs, files and spend history stay (OQ #9's archive-not-erase).
> - **Seed:** the first `GET` makes *Scratch*, a committed scratch repo with `check_command: node --test`, once.
> - **New project wizard** ([`new-project-wizard.html`](../../mockups/new-project-wizard.html), phases 1–2 of the build): Type → Source → Repository → Settings → Clone, in a dialog. GitHub is the installed `gh` CLI's login (`packages/cli/src/github.ts`), the way the Claude provider uses the `claude` login: FlowBoard keeps no token. A missing, signed-out or rejected `gh` shows the command that fixes it; an organization that restricts OAuth apps shows *no access* and a *Request access* link. The clone runs `gh repo clone` as a job in the server (`clone.ts`) and registers the project when git finishes; the name is the repo's, the slug the name's or `owner-name` on a clash, the base branch GitHub's default. The clone goes into the app's projects folder, else `~/FlowBoard/projects`, or a folder for that project; a folder that holds something gets `-2`.
> - **Settings and where they come from** (`settings.ts`): app (`settings.json` in the data folder, edited on `/settings`) → project type → project. Each page shows the source of its value and has an *override* switch. Trust, budget, escalation, memory, knowledge and draft mode are the project record's `overrides`; limits and the check command stay in the repo's `.flowboard.yaml`, whose schema has no key for trust, network or budget, so a cloned repo cannot grant itself any (OQ #16, #23). Stored and shown, **not yet acted on**: the tier, the project budget, escalation, memory, knowledge assets and draft mode each wait for their own phase (sandbox tier and budget in run-flow, the analysis agent, knowledge assets, escalation, memory); each page says so.
> - **Decisions open to review (2026-11-12):** (1) a project runs its type's flows, no copies; (2) *Use another account* is `gh auth switch` between accounts `gh` already holds, else the `gh auth login` command; *Reconnect* is `gh auth refresh`; (3) *Request access* opens the GitHub CLI app's page on github.com; (4) clone jobs live in the server's memory, so a restart mid-clone loses the job; (5) *used before* folders are the parents of earlier clones; (6) graphify's cost per rebuild is a guess from the repo's size; (7) records from before read as local Software projects with nothing overridden; (8) an empty repository is listed but cannot be picked.
> - **Not here:** where worktrees go (OQ #17) is Workspaces' question, and no code makes worktrees yet. Copying seed plugins and agents at registration waits for the Capability Library's store and seed plugins, none of which exist in code yet. Visibility stays an idea: PRD §2 forbids users and auth.

This is a platform component. There is no projects mockup, so this set is architecture reference built from the PRD, the backlog, the architecture notes, the drawio and the places other mockups show a project or repo. Expect [[Projects Open Questions|open questions]].

## Start here

- [[Projects Overview]]: purpose, place in the system, design principles
- [[Projects Glossary]]: terms, including the overloaded words *project*, *repo*, *slug*, *default flow* and *check*

## Core concepts

- [[Project Record]]: the `projects` row, field by field
- [[Project Repository]]: the local git repo a project points at, and what FlowBoard writes into it
- [[Project Default Flow]]: the recipe new tasks start on; *default*, *active* and *adopted*
- [[Project Check Command]]: the command a shell check step runs when the step names none
- [[What Belongs To A Project]]: every table, store and view scoped by project, and what stays global

## Behaviour and rules

- [[Creating A Project]]: the new-project form, registration, seeds, flow v1
- [[Project Lifecycle And Deletion]]: create, the missing edit and delete, and what a cascade would remove
- [[Project Rules And Edge Cases]]: every rule, quoted, and the edge cases the sources leave open
- [[Repository Trust And Sandboxing]]: how trust in a repo picks an isolation tier, and the git boundary
- [[Project Visibility]]: the feature-map idea of per-project access, against the single-user PRD

## Where projects show

- [[Projects List Page]]: `/`, the home screen of project cards
- [[Project Surfaces]]: the board header, inbox, monitor, task detail, flow designer, library and costs

## Under the hood

- [[Projects Data Model]]: the `projects` table, its foreign keys and unique keys
- [[Projects Runtime]]: how `repo_path`, `check_command` and `default_flow_id` reach the engine and runner
- [[Projects API And Routes]]: `GET`/`POST /api/projects`, the project-scoped routes, pages
- [[Projects Storage]]: rows in `flowboard.db` and files in the managed repo

## Content and direction

- [[Seeded Project]]: the one project FlowBoard ships with, on a scratch repo (the whole seed is Intake And Import's [[Seed Data]])
- [[Projects Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Projects Open Questions]]: where the sources disagree or leave a gap
- [[Projects Sources]]: where every fact in these notes comes from

## Related

- [[Flow Design Index]]: flows belong to a project
- [[Capability Library Index]]: the per-project plugin store
- [[Task Detail Index]]: a task's repo, branch and workspace
- [[Cost And Control Index]]: spend per project
- [[Settings And Plumbing Index]]: global settings, the API surface, the database and migrations
- [[Intake And Import Index]]: the seed project, import into a project, promote
- [[Workspaces Index]]: the worktrees cut from the project's repo
- [[Memory Index]]: the `project` memory scope
- [[Sandboxing Index]]: the isolation tier a repo's trust picks
- [[Component Documentation Tracker]]
