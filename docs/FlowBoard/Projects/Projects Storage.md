---
tags: [flowboard, projects, storage]
module: Projects
---

# Projects Storage

A project lives in two places: a row in FlowBoard's database, and a set of directories inside the repo it points at.

## In `flowboard.db`

| What | Where | Source |
|---|---|---|
| The project | `projects` row | PRD §5 |
| Its flows, tasks, plugins, agents | rows with `project_id` | PRD §5 |
| Its memories (`local` adapter) | `memories(scope='project', scope_id=<project id>, …)` with an FTS5 index | PRD §11.2 |

The file is `data/flowboard.db`, SQLite in WAL mode, `busy_timeout = 5000` (PRD §3). The drawio *SQLite* card: *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*. Database setup and migrations belong to the Settings And Plumbing notes.

## In the managed repo

```
<repo_path>/
├── .git/info/exclude          # + .vibe-worktrees/  + .flowboard/skills/   (backlog 2.1, 0.3)
├── .vibe-worktrees/
│   └── task-<id>/             # one worktree per task, branch vibe/task-<id>   (PRD §11)
│       └── .vibe/task-<id>/   # the task's artifacts, git-tracked               (PRD §6)
└── .flowboard/
    └── skills/
        └── <plugin>/<commit>/ # installed plugins, one dir per commit           (PRD §5, §13)
```

| Path | Lifetime | Cleaned up by | Source |
|---|---|---|---|
| `.vibe-worktrees/task-<id>` | from promotion (feature map §14: task start; [[Workspaces Open Questions]] #1) until you clean it up | *"Cleanup worktree only via explicit action, only when done/cancelled/failed."* | backlog Story 2.1 |
| `.flowboard/skills/<plugin>/<commit>` | from install until garbage-collected | *"A commit dir is deleted once no non-terminal task pins it and it is not the installed commit."* | Capability Library D11 |
| `.git/info/exclude` lines | permanent | nothing stated | backlog Stories 0.3, 2.1 |

> [!warning] Other layouts in the sources
> Drawio *Harness architecture*: worktrees at `<repo>/.flowboard/worktrees/task-<id>`. Task-detail mockup: `~/.flowboard/ws/<task>`, outside the repo. Capability-library mockup: store `~/.flowboard/capabilities`. Drawio *FlowBoard ideation* library card: *"Clone / sparse-checkout into ./skills/<slug>"*, FlowBoard's own folder. Monitor mockup artifacts: `.flowboard/${t.id}/…` in the row detail and *"write .flowboard/artifacts/brief.md"* in the sample log, not PRD §6's `.vibe/task-<id>/`. See [[Workspace Naming]], [[Task Detail Open Questions]] #20, [[Monitor Open Questions]] #26 and [[Capability Storage On Disk]].

## In FlowBoard's own repo

| Path | What | Source |
|---|---|---|
| `skills/` | the seed plugins, copied into each project on registration | PRD §3, §15 |
| `seed/flows/default.json` | the seeded flow | PRD §3 |
| `.gitignore` | `data/*.db*`, `data/runs`, `.vibe-worktrees` | backlog Story 0.3 |

Where the seed project's scratch repo lives is not stated. See [[Seeded Project]].

## Knowledge assets (later)

Beside the project repo, the drawio *Harness architecture* draws a dashed **Knowledge assets (later)** card: *"repomix pack · Serena index · graphify-out/, stamped with the build SHA, refreshed by scheduled shell-step flows"*. Its harness concept 2 adds *"Knowledge assets (repomix, Serena) come later as maps of the repo."* No source says whether they are per project or where they are stored. See [[Projects Roadmap]] and [[Project Memory Scope]].

## Related

- [[Project Repository]]
- [[Projects Data Model]]
- [[Task Storage On Disk]]
- [[Capability Storage On Disk]]
- [[Execution Storage]]
- [[Settings And Plumbing Index]]
