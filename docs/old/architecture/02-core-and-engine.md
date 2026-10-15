# 02 — Core domain & workflow engine

The hexagon core: data model, flow definition, execution state machine, board projection. Depends only on
`core/ports`. Provider-neutral by construction.

← back to [README](./README.md) · ports: [01](./01-ports.md)

---

## 1. Domain model & migrations

- **Role:** the 14 tables (PRD §5) plus the invariants — flow immutability, version pinning, guarded loops.
- **Seam:** already provider-neutral except two names. `runs.claude_session_id` and skills-as-Claude-plugins
  are the only leaks.
- **Genericize:**
  - Rename `runs.claude_session_id → agent_session_id`; add `runs.provider`.
  - Add `runs.model`, `runs.effort` (backlog requires these so draft mode can't corrupt cost views),
    and `step_instances.reason` (rejection/failure text shown on the card).
  - `skills` gains `provider` + `format` — a Claude plugin dir is *one packaging* of a capability
    ([component 13](./05-environment-and-registry.md#13-skillagent-registry--capability-packs)).
- **Composes with:** everything reads it; keep it the *only* shared-state coupling. WAL + `busy_timeout=5000`
  + `foreign_keys=ON`, opened via `VIBE_DB_PATH` so worker and MCP (foreign cwd) hit the same file.
- **Idea:** treat `runs` as an **append-only usage journal** — never mutate cost after the result lands;
  corrections are new rows. The ledger ([12](./06-cost-and-platform.md#12-cost--usage-ledger--pricingservice))
  becomes auditable and reproducible.

## 2. Flow definition & validation

- **Role:** DAG of `step_defs` + `step_edges`; immutable versions; artifact-contract check; `board_order`
  topological sort.
- **Seam:** pure functions over graph JSON — no I/O, no provider. The most reusable piece in the system.
- **Genericize:** validation stays provider-independent *if* it validates against **capability descriptors**
  ([01](./01-ports.md#capability-negotiation)) rather than hardcoded knobs. Two design-time checks share one
  engine:
  1. **Artifact contract** (PRD §6): every `requires` entry is produced by some ancestor; exactly one
     producer; known types. Reject the save with a readable error.
  2. **Capability contract**: every knob a step uses is supported by its target provider.
- **Composes with:** feeds the engine (3), the editor (greys invalid edges *and* unsupported knobs), and the
  board's column order (4). `board_order` = layered topological order, `on_fail` edges ignored for layout.
- **Idea:** flows are already immutable JSON — make them **exportable across projects** (the backlog's
  "reuse picker" generalized to a **flow registry**). A flow becomes a shareable artifact; keys uniquified on
  import.

## 3. Flow execution engine (write model)

- **Role:** the state machine — advancement, fan-out, join, conditional edges, rework loops, approval/answer
  gates, `max_attempts` (PRD §8).
- **Seam:** consumes a normalized **run outcome** (`pass|fail` + artifacts produced), emits
  `start_run` / `advance_task` jobs. **Depends only on the AgentProvider port's `RunResult`, never on how the
  run happened.**
- **Genericize:** nothing provider-specific belongs here. Fold in the backlog's correctness fixes, all
  provider-neutral:
  - Task-done = "no active instances **and** no reachable pending targets" (not "no edge fired", which strands
    a task in `running` when a conditional edge never fires).
  - Guard `getInstance()!` / `defs.find()!` so a missing row fails the task cleanly instead of throwing.
  - Approve overrides the agent's `fail` outcome (human wins); reject sets `fail` + reason; reject with no
    `on_fail` edge fails the task.
  - Rework: same instance, `attempts++`, new run, downstream `done` → `skipped` so they re-instantiate,
    superseded runs `wasted=1`. The new run reads the failing step's artifacts (raw `check_output` / `review`).
  - No outcome ≠ pass: a run on a step with conditional edges that sets no outcome parks at a human gate.
  - At `max_attempts` (total runs, first included, default 3; counter on the rework *target*, shared by all
    loops into it), escalate instead of failing: the step parks at `awaiting_approval` (task `blocked`) with
    the last failing artifact; the human picks Retry (one more attempt, with a note, counter not reset) or Fail task.
  - Stuck detection: a shell check failing with the same output fingerprint as its previous failure escalates
    immediately, attempts left or not. Infra failures never reach the engine as attempts (runner retries them).
- **Composes with:** reads flow def (2), writes instances (1), enqueues to the queue
  ([7](./03-execution-substrate.md#7-job-queue--worker-lifecycle)), and its outcome feeds the board (4).
- **Decided for `shell`, open for the rest ([open decision](./README.md#open-decisions-raised-not-resolved)):**
  `shell` is in v3 scope because it is the only executor whose verdict does not come from a model (PRD §7 "Shell
  steps"). The wider idea: generalize `step_defs.kind` (`skill|agent|shell|manual`) into a **StepExecutor interface**. An AI invocation is one executor;
  a shell command, an HTTP call, a pure transform, or a human task are others — each producing/consuming the
  same artifact contract. This turns FlowBoard into a general workflow engine that *ships* AI executors rather
  than *being* one. Nearly free given the DAG already exists; widens the engine's core interface, so decide
  before hardening.

```ts
interface StepExecutor {
  kind: 'agent' | 'skill' | 'shell' | 'http' | 'transform' | 'manual';
  run(step: StepDef, ctx: RunContext): Promise<RunResult>;  // RunResult identical across executors
}
// The 'agent'/'skill' executor delegates to an AgentProvider (01); others don't touch it at all.
```

## 4. Board projection (read model)

- **Role:** DAG + `step_instances` → columns + cards; split badges for parallel branches, state dots, live cost.
- **Seam:** pure derivation, no writes. A card's column is its furthest-advanced step instance; parallel
  branches sit at the split point with a badge. Drag limited to Backlog↔Todo — downstream is engine-driven and
  dragging there would lie.
- **Genericize:** already provider-neutral; reads only normalized instance/run state.
- **Composes with:** column order from 2's topo-sort; card cost from the ledger (12); progress hairline needs
  `runs.num_turns` written **incrementally** (backlog bug: today only on the final event → always 0%).
- **Idea:** the projection is cheap to recompute — expose it as a **materialized view refreshed on job
  completion** instead of client polling, collapsing the three overlapping pollers the backlog flags into one.
