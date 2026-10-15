---
tags: [flowboard, projects, api, routes]
module: Projects
---

# Projects API And Routes

REST route handlers under `apps/web/app/api/`. *"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12). `06` §15 puts the same rule as `src/app/api/` → `src/lib/`. The general API rules belong to the Settings And Plumbing notes.

## Specified

| Method | Path | Purpose | Source |
|---|---|---|---|
| GET | `/api/projects` | List projects (feeds `/`) | PRD §12 |
| POST | `/api/projects` | Create a project | PRD §12 |
| GET | `/api/projects/:id/board` | *"board projection: columns + cards"* | PRD §12 |
| GET | `/api/tasks?project=&status=` | Tasks of one project | PRD §12; backlog Story 2.1 |
| GET | `/api/projects/:id/library` | *"plugins + skills + agents, with used-by"* | PRD §12 |
| POST | `/api/projects/:id/plugins/preview` | *"{url}: clone to staging, parse, return what was found"* | PRD §12 |
| POST | `/api/projects/:id/plugins` | *"{previewId}: confirm the install"* | PRD §12 |
| POST | `/api/projects/:id/plugins/check-updates` | manual update check, per project | PRD §12 |
| POST | `/api/projects/:id/agents` | create an agent in the project | PRD §12 |
| GET | `/api/costs?project=&from=&to=` | rollups, optionally one project | PRD §12 |

The library routes are documented in [[Capability Library API And Routes]], board in [[Monitor API And Routes]], costs in [[Cost API And Routes]].

## Pages

| Route | Page | Source |
|---|---|---|
| `/` | projects list | PRD §13 |
| `/p/[slug]` | the board | PRD §13; drawio |
| `/p/[slug]/flow` | flow editor | PRD §13; drawio |
| `/p/[slug]/library` | skills and agents, *"One screen per project"* | PRD §13 |
| `/skills`, `/agents` | the library, no project | drawio *FlowBoard ideation* (earlier design) |

Pages key on **slug**, the API keys on **id**. The backlog records one bug from the mix: *"Project link must use slug (today uses id → 404)."* (Story 3.4), and one from the editor: *"redirect from a slug prop, not `location.pathname`"* (Story 8.2).

## Not specified

| Gap | Note |
|---|---|
| Request and response bodies for `GET`/`POST /api/projects` | PRD §12 lists paths only |
| Edit a project | no `PATCH` |
| Delete or archive a project | no `DELETE`; see [[Project Lifecycle And Deletion]] |
| Look up by slug | pages need `slug → id`; no endpoint |
| Import into which project | `POST /api/import/backlog` *"accepts `path` (server file) or `content` (browser)"* (backlog Story 7.3; `05` §14), no project named. See [[Intake And Import Open Questions]] #8 |

## Proposals

Not in any source. Each is listed in [[Projects Open Questions]].

```
GET    /api/projects
  -> [{ id, name, slug, repoPath, defaultFlow: {id, name, version} | null,
        checkCommand, taskCounts: {backlog, todo, running, blocked, done, failed, cancelled},
        weekSpendUsd }]                                         -- OQ #11, #12
POST   /api/projects
  { name, repoPath, slug?, flowType | 'empty', checkCommand? }
  -> 201 { id, slug } | 400 { error } (not a git repo, path missing) | 409 (slug taken)   -- OQ #3, #4, #5
GET    /api/projects/by-slug/:slug                                  -- OQ #4
PATCH  /api/projects/:id  { name?, checkCommand?, defaultFlowId? }  -- OQ #6, #10
DELETE /api/projects/:id  -> 409 while any task is non-terminal     -- OQ #9
POST   /api/import/backlog  { projectId, path | content }           -- OQ #25
```

**Proposal:** errors return JSON, because backlog Story 1.3 logs a BUG for *"non‑JSON error bodies"*. The error shape is open app-wide: [[Settings And Plumbing Open Questions]] #18.

## Related

- [[Projects Runtime]]
- [[Creating A Project]]
- [[Projects List Page]]
- [[Capability Library API And Routes]]
- [[Intake API And Routes]]
- [[Settings And Plumbing API And Routes]]
- [[Settings And Plumbing Index]]
