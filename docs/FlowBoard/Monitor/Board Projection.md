---
tags: [flowboard, monitor, board, read-model]
module: Monitor
---

# Board Projection

Architecture component **#4**, *Board projection (read model)*. The PRD's board and the monitor are two views of the same projection.

> *"**The board is a projection, not the model.** The flow is a DAG. A card's column is derived from its furthest-advanced step instance. When a task has multiple step instances running in parallel, the card sits in the column of the split point and shows a split badge listing the active branches."* (PRD §4)

## The projection

`02` §4:

- **Role:** *"DAG + `step_instances` → columns + cards; split badges for parallel branches, state dots, live cost."*
- **Seam:** *"pure derivation, no writes."*
- **Genericize:** *"already provider-neutral; reads only normalized instance/run state."*
- **Composes with:** *"column order from 2's topo-sort; card cost from the ledger (12); progress hairline needs `runs.num_turns` written **incrementally**"*
- **Idea:** *"expose it as a **materialized view refreshed on job completion** instead of client polling, collapsing the three overlapping pollers the backlog flags into one."*

The architecture README counts it among what the spec got right: *"Board = projection of `step_instances` → CQRS; read model derived from write model."*

## The PRD board, `/p/[slug]`

PRD §13: *"Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`. Each card shows title, current step, a state dot (running / awaiting answers / awaiting approval / failed), a live cost figure, and a split badge when parallel branches are active. Drag is enabled only between Backlog and Todo — everything downstream is driven by the engine, and dragging there would lie about what the system does. Clicking a card opens a detail sheet."*

Backlog Story 2.2 adds: card *"looped‑back (attempt n of m + reason), failed, done"*, per-branch cost on the split badge, a progress hairline, native HTML5 drag only Backlog ↔ Todo, a flow strip with attention tints, `h`/`l` pan and `[`/`]` jump, `Enter` to open, and a polling hook. The old design handoff (1b, 1c) designed the cards in seven states and the flow strip *"the answer to findability"*. Column order is covered in [[Canvas Layout And Board Order]].

## What the monitor keeps and changes

| PRD board | Monitor mockup |
|---|---|
| One column per step, Backlog/Todo/Done | No columns. One **row** per task with a [[Flow Bar And Step States|flow bar]] |
| Card in the column of its furthest step | `whereOf()` names the step in a text column |
| State dot: 4 states | [[Task Status Icons]]: 6 |
| Split badge listing branches | `⑂2` badge, `build ∥ tests` in the step column, split cell in the bar |
| Live cost | Live cost, plus wasted under it |
| Drag Backlog ↔ Todo | **No drag at all**. No promote or Start control either |
| Flow strip, jump to attention | [[Needs You Band]] above the list; sort *needs you first* |
| Click → detail sheet | Click → inline [[Task Row Detail]] |
| Progress hairline (turns vs median) | A sweep animation, no progress measure |

The guide still states the drag rule: *"Why you can't drag a card. Everything past the backlog is driven by the engine, so dragging a task into `review` would be a lie — no review has run."* Its walkthrough says the backlog *"is the only place on the board you can drag a card into"*, yet the monitor has no backlog column.

Whether the monitor replaces `/p/[slug]`, and where promote and Start live, are open: [[Monitor Open Questions]] #1, #2, #24.

## Related

- [[Monitor Overview]]
- [[Monitor Runtime]]
- [[Pulse View]]
- [[Canvas Layout And Board Order]]
