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
| **+ Step** | *"Adds a new step wired off `review` on the passed route, selected and ready to edit."* Disabled in preview. | Marks unsaved |
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

Steps are focusable (`tabindex=0`, `role=button`). No control draws, selects or deletes a route — see [[Flow Design Open Questions]] #17.

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
| **Delete this step** | Button (danger) | *"Removes the step and every route into or out of it."* Marks unsaved. |

The ranges are the mockup's. The PRD allows effort `low | medium | high | xhigh | max`, counts `max_attempts` (default 3) rather than retries, and names sandbox tiers `host / container / microVM` — [[Flow Design Open Questions]] #15, #11, #13.

Every field change re-renders and re-validates at once, and focus stays in the field. **produces** is display-only: no control adds or removes an output, and none adds a need. Fields from the PRD and backlog with no control yet: step name and key (the label shows only as the inspector heading, so a step added with **+ Step** stays *New step*), kind, skill picker, command, prompt template, permission mode, allowed tools, max turns, entry. See [[Step Definitions]].

## In the validation strip

| Control | What it does |
|---|---|
| **A problem row** | *"Selects the step it names, so you can fix it without hunting."* Also scrolls the canvas back to the left. |

## Keyboard

| Key | Action |
|---|---|
| `del` / `Backspace` | Remove the selected step and its routes |
| `esc` | Deselect, or leave preview |

Keys are ignored while focus is in an input or select. The guide's walkthrough also takes `←` / `→`. Backlog Story 8.2 has *"Backspace deletes"*, but the phrase follows the edge-label text (*"edge label cycles `always → on_pass → on_fail`, Backspace deletes"*), so it is ambiguous whether it deletes steps, routes or any selection.

## Related

- [[Flow Design Screen]]
- [[Editing And Saving A Flow]]
- [[Adopting And Adapting A Flow]]
