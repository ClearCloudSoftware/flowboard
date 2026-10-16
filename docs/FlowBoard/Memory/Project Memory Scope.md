---
tags: [flowboard, memory, scope]
module: Memory
---

# Project Memory Scope

`{ kind: 'project'; projectId: string }`: *"one codebase: conventions, gotchas, layout"* (`memory-store.ts`).

| | |
|---|---|
| Holds | *build quirks, naming conventions, where things live* (`09-memory.md`) |
| Written from | *summaries, review notes, research briefs* (`09`) |
| Read into | *every run on that project* (`09`) |
| Recalled as | *"the task's project"* (`RecallQuery`) |
| Mockup sample | `project`: *"Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window."* (task-detail aside) |
| Mem0 mapping | *"a `run_id`/session or a metadata namespace"* (`09`), not decided |

## The problem it fixes

*"A second task on the same repo re-learns its conventions."* (`09`, PRD §11.2). The feature map §21: *"this project's conventions"*, *"about a *project* (its quirks and layout)"*.

## Isolation

A project's memory stays in that project: *"a run writes to its own project/agent/task, not another project's"* (`09-memory.md`).

> [!note] A neighbouring idea
> The drawio *Harness architecture* page plans **knowledge assets (later)**: *"repomix pack · Serena index · graphify-out/, stamped with the build SHA, refreshed by scheduled shell-step flows"*. Concept 2 says *"Knowledge assets (repomix, Serena) come later as maps of the repo."* They describe the codebase itself; project memory holds what runs *learned* about it. No source connects the two.

> [!question] Gaps
> - Research briefs feed project memory, but research reads web content, and `09` says recalled memory is *"never third-party content promoted to "fact""*. See [[Memory Open Questions]] #17.
> - Nothing says what happens to a project's memories when the project is removed. See [[Memory Open Questions]] #18.

## Related

- [[Memory Scopes]]
- [[Memory Trust Boundary]]
- [[Memory Index]]
