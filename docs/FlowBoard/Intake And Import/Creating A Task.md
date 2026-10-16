---
tags: [flowboard, intake-and-import, behaviour, task]
module: Intake And Import
---

# Creating A Task

Adding one task by hand, without a file.

> *"**Create and track work** — Add a task with a title and description; it moves through states from "backlog" to "in progress" to "done" (or "blocked" / "failed" if something goes wrong)."* — feature map §3

## In the sources

| Source | What it says |
|---|---|
| PRD §1 | *"A task enters the Backlog, gets promoted to Todo, and then flows through a graph of automated steps"* |
| PRD §12 | `GET /api/tasks?project=&status=` and `POST /api/tasks` |
| PRD §14 M2 | *"Create tasks manually. Board renders columns from a hardcoded flow. Promote Backlog → Todo creates a worktree. No agents run yet."* |
| backlog 2.1 | *"`POST /api/tasks`, `GET /api/tasks?project=&status=`, `GET /api/tasks/:id`."* (**PRD**) |
| drawio *Functional components* | Intake card *"Create / edit task"* |

## What a task carries

**Inference:** no source gives the create body. The fields below are inferred from the PRD §5 `tasks` schema plus feature map §3 (*"Add a task with a title and description"*). Fields a person would write at creation:

| Field | Required | Meaning |
|---|---|---|
| `project_id` | yes | owning project |
| `title` | yes (`NOT NULL`) | — |
| `body` | no | the description |
| `acceptance_criteria` | no | *"the exact conditions that close the task; reviewed against"* |
| `non_goals` | no | *"what the agents must not touch or attempt"* |

Set by the system: `id`, `status`, `created_at`, `updated_at`. Left empty until later: `flow_id` (*"null while in backlog, pinned on promotion"*), `branch_name`, `worktree_path`, `capability_pins`. Never set for a hand-made task: `import_key` (see [[Import Key]]). Full table in [[Intake Data Model]] and [[Task Record]].

> **Say what "done" means** — Each task can carry *acceptance criteria* (what has to be true to close it) and *non-goals* (what agents must leave alone). Every step sees both, and the review checks against them, so an agent can't quietly swap in an easier job and call it finished. — feature map §3

## Where it lands

**Inference:** a new task's status is `backlog`. PRD §1 says a task *"enters the Backlog"*, and the monitor guide describes the backlog task as one that *"exists and has a title, and nothing else. No workspace, no agent, no spend."* No source states the initial value of `tasks.status`. See [[Intake And Import Open Questions]] #6.

## Editing

The drawio card says *"Create / edit task"*, but PRD §12 lists no `PATCH /api/tasks/:id`, and no source describes an edit form, which fields stay editable after promotion, or whether a re-import may overwrite a hand edit. See [[Intake And Import Open Questions]] #18.

## No form is designed

No mockup draws a new-task form, and neither does the old v1 design handoff, whose board shows Backlog and Todo columns but no create control. The projects list has a *"New‑project dialog"* (backlog 1.3), but there is no matching story for tasks. The Monitor has no create control.

## Related

- [[Intake And Import Index]]
- [[Promoting A Task]]
- [[Task Record]]
- [[Task Lifecycle]]
- [[Intake API And Routes]]
