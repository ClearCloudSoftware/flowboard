---
tags: [flowboard, settings-and-plumbing, storage]
module: Settings And Plumbing
---

# Settings And Plumbing Storage

Where this layer's state lives. Durable state is split between one SQLite file and the filesystem. Drawio *Harness architecture*, *Durable state · host filesystem*.

## In SQLite

| What | Where | Note |
|---|---|---|
| Global settings | `settings(key, value)` | [[Settings Data Model]] |
| The job queue | `jobs` | [[Job Queue]] |
| Everything else in the domain | the other tables | [[Domain Schema]] |

Settings are read by both processes: the worker when it builds a `RunSpec` and schedules escalation, the web process when it renders (theme) and serves `GET /api/settings` (proposed).

## On disk, outside SQLite

| What | Path | Source |
|---|---|---|
| Secrets (Slack) | `.env.local` | PRD §10 |
| CLI arg snapshot per run | `data/runs/<id>/args.json` | PRD §7 |
| Run spec + raw stream | `data/runs/<id>/spec.json` | drawio |
| Broker sockets | `data/sock/<run_id>.sock` | PRD §9 |
| Per-run Claude config | generated `mcp.json` and `settings.json` | PRD §7; location open ([[Execution Open Questions]] #39) |

## In the browser

The drawio says *"no client state store: the server is the source of truth"*. The old handoff keeps only ephemeral UI state in the client (`focusedQuestionId`, `draftAnswers`, `connection`, `lastSyncAt`). The theme needs to be known before first paint (backlog 8.3), which a value only in SQLite cannot give without a server read; a `?theme=` URL override exists (backlog 8.3). See [[Appearance And Theme]].

## Not stored

- **Settings history.** No table records changes. The resolved values a run used are on the run (`runs.model`, `runs.effort`, `runs.sandbox`).
- **Users.** *"No auth, no multi-tenancy, no user table."* (PRD §2)

## Related

- [[Database And Connection]]
- [[Environment And Configuration]]
- [[Settings Data Model]]
- [[Execution Storage]]
