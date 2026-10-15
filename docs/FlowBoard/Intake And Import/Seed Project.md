---
tags: [flowboard, intake-and-import, seed, defaults]
module: Intake And Import
---

# Seed Project

What FlowBoard creates so there is something to look at on first run. The drawio *Functional components* Intake card: *"Seed project / default flow + sample tasks"*. The *FlowBoard ideation* card: *"Seed data / One project, default flow, sample tasks, so the app is alive on first run."*

## What is seeded

| Seed | Source |
|---|---|
| **One project** pointing at a scratch git repo | PRD §14 M1: *"Seed a project pointing at a scratch git repo."* Backlog 1.2: *"Seed project pointing at an auto‑`git init`ed scratch repo."* (**PRD**) |
| **One flow**, *Software delivery* | PRD §15: *"Seed one project and one flow, **Software delivery**, that reproduces my actual workflow."* File: `seed/flows/default.json` (PRD §3). See [[Seeded Flows]] |
| The project's **`check_command`** | PRD §15: *"Seed the scratch project's `check_command` with something that exists in the scratch repo."* |
| **Six agents and five skills**, exactly what the flow uses | PRD §15. See [[Seeded Capabilities]] |
| **Ten artifact types** | PRD §6: *"Seed these artifact types: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary`."* |
| **Sample tasks** | drawio only (both cards above). Not in PRD §15 or backlog 1.2 |

> [!warning] Sample tasks
> Only the drawio seeds tasks. The PRD seeds a project and a flow; the backlog's Story 1.2 lists the flow template, agents, skills and the project, and no tasks. No source says what the sample tasks would be. See [[Intake And Import Open Questions]] #19.
>
> The tasks in the mockups (`auth-refactor`, `pdf-import`, `billing-webhook` …) are each mockup's own sample data, not seed data: *"twelve tasks seeded in `TASKS`"* ([[Monitor Sample Data]]).

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
- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Intake Storage]]
- [[Intake And Import Roadmap]]
