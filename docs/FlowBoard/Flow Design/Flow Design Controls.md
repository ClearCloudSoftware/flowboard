---
tags: [flowboard, flow-design, ui, reference]
module: Flow Design
---

# Flow Design Controls

Every control on the [[Flow Design Screen]]. *What it does* quotes the flow-designer guide's *Every control* tables where one exists.

## In the topbar

| Control | What it does | Effect |
|---|---|---|
| **draft mode** toggle | *"Forces every step onto the cheapest model while you iterate on the recipe. The cost ceiling in the canvas bar drops to match."* | Not an edit — makes no version |
| **+ Step** | *"Adds a new step wired off `review` on the passed route, selected and ready to edit."* Disabled in preview. (The guide files it under *On the canvas*; the mockup puts the button in the topbar.) | Marks unsaved |
| **Save as v*n*** | *"Writes a new version and points the project at it. Disabled while the recipe has problems, while previewing, and when nothing has changed."* | Creates a version |

PRD §13 has draft mode as a global settings toggle that overrides every step to `--model haiku --effort low`; the mockup's topbar toggle forces only the model. See [[Flow Design Open Questions]] #28.

## In the library rail

| Control | What it does | Effect |
|---|---|---|
| **Domain chip** | *"Filters to one role pack. The number on each chip is how many flows are filed there."* | — |
| **Search** | *"Matches name, author and description together — type `@team-sec` to see everything one author published."* | — |
| **A flow entry** | *"Single-author flows open directly. Where a name has several authors, it expands into the comparison instead."* Clicking again collapses it. | — |
| **A variant** | *"Previews that author's flow on the canvas, ghosted. Your own recipe is untouched."* Clicking the variant that is open on your canvas leaves preview. In the sample data that variant shows `★ org default`, which masks `open now` (see [[Flow Library]]). | — |
| **Use this flow** | *"Adopts the previewed flow as the one you are editing. Marks it unsaved immediately."* | Replaces what is on the canvas |
| **Back to yours** | *"Leaves preview and returns to your recipe, exactly as you left it."* | — |

> [!note] Mockup gap
> In the mockup, a single-author entry does nothing on click; only grouped entries expand. The guide says single-author flows *"open directly"*.

## On the canvas

| Control | What it does | Effect |
|---|---|---|
| **Click a step** | *"Selects it and opens it in the inspector."* | — |
| **Drag a step** | *"Moves it on a snapped grid. Arrangement only — it never changes what runs when."* Snaps to 10 px. | Marks unsaved |

Steps are focusable (`tabindex=0`, `role=button`), but selection happens on `pointerdown` only: `Enter` or `Space` on a focused step does nothing, so the keyboard cannot open a step in the inspector (a mockup gap). No control draws, selects or deletes a route — see [[Flow Design Open Questions]] #17.

As built in the flow designer (2026-10-24):

- **Selecting.** A click on a step, or `Enter` on a focused one, selects it. A click on the empty canvas selects nothing, which opens the flow's own fields.
- **Dragging a step** moves it on a 10 px grid. It is not an edit.
- **Drawing a route.** Drag from a step's right edge to another step. The route starts as `always`, or as `on_fail` when it would close a loop, a rework.
- **A route's label** cycles `always → on_pass → on_fail`; an `always` route shows its label once selected.
- **Removing.** `Delete` or `Backspace` removes the selected step, with its routes, or the selected route.

This answers #17 (Claude's call, 2026-10-24, open to Alex's review).

## In the inspector

| Control | Type | Range |
|---|---|---|
| **Agent** | Text input | Free text (no picker) |
| **Model** | Select | `haiku`, `sonnet`, `opus` |
| **Effort** | Select | `low`, `medium`, `high` |
| **Budget** | Number | ≥ 0, step 0.10 |
| **Retries** | Number | 0–5 |
| **Approval** | Checkbox | *waits for you* |
| **Sandbox** | Select | `none`, `container`, `sealed container` |
| **×** on a need | Button | *Remove this requirement* |
| **Delete this step** | Button (danger) | *"Removes the step and every route into or out of it."* Marks unsaved. (Filed under *On the canvas* in the guide.) |

The ranges are the mockup's. The PRD allows effort `low | medium | high | xhigh | max`, counts `max_attempts` (default 3) rather than retries, and names sandbox tiers `host / container / microVM` — [[Flow Design Open Questions]] #15, #11, #13.

As built in run-flow (2026-10-23), a flow file holds most of these as step keys: `model`, `effort`, `limits.budget_usd`, `max_attempts` (Retries + 1), `gate: approval`, `requires` and `produces`. The budget must be above 0, so a budget of 0 fails: `steps.a.limits.budget_usd: Too small: expected number to be >0`. Only the flow's own `budget_usd`, its ceiling for the whole flow, takes `0`, meaning none. The file holds no Agent name and no Sandbox (`steps.a.agent: unknown key`, `steps.a.sandbox: unknown key`): an agent is inline `system_prompt` text, and canvas-only fields stay out of the flow file (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). A step added with **+ Step** fails `--check` until it has a lowercase key and a `prompt`, `skill` or `system_prompt`.

