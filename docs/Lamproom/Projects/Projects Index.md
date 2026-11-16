---
tags: [lamproom, projects, index]
module: Projects
---

# Projects Index

A **project** is Lamproom's handle on one codebase: a name, a URL slug, the absolute path of a local git repository, a default flow (read as the flow new tasks start on, an inference; see [[Project Default Flow]]), and the command a check step runs. Almost everything else hangs off it: flows, tasks, installed plugins, agents, the board, the per-project library, a memory scope and a line in every cost rollup.

> [!important] The one idea to get right first
> A project is a **thin record that scopes everything else**. The PRD gives it five working columns (`name`, `slug`, `repo_path`, `default_flow_id`, `check_command`) and no behaviour of its own. Its weight comes from what points at it: four tables carry `project_id … ON DELETE CASCADE`, and the repo it names is where worktrees and the capability store live. See [[Project Record]] and [[What Belongs To A Project]].

> [!check] Built, 2026-11-12
> Projects are built without a database, in the app's file-based style: `projects.json` in Lamproom's data folder (`LAMPROOM_DATA_DIR`, else `code/lamproom/data/`) holds `id`, `name`, `slug`, `repoPath`, `defaultFlow`, `baseBranch`, `createdAt`, `type`, `source` and `overrides` (`packages/cli/src/projects.ts`).
> - **Check command:** not on the record but `check_command` in the repo's `.lamproom.yaml`, beside the sandbox limits; an empty `shell:` runs it ([[Run Flow Reference#Project file]]). OQ #6: the designer's check warns about an empty `shell:`, a project whose default flow has one and whose repo sets no check command shows a warning, and a run there is refused.
> - **Flows by type:** a project runs its type's library flows as they are (*Software*: `delivery`, `review-loop`); `defaultFlow` is the type's first one in the library, and the project page can still pick another for New run. The earlier per-project flow copy (`flowType`) is gone.
> - **Registration** resolves the repo's top folder (400 if not a git repo; 409 for a repo or slug already used), adds `.lamproom/` to `.git/info/exclude`, and records the checked-out branch as `baseBranch` (OQ #14). Cards and the page warn about no commits, a detached HEAD, another branch checked out, and uncommitted changes.
> - **Cards** count **runs** by status (there are no tasks yet) and their spend over the last seven days (OQ #11).
> - **Pages:** `/` (cards, New project), `/p/<slug>` (settings, the settings pages, the repo's runs, New run, Remove), `/settings` (the app's settings, a section per page beside a sidebar, as GitHub's are: *General*, the projects folder; *Connections*, three pages: source repositories (GitHub through `gh`; GitLab, Bitbucket, Azure Repos *coming soon*), task providers and escalation channels (Slack, Discord, Google Chat, email, webhook, desktop), all *coming soon*; *Agents*, Claude Code and OpenCode: what each installed CLI reports (version, login) and the program, default model and effort to run it with, saved but not yet read by runs; *Workflows*, the shipped flows by domain, where only Software's `delivery` and `review-loop` are real and the rest are labelled examples; *Defaults*, what projects inherit). **API:** `GET`/`POST /api/projects`, `PATCH`/`DELETE /api/projects/:id`, `GET`/`POST /api/projects/clone`, `GET /api/projects/clone/:job`, `GET`/`PATCH /api/settings`, `GET /api/agents`, `GET /api/github`, `GET /api/github/repos?owner=`, `POST /api/github/switch`. Remove is refused while a run in the repo is going and only forgets the record: runs, files and spend history stay (OQ #9's archive-not-erase).
> - **Seed:** the first `GET` makes *Scratch*, a committed scratch repo with `check_command: node --test`, once.
> - **New project wizard** ([`new-project-wizard.html`](../../mockups/new-project-wizard.html), phases 1–2 of the build): Type → Source → Repository → Settings → Clone, in a dialog. GitHub is the installed `gh` CLI's login (`packages/cli/src/github.ts`), the way the Claude provider uses the `claude` login: Lamproom keeps no token. A missing, signed-out or rejected `gh` shows the command that fixes it; an organization that restricts OAuth apps shows *no access* and a *Request access* link. The clone runs `gh repo clone` as a job in the server (`clone.ts`) and registers the project when git finishes; the name is the repo's, the slug the name's or `owner-name` on a clash, the base branch GitHub's default. The clone goes into the app's projects folder, else `~/Lamproom/projects`, or a folder for that project; a folder that holds something gets `-2`.
> - **Settings and where they come from** (`settings.ts`): app (`settings.json` in the data folder, edited on `/settings`) → project type → project. Each page shows the source of its value and has an *override* switch. Trust, budget, escalation, memory, knowledge and draft mode are the project record's `overrides`; limits and the check command stay in the repo's `.lamproom.yaml`, whose schema has no key for trust, network or budget, so a cloned repo cannot grant itself any (OQ #16, #23). **Trust is acted on** (2026-11-13): lr-run-flow picks where a run works from it, and refuses a folder no project owns ([[Repository Trust And Sandboxing#Built]]). **The monthly budget is acted on** (2026-11-13): lr-run-flow refuses a start or resume once the project's runs this calendar month have spent its cap (*ask me first* lets one through with `--over-project-budget`, the runs page's **Start anyway**), caps each agent run at what is left, and pauses the run when it is spent; the card and page show the month's spend and a warning past the alert ([[Run Flow Reference#Stopping and resuming]]). **The repo analyst runs** (2026-11-13): after a GitHub clone, or from **Analyse** on the project page, it proposes the stack, the check command and the network hosts, which you accept on the wizard's done screen or the project page; accepted hosts reach OpenSandbox boxes only ([[Creating A Project]]). **Knowledge assets are built and used** (2026-11-15): a build is a run of the project that maps the code with graphify and indexes its symbols with Serena into `.lamproom/knowledge/`, after a clone, from **Rebuild** on the project page, and from the server's scheduler when the base branch moves or once a day; agents in the repo's folder get Serena as a read-only MCP server and graphify's report ([[Knowledge Assets Handoff]]). **Escalation reaches Slack** (2026-11-15): a question a run asks the page, unanswered for the project's minutes, is posted to its Slack channel over Socket Mode and can be answered there through a modal, the first answer winning; the message is repainted when the question is answered anywhere or stops waiting, and the budget alert and cap are posted too ([[Slack Escalation Handoff]]). **Project memory is kept and recalled** (2026-11-15): after a run of a project with memory on ends done, lr-run-flow saves notes from its summary and review artifacts and the choices you made into `<data>/memory/<project id>.json`, recalls the ones sharing words with each agent attempt as a 7th prompt part labelled background (at most 6,000 characters), and the project page lists them to forget ([[Project Memory Handoff]]). Stored and shown, **not yet acted on**: draft mode waits for its own phase; its page says so.
> - **Decisions open to review (2026-11-12):** (1) a project runs its type's flows, no copies; (2) *Use another account* is `gh auth switch` between accounts `gh` already holds, else the `gh auth login` command; *Reconnect* is `gh auth refresh`; (3) *Request access* opens the GitHub CLI app's page on github.com; (4) clone jobs live in the server's memory, so a restart mid-clone loses the job; (5) *used before* folders are the parents of earlier clones; (6) graphify's cost per rebuild was a guess from the repo's size (gone 2026-11-15: its code map is free); (7) records from before read as local Software projects with nothing overridden; (8) an empty repository is listed but cannot be picked.
> - **Not here:** where worktrees go (OQ #17) is Workspaces' question, and no code makes worktrees yet. Copying seed plugins and agents at registration waits for the Capability Library's store and seed plugins, none of which exist in code yet. Visibility stays an idea: PRD §2 forbids users and auth.

This is a platform component. There is no projects mockup, so this set is architecture reference built from the PRD, the backlog, the architecture notes, the drawio and the places other mockups show a project or repo. Expect [[Projects Open Questions|open questions]].

## Start here

- [[Projects Overview]]: purpose, place in the system, design principles
- [[Projects Glossary]]: terms, including the overloaded words *project*, *repo*, *slug*, *default flow* and *check*

## Core concepts

- [[Project Record]]: the `projects` row, field by field
- [[Project Repository]]: the local git repo a project points at, and what Lamproom writes into it
- [[Project Default Flow]]: the recipe new tasks start on; *default*, *active* and *adopted*
- [[Project Check Command]]: the command a shell check step runs when the step names none
- [[What Belongs To A Project]]: every table, store and view scoped by project, and what stays global
- [[Project Settings]]: what a project overrides, the order values come in, and repo-stored against Lamproom-stored

## Behaviour and rules

- [[Creating A Project]]: the new-project form, registration, seeds, flow v1
- [[Project Lifecycle And Deletion]]: create, the missing edit and delete, and what a cascade would remove
- [[Project Rules And Edge Cases]]: every rule, quoted, and the edge cases the sources leave open
- [[Repository Trust And Sandboxing]]: how trust in a repo picks an isolation tier, and the git boundary
- [[Isolation Enforcement Handoff]]: the open critical issue, what happens when a run starts, and the rulings made while building (2026-11-13)
- [[Project Budget Handoff]]: how the monthly cap works, the decisions and rulings made while building it, and its open questions (2026-11-13)
- [[Analysis Agent Handoff]]: the repo analyst after a clone, the decisions and rulings made while building it, and its known problems (2026-11-13)
- [[Knowledge Assets Handoff]]: how Serena and graphify are built and reach agents, the decisions and rulings made while building them, and the known problems (2026-11-15)
- [[Project Memory Handoff]]: how a project's runs save and recall memory, the store, the page, the decisions and rulings made while building it, and the known problems (2026-11-15)
- [[Slack Escalation Handoff]]: how a waiting question reaches Slack and is answered there, the Slack app's manifest and setup, the decisions and rulings made while building it, and the known problems (2026-11-15)
- [[Project Visibility]]: the feature-map idea of per-project access, against the single-user PRD

## Where projects show

- [[Projects List Page]]: `/`, the home screen of project cards
- [[Project Surfaces]]: the board header, inbox, monitor, task detail, flow designer, library and costs

## Under the hood

- [[Projects Data Model]]: the `projects` table, its foreign keys and unique keys
- [[Projects Runtime]]: how `repo_path`, `check_command` and `default_flow_id` reach the engine and runner
- [[Projects API And Routes]]: `GET`/`POST /api/projects`, the project-scoped routes, pages
- [[Projects Storage]]: rows in `lamproom.db` and files in the managed repo

## Content and direction

- [[Seeded Project]]: the one project Lamproom ships with, on a scratch repo (the whole seed is Intake And Import's [[Seed Data]])
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
