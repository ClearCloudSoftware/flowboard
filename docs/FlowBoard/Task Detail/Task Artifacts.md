---
tags: [flowboard, task-detail, concept, artifacts]
module: Task Detail
---

# Task Artifacts

> **Artifacts** — *The documents agents produce as they work — a research brief, a plan, a summary — kept as real files.* — feature map §15

## The rule

> Artifacts are files inside the task's worktree … The `artifacts` table stores only type, path and metadata. Rationale: Claude Code reads files natively so there is no retrieval layer to build, git tracks the files so they are diffable and reviewable, and the "compare what was planned against what was built" step becomes a plain diff of two files. — PRD §6

The task-detail guide's callout: *"**Everything is a real file.** Each step declares what it produces, and FlowBoard files the output into the task's own copy of the repo, committed on its own branch. That is why *Files* is a list of paths rather than a database view — and it's what makes the next section possible at all."* The next section is [[Plan Versus Built]].

`05` §11 draws the line against memory: *"An **artifact** is the *verbatim, within-task* output — a real file on disk, git-tracked, diffable, the contract the next step reads. **Memory** is the *cross-task distillation*"* and *"Artifacts stay the source of truth inside a task; memory is what survives it."*

## How an artifact gets registered

1. The step declares `produces` (artifact type keys). See [[Artifact Contract]].
2. The prompt tells the agent *"The exact output path the step should write, one per `produces` entry."* (PRD §7, part 3).
3. After a run completes, *"the runner scans `<worktree>/.vibe/task-<id>/` for files created or modified during the run and registers any that match the step's declared `produces` types."* (PRD §6). The scan is *"mtime ≥ run start, matched to `produces`"* (`03` §6); backlog Story 3.2: *"Artifact scan (mtime ≥ run start) matched to `produces`"*.
4. *"The agent may also register one explicitly via the `declare_artifact` MCP tool. Do both — scanning catches the case where the agent forgets to call the tool."* (PRD §6)
5. An outcome is read from the produced JSON: *"`{"outcome":…}` read from produced JSON"* (backlog Story 3.2).

The drawio *Harness architecture* page names the worker part **Artifact scanner**: *"files with mtime ≥ run start, matched to produces · declare_artifact · reads {outcome}"*.

## Artifact types

PRD §6 seeds ten types: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary`. Backlog Story 1.1 adds `sources` and `grounding_report`.

## File naming

| Source | Directory | File names |
|---|---|---|
| PRD §6 | `<worktree>/.vibe/task-<task-id>/` | `01-research_brief.md`, `02-questions.json`, `03-plan.md`, `07-review.md`, `08-summary.md` |
| `07-ports-in-practice.md` disk adapter | `` join(worktreeOf(t), '.vibe', `task-${t.id}`) `` | scan parses `NN-<type>.<ext>`; `resolve` returns `${type}.md`, with no number |
| Drawio *Harness architecture* | `.vibe/task-<id>/*.md \| *.json` | *"committed alongside the code"* |
| Task-detail mockup | `.flowboard/auth-refactor/` | `brief.md`, `plan.md`, `changes.patch`, `test-report.md`, `review.md`, `summary.md` |

The mockup's names are neither type keys nor numbered. It also has a `changes.patch` artifact that no PRD type covers (the nearest is `implementation_notes`). See [[Task Detail Open Questions]].

## The mockup's artifacts

| Step | Artifact | Size |
|---|---|---|
| Research | `brief.md` | 4.1 kB |
| Plan | `plan.md` | 11.7 kB |
| Build | `changes.patch` | 38.2 kB |
| Tests | `test-report.md` | 2.9 kB |
| Review | `review.md` | 6.4 kB |
| Summarize | `summary.md` (after approval) | 1.8 kB |

## Viewing

- *"Read them nicely — Open any artifact in a formatted viewer, and compare two of them (like the plan against the final summary) side by side."* (feature map §15)
- *"Artifacts listed as links that open a rendered markdown viewer."* (PRD §13)
- *"Artifacts → rendered markdown dialog (JSON as `<pre>`)."* (backlog Story 2.3)
- The guide's action table: *"An artifact chip — Opens the file in a formatted viewer. Everything is an ordinary file on the task's branch."* In the mockup the chip is a button that does nothing.

Backlog Story 9.1 records a past bug: *"`markdown.tsx`: `prose dark:prose-invert` (today dark‑only → unreadable in the default theme)."*

## Ideas

- **Discuss an artifact** — *"comment on the plan or the review and @mention a teammate, so the conversation lives next to the document it is about."* (feature map §15)
- **Check for hidden manipulation** — *"scan the files agents produce … for prompt-injection before the next step trusts them."* (feature map parking lot; drawio *Injection scan (later)*, dashed)

## Related

- [[Task Detail Index]]
- [[Task Workspace]]
- [[Plan Versus Built]]
- [[Task Storage On Disk]]
- [[Artifact Contract]]
