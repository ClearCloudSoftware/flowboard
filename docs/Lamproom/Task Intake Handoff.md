---
tags: [lamproom, intake-and-import, handoff]
module: Intake And Import
---

# Task Intake — developer handoff

A 15-minute read for someone picking up Lamproom's task-intake slice. Covers
what it does, how to run it, how to connect Jira, and where every piece lives.

## What this ships

Lamproom now imports work tickets from Jira into a local SQLite database and
displays them on a kanban board.

| Capability | Where |
|---|---|
| **Jira adapter** — OAuth 2.1 (PKCE + confidential client) or API-token Basic auth; pulls issues via Atlassian's REST `/rest/api/3/search/jql` | `packages/adapters/src/ticket/jira/` |
| **TaskSource port** — generic `fetch(input) → { tasks, nextCursor, usage }` interface. Jira, GitHub, markdown and a replay adapter implement it | `packages/core/src/ticket/`, `packages/adapters/src/ticket/*/` |
| **Storage** — one `data/lamproom.db` SQLite file. Two tables: `tasks` (PK `project_id + source_id + import_key`) and `imports` (one row per button click, carries state + counters) | `packages/cli/src/{schema,db,storage}.ts` |
| **Intake loop** — drains a TaskSource into storage, honours a 500-task / 5-minute budget, redacts tokens on failure, writes progress mid-run | `packages/cli/src/intake.ts` |
| **HTTP API** — `POST /api/import/jira`, `GET /api/imports/<id>`, `GET /api/projects/<id>/tasks`, `DELETE /api/projects/<id>/tasks` | `app/api/import/jira/`, `app/api/imports/[id]/`, `app/api/projects/[id]/tasks/` |
| **UI** — "Import from Jira" button + JQL dialog + progress toast on the project page; kanban board at `/p/<slug>/tasks` with click-to-expand detail sheet | `app/projects/import-jira.tsx`, `app/projects/tasks-board.tsx`, `app/p/[slug]/tasks/page.tsx` |
| **Settings** — Jira OAuth + API-token + client-secret management, no `.env.local` required | `app/settings/connections/tasks/jira/JiraPage.tsx`, `app/api/jira/*` |

Not here yet: drag-and-drop, writes to Jira, incremental sync, Linear,
Trello, webhook ingest, backlog-importer agent, FTS5 search, OS-keychain
credential storage.

## Quick start

```powershell
# One-time
corepack enable
cd code\lamproom
pnpm install            # pnpm 10.23 (pinned via packageManager)
```

```powershell
# Dev loop
cd code\lamproom
pnpm dev                # Next.js on http://localhost:3000
pnpm typecheck:packages # type-check the workspace packages
pnpm test:packages      # Node's test runner, no live network
pnpm lint
```

```powershell
# Desktop shell (optional)
pnpm electron:dev
```

**Runtime:** Node 24 runs `.ts` directly — no build step for the packages. The
Next.js app is ESM + Turbopack.

**Corporate networks:** If you're behind a TLS-inspecting proxy, export the
root CAs once and launch Node with `NODE_EXTRA_CA_CERTS` pointing at the
bundle. See `windows-root-cas.pem` in the repo root for the Windows variant.

```powershell
$env:NODE_EXTRA_CA_CERTS = "$PWD\windows-root-cas.pem"
pnpm dev
```

Must be set **in the shell before `pnpm dev`** — Node reads it at process
startup; env vars loaded by Next.js from `.env.local` arrive too late for
the TLS module.

## Connecting Jira end-to-end

1. **Register an OAuth 2.0 app** at
   [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps).
   Grant these scopes: `read:jira-work`, `read:jira-user`,
   `read:jira:agent-interface`, `search:jira:agent-interface`, `offline_access`.
   Set the callback URL to `http://localhost:3000/api/jira/auth/callback`.
   Copy the **Client ID** and **Client Secret**.

2. **Pin the Client ID** — currently hard-coded as `ATLASSIAN_CLIENT_ID` in
   `packages/adapters/src/ticket/jira/oauth.ts`. One client per Lamproom build;
   not UI-settable yet.

3. **Start the dev server** — `pnpm dev`. Open
   `http://localhost:3000/settings/connections/tasks/jira`.

