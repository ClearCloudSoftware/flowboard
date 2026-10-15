---
tags: [flowboard, intake-and-import, ui, board]
module: Intake And Import
---

# Intake In The UI

Every place intake shows on a screen. There is no mockup for this component, and none for the board `/p/[slug]` where most of it lives. What follows is from the PRD, the backlog, the old design handoff (`docs/old/design/`), and the monitor and task-detail mockups.

## The board's two intake columns

> *"Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`."* — PRD §13

| Rule | Source |
|---|---|
| *"Drag is enabled only between Backlog and Todo — everything downstream is driven by the engine, and dragging there would lie about what the system does."* | PRD §13 |
| *"Native HTML5 drag only Backlog ↔ Todo; Todo drop target only while dragging."* | backlog 2.2 (**PRD**) |
| *"Only Backlog → Todo is draggable. Everything downstream is engine-driven. Make that legible so I don't try to drag a card and wonder why it snapped back."* | old brief §2 |
| *"Only Backlog → Todo (either direction)."* *"Prefer making the affordance absent over letting a drag snap back."* | old handoff, *Drag* |
| *"Columns come from the flow / Backlog + Todo fixed in front, Done at the end."* | drawio *FlowBoard ideation* |

### Marks (old handoff)

| Element | Mark |
|---|---|
| Draggable card (Backlog/Todo) | *"**dashed** `#2e2e33`"* border, *"2px-radius square outline, not a circle"*, *"A `⠿` grip top-right; meta reads `Backlog` / `drag → Todo`. No cost, no progress"* |
| Why it matters | *"The dashed border + grip + square marker are the *only* things that say "you can drag this". Engine-driven cards are solid-bordered with round dots and never respond to drag."* |
| Column header | *"either `⠿ drag` (Backlog, Todo) or `engine`"* |
| Drop target | *"Todo shows the **drop target**: a 44px dashed accent box … reading `drop to queue` in 10px mono accent. It only appears while dragging."* |
| Flow strip | *"the fixed columns are `#18181b` on `#2e2e33`"* |

The handoff's colours come from the dark-first design (PRD §13: *"Dark-first, dense, keyboard-friendly."*). The drawio *Harness architecture* tech card has moved to *"shadcn/ui + Tailwind (light, zero radius, IBM Plex)"*, so the colours will change; the shapes (dashed, grip, square marker) are what carry the meaning.

## The Import button

Backlog 2.2: *"Import .md button (see 7.3)."* (**NEW**). Backlog 7.3: *"Board button: file picker + paste, busy state, toast; show job progress/result (queued → running → "6 created") so the user is not left guessing."* (**NEW/GAP**)

| Part | What it shows |
|---|---|
| Input | a file picker and a paste box |
| While working | a busy state |
| Progress | *queued → running → "6 created"* |
| Done | a toast, and which path ran (*"deterministic vs agent"*, `05` §14) |

## The task sheet

Backlog 2.3: *"Retry, Cancel, Cleanup, Promote, Start, Demote."* (**PRD/GAP**). D1 puts **Start** *"on card + sheet"*. See [[Promoting A Task]].

## Accessibility

Backlog 9.4 (**BUG**): *"keyboard equivalent for promote/demote"*. No key is named.

## On the mockups that exist

| Screen | What it shows of intake |
|---|---|
| Monitor (`monitor.html`) | A **backlog** count in the pipeline readout and the status bar: tasks with no runs (`TASKS.filter(t => !runsOf(t).length)`). The *Idle* icon covers *"queued or in the backlog"*. No backlog column, no drag, no promote ([[Monitor Open Questions]] #24) |
| Monitor guide | Beats *"In the backlog"* (*"This is the only place on the board you can drag a card into."*) and *"You promote it"*. Note *"Why you can't drag a card."* See [[Life Of A Task]] |
| Task detail (`task-detail.html`) | **Send to backlog** action |
| Task-detail guide | Lifecycle box *backlog · "no workspace yet"*, arrow *"you promote it"* |
| Projects list (PRD §13) | *"Cards with task counts by status"*, so backlog counts show there |

No mockup draws an Import button, a new-task form, a Todo column, or a Promote or Start button.

## Related

- [[Intake And Import Index]]
- [[Promoting A Task]]
- [[Import Job Lifecycle]]
- [[Board Projection]]
- [[Task Actions]]
