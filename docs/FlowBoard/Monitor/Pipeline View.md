---
tags: [flowboard, monitor, ui, views]
module: Monitor
---

# Pipeline View

Guide: *"Which step is the bottleneck, and is the recipe the problem?"* Reach for it when *"Work keeps piling up somewhere. Counts on a node, a thick retry loop, and an amber node all point at the flow rather than the code."*

## The graph

The flow drawn left to right as fixed SVG nodes (140 × 70): research → plan → build / tests (stacked) → review → summarize. Each node shows:

- The step name in capitals and its model
- A large **count**: live tasks at that step, meaning running, queued, or held at a gate, question or failure. Grey when zero
- `avg <duration> · <$ per run>`: average duration of finished runs, and the step's total spend (every run, live and wasted included) divided by its number of finished runs
- A `GATE` label on gated steps

Node marks:

| Mark | Means |
|---|---|
| Petrol left rail and box stroke (`live`) | A run is live at this step |
| Ochre outline and wash (`hot`) | A task is parked here on a human |

Edges turn petrol with a flowing dash animation: the edges into build and tests while those steps are live, the edge into plan when plan has any live, queued or held task, and the edges into review and summarize whenever any task sits there, a task held at the gate included. The **retry edge** from review back to build is dashed brick, labelled `↺ sent back ×N today · $X burned`.

## The readout

Below the graph: `backlog · in flight · waiting on you · finished today · burn`.

Then a sentence: *"Counts are live tasks sitting at each step."* Then either a sentence such as *"Right now **review** is where work stops — 1 task parked there waiting on a human, not on an agent."* or *"Nothing is parked on a human — every step is moving."* And: *"The dashed loop is the review→build retry path; a thick one means the recipe, not the code, is the problem."*

The topbar's flow button opens this view.

## In the mockup code

- The node layout is hard-coded (`NODE` positions), and so are the edges. It draws only this one flow.
- `×N` sums `attempts − 1` across **every** run of every task, so failed retries are counted as *sent back* too. It is not limited to today, and neither is `$X burned`, which is all wasted spend on every task.
- The worst step is the one with the most held tasks. Ties go to the earliest step in flow order (`>` not `>=`), so the seeded screen, with one held task each at research, plan, build and review, names **research**.
- *finished today* counts every finished task, with no date check.

See [[Monitor Open Questions]] #3 and #23.

## Where it comes from

No PRD or backlog item asks for a pipeline view. The feature map's parking lot has *"A trends dashboard — throughput over time, how fast questions get answered, cost per feature."* The flow designer draws the same graph for editing; the monitor draws it for live counts. See [[Branching Joining And Loops]] for the loop.

## Related

- [[Pulse View]]
- [[Timeline View]]
- [[Burn Today And Wasted]]
- [[Branching Joining And Loops]]
