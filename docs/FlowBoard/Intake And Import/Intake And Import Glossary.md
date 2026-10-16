---
tags: [flowboard, intake-and-import, glossary]
module: Intake And Import
---

# Intake And Import Glossary

| Term | Meaning | Source |
|---|---|---|
| **Intake** | The drawio *Functional components* group for getting work in: import, create/edit, promote, seed. Used only on the drawio. | drawio |
| **Import** (backlog import) | Turning a markdown file into tasks. *"md file -> tasks"*. | PRD §12, feature map §17 |
| **Ingestion** | The architecture's word for import: component #14 *"Ingestion → TaskSource port"*. | architecture README, `05` §14 |
| **TaskSource** | The port every import source sits behind: an `id` and one call, `fetch(input)`. | `01-ports.md`, `task-source.ts` |
| **Adapter** | One TaskSource implementation: `markdown` now; GitHub Issues, Linear, Jira, webhook later. | architecture README |
| **`MarkdownTaskSource`** | The reference markdown adapter, `id = 'markdown'`. | `markdown-source.ts` |
| **Deterministic parser** | Parsing by fixed rules, no model. D6. | backlog 7.3, D6 |
| **`backlog-importer`** | The internal agent for *"messy"* files. Not a seed. | PRD §15, `05` §14 |
| **Messy file** | Never defined. This set reads it as a file that fits neither shape (an inference; [[Intake And Import Open Questions]] #3). | `05` §14 |
| **Shape A / shape B** | This set's names for *"`##` heading = task"* and *"heading‑as‑category with `- **Title** …` bullets"*. | backlog 7.3 |
| **Category heading** | A heading whose bold bullets are the tasks; not a task itself. | backlog 7.3, `markdown-source.ts` |
| **`import_key`** | The task's stable identity across imports. Server-derived. | PRD §5, `05` §14 |
| **Explicit id** | A key written in the file: front-matter `id` (PRD), *"front‑matter/inline `id`"* (backlog, `05` §14) or `{#slug}` (reference). | PRD §15, backlog 7.3, `markdown-source.ts` |
| **`slugify`** | Lowercase, non-`[a-z0-9]` runs → `-`, trim `-`. | `markdown-source.ts` |
| **Upsert** | Insert, or update on `(project_id, import_key)` conflict. | PRD §15, `07` |
| **`ParsedTask`** | `{ import_key, title, body? }`, what `fetch()` returns. | `task-source.ts` |
| **`SourceInput`** | `{ content?, path? }`, what `fetch()` takes. | `task-source.ts` |
| **`import_backlog`** | The job kind that runs an import in the worker. | PRD §5 |
| **`cleanup`** | Payload flag: delete the temp file after the job. | backlog 7.3 |
| **`{queued}`** | What the import route returns. | backlog 7.3 |
| **Which path ran** | *Deterministic* or *agent*, reported after an import. | backlog 7.3, `05` §14 |
| **Promote** | Backlog → Todo: pin the flow, create the worktree. | PRD §12 |
| **Demote** | Todo → Backlog, keeping the worktree. | backlog 2.1 |
| **Send to backlog** | Task-detail action that returns a task to the backlog from *"anywhere"*. Maybe demote. | task-detail mockup and guide |
| **Start** | Todo → running. Separate from promote under D1. | backlog 2.1 |
| **Seed project** | The project FlowBoard seeds, on a scratch repo, *"so the app is alive on first run"*. See [[Seed Data]]. | PRD §14, §15; drawio |
| **Scratch repo** | An *"auto‑`git init`ed"* repo for the seed project. | backlog 1.2 |

## Overloaded words

> [!warning] Backlog
> 1. The task status `backlog` and the board's fixed **Backlog** column (PRD §5, §13).
> 2. The markdown file being imported (*"markdown backlog import"*).
> 3. `docs/old/REBUILD-BACKLOG.md`, cited in these notes as *backlog* with a story number.
> 4. The *Backlog triage* flow in the flow-designer mockup (*"Sweep the backlog, merge duplicates, re-prioritise."*), which is a flow, not intake.
> 5. *Prioritize backlog*, a step in the business analyst role flow (feature map appendix; *Prioritise backlog* in the flow-designer mockup).

> [!warning] Import
> Backlog import (this set); flow import across projects (*"keys uniquified on import"*, `02` §2, see [[Flow Design Index]]); and TypeScript `import` lines in the reference code.

> [!warning] Seed
> The seed project (this set); [[Seeded Flows]]; [[Seeded Capabilities]] (`plugins.source = 'seed'`); *"seed commits"* staged on a FlowBoard upgrade (PRD §15); and each mockup's sample data (*"seeded:true"* in the library mockup, *"seed — the board mid-morning"* in the monitor).

> [!warning] Promote
> Backlog → Todo (this set). Also *"Promote the backlog's fake-`claude` test harness to a first-class adapter"* (`01-ports.md`) and *"Attempt counter promoted into the meta row"* (old design file `docs/old/design/Vibe Kanban.dc.html`), which are unrelated.

> [!warning] Todo
> The status `todo` and the board column **Todo** (the feature map writes *"To do"*). The v3 mockups have neither; the task-detail guide goes straight from backlog to running. The old v1 design handoff draws a Todo column.

> [!warning] Key
> `import_key` (a task's import identity), a step's `key` (PRD §5 `step_defs.key`), and flow keys. Unrelated.

> [!warning] Source
> TaskSource (where tasks come from) versus `plugins.source` (`'seed'|'git'`, where a plugin came from).

## Related

- [[Intake And Import Index]]
- [[Intake And Import Overview]]
- [[Execution Glossary]]
- [[Task Detail Glossary]]
