---
tags: [flowboard, flow-design, concept, edges]
module: Flow Design
---

# Connections And Routes

> **Connections between steps** — Steps are wired together ("after this, do that"). A connection can always fire, or only when the previous step passed, or only when it failed. — feature map §2

An edge is a row in `step_edges`: `from_step`, `to_step`, and a `condition` (PRD §5).

## The three conditions

| Schema value | Mockup label | Canvas mark | When it fires |
|---|---|---|---|
| `always` | *(none)* | Grey line, grey arrow | *"Unconditional. The moment the step before it finishes, this one becomes eligible."* |
| `on_pass` | `passed` | Petrol line, label *passed* | *"Only when the previous step reported success. This is the happy path out of a review or a health check."* |
| `on_fail` | `failed ↺` | Red dashed line; arced over the top when it points backwards | *"Only when it failed — and it usually points *backwards*, which is what makes a rework loop. Arced over the top of the graph so it can't be confused with forward flow."* |

*When it fires* quotes the flow-designer guide's *Routes between steps* table. The guide's condition names are *always*, *on passed*, *on failed*; the mockup's data uses `always`, `pass`, `fail`. **Proposal:** map `pass` → `on_pass`, `fail` → `on_fail` ([[Flow Design Open Questions]] #31).

In the mockup the arc depends on direction, not condition (`edgePath()`): any backward edge arcs over the top, and a forward `fail` edge, such as the one in the `branch` preview, is drawn as a forward curve.

## How the engine resolves edges

From PRD §8:

- *"`always` edges always fire."*
- *"`on_pass` / `on_fail` edges fire based on `step_instances.outcome`."* A shell step's outcome is its exit code. An agent step sets it *"by writing `{"outcome":"pass"|"fail"}` into its artifact JSON, or via the `set_outcome` MCP tool."*
- *"**A missing outcome is never a pass.** If the step has an `on_pass` or `on_fail` edge and the run ended without setting an outcome, set the step instance to `awaiting_approval` with the reason "no outcome reported" and stop."*
- *"Steps with only `always` edges need no outcome."*

> [!tip] Design implication
> Adding any conditional edge to a step obliges that step to report an outcome. A skill used on such a step must call `set_outcome` (the seeded `/code-review` *"must call `set_outcome`"*, PRD §15). The capability-library mockup shows this in skill manifests as `invokes: set_outcome`.

Human decisions also set outcomes: *"Approve overrides the agent's `fail` outcome (human wins); reject sets `fail` + reason; reject with no `on_fail` edge fails the task."* (backlog Story 5.2; `02` §3). So a rejected gate follows the step's `on_fail` edge.

## Editing routes

| Source | How you edit a route |
|---|---|
| PRD §13 | A *"connections panel"* next to a vertical list of steps |
| Backlog Story 8.2 | *"drag‑to‑connect, edge label cycles `always → on_pass → on_fail`, Backspace deletes … backwards edges routed under the row"* (*Backspace deletes* follows the edge-label text, so it is ambiguous whether it deletes routes, steps or any selection — see [[Flow Design Controls]]); BUG: *"Stable edge ids (not array index)"* |
| Feature map §2 | *"drag steps, draw connections"* |
| Flow-designer mockup | No route editing. **+ Step** adds one route; **Delete this step** removes every route into or out of the step |

Note the routing difference: backlog Story 8.2 routes backward edges *under* the row; the mockup arcs them *over* the top. See [[Flow Design Open Questions]] #17.

PRD §6 says the contract check also *"lets the flow editor grey out invalid connections"*, and `02` §2 says the editor *"greys invalid edges *and* unsupported knobs"*.

## Related

- [[Branching Joining And Loops]]
- [[Approval Gates]]
- [[Flow Validation]]
- [[Flow Data Model]]
