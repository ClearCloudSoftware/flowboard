---
tags: [flowboard, task-detail, storage]
module: Task Detail
---

# Task Storage On Disk

Where a task's state lives. The drawio *Logical components* page has two stores: **Database** (*"flows, tasks, steps, runs, questions, costs"*) and **Disk** (*"worktrees, artifacts, skills, session logs"*).

## Layout

```text
data/
  flowboard.db                     # SQLite: tasks, step_instances, runs, run_events, artifacts, questions …
  runs/<run-id>/args.json          # final CLI args snapshot (PRD §7)
  runs/<run-id>/spec.json          # resolved RunSpec + raw stream, "replayable at $0" (drawio; 03 §6 idea)
  sock/<run-id>.sock               # ask-user broker socket (PRD §9)

<repo>/
  .vibe-worktrees/task-<id>/       # the task's worktree, branch vibe/task-<id> (PRD §11)
    .vibe/task-<id>/               # the task's artifacts (PRD §6)
      01-research_brief.md
      02-questions.json
      02-answers.json
      03-plan.md
      …
      08-summary.md
    <the project's files, edited on the task's branch>
  .flowboard/skills/<plugin>/<commit>/   # capability store, gitignored (Capability Library D5), mounted read-only
```

Paths from PRD §3 (`data/flowboard.db`), §6, §7, §9 and §11, the drawio *Harness architecture* page, and for the skills store PRD §13 (*"gitignored, one dir per commit"*) and [[Capability Library Decisions]] D5. *Mounted read-only* is from PRD §11.1. See [[Task Workspace]] for the three competing worktree schemes and [[Task Artifacts]] for artifact naming.

## What lives where

| Thing | Store | Why (source) |
|---|---|---|
| Task, instance, run rows, costs | SQLite | *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"* (drawio) |
| Run event stream | SQLite `run_events` (+ raw line) | the SSE tails it across processes (PRD §7) |
| Artifacts | files in the worktree; DB rows are pointers | *"Real files, not hidden in a database"* (feature map §15) |
| Code changes | the worktree, on the task branch | — |
| Recalled memories | `memories` table (local adapter) or Mem0 | PRD §11.2 |

## Lifetimes

| Thing | Lives until | Source |
|---|---|---|
| Worktree and branch | you clean up (the branch too, by the guide's account) | PRD §11; guide |
| Artifacts | the worktree goes (they are inside it) | PRD §6 |
| Sandbox container | the end of the run | *"One container per run/attempt, destroyed on completion"* (`08`) |
| DB rows | the task row is deleted (`ON DELETE CASCADE`) | PRD §5 |
| Pinned capability commit dir | no non-terminal task pins it and it is not the installed commit | [[Capability Library Decisions]] D11 |

> [!question] Cleanup loses the artifacts
> Artifacts live inside the worktree, and **Clean up workspace** *"Removes the branch and the folder"* (guide). After cleanup, `artifacts.path` points at nothing and plan vs built cannot be shown. Unless the branch is merged first, the only record left is the DB. No source says what task detail shows for a cleaned-up task. See [[Task Detail Open Questions]].

## Related

- [[Task Detail Index]]
- [[Task Workspace]]
- [[Task Artifacts]]
- [[Capability Storage On Disk]]
