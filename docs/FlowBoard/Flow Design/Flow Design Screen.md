---
tags: [flowboard, flow-design, ui, screen]
module: Flow Design
---

# Flow Design Screen

The flow designer, `flowboard/flows`. Mockup: `docs/mockups/flow-designer.html`; field guide: `docs/mockups/flow-designer-guide.html`. The PRD route is `/p/[slug]/flow` (§13).

> *"A topbar that states which version you're editing, three columns, and a validation strip that sits between you and the Save button."* — flow-designer guide, *Anatomy*

## Layout

```
┌ flowboard/flows  [Software delivery @core v4 adopted 12 Sep]   draft mode  + Step  Save as v5 ┐
├───────────────┬──────────────────────────────────────────┬──────────────┤
│ FLOW LIBRARY  │ CANVAS   drag a step to move it · click…  │ STEP  review │
│ search        │ (preview bar)                             │ agent model  │
│ domain chips  │   [Research]→[Plan]→[Build ]→[Review]→…   │ effort budget│
│ entries       │                    [Tests ]               │ retries      │
│               │ 7 steps · 2 conditional routes · 1 gate · │ gate sandbox │
│               │ est. $15.80 ceiling per task              │ needs/produc.│
├───────────────┴──────────────────────────────────────────┴──────────────┤
│ VALIDATION STRIP  won't save — 1 problem                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ 17 flows · 5 authors · 3 tasks still running on v4      del · esc        │
└──────────────────────────────────────────────────────────────────────────┘
```

Columns are 300 px · flexible · 272 px. Below 1100 px wide the inspector hides; below 760 px the library hides too.

## Regions

| # | Region | Contents | Note |
|---|---|---|---|
| 1 | **Version chip** | Name, `@author vN`, and `adopted <date>` or `edited — saving makes v(n+1)` or `preview` | *"Which recipe, whose, which version, and whether you've changed it."* Turns amber when edited. |
| 2 | **Library** | Header with flow count, search, domain chips, grouped entries | See [[Flow Library]] |
| 3 | **Canvas** | Grid background, steps as 140 × 56 boxes, SVG edges, hint *"drag a step to move it · click to edit it"*, preview bar, canvas bar | *"Drag to arrange, click to edit, and read the routes off the edges."* |
| 4 | **Inspector** | Header `STEP <id>`; fields; needs/produces; problem count; **Delete this step** | *"Everything about the selected step, including what it needs and makes."* |
| 5 | **Validation strip** | Green check, or amber header with one button per problem | *"Green when the recipe holds together; amber, and Save is disabled, when it doesn't."* |
| 6 | **Status bar** | `N flows in the library · N authors · N tasks still running on vN — they keep it until they finish`, key hints | *"Library totals, and how many tasks are still running on the version you're editing."* |

### Canvas bar

`7 steps · 2 conditional routes · 1 approval gate · est. $15.80 ceiling per task`, plus `draft mode — every step forced to haiku` when draft mode is on. *Conditional routes* counts edges that are not `always`. The ceiling sums step budgets (see [[Step Guardrails]]).

## Step marks on the canvas

| State | Look | Means (guide) |
|---|---|---|
| normal | White box, grey border | *"A step as it sits. The three chips are its model, its thinking effort, and the most it may spend on one attempt."* |
| selected | Dark border and left rail | *"Open in the inspector. … the dark rail matches the row treatment on the monitor."* |
| has a problem | Amber border and wash | *"The validator found something wrong with this step — almost always a file it needs that nothing upstream writes."* |
| preview | Ghosted, dashed | *"You are looking at a library flow, not yours."* |
| gate | Pause-bars glyph after the name | *"this step stops when its agent is done and waits for your approval"* |

Each node shows: name (+ gate glyph), agent, then chips `model · effort · $budget`. Edge marks are in [[Connections And Routes]].

## States of the screen

| State | Chip | Strip | Inspector | Save |
|---|---|---|---|---|
| Adopted, valid | quiet | green | selected step | inert |
| Edited, valid | amber | green | selected step | enabled |
| Edited, invalid | amber | amber | step, with problem chip | disabled |
| Preview | `preview` | green — validation is not run on a preview | preview message | disabled |
| Nothing selected | — | — | *"Select a step on the canvas to edit it."* | — |

The mockup **opens** on *Software delivery @core v4* with `review` selected, the *Code review* group expanded, and one problem (`threat-model` needs `design.md`) while the chip still reads *adopted 12 Sep*. See [[Flow Design Open Questions]] #8.

## Empty states

| Where | Text |
|---|---|
| Library, no match | *"No flow matches that. Try another domain, or clear the search."* |
| Inspector, no selection | *"Select a step on the canvas to edit it."* |
| Inspector, preview | *"You are previewing a library flow. Use it, or go back to yours, to edit steps."* |
| Needs, none | `nothing — it can start cold` |
| Produces, none | `nothing` |

## Design system

Light only, zero radius, IBM Plex Mono and Sans, hairlines not shadows. Colour roles: petrol `--run` for pass and primary actions, amber `--wait` for problems and edits, red `--fail` for fail routes and delete. The drawio *Harness architecture* page lists the target stack: *"shadcn/ui + Tailwind (light, zero radius, IBM Plex) · xyflow for the designer"*.

> [!warning] Two designs of the editor
> PRD §13 and the drawio *Flow editor* card accept *"A vertical list of steps with an 'add step' button and a connections panel"* for v1; the mockup is a canvas. See [[Flow Design Open Questions]] #27.

## Related

- [[Flow Design Controls]]
- [[Flow Library]]
- [[Editing And Saving A Flow]]
- [[Canvas Layout And Board Order]]
