---
tags: [flowboard, settings-and-plumbing, settings, draft-mode]
module: Settings And Plumbing
---

# Draft Mode Setting

Draft mode is the best-known global switch. This note covers only where the setting lives. What it does to a run and to cost is documented elsewhere:

- [[Draft Mode]] (Cost And Control): the rule, the honest-rollup argument, the mockup behaviour, and every disagreement between sources.
- [[Draft Mode And Spec Transforms]] (Execution): where the runner applies it.

## The setting

| Aspect | What the sources say |
|---|---|
| Scope | Global. PRD §13: *"a global **draft mode** toggle in settings"*. Feature map §19 lists it under *"The global switches."* |
| Storage | A row in `settings` (`06` §15: *"**Settings** (`settings` table): draft mode, …"*) |
| Effect | *"overrides every step to `--model haiku --effort low`"* (PRD §13). `06` §15's sketch sets the logical id `fast-cheap` instead ([[Flow Design Open Questions]] #15) |
| Applied by | The runner, as a `SpecTransform` *"applied before `launch()`"* (`06` §15, `03` §6) |
| Recorded | `runs.model`, `runs.effort` (`02` §1, backlog 3.2) |
| Acceptance | *"Draft mode forces every step to haiku/low"* (PRD §16, backlog 10.1) |
| Milestone | None in PRD §14. Backlog places it in Epic 8, Story 8.3: *"Draft mode toggle"* |

## Where the toggle appears

| Place | Source |
|---|---|
| A settings screen | PRD §13, feature map §19, backlog 8.3 |
| The `/costs` page | drawio *FlowBoard ideation*: *"Costs & settings /costs"* holds *"Draft mode toggle"*; *Logical components*: *"Costs /costs rollups and draft-mode toggle"* |
| The flow designer topbar | `flow-designer.html` (`#draft` button); flow-designer guide: *"Not an edit — makes no version"* |
| A combined Library · Costs · Settings area | drawio *Harness architecture* front-end card: *"skills & agents, spend + wasted spend, draft mode, sandbox tier"* |

Four placements, one global value. If the designer toggle flips the global setting, flipping it while editing one flow changes every project's runs (an inference: no source says what the designer toggle writes). [[Flow Design Open Questions]] #28 asks whether it is a global switch or a designer toggle. See [[Settings Surfaces]].

> [!note] Not a flow edit
> The flow-designer guide: *"It's a switch on how runs execute, not an edit to the flow, so it never makes a new version and never shows as unsaved."* This fits a global setting.

## Related

- [[Draft Mode]]
- [[Draft Mode And Spec Transforms]]
- [[Settings Overrides And Spec Transforms]]
- [[Settings Catalogue]]
- [[Models And Effort]]
