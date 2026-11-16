---
tags: [lamproom, workspaces, rule, naming]
module: Workspaces
---

# Workspace Naming

Where a task's worktree lives and what its branch is called. The sources give three schemes. The drawio's, `<repo>/.lamproom/worktrees/task-<id>` on `lr/task-<id>`, is the one chosen (see [[#Decision]]).

| Source | Worktree path | Branch | Artifacts folder |
|---|---|---|---|
| PRD §11, backlog 2.1, `07` (artifacts folder: PRD §6, `05` §11) | `<repo_path>/.vibe-worktrees/task-<id>` | `vibe/task-<id>` | `<worktree>/.vibe/task-<id>/` |
| Drawio *Harness architecture* | `<repo>/.lamproom/worktrees/task-<id>` | `lr/task-<id>` | `.vibe/task-<id>/*.md \| *.json` |
| Task-detail mockup (sample data) | `~/.lamproom/ws/auth-refactor` | `lamproom/auth-refactor` | — |

`05` §11 gives no worktree path or branch name. It names only the `.vibe-worktrees/` folder (in its exclude line) and the artifacts folder.

The mockup's `TASK` object: `repo:'lamproom/api', branch:'lamproom/auth-refactor', workspace:'~/.lamproom/ws/auth-refactor'`. It uses a task slug, not an id, and puts the folder in the home directory, outside the repo.

## What is common

- **Keyed by task.** Every scheme has one folder and one branch per task.
- **Branch prefix names the tool.** `vibe/`, `lr/`, `lamproom/`. *(Observation across the three, not a stated rule.)*
- **The PRD and drawio put the folder inside the repo.** Both need the parent repo to ignore it. See [[Parent Repo Hygiene]].

## Where the names are stored

PRD §5 `tasks`: `branch_name TEXT`, `worktree_path TEXT`. PRD §11: *"Store both paths on the task."* See [[Workspaces Data Model]].

## The prefix history

`vibe` is the first build's name. The backlog's sources include *"the live `data/vibe.db`"*, env vars are `VIBE_DB_PATH`, `VIBE_MAX_RUNS`, and the design handoff is `docs/design_handoff_vibe_kanban`. The drawio's `lr/` and `.lamproom/` match the later Lamproom name, and the capability store already uses `<repo_path>/.lamproom/skills/` (PRD §5, §13).

## Decision

> [!success] Decided 2026-11-12: the drawio scheme
> Worktree: `<repo>/.lamproom/worktrees/task-<id>`. Branch: `lr/task-<id>`.

Why:

- **`vibe` is the old name.** The shipped code has already dropped it: the MCP server is `lamproom`, the shim's variable is `LAMPROOM_ASK_SOCKET`, and run state lives in `<folder>/.lamproom/`.
- **One exclude line covers it.** `lr-run-flow` already appends `.lamproom/` to each managed repo's `.git/info/exclude` (`code/lamproom/packages/cli/src/flow-run.ts`, `excludeFromGit`). With worktrees under `.lamproom/worktrees/`, git ignores them without a second line. See [[Parent Repo Hygiene]].
- **Inside the repo, not in the home directory.** The mockup's `~/.lamproom/ws/<slug>` is sample data. Keeping the worktree under the repo keeps everything a project owns in one place.

The PRD, backlog and `07` quotes elsewhere in these notes still say `.vibe-worktrees/` and `vibe/`. They are accurate citations of those sources and stay as written. This decision overrides them.

Still open: the artifacts folder. Both the PRD and the drawio keep `.vibe/task-<id>/` inside the worktree. This decision does not rename it.

[[Task Detail Open Questions]] #20, [[Execution Open Questions]] #3, [[Monitor Open Questions]] #26, [[Projects Open Questions]] #17 and [[Intake And Import Open Questions]] #15 raise the same split. See [[Workspaces Open Questions]] #6.

## Related

- [[Workspaces Index]]
- [[Git Worktree Adapter]]
- [[Workspaces Storage]]
- [[Task Workspace]]
- [[Project Repository]]
