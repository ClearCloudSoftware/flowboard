---
tags: [flowboard, intake-and-import, storage]
module: Intake And Import
---

# Intake Storage

Where intake's data sits.

| What | Where | Source |
|---|---|---|
| Tasks | `tasks` table in `data/flowboard.db` (SQLite, WAL, `busy_timeout = 5000`) | PRD §3, §5 |
| Import jobs | `jobs` table, `kind = 'import_backlog'` | PRD §5 |
| Pasted backlog | a temp file, deleted by the worker after the job | backlog 7.3. Location not given |
| A backlog given by `path` | stays where it is; FlowBoard reads it | backlog 7.3, `SourceInput.path` |
| The seed flow | `seed/flows/default.json` in FlowBoard's repo | PRD §3 |
| Seeded skills | FlowBoard's `./skills/`, copied into each project's store on registration | PRD §15 |
| The seed project's repo | an *"auto‑`git init`ed scratch repo"*; path not given | backlog 1.2 |
| A promoted task's worktree | `<repo_path>/.vibe-worktrees/task-<id>` on branch `vibe/task-<id>` | PRD §11 |
| … or, on the drawio | `<repo>/.flowboard/worktrees/task-<id>` on branch `fb/task-<id>` | drawio *Harness architecture* |
| The task's artifact folder | `.vibe/task-<id>`, pre-created on promote | backlog 2.1 |
| Keeping the parent repo clean | `.vibe-worktrees/` appended to `<repo>/.git/info/exclude` | backlog 2.1 |

The two worktree layouts disagree. See [[Task Workspace]] and [[Intake And Import Open Questions]] #15.

The backlog file is never copied into the project repo or kept after import. Only the parsed fields are stored, so there is no record of which file or version produced a task beyond its `import_key`.

## Related

- [[Intake And Import Index]]
- [[Intake Data Model]]
- [[Task Storage On Disk]]
- [[Task Workspace]]
- [[Seed Project]]
