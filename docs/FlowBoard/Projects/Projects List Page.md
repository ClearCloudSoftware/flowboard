---
tags: [flowboard, projects, surface, page]
module: Projects
---

# Projects List Page

The `/` route. There is no mockup; this note collects the prose.

> **`/` — projects list.** *Cards with task counts by status and this week's spend.* (PRD §13)

> **A home screen listing your projects** — *The first screen shows each project as a card with how many tasks are in each state and how much you've spent this week.* (feature map §1)

## What the sources specify

| Item | Wording | Source |
|---|---|---|
| One card per project | *"Cards with task counts by status and this week's spend."* | PRD §13 |
| Counts per status | *"Cards: counts per status, this‑week spend (decide rolling 7 d vs calendar week)."* (**PRD/DEC**) | backlog Story 1.3 |
| New project | *"New‑project dialog with flow‑type select ("Empty" allowed); choosing one creates flow v1."* (**NEW**) | backlog Story 1.3 |
| Empty and error | *"Empty state, error handling on submit (non‑JSON error bodies)."* (**BUG**) | backlog Story 1.3 |
| First milestone | *"Seed a project pointing at a scratch git repo. Projects list page renders."* | PRD §14 M1 |
| Data | `GET /api/projects` | PRD §12 |

## A card

| Element | Source | Detail |
|---|---|---|
| Project name | PRD §13 (implied by "cards") | — |
| Task counts by status | PRD §13 | `tasks.status`: `backlog`, `todo`, `running`, `blocked`, `done`, `failed`, `cancelled` (PRD §5). Which of the seven appear is not stated. |
| This week's spend | PRD §13 | Rolling 7 days or calendar week: undecided (backlog Story 1.3 **DEC**). See [[Cost And Control Open Questions]] #4 and [[Spend Rollups]]. |
| Link to the board | **inferred** | No source says a card links anywhere. Pages key on slug (`/p/[slug]`, PRD §13), so a card link would use it. Backlog Story 3.4's *"Project link must use slug (today uses id → 404)"* is about the **run viewer's** link back to the project, not this page. |

**Proposal** for the card layout, borrowed from the design handoff's board header (*"project name 14px/600 · `standard-flow · 8 steps` 11px mono · spacer · `14 tasks · $28.40 today`"*, handoff 1c): name, slug, default flow name and version, the status counts as a row of figures, the week's spend, and a link to `/p/[slug]`. Not in any source as a card. Listed in [[Projects Open Questions]] #12.

## Is `/` the home page?

| Source | Home page |
|---|---|
| PRD §13, feature map §1 | the projects list (*"The first screen"*) |
| Design handoff `Vibe Kanban.dc.html` | nav pills *Inbox · Boards · Runs · Costs*; *Boards* is the nearest thing to a list of projects |
| Design brief | lists six screens to design (inbox, board, task detail, live session viewer, costs, flow editor); no projects list |
| Drawio *Harness architecture*, *Browser · front end* | board, inbox, task detail, flow designer, run viewer, *Library · Costs · Settings*; no projects list |
| Monitor mockup | a cross-repo screen with no route; [[Monitor Open Questions]] #1 asks whether it is the home page |

See [[Projects Open Questions]] #13.

## States

| State | Source |
|---|---|
| Empty | backlog Story 1.3 names it. Rarely seen if the seed project exists *(inferred)*; see [[Seeded Project]]. |
| Submit error | backlog Story 1.3 BUG: non-JSON error bodies |
| Loading, stale | not specified for this page; the design handoff's inbox pattern (1d: skeleton, a `stale` badge, the stale queue kept visible) is the nearest model |

## Related

- [[Project Surfaces]]
- [[Creating A Project]]
- [[Spend Rollups]]
- [[Cost Surfaces]]
- [[Projects API And Routes]]
