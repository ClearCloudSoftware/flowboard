---
tags: [flowboard, projects, rules, validation]
module: Projects
---

# Project Rules And Edge Cases

Every rule the sources state about projects, in their words, then the edge cases they leave open.

## Rules

| # | Rule | Source |
|---|---|---|
| R1 | *"`repo_path TEXT NOT NULL, -- absolute path to the git repo`"* | PRD §5 |
| R2 | *"`slug TEXT NOT NULL UNIQUE`"* | PRD §5 |
| R3 | A shell step with no command runs the project's: *"null = the project's check_command"* | PRD §5 |
| R4 | *"Editing a project's flow never moves an in-flight task."* | PRD §4 |
| R5 | Flow names and versions are unique per project: *"`UNIQUE (project_id, name, version)`"* | PRD §5 |
| R6 | *"Re-importing an edited file updates the existing tasks instead of making copies"*; upsert on `(project_id, import_key)` | feature map §17; PRD §15 |
| R7 | Plugin names and agent slugs are unique per project: `UNIQUE (project_id, name)`, `UNIQUE (project_id, slug)` | PRD §5 |
| R8 | *"Registering a project copies the seeds into its store under FlowBoard's commit"* | PRD §15 |
| R9 | The parent repo stays clean: *"append `.vibe-worktrees/` to `<repo>/.git/info/exclude`"*; *"FlowBoard adds [`.flowboard/skills/`] to that repo's `.git/info/exclude`"* | backlog Stories 2.1, 0.3 |
| R10 | The project's git remote is not on the egress allowlist: *"the host does all git work and the agent never needs to push or fetch"* | PRD §11.1 |
| R11 | The agent may not push or touch the base branch: the hook denies *"any `git push`, `git reset --hard` or `git checkout` of the base branch"* | PRD §7 |
| R12 | *"Every task gets its own worktree"*, created under `repo_path` on promotion; *"never remove it automatically"* | PRD §11 |
| R13 | Memory writes stay in their project: *"a run writes to its own project/agent/task, not another project's"* | `09` |
| R14 | Project links use the slug: *"Project link must use slug (today uses id → 404)."* | backlog Story 3.4 (**BUG**) |
| R15 | *"No auth, no multi-tenancy, no user table. Do not add them 'for later'"* | PRD §2 |
| R16 | Library usage counts per project: Remove *"is disabled while any step uses the plugin (counting each flow's latest version and any version a running task pins)"* | PRD §13 |

## Edge cases the sources leave open

| Case | What the sources say | See |
|---|---|---|
| Two projects on the same repo | Nothing. `repo_path` is not `UNIQUE`. Both would write to the same `.vibe-worktrees/` and `.flowboard/skills/`. Task ids keep worktree paths apart; plugin dirs keyed by name and commit would be shared. | OQ #5 |
| A path that is not a git repo | Only the seed is *"auto‑`git init`ed"* (backlog Story 1.2) | OQ #5 |
| A relative path | The column comment says *"absolute"*; no normalisation rule | OQ #5 |
| A repo that moves or disappears | Nothing | OQ #5 |
| A duplicate slug | The `UNIQUE` constraint rejects it; no friendlier rule | OQ #4 |
| No default flow | `default_flow_id` is nullable; promotion behaviour unstated | OQ #7 |
| *Empty* flow type | Allowed (backlog Story 1.3); what it creates is unstated | OQ #7 |
| No check command and no step command | Unstated | OQ #6 |
| A dirty working tree in the repo | Nothing for the project. Capability Library D7 rejects dirty `file://` installs, a different case. | OQ #14 |
| Deleting a project with running tasks | No delete is specified | OQ #9 |
| A project with only `user` memory enabled | Scopes are enabled globally (`settings` memory block, PRD §11.2) | — |

OQ numbers refer to [[Projects Open Questions]].

## Related

- [[Project Record]]
- [[Creating A Project]]
- [[Project Lifecycle And Deletion]]
- [[Projects Open Questions]]
