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

As built in run-flow (2026-10-23), the condition and the graph decide, not where a step sits: an `on_fail` route to its own step, or to a step that reaches it along `always` and `on_pass` routes, is a **rework** route, and every other route is forward (the run-flow plan, Execution #9). `pnpm run-flow --mermaid` draws a flow left to right: `always` as `-->`, `on_pass` as `-->|pass|`, a forward `on_fail` as a solid `-->|fail|`, and a rework route as a dotted `-.->|fail ↺|`. A gated step reads `<step> (approval)`; shell and agent steps look alike, and `requires` and `produces` are not drawn. An invalid flow prints its errors instead, with exit 2.

## How the engine resolves edges

From PRD §8:

- *"`always` edges always fire."*
- *"`on_pass` / `on_fail` edges fire based on `step_instances.outcome`."* A shell step's outcome is its exit code. An agent step sets it *"by writing `{"outcome":"pass"|"fail"}` into its artifact JSON, or via the `set_outcome` MCP tool."*
- *"**A missing outcome is never a pass.** If the step has an `on_pass` or `on_fail` edge and the run ended without setting an outcome, set the step instance to `awaiting_approval` with the reason "no outcome reported" and stop."*
- *"Steps with only `always` edges need no outcome."*

As built in run-flow (2026-10-23), the ask-user shim (`packages/ask-user`) also offers `set_outcome`, which writes `{"outcome","reason"}` to the file `FLOWBOARD_OUTCOME_FILE` names. run-flow offers it only to agent steps whose routes or gate read the verdict (an `on_pass` or `on_fail` route, or `gate: approval`), and ignores an outcome any other step reports (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). Neither real adapter sets `RunResult.outcome`, and there is no `{"outcome":…}` JSON fallback (the run-flow plan's Left out list), so an agent step that does not call `set_outcome` ends with no outcome ([[Agent Run Handle And Result]]).

> [!tip] Design implication
> Adding any conditional edge to a step obliges that step to report an outcome. A skill used on such a step must call `set_outcome` (the seeded `/code-review` *"must call `set_outcome`"*, PRD §15). The capability-library mockup shows this in skill manifests as `invokes: set_outcome`.

Human decisions also set outcomes: *"Approve overrides the agent's `fail` outcome (human wins); reject sets `fail` + reason; reject with no `on_fail` edge fails the task."* (backlog Story 5.2; `02` §3). So a rejected gate follows the step's `on_fail` edge.

As built in run-flow (2026-10-23):

- **Reject is offered only when the step has an `on_fail` route** (the run-flow plan). *Fail the flow* is how a person fails the task.
- **A fail that no route handles** (the step has no `always` or `on_fail` route, a final check that exits 1 included) waits at a gate, `failed, and no edge handles a failure`, offering Approve, Retry this step and Fail the flow (Alex's call in the run-flow plan). **A pass that fires no route** ends its branch.
- **Reject is a fail, so it also fires `always` routes.** Use `on_pass` for a route a rejection must not take (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).
- **A rework route must be its step's only `on_fail` route** (`steps.check: on a failure it would rework "impl" and also take the on_fail route to "notify"; a rework route must be its step's only on_fail route`). It fires after the `always` routes fired with it, and its reset removes their targets below its target, so the order edges are written in changes nothing (also Claude's call).

## Editing routes

| Source | How you edit a route |
|---|---|
| PRD §13 | A *"connections panel"* next to a vertical list of steps |
| Backlog Story 8.2 | *"drag‑to‑connect, edge label cycles `always → on_pass → on_fail`, Backspace deletes … backwards edges routed under the row"* (*Backspace deletes* follows the edge-label text, so it is ambiguous whether it deletes routes, steps or any selection — see [[Flow Design Controls]]); BUG: *"Stable edge ids (not array index)"* |
| Feature map §2 | *"drag steps, draw connections"* |
| Flow-designer mockup | No route editing. **+ Step** adds one route; **Delete this step** removes every route into or out of the step |

Note the routing difference: backlog Story 8.2 routes backward edges *under* the row; the mockup arcs them *over* the top. See [[Flow Design Open Questions]] #17.

As built in run-flow (2026-10-23), a route is `{ from, to, condition }` in a top-level `edges:` list, with no id. At most one edge goes from one step to another (`repeats the edge a → b; keep one and set its condition`), so `from` and `to` identify it: the stable edge id the backlog asks for (Alex's call in the run-flow plan). An unknown step, `START` or `END`, or a list in `from` or `to` is an error. Problems still name an edge by its place in the list (`edges.3: unknown step "x"`), which a canvas that reorders edges would need to map back.

PRD §6 says the contract check also *"lets the flow editor grey out invalid connections"*, and `02` §2 says the editor *"greys invalid edges *and* unsupported knobs"*.

## Related

- [[Branching Joining And Loops]]
- [[Approval Gates]]
- [[Flow Validation]]
- [[Flow Data Model]]
