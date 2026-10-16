---
tags: [flowboard, intake-and-import, index]
module: Intake And Import
---

# Intake And Import Index

Intake And Import is how work gets into FlowBoard: import a markdown backlog, create a task by hand, promote it from Backlog to Todo, and the seed project you get on first run. Behind the import sits the **TaskSource port**, so GitHub Issues, Linear, Jira or a webhook cost an adapter, not a rewrite.

> [!important] The one idea to get right first
> A task's import identity is its `import_key`, and the server derives it, never the agent. *"Never trust the agent's key — it drifted between runs … and that is what duplicated tasks."* (`05` §14). Everything else follows: one parser for both file shapes, an upsert on `(project_id, import_key)`, and the acceptance test *"re-import twice = 0 created, N updated"*.

There is no mockup for this component in `docs/mockups/`. This set is built from the PRD, the backlog, the architecture notes, the reference port and adapter (run to check their behaviour), the drawio, the old v1 design handoff (`docs/old/design/`, which draws the board's Backlog and Todo columns), and the places the monitor and task-detail mockups show the backlog and promotion.

## Start here

- [[Intake And Import Overview]]: purpose, place in the system, design principles
- [[Intake And Import Glossary]]: terms, including the overloaded words *backlog*, *import*, *seed* and *promote*

## Core concepts

- [[TaskSource Port]]: the interface, its two sketches, the adapters
- [[Markdown Task Source]]: the deterministic parser and its self-check
- [[Backlog Importer Agent]]: the *"messy file"* adapter, how it is invoked
- [[Backlog File Shapes]]: heading per task, category plus bold bullets, sub-sections, explicit ids
- [[Import Key]]: how a task's identity is derived and why the server owns it

## Behaviour and rules

- [[Idempotent Upsert]]: re-import without duplicates, and what it leaves open
- [[Import Job Lifecycle]]: request, temp file, `import_backlog` job, *"6 created"*
- [[Parser Edge Cases]]: what the reference does with odd markdown
- [[Import Trust And Isolation]]: the backlog is untrusted input
- [[Creating A Task]]: one task by hand
- [[Promoting A Task]]: Backlog → Todo, demote, and the D1 question

## Where it shows

- [[Intake In The UI]]: Backlog and Todo columns, drag marks, the Import button, the sheet

## Under the hood

- [[Intake Data Model]]: `tasks`, `jobs`, port types, proposals
- [[Intake Runtime]]: processes, code layout, call sites
- [[Intake API And Routes]]: import, create, promote, start
- [[Intake Storage]]: tables, temp files, seeds, worktrees
- [[Intake Testing]]: acceptance checks and the self-check

## Content and direction

- [[Seed Data]]: the project, flow and capabilities seeded on first run, and the drawio's sample tasks
- [[Future Task Sources]]: GitHub Issues, Linear, Jira, webhook
- [[Intake And Import Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Intake And Import Open Questions]]: where the sources disagree or leave a gap
- [[Intake And Import Sources]]: where every fact in these notes comes from

## Related

- [[Execution Index]]: what happens after promote, including Start
- [[Task Detail Index]]: the task record and its lifecycle
- [[Flow Design Index]]: the flow a promoted task pins
- [[Monitor Index]]: the backlog count and the life-of-a-task walkthrough
- [[Capability Library Index]]: seeded capabilities
- [[Projects Index]]: the seed project and which project an import lands in
- [[Workspaces Index]]: the worktree promote creates
- [[Component Documentation Tracker]]
