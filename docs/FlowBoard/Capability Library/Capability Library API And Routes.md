---
tags: [flowboard, capability-library, api]
module: Capability Library
---

# Capability Library API And Routes

## Web routes

| Source | Route(s) | Content |
|---|---|---|
| drawio *FlowBoard ideation* (and the earlier PRD §13) | `/skills`, `/agents` | Two pages: skills (install from GitHub URL, update, remove); agents (form) |
| Mockup | `flowboard/library` (the topbar brand) | One screen covering skills, agents and packs |
| PRD §13; backlog Stories 7.1, 7.2 | `/p/[slug]/library` | *"One screen per project"*: plugins and agents |

The drawio *Logical components* page names the area *Skills & agents — install, edit, list*, without routes. The harness-architecture diagram's browser box *Library · Costs · Settings* lists *"skills & agents"* among its contents.

v1 keeps the single library screen, scoped to the current project, because the store is per project ([[Capability Library Decisions|D5]]); the PRD and backlog now give it the project route. See [[Projects Open Questions]] #21 (resolved by D5) for the route conflict from the project side.

## HTTP API (earlier PRD §12)

The PRD first listed four endpoints:

```
GET    /api/skills                          POST /api/skills/install    -- from github url
GET    /api/agents                          POST /api/agents
```

## v1 API (decided)

Derived from the decisions (D24); PRD §12 now lists the same routes. Everything is project-scoped except actions on one plugin or agent. The `_staging/<uuid>` directory and the `403` for a seeded agent come from D24 and D21; PRD §12 says only *"clone to staging"* and does not give the `403`. Also not in PRD §12, and inferred here from the decisions: the amber flag in the library response (D9), the update preview's contents (D19), and the `409` on agent delete (D17).

| Method | Path | For | Decision |
|---|---|---|---|
| `GET` | `/api/projects/:id/library` | Plugins with their skills, and agents — including used-by and the amber flag, computed | D9, D17 |
| `POST` | `/api/projects/:id/plugins/preview` | `{url}` — clone into `_staging/<uuid>`, parse, return what was found | D7 |
| `POST` | `/api/projects/:id/plugins` | `{previewId}` — confirm a previewed install | — |
| `POST` | `/api/projects/:id/plugins/check-updates` | Check every git-sourced plugin in the project | D13 |
| `POST` | `/api/plugins/:id/update/preview` | Update note, skills added and removed; flags a removed skill that is in use | D19 |
| `POST` | `/api/plugins/:id/update` | Take the update; `409` if it drops an in-use skill | D19 |
| `DELETE` | `/api/plugins/:id` | Remove; `409` while referenced | D17, D18 |
| `POST` | `/api/projects/:id/agents` | Define an agent | D21 |
| `PATCH` | `/api/agents/:id` | Edit an agent; `403` for a seeded agent | D21 |
| `DELETE` | `/api/agents/:id` | Remove; `409` while referenced | D17 |

- **No duplicate endpoint.** *Duplicate to edit* is client-side: read the agent, then `POST` a copy.
- **No separate usage endpoint.** Used-by is part of the library response.
- **Staging is cleaned up** when a preview is confirmed or abandoned.

## Related

- [[Capability Library Decisions]]
- [[Capability Data Model]]
- [[Installing A Capability From GitHub]]
- [[Capability Library Screen]]
- [[Projects API And Routes]]
