---
tags: [flowboard, projects, seed]
module: Projects
---

# Seeded Project

FlowBoard ships with one project so the app is alive on first run. This note covers that project's own fields (repo, flow, check command). The seed as a whole, including sample tasks and artifact types, is documented in Intake And Import's [[Seed Data]] note; the scratch repo as a place to cut worktrees from is in [[Seed Scratch Repo]].

| Source | Wording |
|---|---|
| PRD §15 | *"Seed one project and one flow, **Software delivery**, that reproduces my actual workflow."* |
| PRD §15 | *"Seed the scratch project's `check_command` with something that exists in the scratch repo."* |
| PRD §14 M1 | *"Seed a project pointing at a scratch git repo. Projects list page renders."* |
| Backlog Story 1.2 | *"Seed project pointing at an auto‑`git init`ed scratch repo."* (**PRD**) |
| Drawio *FlowBoard ideation*, Import & seed | *"Seed data — One project, default flow, sample tasks, so the app is alive on first run."* |
| Drawio *Functional components*, Intake | *"Seed project — default flow + sample tasks"* |

## What it contains

| Part | Value | Source |
|---|---|---|
| Repo | a scratch repo FlowBoard creates with `git init` | backlog Story 1.2 |
| Default flow | *Software delivery*, nine steps | PRD §15; see [[Seeded Flows]] |
| Check command | *"something that exists in the scratch repo"*; the value is not given | PRD §15 |
| Seed plugins | `grill-me`, `plan-implementation`, `explain-simply`, `ponytail`, `code-review`, copied into its store under FlowBoard's commit | PRD §15; Capability Library D6; see [[Seeded Capabilities]] |
| Seed agents | `scout`, `architect`, `developer`, `tester`, `reviewer`, `scribe`, *"read-only in the editor"* | PRD §15; backlog Story 1.2 |
| Sample tasks | drawio only | drawio (both pages) |

> [!warning] Sample tasks
> Both drawio cards seed *"sample tasks"*. PRD §15 and backlog Story 1.2 seed none, and the M2 milestone says *"Create tasks manually."* See [[Projects Open Questions]] #19 and [[Intake And Import Open Questions]] #19.

## Why the scratch repo matters

M5's proof runs against it: *"a deliberately failing test in the scratch repo sends the seeded flow from `check` back to `implement` with the raw log"* (PRD §14). So the scratch repo needs a real lint and test command that can fail on purpose. The seed skills are local *"so M5 is testable without any GitHub access"* (PRD §15).

## Gaps

- Where the scratch repo lives (inside FlowBoard's `data/`? a temp dir?) is not stated.
- Its name and slug are not stated.
- The `check_command` value is not stated.
- Whether a seed project is created on every fresh database, or only once, is not stated.
- Whether the scratch repo gets a first commit is not stated. `git worktree add` needs a commit to branch from, so a bare `git init` would make M2's first promotion fail *(git behaviour, inferred)*. See [[Workspaces Open Questions]] #4.

All in [[Projects Open Questions]] #19.

## Related

- [[Seed Data]]
- [[Seed Scratch Repo]]
- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Seeded Flow Execution]]
- [[Project Check Command]]
- [[Creating A Project]]
