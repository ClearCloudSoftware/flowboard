---
tags: [flowboard, workspaces, rule, naming]
module: Workspaces
---

# Workspace Naming

Where a task's worktree lives and what its branch is called. The sources give three schemes. The drawio's, `<repo>/.flowboard/worktrees/task-<id>` on `fb/task-<id>`, is the one chosen (see [[#Decision]]).

| Source | Worktree path | Branch | Artifacts folder |
|---|---|---|---|
| PRD §11, backlog 2.1, `07` (artifacts folder: PRD §6, `05` §11) | `<repo_path>/.vibe-worktrees/task-<id>` | `vibe/task-<id>` | `<worktree>/.vibe/task-<id>/` |
| Drawio *Harness architecture* | `<repo>/.flowboard/worktrees/task-<id>` | `fb/task-<id>` | `.vibe/task-<id>/*.md \| *.json` |
| Task-detail mockup (sample data) | `~/.flowboard/ws/auth-refactor` | `flowboard/auth-refactor` | — |

`05` §11 gives no worktree path or branch name. It names only the `.vibe-worktrees/` folder (in its exclude line) and the artifacts folder.

The mockup's `TASK` object: `repo:'flowboard/api', branch:'flowboard/auth-refactor', workspace:'~/.flowboard/ws/auth-refactor'`. It uses a task slug, not an id, and puts the folder in the home directory, outside the repo.

## What is common

- **Keyed by task.** Every scheme has one folder and one branch per task.
- **Branch prefix names the tool.** `vibe/`, `fb/`, `flowboard/`. *(Observation across the three, not a stated rule.)*
- **The PRD and drawio put the folder inside the repo.** Both need the parent repo to ignore it. See [[Parent Repo Hygiene]].

## Where the names are stored

PRD §5 `tasks`: `branch_name TEXT`, `worktree_path TEXT`. PRD §11: *"Store both paths on the task."* See [[Workspaces Data Model]].

## The prefix history

`vibe` is the first build's name. The backlog's sources include *"the live `data/vibe.db`"*, env vars are `VIBE_DB_PATH`, `VIBE_MAX_RUNS`, and the design handoff is `docs/design_handoff_vibe_kanban`. The drawio's `fb/` and `.flowboard/` match the later FlowBoard name, and the capability store already uses `<repo_path>/.flowboard/skills/` (PRD §5, §13).

## Decision

> [!success] Decided 2026-11-12: the drawio scheme
> Worktree: `<repo>/.flowboard/worktrees/task-<id>`. Branch: `fb/task-<id>`.

Why:

- **`vibe` is the old name.** The shipped code has already dropped it: the MCP server is `flowboard`, the shim's variable is `FLOWBOARD_ASK_SOCKET`, and run state lives in `<folder>/.flowboard/`.
- **One exclude line covers it.** `run-flow` already appends `.flowboard/` to each managed repo's `.git/info/exclude` (`code/flowboard/packages/cli/src/flow-run.ts`, `excludeFromGit`). With worktrees under `.flowboard/worktrees/`, git ignores them without a second line. See [[Parent Repo Hygiene]].
- **Inside the repo, not in the home directory.** The mockup's `~/.flowboard/ws/<slug>` is sample data. Keeping the worktree under the repo keeps everything a project owns in one place.

The PRD, backlog and `07` quotes elsewhere in these notes still say `.vibe-worktrees/` and `vibe/`. They are accurate citations of those sources and stay as written. This decision overrides them.

Still open: the artifacts folder. Both the PRD and the drawio keep `.vibe/task-<id>/` inside the worktree. This decision does not rename it.

[[Task Detail Open Questions]] #20, [[Execution Open Questions]] #3, [[Monitor Open Questions]] #26, [[Projects Open Questions]] #17 and [[Intake And Import Open Questions]] #15 raise the same split. See [[Workspaces Open Questions]] #6.

## Related

- [[Workspaces Index]]
- [[Git Worktree Adapter]]
- [[Workspaces Storage]]
- [[Task Workspace]]
- [[Project Repository]]