4. **Paste the Client Secret** into the "OAuth client secret" field and save.
   It writes to `data/jira.json` (mode 0600) and is never returned to the UI
   once saved.

5. **Click "Sign in with Atlassian"**. Approve in the popup; the callback
   stores the access + refresh token in `jira.json`. Access tokens are
   auto-refreshed when within 60 s of expiry, and the refreshed credential is
   written back to disk.

6. **Save a default JQL (optional)** — only exposed on the API-token tab
   today. OAuth users just paste a JQL each import.

7. **Import** — open any project at `/p/<slug>`, click **Import from Jira**,
   enter JQL in the dialog (`project = KAN ORDER BY updated DESC`), submit.
   A floating toast polls progress every 1.5s. On success, click **Open the
   board** for the kanban view.

## Codebase layout

Monorepo under the repo root with pnpm workspaces:

```

├── app/                                 Next.js 16 app (Turbopack)
│   ├── api/
│   │   ├── import/jira/                 POST: kick off an import
│   │   ├── imports/[id]/                GET:  one import row (polled)
│   │   ├── jira/                        OAuth flow + credentials + preview
│   │   │   ├── _lib.ts                  shared helpers (transport, secret, refresh)
│   │   │   ├── auth/{start,callback,status}/
│   │   │   ├── credentials/             POST: save API-token credential
│   │   │   ├── oauth-secret/            PUT/DELETE: client secret storage
│   │   │   └── preview/                 GET: one page of issues
│   │   └── projects/[id]/tasks/         GET/DELETE: imported-task storage
│   ├── p/[slug]/
│   │   ├── page.tsx                     project overview
│   │   └── tasks/page.tsx               kanban board
│   ├── projects/
│   │   ├── api.ts                       TanStack query options
│   │   ├── import-jira.tsx              button + JQL dialog + progress toast
│   │   ├── project.tsx                  project overview component
│   │   └── tasks-board.tsx              kanban + detail sheet
│   └── settings/connections/tasks/jira/
│       └── JiraPage.tsx                 OAuth + API-token + client secret UI
├── packages/
│   ├── core/                            @lamproom/core — zero-dep types
│   │   └── src/ticket/                  TaskSource port, ParsedTask, SourceInput, etc.
│   ├── adapters/                        @lamproom/adapters — IO implementations
│   │   └── src/ticket/jira/             JiraTaskSource, oauth, normalize, rest-transport
│   └── cli/                             @lamproom/cli — storage, intake loop, pnpm lr-* CLIs
│       └── src/{schema,db,storage,intake}.ts
├── data/                                SQLite + jira.json live here (gitignored)
├── drizzle.config.ts                    points at packages/cli/src/schema.ts
└── windows-root-cas.pem                 corporate CA bundle (gitignored)
```

### Dependency rule

```
app/api/* ─▶ @lamproom/cli ─▶ @lamproom/adapters ─▶ @lamproom/core
                  │                    │
                  └─ SQL stays here     └─ IO stays here
```

`@lamproom/core` is zero-dep: types and pure functions only. `@lamproom/adapters`
owns every network call. `@lamproom/cli` owns every SQL call. No file in
`@lamproom/adapters` imports anything SQL-shaped; no file in `@lamproom/core`
imports anything from the other two.

## Daily dev workflows

### Add a new task source

1. Define capabilities and normalise output in `packages/adapters/src/ticket/<id>/`.
   Mirror `packages/adapters/src/ticket/github/` for a REST source, or
   `packages/adapters/src/ticket/jira/` for a Rovo-MCP-style source.
2. Implement `TaskSource` from `@lamproom/core`. Produce `ParsedTask[]` and
   a `SourceResult` with `usage` + optional `nextCursor`.
3. Export it from `packages/adapters/src/index.ts`.
4. Write unit tests under `packages/adapters/test/` and a `*-live.test.ts`
   (skipped unless `FLOWBOARD_LIVE=1` and whichever env var names the target).
5. Wire a route under `app/api/import/<id>/route.ts` modelled on
   `app/api/import/jira/route.ts`. The intake loop and storage are source-agnostic.
6. Add a UI entry on the connections page (promote it out of the "coming soon"
   list in `app/settings/settings.tsx` → `TASK_PROVIDERS_SOON`).

### Change the storage schema

