---
tags: [flowboard, flow-design, models, cost]
module: Flow Design
---

# Models And Effort

Every agent step names a **model** and an **effort** (how hard it thinks). Check steps don't use them: the seed table shows `—` (PRD §15), but both columns are `NOT NULL` with defaults (§5), so a shell step row still carries `sonnet`/`medium`, ignored rather than absent. As built in run-flow (2026-10-23), a shell step may set neither: `steps.check.model: not used by a shell step`.

## The fields

| Field | PRD §5 | Mockup options | Flow-designer guide |
|---|---|---|---|
| `model` | default `'sonnet'`, *"passed to --model"* | `haiku`, `sonnet`, `opus` | *"Cheap ones for reading and summarising; expensive ones where a wrong answer is costly to unwind."* Get it wrong: *"Opus on a summarize step burns money for no gain; haiku on a plan step costs you the whole task."* |
| `effort` | default `'medium'`, `low\|medium\|high\|xhigh\|max` | `low`, `medium`, `high` | *"How hard it thinks before acting. Trades latency and cost against care."* Get it wrong: *"High effort everywhere is the most common way a flow quietly doubles in price."* |

Agents carry a `default_model` and `default_effort` (PRD §5 `agents`); the step sets its own. Each node on the canvas shows three chips: model, effort, budget — *"its model, its thinking effort, and the most it may spend on one attempt."*

As built in run-flow (2026-10-23), each agent step takes `adapter`, `model` and `effort` from itself or from the flow's `defaults`. `model` has no default (`steps.a.model: required`); `effort` is optional and sent only when set, so unset means the model's own. The terminal names the adapter and model as each run starts: `-- <step> attempt <n> (<adapter> <model>)`.

## Logical model ids

> Step defs reference logical ids (`reasoning-high`, `fast-cheap`, `default`) resolved per provider via `resolveModel`. A flow authored for Claude runs on Codex unchanged; only the resolution table differs. — `01-ports.md`, *Logical model ids*

`RunSpec.model` is documented as *"Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel()"* (the reference `agent-provider.ts`; the shipped one says *"Logical model id; the adapter resolves it via resolveModel() (Claude: an alias, as is; OpenCode: its table, or "provider/model" as is)"*). The PRD and every mockup use `haiku`, `sonnet` and `opus`. These are Claude **aliases**, not native ids: PRD §5 comments `agents.default_model` as *"a Claude alias, used as the logical model id"*, and the CLI in `docs/old/stream-sample.jsonl` reports a native id like `claude-fable-5-1`. For v1, [[Capability Library Decisions|D20]] treats the aliases as the logical ids, and `resolveModel` passes them through for Claude. The abstract names (`reasoning-high` …) return with a second provider. As built, the second provider, OpenCode (2026-10-18), did not bring them back: it takes a `providerID/modelID` id, or a table given to its constructor, and nothing maps `reasoning-high` and the like ([[Agent Providers Open Questions]] #11). See [[Logical Model Ids]] and [[Flow Design Open Questions]] #15.

> [!check] Answered by run-flow, 2026-10-23
> Native ids per adapter: a Claude alias or id on `claude-code`, OpenCode's `provider/model` on `opencode`; logical ids wait for a models table (Claude's call, 2026-10-23, open to Alex's review). `--check` refuses `sonnet` on an OpenCode step, one inherited from `defaults` included (`steps.a.model: opencode model must be "providerID/modelID"`), so moving a step to another adapter means rewriting its model. See [[Run Flow Reference#Rules this command settles]].

## Capability negotiation

*"The engine and flow editor query `capabilities` before using a knob: no `effort` → adapter drops it; editor greys the field."* (`01-ports.md`). The *capability contract* checks *"every knob a step uses is supported by its target provider"* (`02` §2). See [[Flow Validation]].

As built in run-flow (2026-10-23), capability negotiation is deferred: nothing reads `capabilities`, and capability-gap warnings are on the run-flow plan's Left out list, since both providers declare the same set. The gaps are per model instead. OpenCode drops `effort` silently when the model has no variant of that name, and it reports $0 for a model it has no price for, so neither `limits.budget_usd` nor the flow's `budget_usd` stops such a step. run-flow says so only after the run (`-- <step>: no price for <model>: its cost shows as $0, and limits.budget_usd cannot stop it`); `--check` does not warn.

## Draft mode

> **Draft mode** — A switch that forces every step onto the cheapest, fastest AI while you're tinkering with the recipe rather than the code. — feature map §7

| Source | What it does |
|---|---|
| PRD §13 | *"a global **draft mode** toggle in settings that overrides every step to `--model haiku --effort low`, for when I am iterating on the flow itself rather than on code."* PRD §16: *"Draft mode forces every step to haiku/low"* |
| Feature map §19 *Settings* | *"Force everything onto cheap, fast AI while you iterate on recipes."* |
| Drawio | *FlowBoard ideation*, group *Costs & settings*: card *Draft mode toggle* (*"Overrides every step to --model haiku --effort low while iterating on the flow itself."*). *Logical components*: *Costs /costs* — *"rollups and draft-mode toggle"*. *Harness architecture*: *Library · Costs · Settings* lists *"draft mode"* |
| `docs/pitch.md` | *"a global **draft mode** forces the cheapest models while iterating"* |
| `06` §15 | A spec transform: `const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });` |
| Backlog Story 3.2 | *"override to haiku/low and record actual model/effort on the run"* — so draft runs don't corrupt cost views (Story 1.1 adds `runs.model`, `runs.effort`) |
| Flow-designer mockup | A **draft mode** toggle in the topbar. Every node's model chip shows `haiku`, the ceiling drops to `$0.05` per step, and the bar adds *"draft mode — every step forced to haiku"* |
| Flow-designer guide | *"**Draft mode isn't a version.** … It's a switch on how runs execute, not an edit to the flow, so it never makes a new version and never shows as unsaved."* |

Whether the designer toggle is the global setting is open — [[Flow Design Open Questions]] #28. The setting itself is in [[Draft Mode Setting]] and [[Draft Mode]].

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
- [[Logical Model Ids]]
