---
tags: [flowboard, intake-and-import, roadmap]
module: Intake And Import
---

# Intake And Import Roadmap

## v1 scope (PRD)

Intake is spread over three milestones (PRD §14):

| Milestone | Intake part |
|---|---|
| **M1 — Foundation** | *"Seed a project pointing at a scratch git repo. Projects list page renders."* |
| **M2 — Tasks and board, no automation** | *"Create tasks manually. Board renders columns from a hardcoded flow. Promote Backlog → Todo creates a worktree. No agents run yet."* |
| **M7 — Library and import** | *"Skills install from GitHub, agent CRUD, markdown backlog import."* |

| In v1 | Source |
|---|---|
| `POST /api/tasks`, `GET /api/tasks?project=&status=` | PRD §12 |
| `POST /api/tasks/:id/promote`: worktree, branch, pinned flow | PRD §11, §12 |
| Drag only between Backlog and Todo | PRD §13 |
| `POST /api/import/backlog` and the `import_backlog` job | PRD §5, §12 |
| `tasks.import_key`, `UNIQUE (project_id, import_key)` | PRD §5 |
| The internal `backlog-importer` agent | PRD §15 |
| Seed project, *Software delivery* flow, seeded agents and skills | PRD §15 |
| Acceptance: import twice, no duplicates; promote makes a worktree | PRD §16 |

## Owed from the first build

| Item | Tag | Source |
|---|---|---|
| One parser for both shapes; agent for messy files only | **BUG** | backlog 7.3, D6 |
| Server-derived `import_key`, agent output normalised through it | **BUG** | backlog 7.3 |
| `path` or `content`; temp file; `{queued}`; worker deletes the file | **NEW (uncommitted)** | backlog 7.3 |
| Import button: picker, paste, busy, toast, progress | **NEW/GAP** | backlog 2.2, 7.3 |
| Agent: haiku, `--tools ""`, first `[`…`]`, fall back, report path | **FIX** | backlog 7.3 |
| Isolate the importer from global hooks | **BUG** | backlog 7.3, 0.1 |
| Promote pre-creates `.vibe/task-<id>`, excludes `.vibe-worktrees/` | **PRD/FIX** | backlog 2.1 |
| Demote keeps the worktree; re-promote reuses it | **NEW** | backlog 2.1 |
| Start: auto on promote or a button (D1) | **GAP/DEC** | backlog 2.1 |
| Promote, Start, Demote in the sheet | **PRD/GAP** | backlog 2.3 |
| Keyboard equivalent for promote and demote | **BUG** | backlog 9.4 |
| Scripted import-twice check over both shapes | — | backlog 10.1, `05` §14 |

The backlog's *"Four uncommitted files"* were the *"import route, worker cleanup, board Import button, sheet Start button"* (*What went wrong*, item 7).

## Decisions

| # | Decision | Source |
|---|---|---|
| D6 | *Recommended*, not closed: *"Deterministic parser supports headings **and** bullets; agent optional"*. The architecture README still lists *"import parser shape"* among its open decisions (item 5) | backlog *Decisions to close* (default recommendation) |
| D30 | Decided: `backlog-importer` is not a seed and never shows in the library | [[Capability Library Decisions]] |
| D1 | *Recommended*, not closed: explicit Start, *"promote stays cheap"* | backlog, drawio |

## Designed beyond the PRD

- **The TaskSource port** with its server-owned key (`01-ports.md`, `05` §14, `task-source.ts`).
- **A runnable `MarkdownTaskSource`** with a self-check (`markdown-source.ts`).
- **Progress the user can see**: *queued → running → "6 created"* (feature map §17).
- **Sample tasks** in the seed (drawio only).

## Ideas

- **More task sources**: GitHub Issues, Linear, Jira, webhook (architecture README, `05` §14). See [[Future Task Sources]].
- **Kick off work from outside**: *"start a task straight from a GitHub issue, a Slack message, or on a schedule"* (feature map parking lot).
- **Schedule trigger (later)** (drawio *Harness architecture*).
- **An owner per task** (feature map §3): *"a task can belong to a teammate"*. That imported tasks would then need an owner is this set's inference.
- Feature map §17's own *💡 Ideas* slot is empty: *"(add ideas)"*.

## Out of scope

- PRD §17: *"authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI."* Imports are one operator's, and the importer agent is a `claude` CLI call.
- Deleting or syncing back to the source: not mentioned anywhere.

## Related

- [[Intake And Import Index]]
- [[Intake And Import Open Questions]]
- [[Future Task Sources]]
- [[Execution Roadmap]]
