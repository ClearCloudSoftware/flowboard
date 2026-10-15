---
tags: [flowboard, projects, index]
module: Projects
---

# Projects Index

A **project** is FlowBoard's handle on one codebase: a name, a URL slug, the absolute path of a local git repository, a default flow (read as the flow new tasks start on, an inference; see [[Project Default Flow]]), and the command a check step runs. Almost everything else hangs off it: flows, tasks, installed plugins, agents, the board, the per-project library, a memory scope and a line in every cost rollup.

> [!important] The one idea to get right first
> A project is a **thin record that scopes everything else**. The PRD gives it five working columns (`name`, `slug`, `repo_path`, `default_flow_id`, `check_command`) and no behaviour of its own. Its weight comes from what points at it: four tables carry `project_id … ON DELETE CASCADE`, and the repo it names is where worktrees and the capability store live. See [[Project Record]] and [[What Belongs To A Project]].

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