Every field change re-renders and re-validates at once, and focus stays in the field. **produces** is display-only: no control adds or removes an output, and none adds a need. Fields from the PRD and backlog with no control yet: step name and key (the label shows only as the inspector heading, so a step added with **+ Step** stays *New step*), kind, skill picker, command, prompt template, permission mode, allowed tools, max turns, entry. See [[Step Definitions]].

run-flow's flow file adds keys that no design note lists, which a canvas would also have to keep: a required top-level `budget_usd:`, the flow's ceiling (`0` for none), a per-step `adapter`, the flow's `defaults`, `write_roots` (paths inside the run's folder, relative to it), `timeout_minutes`, `guards`, `skills` and `plugins` folders, and a top-level `entry:` that names the first step when every step has a route into it; there is no per-step entry flag. It has no folder or task: a flow is a reusable recipe, and each run gives them (`--folder`, `--task`; Alex's call, 2026-10-23). A step's own key replaces the default whole, so a step's `limits: { budget_usd: 1 }` drops a default `max_turns`. Whether the canvas edits `defaults` or writes every value on the step is not decided.

As built in the flow designer (2026-10-24), the inspector edits the step's own keys as they are written, and the flow's `defaults` with nothing selected. A blank step field takes the default, which its placeholder shows, and nothing is copied from one to the other (Claude's call, 2026-10-24, open to Alex's review). Every change reaches the draft at once; the check follows a quarter of a second later.

| Field | Key | Notes |
|---|---|---|
| **Name** | the step's key | Lowercase letters, digits, `-` and `_`. Renames when the field is left; the step's routes and `entry:` follow |
| **Runs** | `shell:` or not | *an agent* or *a shell command*. A step that becomes a shell step drops its agent keys, as run-flow would refuse them |
| **Adapter**, **Model**, **Effort** | `adapter`, `model`, `effort` | Model is free text; Claude Code's aliases `haiku`, `sonnet`, `opus` are offered. Effort runs `low` … `max` |
| **Budget**, **Max turns** | `limits.budget_usd`, `limits.max_turns` | Above 0, or blank |
| **Timeout** | `timeout_minutes` | On both kinds of step |
| **Prompt**, **Skill**, **System** | `prompt`, `skill`, `system_prompt` | The prompt is a file beside the flow file; the skill is `/plugin:name`; the system prompt is inline text |
| **Command** | `shell` | Shell steps |
| **Approval** | `gate: approval` | *waits for you* |
| **Attempts** | `max_attempts` | Shown only on a step a rework route leads back to, or one that has it set, since nothing else reads it |
| **needs** | `requires` | Chips, amber when no step before this one produces the type; the types steps before it produce are offered |
| **produces** | `produces` | Chips; outputs can be added and removed |
| **may write** | `write_roots` | Agent steps: paths inside the run's folder |

With nothing selected: **Budget** (`budget_usd`, `0` for no ceiling), **Starts at** (`entry:`, blank to let the routes say), and the defaults' adapter, model, effort, budget and max turns. A selected route shows **When**, its condition, with the guide's words for it, and **Delete this route**. There is no Agent or Sandbox field, as there are no such keys. `permissions`, `guards`, `skills` and `plugins` have no field and are kept as written.

## In the validation strip

| Control | What it does |
|---|---|
| **A problem row** | *"Selects the step it names, so you can fix it without hunting."* Also scrolls the canvas back to the left. |

As built in the flow designer (2026-10-24), every line `--check` prints is a row, errors first, then warnings: a row selects the step or route it names and brings a step into view, and a row about the flow as a whole opens the flow's own fields.

## Keyboard

| Key | Action |
|---|---|
| `del` / `Backspace` | Remove the selected step and its routes |
| `esc` | Deselect, or leave preview |

Keys are ignored while focus is in an input or select. The guide's walkthrough also takes `←` / `→`. Backlog Story 8.2 has *"Backspace deletes"*, but the phrase follows the edge-label text (*"edge label cycles `always → on_pass → on_fail`, Backspace deletes"*), so it is ambiguous whether it deletes steps, routes or any selection.

As built in the flow designer (2026-10-24), `Delete` and `Backspace` remove the selected step, with its routes, or the selected route; `Esc` deselects; `⌘S` or `Ctrl+S` saves. They are ignored while focus is in a field, except `⌘S`.

## Related

- [[Flow Design Screen]]
- [[Editing And Saving A Flow]]
- [[Adopting And Adapting A Flow]]
