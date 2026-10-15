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

## HTTP API (PRD §12)

```
GET    /api/skills                          POST /api/skills/install    -- from github url
GET    /api/agents                          POST /api/agents
```

## Endpoints the mockup implies but no source specifies

The screen needs more than the PRD lists. A sketch, not a decision:

| Method | Path | For |
|---|---|---|
| `POST` | `/api/capabilities/preview` | Clone + parse + check, returning the manifest without installing |
| `POST` | `/api/capabilities` | Confirm install of a previewed capability |
| `POST` | `/api/capabilities/:id/update` | Take an available update |
| `DELETE` | `/api/capabilities/:id` | Remove; `409` while referenced |
| `GET` | `/api/capabilities/:id/usage` | The used-by list |
| `PUT` | `/api/agents/:id` | Edit an agent (backlog Story 7.2 CRUD) |

> [!note]
> These are proposals derived from the mockup's behaviour. See [[Capability Library Open Questions]].

## Related

- [[Capability Data Model]]
- [[Installing A Capability From GitHub]]
- [[Capability Library Screen]]
