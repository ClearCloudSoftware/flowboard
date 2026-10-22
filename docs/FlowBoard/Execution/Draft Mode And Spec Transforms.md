---
tags: [flowboard, execution, concept, draft-mode]
module: Execution
---

# Draft Mode And Spec Transforms

Draft mode is a global switch that runs every step on the cheapest model while you work on the recipe rather than the code. Execution applies it at launch. The rule and its cost effects are in [[Draft Mode]] (Cost And Control); where the setting lives is in [[Draft Mode Setting]].

## What it does

| Source | Wording |
|---|---|
| PRD §13 | *"Add a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`, for when I am iterating on the flow itself rather than on code."* |
| Feature map §7 | *"A switch that forces every step onto the cheapest, fastest AI while you're tinkering with the recipe rather than the code."* |
| PRD §16 | *"Draft mode forces every step to haiku/low"* |
| drawio | *"Draft mode toggle / Overrides every step to --model haiku --effort low while iterating on the flow itself."* (*FlowBoard ideation*); *"force haiku / low effort while iterating"* (*Functional components*) |
| Flow designer guide | *"Draft mode isn't a version. It forces every step onto the cheapest model"*; control table: *"Not an edit — makes no version"* |

## Where execution applies it

As a `RunSpec` transformer, not a special case:

```ts
type SpecTransform = (spec: RunSpec) => RunSpec;
const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });
```

*"don't special-case it in the runner. Model it as a pure function applied before `launch()`"*; *"composable with any future override (force-local-model, cap-budget-globally, pin-a-model for an incident)"* (`06` §15). `03` §6: *"Draft mode is applied here as a `RunSpec` transformer … and the *actual* model/effort recorded on the run."* The drawio *Runner* card lists *"draft-mode transform"*.

Backlog 3.5: *"draft mode and the sandbox profile compose as `RunSpec` transformers."* No source fixes the order of the chain ([[Settings And Plumbing Open Questions]] #10; [[Settings Overrides And Spec Transforms]]).

## Recording the truth

*"Add `runs.model`, `runs.effort` (backlog requires these so draft mode can't corrupt cost views)"* (`02` §1); backlog 1.1: *"`runs.model`, `runs.effort` (draft mode must not corrupt cost views)"*. PRD §11.1 names both columns in prose, but PRD §5's `runs` SQL has neither. Backlog 3.2 (**PRD/FIX**): *"Draft mode: override to haiku/low and record actual model/effort on the run."*

## In the flow designer mockup

The canvas bar shows *"est. $… ceiling per task"* and, with draft on, *"draft mode — every step forced to haiku"*. Each step's model chip reads `haiku`, but its effort chip keeps the step's own effort (`flow-designer.html`), so the mockup forces the model only, not PRD §13's `--effort low`. The ceiling uses a flat `$0.05` per step while draft is on; that figure is mockup-only.

## Gaps

- **`haiku` or `fast-cheap`.** The PRD names a Claude alias; `06` uses a logical id. PRD §5 treats Claude aliases as the logical ids (`agents.default_model`: *"a Claude alias, used as the logical model id"*); `01-ports.md` uses names like `fast-cheap` that each provider resolves (as built, none does: Claude passes the id to the CLI as is, and OpenCode takes a `provider/model` id or its own table; [[Agent Providers Open Questions]] #11). Under the PRD's reading `haiku` is already logical; under `01-ports.md`'s it ties draft mode to Claude. See [[Models And Effort]], [[Logical Model Ids]] and [[Execution Open Questions]] #45 ([[Agent Providers Open Questions]] #13).
- **Shell steps.** Draft mode has nothing to override on a shell step; no source says so explicitly.
- **Budget caps.** Answered: no. `06` §15's `draftMode` changes only `model` and `effort`, and lists *"cap-budget-globally"* as a separate future override.
- **When it applies.** Whether a run already in flight keeps its model when the toggle flips is not stated. Applying it at `RunSpec` build time implies the next run picks it up (inference; [[Settings And Plumbing Open Questions]] #10 proposes the same).

## Related

- [[Execution Index]]
- [[Runner Pipeline]]
- [[Models And Effort]]
- [[Agent Launch Contract]]
- [[Draft Mode]]
- [[Draft Mode Setting]]
