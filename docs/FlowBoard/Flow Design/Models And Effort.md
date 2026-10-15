---
tags: [flowboard, flow-design, models, cost]
module: Flow Design
---

# Models And Effort

Every agent step names a **model** and an **effort** (how hard it thinks). Check steps have neither.

## The fields

| Field | PRD §5 | Mockup options | Flow-designer guide |
|---|---|---|---|
| `model` | default `'sonnet'`, *"passed to --model"* | `haiku`, `sonnet`, `opus` | *"Cheap ones for reading and summarising; expensive ones where a wrong answer is costly to unwind."* Get it wrong: *"Opus on a summarize step burns money for no gain; haiku on a plan step costs you the whole task."* |
| `effort` | default `'medium'`, `low\|medium\|high\|xhigh\|max` | `low`, `medium`, `high` | *"How hard it thinks before acting. Trades latency and cost against care."* Get it wrong: *"High effort everywhere is the most common way a flow quietly doubles in price."* |

Agents carry a `default_model` and `default_effort` (PRD §5 `agents`); the step sets its own. Each node on the canvas shows three chips: model, effort, budget — *"its model, its thinking effort, and the most it may spend on one attempt."*

## Logical model ids

> Step defs reference logical ids (`reasoning-high`, `fast-cheap`, `default`) resolved per provider via `resolveModel`. A flow authored for Claude runs on Codex unchanged; only the resolution table differs. — `01-ports.md`, *Logical model ids*

`RunSpec.model` is documented as *"Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel()"* (`agent-provider.ts`). The PRD and the mockups still use native Claude ids. See [[Flow Design Open Questions]] #15.

## Capability negotiation

*"The engine and flow editor query `capabilities` before using a knob: no `effort` → adapter drops it; editor greys the field."* (`01-ports.md`). The *capability contract* checks *"every knob a step uses is supported by its target provider"* (`02` §2). See [[Flow Validation]].

## Draft mode

> **Draft mode** — A switch that forces every step onto the cheapest, fastest AI while you're tinkering with the recipe rather than the code. — feature map §7

| Source | What it does |
|---|---|
| PRD §13 | *"a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`, for when I am iterating on the flow itself rather than on code."* |
| `06` §15 | A spec transform: `const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });` |
| Backlog Story 3.2 | *"override to haiku/low and record actual model/effort on the run"* — so draft runs don't corrupt cost views (Story 1.1 adds `runs.model`, `runs.effort`) |
| Flow-designer mockup | A **draft mode** toggle in the topbar. Every node's model chip shows `haiku`, the ceiling drops to `$0.05` per step, and the bar adds *"draft mode — every step forced to haiku"* |
| Flow-designer guide | *"**Draft mode isn't a version.** … It's a switch on how runs execute, not an edit to the flow, so it never makes a new version and never shows as unsaved."* |

Whether the designer toggle is the global setting is open — [[Flow Design Open Questions]] #28.

## Cost views that read these fields

- *"spend per model and effort combination"* (PRD §13)
- *"spend per step definition, so I can see what `/grill-me` actually costs me"* (PRD §13; drawio *Spend per step definition*)
- Monitor mockup rates: `haiku 0.008`, `sonnet 0.05`, `opus 0.14` dollars per minute (simulation only).

## Ideas

- *"Auto-pick the AI per step — let FlowBoard choose the best or cheapest model for each step instead of you setting it by hand."* (feature map, parking lot)

## Related

- [[Step Definitions]]
- [[Step Guardrails]]
- [[Provider Coverage And Portability]]
