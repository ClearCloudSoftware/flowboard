---
tags: [flowboard, workspaces, ui]
module: Workspaces
---

# Workspaces In The UI

Workspaces has no mockup of its own, so there are no Screen or Controls notes. The workspace appears on other screens. This note lists where, and points to the notes that describe those screens.

## Task detail

The richest source. See [[Task Detail Screen]], [[Task Detail Controls]] and [[Task Workspace]].

| Place | What it shows | Source |
|---|---|---|
| Aside, *repo & branch* | `flowboard/api` / `flowboard/auth-refactor` | `task-detail.html` `asideHTML` |
| Aside, *workspace* | `~/.flowboard/ws/auth-refactor`, *"its own copy of the repo — kept until you clean it up"* | same |
| Status bar | *"sandbox container, egress default-deny"* | `task-detail.html`; see [[Sandboxing In The UI]] |
| Top actions, while running | **Pause** · **Send to backlog** · **Cancel task** | `drawHeader` |
| Top actions, when done | **Open workspace** · **Clean up workspace** | `drawHeader` |
| Files tab, *working tree* | changed files with `+`/`−` counts *"on"* the task branch; closing note: *"The workspace stays until you clean it up, and only once the task is finished or cancelled."* | `task-detail.html` |
| Plan vs built | *"what the plan asked for"* against *"what landed in the workspace"* | `task-detail.html`; see [[Plan Versus Built]] |
| Lifecycle diagram | backlog *"no workspace yet"*, done *"workspace kept"*; *"you promote it"* leads from backlog to running | `task-detail-guide.html`; see [[Task Lifecycle]] |
| Walkthrough, done | *"The task is finished and its branch is still there until you clean it up."* | `task-detail-guide.html` |

## Monitor

Text only, in the guide's walkthrough and status table (see [[Life Of A Task]]):

- Beat 1, in the backlog: *"No workspace, no agent, no spend."*
- Beat 2, promoted: *"It has a private copy of the repo waiting for it, but no worker yet"*.
- Beat 4: *"`brief.md` is written to the task workspace."*
- Beat 8: *"Two agents on one task, in the same workspace, on independent work."*
- Done status: *"Its artifacts are in the task workspace, tracked in git."*

## Capability library

*"The ones that can reach outside the workspace are marked, because they interact with the sandbox"* (`capability-library-guide.html`). The amber tool note: *"Amber tools can reach outside the workspace."* See [[Capability Tools And Egress]].

## Board

PRD §13: drag *"is enabled only between Backlog and Todo"*, which is promote and demote, the two moves that create or keep a workspace. Backlog 9.4 wants *"keyboard equivalent for promote/demote"*.

## Words the UI uses

The UI says **workspace**. The PRD and backlog say **worktree**. The mockup's Files tab says **working tree**. See [[Workspaces Glossary]].

## Related

- [[Workspaces Index]]
- [[Task Workspace]]
- [[Task Actions]]
- [[Cleaning Up A Workspace]]
