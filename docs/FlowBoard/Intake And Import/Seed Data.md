---
tags: [flowboard, intake-and-import, seed, defaults]
module: Intake And Import
---

# Seed Data

What FlowBoard creates so there is something to look at on first run. The drawio *Functional components* Intake card: *"Seed project / default flow + sample tasks"*. The *FlowBoard ideation* card is titled **Seed data**: *"Seed data / One project, default flow, sample tasks, so the app is alive on first run."*

This note covers the seed from the intake side, mainly the sample tasks. The seeded project itself is [[Seeded Project]] in the Projects set; its repo, from the workspace side, is [[Seed Scratch Repo]].

## What is seeded

| Seed | Source |
|---|---|
| **One project** pointing at a scratch git repo | PRD §14 M1: *"Seed a project pointing at a scratch git repo."* Backlog 1.2: *"Seed project pointing at an auto‑`git init`ed scratch repo."* (**PRD**) |
| **One flow**, *Software delivery* | PRD §15: *"Seed one project and one flow, **Software delivery**, that reproduces my actual workflow."* File: `seed/flows/default.json` (PRD §3). See [[Seeded Flows]] |
| The project's **`check_command`** | PRD §15: *"Seed the scratch project's `check_command` with something that exists in the scratch repo."* |
| **Six agents and five skills**, exactly what the flow uses | PRD §15. See [[Seeded Capabilities]] |
| **Ten artifact types** | PRD §6: *"Seed these artifact types: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary`."* Backlog 1.1 says *"the nine PRD types + `sources`, `grounding_report`"*; see [[Flow Design Open Questions]] #25 |
| **Sample tasks** | drawio only (both cards above). Not in PRD §15 or backlog 1.2 |

> [!warning] Sample tasks
> Only the drawio seeds tasks. The PRD seeds a project and a flow, and its M2 milestone says *"Create tasks manually."* (PRD §14). The backlog's Story 1.2 lists the flow template, agents, skills and the project, and no tasks. No source says what the sample tasks would be. See [[Intake And Import Open Questions]] #19 and [[Projects Open Questions]] #19.
>
> The tasks in the mockups (`auth-refactor`, `pdf-import`, `billing-webhook` …) are each mockup's own sample data, not seed data: *"twelve tasks seeded in `TASKS`"* ([[Monitor Sample Data]]).

> [!note] One flow or two
> The feature map promises more: *"Ships with a couple of complete ones (a full software-development pipeline and a research pipeline)"* (§2), and *"A starter set — Comes with a handful of ready skills and agents so the sample recipes work out of the box."* (§16). Backlog 1.2 keeps the research template out of v1: *"The `researcher` web-research template is out of v1 until open-web egress has an answer."* See [[Seeded Flows]] and [[Flow Design Open Questions]] #32.

## The scratch repo

Its job is to make milestones testable without a real codebase:

- M1 needs a project to list: *"Projects list page renders."* (PRD §14).
- M5's proof runs in it: *"a deliberately failing test in the scratch repo sends the seeded flow from `check` back to `implement` with the raw log"* (PRD §14).

Backlog 1.2 says it is *auto-`git init`ed*. No source gives its path or what code it holds. See [[Intake And Import Open Questions]] #20.

## Seeds and new projects

Seeded capabilities are copied per project: *"Registering a project copies the seeds into its store under FlowBoard's commit; upgrading FlowBoard stages new seed commits as an available update rather than applying them."* (PRD §15). The new-project dialog has *"flow‑type select ("Empty" allowed); choosing one creates flow v1"* (backlog 1.3, **NEW**). Feature map §1: *"name it and choose which recipe new tasks should follow (or start empty)"*.

## Not seeds

- **`backlog-importer`** is *"part of the import feature, not a seed"* (PRD §15). See [[Backlog Importer Agent]].
- **`ask-three`** *"is a test fixture loaded by the test setup, not a seed"* (PRD §15).

## Related

- [[Intake And Import Index]]
- [[Seeded Project]]
- [[Seed Scratch Repo]]
- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Intake Storage]]
- [[Intake And Import Roadmap]]
