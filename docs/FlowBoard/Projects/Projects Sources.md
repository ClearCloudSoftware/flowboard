---
tags: [flowboard, projects, sources]
module: Projects
---

# Projects Sources

Where every fact in the Projects notes comes from. Paths are relative to the repo root.

| Source | Sections used | Contributed |
|---|---|---|
| `docs/feature-map.md` | §1 Projects; §2 (ready-made recipes); §10; §17; §18 ideas; §19; §21; *Across everything → Teams & collaboration*; Parking lot; Appendix | The four v1 features and the visibility idea; the create form (*name it and choose which recipe*); the home screen; trust picks the box, *"never your keys or your other projects"*; global switches; project memory and its ❓; teams and shared-tier ideas; recipes reused across projects; role starter flows |
| `docs/old/PRD.MD` | §1, §2, §3, §4, §5, §6, §7, §10, §11, §11.1, §11.2, §12, §13, §14, §15, §17 | The `projects` table and every `project_id` FK and unique key; *"Editing a project's flow never moves an in-flight task"*; `check_command` fallback and shell-step behaviour; worktree command under `repo_path`; git remote off the allowlist; hook denials (push, base branch); memory project scope; the API list; `/`, `/p/[slug]`, `/p/[slug]/flow`, `/p/[slug]/library`; M1; the seed project and its `check_command`; *"Registering a project copies the seeds"*; out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Intro item 1; Stories 0.3, 1.1, 1.2, 1.3, 2.1, 2.2, 3.4, 3.5, 7.3, 8.1, 8.2, 8.3; Decisions D1, D7, D8 | `.git/info/exclude` hygiene; *"14 tables"*; seed project on an auto-`git init`ed scratch repo; the projects list cards, new-project dialog, empty and error states; this-week spend **DEC**; pin at promotion; project link slug **BUG** (run pages); reuse picker; project filter **GAP**; import request shape; global settings; separate promote and Start; trusted opt-out; tiers per untrusted repo |
| `docs/old/architecture/README.md` | component index, open decisions | #1 Domain model & migrations; the system in one paragraph |
| `docs/old/architecture/02-core-and-engine.md` | §1, §2 | *"the 14 tables … plus the invariants"*; append-only `runs` journal; flows exportable across projects |
| `docs/old/architecture/03-execution-substrate.md` | §6, §8 | Shell steps run the project's `check_command` through the `ExecHost`; the run viewer's project link must use the slug |
| `docs/old/architecture/04-hitl-and-notify.md` | §10 | The escalation threshold as a setting: *"`escalate_question` at `now + settings.escalation_threshold_ms` (default 5 min)"*; one of the global switches a project does not carry |
| `docs/old/architecture/05-environment-and-registry.md` | §11, §14 | Worktree hygiene; import idempotent on `(project_id, import_key)`, request shape (§13, the registry, says nothing per project) |
| `docs/old/architecture/06-cost-and-platform.md` | §12, §15 | Spend per project; thin API handlers; global settings |
| `docs/old/architecture/07-ports-in-practice.md` | *Workspace — git worktree adapter*; *TaskSource* | `worktreeWorkspace(repoPath)`; upsert on `projectId, importKey`; *"the project's `@/` path alias"* (the overloaded word) |
| `docs/old/architecture/08-sandboxing.md` | isolation ladder, security profile, recommendation | Repo trust picks the tier; trusted-repo opt-out; *"Run trusted repos"* |
| `docs/old/architecture/09-memory.md` | the port, the scopes, lifecycle, Mem0 mapping, trust boundary, recommendation | The `project` scope: what it holds, written from, read into; writes stay in their project; *"`project`/`agent`/`task` per step"* |
| `docs/old/reference/core/ports/workspace.ts` | `Workspace`, `TaskRef` | `TaskRef` is `{ id }`; cleanup only when done, cancelled or failed |
| `docs/old/reference/core/ports/memory-store.ts` | `MemoryScope` | `{ kind: 'project'; projectId }`; the per-run scope union |
| `docs/old/reference/core/ports/task-source.ts` | header comment | `import_key` is the idempotency key for upsert on `(project_id, import_key)` |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Board, Inbox, Skills & agents, Costs, Import & seed, Out of scope, Architecture; *Logical components*: Inbox, Cost rollup; *Functional components*: Intake (no Projects box), Start task; *Harness architecture*: browser front end, SQLite, Project repo + git worktrees, Workspace manager (in `apps/worker`), Knowledge assets, Shell executor, Check container, Mounts, Tiers, GitHub, the dashed edge *host-side push / fetch*, the legend, Life of one step | `projects (check_command)`; the alternative worktree scheme; where `worktree add` runs; the project remote (optional or later); seed data with sample tasks; global `/skills /agents` and `./skills/<slug>`; the active flow's `board_order`; pin at Start; tiers by repo trust; knowledge assets (later) |
| `docs/mockups/monitor.html` | seed tasks `T(id, title, repo, …)`, row detail | Six `owner/name` repos on one screen |
| `docs/mockups/monitor-guide.html` | walkthrough beats | *"a private copy of the repo"*; *"An agent is reading the repo"* |
| `docs/mockups/task-detail.html` | `TASK`, `MEMORY`, aside | repo & branch, workspace path, the `project` memory sample |
| `docs/mockups/task-detail-guide.html` | anatomy, lifecycle, actions | the *repo & branch* label; *"no workspace yet"* in backlog; cleanup wording |
| `docs/mockups/flow-designer.html` | `OPEN` flow, version chip | *"adopted 12 Sep"* |
| `docs/mockups/flow-designer-guide.html` | walkthrough, actions table | *"Your project has adopted"*; *"creates v5 and points your project at it"*; **Save as v*n*** |
| `docs/mockups/capability-library.html` | seed agent descriptions, status bar | *"Reads the brief and the codebase"*; store `~/.flowboard/capabilities` |
| `docs/mockups/inbox.html`, `inbox-guide.html`, `capability-library-guide.html` | searched | No project or repo mentions |
| `docs/old/design/README.md` | 1a, 1c | Inbox batch header shows the project slug; board project header |
| `docs/old/design/Vibe Kanban.dc.html` | chrome, board header | Nav *Inbox · Boards · Runs · Costs*; sample project `billing-svc`, `standard-flow · 8 steps`, `14 tasks` |
| `docs/old/design/brief.md` | *What it is*, *Screens to design* | One user, no login; inbox across every project; no projects list among the six screens |
| `docs/pitch.md` | objections, risk | *"your repos, your machine, no new service to run"*; a prompt injection can *"corrupt a repo"* |
| `docs/competitor-multica.md` | comparison | *"per-project access"* among the multi-user ideas |
| Vault: [[Capability Library Decisions]] | D4, D5, D6, D7, D11, D12, D15, D23 | Per-project store; seeds copied on registration; garbage collection; host tier fails closed |
| Vault: [[Flow Design Open Questions]], [[Task Detail Open Questions]], [[Monitor Open Questions]], [[Cost And Control Open Questions]], [[Execution Open Questions]] | #1, #7; #20, #21; #1, #2; #4; #3, #40 | Questions shared with this set |
| Vault, sibling sets: [[Settings And Plumbing Open Questions]], [[Workspaces Open Questions]], [[Intake And Import Open Questions]], [[Memory Open Questions]], [[Sandboxing Open Questions]] | #1, #18, #21; #2, #4, #5, #6, #20, #21; #8, #15, #19, #20; #3, #4, #18; #5 | Questions those sets own; this set links rather than repeats them |
| Vault: [[Flow Data Model]] | mockup field mapping | *adopted* maps to `projects.default_flow_id` |

## Related

- [[Projects Index]]
- [[Projects Open Questions]]
- [[Component Documentation Tracker]]
