---
tags: [flowboard, intake-and-import, sources]
module: Intake And Import
---

# Intake And Import Sources

What each source contributed. There is no mockup for this component.

| Source | Contributed |
|---|---|
| `docs/FlowBoard/Component Documentation Tracker.md` | Scope (*"Backlog import, create task, promote, seed project"*), feature map §17, architecture #14 TaskSource port, no mockup |
| `docs/feature-map.md` §17 | The four features (*From a document*, *No duplicates*, *Progress you can see*, *Room for other sources*), the deep-dive link to `05` §14, the empty ideas slot |
| `docs/feature-map.md` §1, §3, §5, parking lot, appendix | New-project form (*"or start empty"*); *Create and track work*, *Say what "done" means*, *Pause, send back, or cancel*, the start ❓; *Drag only where it's honest*; *Kick off work from outside*, *Check for hidden manipulation*; *Prioritize backlog* step |
| `docs/old/PRD.MD` §1, §2 | *"A task enters the Backlog, gets promoted to Todo"*; route handlers never spawn long-lived processes; single user |
| `docs/old/PRD.MD` §3 | `ports/` holds `TaskSource`; `seed/flows/default.json`; `skills/`; no `adapters/source/` |
| `docs/old/PRD.MD` §5 | `tasks` (`import_key`, `UNIQUE (project_id, import_key)`, `flow_id` *"null while in backlog, pinned on promotion"*, statuses); `jobs.kind = 'import_backlog'`; `jobs` states |
| `docs/old/PRD.MD` §6, §7 | Seeded artifact types; job leasing; prompt part 1 reads title, body, acceptance criteria, non-goals; non-goal hooks |
| `docs/old/PRD.MD` §11, §11.1 | Worktree on promotion, `.vibe-worktrees/task-<id>`, `vibe/task-<id>`; *"the backlog"* as untrusted content |
| `docs/old/PRD.MD` §12, §13 | Task, promote, project and import routes; zod; Backlog and Todo columns; drag rule |
| `docs/old/PRD.MD` §14, §15, §16, §17 | M1, M2, M7; seed project and flow, `backlog-importer`, its output and key rule, the upsert; two acceptance lines; out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Header (*"nine headless `backlog-importer` runs"*); *What went wrong* items 1, 2, 3, 7; Stories 0.1, 0.2, 1.2, 1.3, 2.1, 2.2, 2.3, 7.3, 9.4, 10.1; decisions D1, D5, D6 |
| `docs/old/architecture/README.md` | Five-ports table (*"TaskSource · markdown import · GitHub Issues, Linear, Jira, webhook"*); module layout `source/markdown/ github/`; component #14; dependency rule; open decision 5 (*"import parser shape"*) |
| `docs/old/architecture/01-ports.md` | The `TaskSource` sketch; the *"messy file"* adapter; key rule; the acceptance test; *"Promote the backlog's fake-`claude` test harness"* (overloaded *promote*) |
| `docs/old/architecture/05-environment-and-registry.md` §14 | Role, seam (two rules), genericize (adapters, `path`/`content`, `{queued}`, which path ran), composes with (upsert, Import button progress), idea (scripted check) |
| `docs/old/architecture/07-ports-in-practice.md` | `MarkdownTaskSource` usage and the upsert snippet |
| `docs/old/architecture/02-core-and-engine.md` §1, §2 | Domain model as the only shared state; flow import (*"keys uniquified on import"*, overloaded *import*) |
| `docs/old/architecture/08-sandboxing.md` | *"the backlog markdown, issue/PR text"* as untrusted content |
| `docs/old/reference/core/ports/task-source.ts` | `ParsedTask`, `SourceInput`, `TaskSource`, and the port's doc comment |
| `docs/old/reference/adapters/source/markdown/markdown-source.ts` | The parser, `splitId`, `slugify`, in-file de-dupe, the self-check. Run with Node 24.11 for [[Parser Edge Cases]] |
| `docs/old/reference/README.md` | What the two reference files are, how to run them, why they need no toolchain |
| `docs/flowboard-ideation.drawio` — *FlowBoard ideation* | *Import & seed* group (*Markdown backlog import*, *D6 · Deterministic parser*, *Seed data … sample tasks*); board cards (*Backlog + Todo fixed in front*, *Drag only Backlog ↔ Todo*, *D1 · Auto-start on promote?*); *TaskSource adapters*; *Five ports*; an empty *Integrations* group |
| `docs/flowboard-ideation.drawio` — *Logical components* | `TaskSource` port; *Markdown / Issues import* adapter; edges *TaskSource ↔ Markdown / Issues import*, *TaskSource → Task & run state* (*"import tasks"*) |
| `docs/flowboard-ideation.drawio` — *Functional components* | *Intake* group: *Import backlog*, *Create / edit task*, *Promote Backlog → Todo*, *Seed project*; edge *Intake → Execution* (*"tasks"*) |
| `docs/flowboard-ideation.drawio` — *Harness architecture* | Board card (*"drag only Backlog ↔ Todo"*); job loop kinds incl. `import_backlog`; *Backlog import* card (agent → five fields → upsert); *Workspace manager*; `.flowboard/worktrees/task-<id>`, `fb/task-<id>`; *Schedule trigger (later)*; *Injection scan (later)*; *"light, zero radius"* tech card; API card |
| `docs/mockups/monitor.html` | Backlog count (tasks with no runs) in the pipeline readout and status bar |
| `docs/mockups/monitor-guide.html` | Beats *In the backlog* and *You promote it*; *Why you can't drag a card*; *Idle* = *"queued or in the backlog"* |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | *Send to backlog*; lifecycle *backlog · "no workspace yet"* → *"you promote it"* → running; *"can happen from anywhere"* |
| `docs/mockups/flow-designer.html` | The *Backlog triage* flow (overloaded *backlog*) |
| `docs/mockups/README.md` | The monitor's *"seeded tasks"*; the guide's *"from backlog to done"* scrubber |
| `docs/old/design/brief.md`, `README.md` | *"Only Backlog → Todo is draggable"*; draggable card marks, `drop to queue`, `⠿ drag` header, flow strip |
| `docs/pitch.md` | Import rewritten three times; *"one deterministic import contract"*; import among the build milestones |
| Sibling vault sets | [[Starting A Task]], [[Task Lifecycle]], [[Task Record]], [[Task Actions]], [[Task Workspace]], [[Version Pinning]], [[Seeded Flows]], [[Seeded Capabilities]], [[Capability Library Decisions]] (D30), [[Job Queue]], [[Board Projection]], [[Life Of A Task]], [[Monitor Sample Data]]; [[Execution Open Questions]] #2, [[Flow Design Open Questions]] #7, [[Monitor Open Questions]] #24; [[Escalation And Notifications Roadmap]] (Slack as a task source) |

## Not found

No source mentions import or intake in `docs/old/architecture/03-execution-substrate.md`, `04-hitl-and-notify.md`, `06-cost-and-platform.md` or `09-memory.md` (beyond the word *promoted* in `09`), in `docs/mockups/inbox*.html` or `capability-library*.html` (beyond sample task ids such as `pdf-import`), in `docs/competitor-multica.md`, or in the other reference `.ts` files.

## Related

- [[Intake And Import Index]]
- [[Intake And Import Open Questions]]
- [[Component Documentation Tracker]]
