---
tags: [flowboard, capability-library, api]
module: Capability Library
---

# Capability Library API And Routes

## Web routes

| Source | Route(s) | Content |
|---|---|---|
| PRD §13 / drawio *FlowBoard ideation* | `/skills`, `/agents` | Two pages: skills (list, install from GitHub, update, remove); agents (form) |
| Mockup | `flowboard/library` | One screen covering skills, agents and packs |

The drawio *Logical components* page names the area *Skills & agents — install, edit, list*, without routes. The mockup consolidates the two PRD pages into one library screen. The harness-architecture diagram groups it as *"Library · Costs · Settings — skills & agents"* in the browser front end.

v1 keeps the single library screen, scoped to the current project, because the store is per project ([[Capability Library Decisions|D5]]).

## HTTP API (PRD §12)

```
GET    /api/skills                          POST /api/skills/install    -- from github url
GET    /api/agents                          POST /api/agents
```

## v1 API (decided)

Derived from the decisions (D24). Everything is project-scoped except actions on one plugin or agent.

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
