---
tags: [flowboard, flow-design, architecture, internals]
module: Flow Design
---

# Flow Definition Internals

How a flow definition is structured in code, and who reads a flow version once it is saved.

## Component #2 — Flow definition & validation

From `docs/old/architecture/02-core-and-engine.md` §2:

| Aspect | Text |
|---|---|
| **Role** | *"DAG of `step_defs` + `step_edges`; immutable versions; artifact-contract check; `board_order` topological sort."* |
| **Seam** | *"pure functions over graph JSON — no I/O, no provider. The most reusable piece in the system."* |
| **Genericize** | *"validation stays provider-independent *if* it validates against **capability descriptors** rather than hardcoded knobs. Two design-time checks share one engine"*: the artifact contract and the capability contract. |
| **Composes with** | *"feeds the engine (3), the editor (greys invalid edges *and* unsupported knobs), and the board's column order (4)."* |
| **Idea** | *"flows are already immutable JSON — make them **exportable across projects** … A flow becomes a shareable artifact; keys uniquified on import."* |

## Where the code lives

The PRD's rule (§3): *"**`packages/core` imports no framework, no database driver and no CLI.**"* The architecture README's module layout:

```
core/flow/     # def, validation, board_order (02)
core/engine/   # advancement, fan-out, join, rework (02)
```

The PRD's layout puts *"DAG traversal, advancement rules, loop guard"* in `packages/core/engine/` and the default flow in `seed/flows/default.json`.

## Who calls validation

```mermaid
flowchart LR
  UI[Flow designer<br/>apps/web] -->|live, on change| V[core/flow validate]
  API[PUT /api/flows/:id<br/>POST /api/flows/:id/validate] --> V
  V -->|errors| UI
  V -->|ok| DB[(flows, step_defs, step_edges)]
  DB --> ENG[Flow engine<br/>apps/worker]
  DB --> BOARD[Board projection]
  DB --> PROMPT[Prompt builder]
```

- The drawio *Harness architecture* page puts *Flow validation on save* in **Process 1 · apps/web** (*"thin: validates, calls core, enqueues; never spawns agents"*) and the **Flow engine** in **Process 2 · apps/worker** (*"its rules come from packages/core"*).
- API handlers are thin: *"validate with zod, call a function in `packages/core`, return JSON"* (PRD §12).

## Inputs validation needs

| Check | Needs | Note |
|---|---|---|
| Artifact contract | The graph only | *"checks *type-graph reachability*, not bytes"* (`01-ports.md`, ArtifactStore) |
| Known types | The artifact type list | Seed list in PRD §6 |
| Capability contract | Each step's target provider's capability set | *"Validation (component 2) checks steps against the *target provider's* capability set"* (`01-ports.md`) |
| Provider match | The registry's pack list | Couples pure validation to registry state — [[Capability Library Open Questions]] #6 |

## Consumers of a saved flow version

| Consumer | Reads | Source |
|---|---|---|
| Flow engine | Edges and conditions, `advance_mode`, `max_attempts`, joins | PRD §8; `02` §3 |
| Board projection | `board_order`, step names | PRD §13; `02` §4 |
| Runner / prompt builder | `kind`, model, effort, limits, tools, `requires`, `produces`, `prompt_template` | PRD §7 |
| Artifact scanner | `produces` | PRD §6 |
| Cost views | Step definition and flow version ids | PRD §13 |
| Memory recall | The step's agent or skill as a scope | PRD §11.2 |

The engine *"Depends only on the AgentProvider port's `RunResult`, never on how the run happened."* (`02` §3). `RunResult.outcome` is documented as: *"Drives conditional edges; read from the produced JSON or set_outcome. Unset is NOT 'pass': the engine parks the step at a human gate."* (`agent-provider.ts`)

## Types

The reference tree (`docs/old/reference/`) has no `StepDef`, `FlowDef`, `Edge` or `FlowVersion` type. `StepDef` appears only as an undeclared name in `07-ports-in-practice.md`. The nearest typed shapes are `RunSpec`, `PromptParts` and `RunResult` in `agent-provider.ts`.

## Tests

Backlog Story 5.3: *"Keep `tests/flow.test.ts` scenarios (validation, gate, fan‑out, join, rework, cap, approve → done); add: conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts."* The drawio *Test lane*: *"vitest on engine rules … ReplayProvider drives whole flows at $0"*. Story 0.2 adds a Playwright lane including *"flow canvas connect"*.

## Related

- [[Flow Validation]]
- [[Flow Data Model]]
- [[Flow Design API And Routes]]
- [[Flow Design Overview]]
