---
tags: [flowboard, task-detail, concept, task]
module: Task Detail
---

# Task Record

A **task** is *"The individual pieces of work — a feature, a bug, a question — that move through a recipe."* (feature map §3).

## Fields

From PRD §5 `tasks`:

| Column | Meaning (PRD §5 comment where quoted) | Shown on task detail |
|---|---|---|
| `id` | primary key | Topbar id, e.g. `auth-refactor` |
| `project_id` | owning project | Implied by repo |
| `flow_id` | *"null while in backlog, pinned on promotion"* | Aside **flow**. See [[Pinned Flow On A Task]] |
| `title` | — | `h1` |
| `body` | — | The prose paragraph under the title |
| `acceptance_criteria` | *"the exact conditions that close the task; reviewed against"* | Not in the mockup (see below) |
| `non_goals` | *"what the agents must not touch or attempt"* | Not in the mockup |
| `status` | `'backlog'\|'todo'\|'running'\|'blocked'\|'done'\|'failed'\|'cancelled'` | Status pill. See [[Task Lifecycle]] |
| `import_key` | *"stable key for idempotent md import"* | — |
| `branch_name` | the task's branch | Aside **repo & branch** |
| `worktree_path` | the task's worktree | Aside **workspace** |
| `capability_pins` | *"JSON {plugins:{id:commit_sha}, agents:{id:<agent row>}}, set when the task starts"* | — |
| `created_at`, `updated_at` | — | Aside **timeline** `created …` |

The mockup's aside also shows **owner** (`you`) and **started** (`today 09:21`). Neither is a PRD column. See [[Task Detail Open Questions]].

## Acceptance criteria and non-goals

> **Say what "done" means** — Each task can carry *acceptance criteria* (what has to be true to close it) and *non-goals* (what agents must leave alone). Every step sees both, and the review checks against them, so an agent can't quietly swap in an easier job and call it finished. — feature map §3

How the sources use them:

- **Prompt.** Part 1 of every prompt names *"the task, its title and body, its acceptance criteria ("the task is done when…") and its non-goals ("do not touch…")"* (PRD §7). Placeholders `{{acceptance_criteria}}` and `{{non_goals}}` are available to prompt templates.
- **Hooks.** The per-run `PreToolUse` hook denies *"any path matching a line of the task's `non_goals` that is written as a path or glob"* (PRD §7).
- **Review.** The seeded `/code-review` skill *"reviews the diff against the task's acceptance criteria and non-goals and against the raw `check_output`"* (PRD §15).
- **Import.** The `backlog-importer` fills both from *"Acceptance criteria" / "Non-goals"* sub-sections when present (PRD §15).
- **Drawio concept 1 *Bounded contract*.** *"Acceptance criteria and non-goals on the task; requires / produces, budget, turns and tools on the step. Fixed before generation, checked at flow save, injected by the prompt builder."*

> [!question] Two kinds of acceptance criteria
> The task-detail mockup's acceptance criteria are **per plan item**, written by the Plan step into `plan.md` (*"accepts when: Replaying a spent refresh token is rejected with 401."*). The PRD's `acceptance_criteria` is **one text field on the task**, written by a person. The screen never shows the task-level field. See [[Plan Versus Built]] and [[Task Detail Open Questions]].

## Owner

The mockup's aside shows `owner: you`. The PRD has no user table: *"No auth, no multi-tenancy, no user table"* (PRD §2). The feature map lists owners as an **idea**: *"An owner per task — a task can belong to a teammate; hand it off or reassign it as it moves."* (§3). See [[Task Detail Roadmap]].

## Related

- [[Task Detail Index]]
- [[Task Lifecycle]]
- [[Task Data Model]]
- [[Step Instances And Runs]]
