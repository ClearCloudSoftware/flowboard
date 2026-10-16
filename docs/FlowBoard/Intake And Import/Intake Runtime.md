---
tags: [flowboard, intake-and-import, runtime, internals]
module: Intake And Import
---

# Intake Runtime

Where intake's code lives and which process runs it.

## Processes

PRD §2: *"A separate worker process for running agents. Next.js route handlers must never spawn a long-lived child process; they enqueue jobs and the worker picks them up."*

| Work | Process | Source |
|---|---|---|
| Validate the import request, write the temp file, enqueue | `apps/web` | backlog 7.3; drawio *Harness architecture*: `apps/web` is *"thin: validates, calls core, enqueues; never spawns agents"*, its routes *"zod-validated input → write rows → enqueue a job → return"* |
| Lease `import_backlog`, parse, upsert, delete the temp file | `apps/worker` | backlog 7.3; drawio *Harness architecture* job loop and *Backlog import* card |
| Create a task | `apps/web`; a row write with no job is an inference (no job kind fits it) | PRD §5, §12 |
| Promote: `git worktree add` | not stated | PRD §11, §12. The drawio puts *"git worktree add / remove per task"* in the worker's *Workspace manager* |

> [!question] Who runs `git worktree add` on promote?
> `POST /api/tasks/:id/promote` is a web route, and the PRD does not say it enqueues a job. The drawio *Harness architecture* places the *Workspace manager* (*"git worktree add / remove per task"*) inside `apps/worker`. A worktree is a short git call, not a long-lived child process, so either reading fits PRD §2. No job kind creates a worktree. See [[Intake And Import Open Questions]] #15 and [[Workspaces Open Questions]] #2.

## Code layout

| Piece | PRD §3 | Architecture README |
|---|---|---|
| Port | `packages/core/ports/` (*"AgentProvider, ExecHost, MemoryStore, Notifier, TaskSource interfaces"*) | `core/ports/` |
| Markdown adapter | not listed (`adapters/` has `agent/`, `exec/`, `notify/`, `memory/`; the drawio *Code layout* card lists the same four) | `adapters/source/markdown/` |
| GitHub adapter | — | `adapters/source/github/` |
| Seeds | `seed/flows/default.json`, `skills/` | — |
| Reference | — | `docs/old/reference/core/ports/task-source.ts`, `docs/old/reference/adapters/source/markdown/markdown-source.ts` |

Rule (PRD §3): *"**`packages/core` imports no framework, no database driver and no CLI.**"* So the upsert cannot live in core's port; the `07` snippet calls `db.insert(...)` on what `fetch()` returned. `06` §15 adds that *"Every port is called from `src/lib/`, **never from a route**"*. Which layer holds the upsert is not named ([[Settings And Plumbing Open Questions]] #15).

## Call sites

From `07-ports-in-practice.md`, abridged (the full snippet is in [[Idempotent Upsert]]):

```ts
const source = new MarkdownTaskSource();
const tasks = await source.fetch({ content: '...' });
for (const t of tasks) { /* upsert on (projectId, importKey) */ }
```

**Proposal** (assembled, not in a source): the worker's `import_backlog` handler reads `{ projectId, path, cleanup }`, calls the markdown source, falls back to or prefers the agent per [[Intake And Import Open Questions]] #3, normalises keys, upserts, records counts and the path that ran, then deletes the temp file when `cleanup` is set.

## Related

- [[Intake And Import Index]]
- [[TaskSource Port]]
- [[Import Job Lifecycle]]
- [[Worker Lifecycle]]
- [[Intake Storage]]