```powershell
# Edit packages/cli/src/schema.ts
pnpm --filter @lamproom/cli exec drizzle-kit generate   # writes packages/cli/drizzle/<ts>_<name>.sql
pnpm test:packages                                       # verifies openDb runs the new migration
```

Commit the generated SQL alongside the schema change. Migrations run
automatically on first `openDb(path)` for a given DB file.

### Rotate the Atlassian OAuth client secret

Paste the new secret into the OAuth tab on
`/settings/connections/tasks/jira`. It replaces the old one in `jira.json` on
the next request; no restart required.

### Run live tests (real Jira)

```powershell
$env:FLOWBOARD_LIVE = "1"
$env:FLOWBOARD_LIVE_JIRA_JQL = "project = KAN AND statusCategory != Done"
$env:NODE_EXTRA_CA_CERTS = "$PWD\code\lamproom\windows-root-cas.pem"

cd code\lamproom
node --test packages\adapters\test\jira-live.test.ts   # adapter only
node --test packages\cli\test\intake-live.test.ts      # adapter + intake + SQLite
```

Both skip when the env vars are absent.

### Reset local state

```powershell
Remove-Item .\code\lamproom\data\lamproom.db*   # tasks + import history
Remove-Item .\code\lamproom\data\jira.json      # Jira credentials + client secret
```

Everything else (projects list, flow library, app settings) lives in separate
JSON files under `code\lamproom\data\` or in the repo under `code\lamproom\flows\`.

## Trust boundary (non-negotiable)

Imported task content is **data**, not instructions.

- Rendered as text inside `<b>`, `<p>`, `<span>`, `<pre>` — never as HTML.
- Never passed into an LLM prompt as if it were a system/user instruction.
- Any URL mentioned in a title or body is not auto-fetched. The link is
  displayed as text only.
- Any error surfaced to the UI from a Jira path runs through
  `redactJiraTokens(message, accessToken, refreshToken, apiToken)` before
  it leaves the server. The `imports.error` column is already redacted.

The TaskSource design doc has the full rule set:
`docs/superpowers/specs/2026-11-14-task-source-port-design.md § Trust boundary`.

## Where to look in the design docs

| If you need to understand… | Read |
|---|---|
| The port, data model, idempotency | `docs/superpowers/specs/2026-11-14-task-source-port-design.md` |
| How Jira was implemented | `docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md` and `.../plans/2026-11-17-task-source-jira-mcp.md` |
| Storage + intake | `docs/superpowers/specs/2026-11-19-task-storage-and-intake-design.md` and `.../plans/2026-11-19-task-storage-and-intake.md` |
| Everything Intake-and-Import touches | `docs/Lamproom/Intake And Import/Intake And Import Index.md` |
| Open questions / decided vs still open | `docs/Lamproom/Intake And Import/Intake And Import Open Questions.md` (banners at the top summarise what's resolved) |
| What's left for later across the whole app | `docs/Lamproom/Deferred Work.md` |
| Operator-facing walkthroughs (README-style) | `README.task-sources.md` |

## Known limits for the next developer

Short list; the full deferred work lives in
`docs/Lamproom/Deferred Work.md` and each area's *Open Questions* doc.

- **Only Jira ships a UI path.** The GitHub and markdown adapters exist and
  are tested, but there are no buttons for them. Promoting them is "add a
  route + add a dialog" — not a design decision.
- **No create/edit/write-back.** Every stored task is a read-only mirror of
  whatever the source returned on the last import.
- **Tasks removed from the source stay in Lamproom** on re-import. Design
  decision: v1 keeps them, a follow-up adds a `missingMode: 'keep' | 'archive' | 'delete'`
  option to `runIntake`.
- **No incremental sync.** Every import is a full fetch. Adding `?since=` is
  on the roadmap but not scoped yet.
- **No OS-keychain storage.** OAuth tokens and the client secret live in
  `jira.json` plaintext with mode 0600. A follow-up plan moves them.
- **Rovo MCP is blocked for third-party OAuth apps.** `rest-transport.ts`
  hits Jira REST directly and masquerades as the Rovo envelope the adapter
  expects. When Rovo opens to third parties, swap `restTransport` for
  `httpTransport` in `app/api/jira/_lib.ts` — nothing else changes.
- **The kanban board is read-only.** No drag-and-drop, no column config, no
  filter by source. Plan 3 covers the next iteration.
