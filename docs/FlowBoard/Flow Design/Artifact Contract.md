---
tags: [flowboard, flow-design, concept, artifacts, contract]
module: Flow Design
---

# Artifact Contract

> **Each step declares what it needs and what it makes** — So FlowBoard can check the whole recipe hangs together before you save it, and warn you if a step needs something no earlier step produces. — feature map §2

## The contract

Every step lists two arrays:

- **`requires`** (mockup: **needs**) — artifact types the step must be given. *"files an earlier step must write"* (inspector hint).
- **`produces`** — artifact types the step writes. *"they're the promise this step makes to whatever comes next"* (flow-designer guide).

> **Artifact types are declared, and the declaration is checked.** Each step definition lists `requires` and `produces` as arrays of artifact type keys. When saving a flow, validate that every `requires` entry is produced by some ancestor step in the DAG. Reject the save with a clear error if not. This turns a whole class of runtime failures into design-time errors, and lets the flow editor grey out invalid connections. — PRD §6

The flow-designer guide explains why it matters: *"Those declarations are what let steps hand off without a shared conversation: `plan` writes `plan.md`, and `build` reads it. They're also what the validator checks."*

## Why files, not messages

The architecture README: *"**Artifacts flow along the edges.** … the graph is valid only if every `requires` is produced by an ancestor (checked at design time — component 2). It is a *dataflow* graph, not a call sequence."* Each step gets a fresh context (drawio concept 7: *"one agent per step with a fresh context"*), so artifacts are the main hand-off between steps. They are not the only one: a rejection *"carries your reason into the next attempt"* (feature map §4), **Retry** *"carries my note into it"* (PRD §8), and, if memory is enabled, the `task` scope means *"attempt 2 starts warm"* (PRD §11.2).

## What the contract drives

| Consumer | Use | Source |
|---|---|---|
| Validator | Every `requires` produced by an ancestor; reject otherwise | PRD §6; [[Flow Validation]] |
| Prompt builder | Part 2: *"input artifacts with their absolute paths, one per `requires` entry, phrased as 'read these first'"*. Part 3: *"The exact output path the step should write, one per `produces` entry."* | PRD §7 |
| Artifact scanner | After a run, registers files created or modified during it *"that match the step's declared `produces` types"* | PRD §6 |
| Park / resume | *"Resume prompt must repeat the requires/produces paths, not only the answers."* (BUG) | backlog Story 3.2 |
| Questions | Questions can be an artifact type: the engine watches the `produces:questions` path | `04-hitl-and-notify.md` §9 |
| Task detail | Files tab: *"what each step produced — the contract the next step reads"* | task-detail mockup |

## How the inspector shows it

| Mark | Meaning |
|---|---|
| Plain chip under **needs** | Some earlier step writes that file |
| Amber chip under **needs** | Nothing upstream writes it |
| Petrol chip under **produces** | An output |
| `nothing — it can start cold` | No needs |
| `×` on a need | Drop the requirement |

## Rework inputs

On a rework loop, *"The new run's 'read these first' list (prompt part 2) also gets the artifacts the failing step produced, so a rework sees the raw `check_output` or `review`, not a summary of it."* (PRD §8). These inputs are not declared in `requires`. Whether a back-edge counts as ancestry for validation is open — [[Flow Design Open Questions]] #22.

> [!check] Answered by run-flow, 2026-10-23
> No (the run-flow plan): ancestry follows forward routes only, so a rework route never counts. On rework the run-flow engine adds the failing step's `produces` to the target's inputs, without a `requires` entry and leaving out any output its failing run did not write this time. A repair step reached only by rework (`health → rollback`) gets those outputs and can `require` nothing (`steps.rollback: requires "release", and no step before it produces that`). See [[Run Flow Reference]].

## Type keys versus filenames

The PRD uses **type keys**: `research_brief`, `questions`, `answers`, `plan`, `explainer`, `implementation_notes`, `test_notes`, `check_output`, `review`, `summary` (§6 seed list). Files land at `<worktree>/.vibe/task-<task-id>/NN-<type>.<ext>`, e.g. `03-plan.md`. The mockups use **filenames** (`brief.md`, `plan.md`, `changes.patch`, `test-report.md`, `review.md`, `summary.md`). See [[Flow Design Open Questions]] #24 and #25.

> [!check] Answered by run-flow, 2026-10-23
> Type keys, each saved as `<folder>/.flowboard/<run folder name>/<type>.md`: always `.md` with no `NN-` prefix, even for a check's log or a patch (the run-flow plan). A type matches `^[a-z0-9][a-z0-9_-]*$`, so a file name is refused (`steps.research.produces.0: name may only use lowercase letters, digits, - and _`). The types are an open set with no known-types list, and a typo in `requires` fails as *no step before it produces that* (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).

Contract validation is store-agnostic: *"it checks the artifact **type graph** (does an ancestor produce what this step requires?), never the bytes."* (`05` §11; `artifact-store.ts` header).

## Related

- [[Flow Validation]]
- [[Step Definitions]]
- [[Adopting And Adapting A Flow]]
- [[Check Steps]]
