---
tags: [flowboard, cost-and-control, screen]
module: Cost And Control
---

# Costs Page

`/costs`, the screen for the rollups. **There is no mockup and no field guide.** The old design handoff lists it as *"Not in this bundle (designed later): task detail sheet, live session viewer, costs, flow editor."* (`docs/old/design/README.md`). The newer mockups (`docs/mockups/`) cover the monitor, inbox, task detail, flow designer and capability library, not `/costs`.

Everything below comes from prose specs.

## What it must show

PRD §13:

> **`/costs`.** Not just a total. Show:
> - spend per project over time (bar chart, Recharts)
> - spend per step definition, so I can see what `/grill-me` actually costs me
> - spend per model and effort combination
> - **wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops
> - cost per completed task, trended by flow version

The brief (§5) asks a question of each, and singles out wasted spend: *"This needs its own treatment"*. See [[Spend Rollups]].

## What the backlog adds

Story 8.1:

- *"Recharts stacked bars per project per day; tables per step def (by flow version), per model × effort (from `runs.model/effort`), wasted spend, cost per completed task by flow version."* (**PRD**)
- *"Add project filter and real `from`/`to` (API supports both, UI sends neither)."* (**GAP**)
- *"Use the red token, not `text-red-400`; do not freeze `now` for the page lifetime."* (**BUG**)
- *"Loading/error state instead of blank."* (**BUG**)

Acceptance: *"`/costs` shows spend per step definition and a separate wasted-spend figure"* (PRD §16); *"`/costs` per step + wasted."* (backlog 10.1).

## Where it sits

| Source | Placement |
|---|---|
| Drawio ideation | *"Costs & settings `/costs`"*: the rollup cards and the **draft mode toggle** in one group |
| Drawio logical | *"Costs `/costs` — rollups and draft-mode toggle"* |
| Drawio harness | *"Library · Costs · Settings — skills & agents, spend + wasted spend, draft mode, sandbox tier"* |
| PRD §13 | The draft mode toggle is *"in settings"*, written directly under `/costs` |
| Flow-designer mockup | A draft mode toggle in the designer topbar |

Whether the draft toggle lives on `/costs`, on a settings screen, in the designer, or in all three is [[Cost And Control Open Questions]] #5.

## Look and feel the sources fix

Nothing screen-specific. General rules that apply:

- The newer mockups colour only wasted, and not consistently. The monitor topbar's wasted figure uses `--wait` (`monitor.html:61`), the colour the monitor otherwise uses for work waiting on a human. The monitor row, the inbox and task detail use `--fail` red (`monitor.html:209`, `inbox.html:388`, `task-detail.html:64`). See [[Cost And Control Open Questions]] #21.
- The old handoff: live cost is *"Always mono, always right-aligned, never coloured."* Type: *"IBM Plex Mono (all numbers, ids, keys, slugs, models, times, costs)"*.
- Backlog 8.1: wasted uses *"the red token"*.

## What is missing

- A layout, regions, empty state, or any control besides filters and charts.
- How cost per finished task is "trended": by version number on the x-axis, or over time per version.
- Whether the memory bucket appears here. The drawio card *Pays for itself, or it's off* says *"memory's own cost is tagged apart, so /costs shows the net"*. `06` §12 only says the honest number is the net, without naming a screen.
- A drill-down from a rollup to tasks or runs.

These are [[Cost And Control Open Questions]] #13. A mockup and guide for `/costs` would close most of them.

## Related

- [[Spend Rollups]]
- [[Cost API And Routes]]
- [[Cost Surfaces]]
- [[Draft Mode]]
