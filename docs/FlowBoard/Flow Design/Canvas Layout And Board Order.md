---
tags: [flowboard, flow-design, layout, board]
module: Flow Design
---

# Canvas Layout And Board Order

Two orderings come out of a flow: where steps sit on the **canvas**, and the order of the **board's columns**.

## Canvas position is arrangement, not meaning

> **The canvas is arrangement, not meaning.** Dragging a step changes where it sits, never what runs when — that's the edges. Position is for your reading comfort, and it's saved with the version so the recipe looks the same to whoever opens it next. — flow-designer guide

| Source | Position |
|---|---|
| Flow-designer guide | Saved with the version |
| Flow-designer mockup | `x`, `y` on each step; drag snaps to 10 px; a drag marks the recipe unsaved |
| Backlog decision **D4** | *"Persist React Flow positions — No; dagre is deterministic"* |
| Drawio card *D4 · Don't persist node positions* | *"dagre layout is deterministic."* (page *FlowBoard ideation*) |
| Backlog Story 8.2 | *"dagre auto‑layout"*; **DEC**: *"Decide whether to persist node positions (needs a layout column)."* |

Undecided — [[Flow Design Open Questions]] #5 and #6. As built in run-flow (2026-10-23), a flow file has no position keys (`steps.a.x: unknown key`); for now a canvas keeps positions in its own file, and the question is settled with the canvas (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).

## Edge drawing in the mockup

- Forward edges (target to the right) are cubic curves between node sides.
- Backward edges, whatever their condition, *"arc over the top"* of both nodes so they *"can't be confused with forward flow"*.
- The canvas grows to fit: at least 880 × 400, plus 40 px past the furthest node.

Backlog Story 8.2 instead routes *"backwards edges … under the row"*. run-flow's `--mermaid` draws by condition instead, with rework routes dotted; see [[Connections And Routes]].

## Board order

> **Columns come from the recipe** — A "Backlog" and "To do" column, then one column per step, ending in "Done." — feature map §5

| Rule | Source |
|---|---|
| `step_defs.board_order INTEGER NOT NULL` | PRD §5 |
| *"Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`."* | PRD §13 |
| *"`board_order` = layered topological order, `on_fail` edges ignored for layout."* | `02` §2 |
| *"`board_order` = layered topological order."* | backlog Story 5.1 |
| *"Columns: Backlog, Todo, flow steps by `board_order` (topological order from the graph, `on_fail` ignored), Done."* | backlog Story 2.2 |

Inference: an `on_fail` edge *"usually points *backwards*"* (guide), so ignoring them makes the graph acyclic and sortable. Not every one does — the mockup's `branch` preview draws a forward `fail` edge (`buildPreview()`). As built in run-flow (2026-10-23), the routes to set aside are rework routes, not every `on_fail` route: forward routes, a forward `on_fail` included, may not loop, so they always sort. The board is a projection: *"A card's column is derived from its furthest-advanced step instance."* (PRD §4)

### Parallel steps on the board

Layered order puts parallel steps (`build`, `tests`) in the same layer, but the board has one column per step. The monitor mockup's flow strip groups them: `COLS = [['research'],['plan'],['build','tests'],['review'],['summarize']]`, shown as `research→plan→build∥tests→review→summarize`. Tie-breaking inside a layer is not specified.

### Wide flows

The drawio card *8+ columns don't fit* (page *FlowBoard ideation*): *"Horizontal scroll, but the columns that need me must stay findable. Jump-to-attention?"* The old design handoff: *"A real flow is 8 steps + Backlog/Todo/Done = 11 columns"* and *"The flow strip assumes ≤ ~14 columns."*

## Related

- [[Flow Design Screen]]
- [[Branching Joining And Loops]]
- [[Flow Data Model]]
