---
tags: [flowboard, flow-design, ui, screen]
module: Flow Design
---

# Flow Design Screen

The flow designer, `flowboard/flows`. Mockup: `docs/mockups/flow-designer.html`; field guide: `docs/mockups/flow-designer-guide.html`. The PRD route is `/p/[slug]/flow` (§13).

> *"A topbar that states which version you're editing, three columns, and a validation strip that sits between you and the Save button."* — flow-designer guide, *Anatomy*

## Layout

```
┌ flowboard/flows  [Software delivery @core v4 adopted 12 Sep]   draft mode  + Step  Save as v5 ┐
├───────────────┬───────────────────────────────────────────┬──────────────┤
│ FLOW LIBRARY  │ CANVAS   drag a step to move it · click…  │ STEP  review │
│ search        │ (preview bar)                             │ agent model  │
│ domain chips  │                    [Build ]               │ effort budget│
│ entries       │   [Research]→[Plan]→[Tests ]→[Review]→…   │ retries      │
│               │                    [Threat model]         │ gate sandbox │
│               │ 7 steps · 2 conditional routes · 1 gate · │ needs/produc.│
│               │ est. $15.80 ceiling per task              │              │
├───────────────┴───────────────────────────────────────────┴──────────────┤
│ VALIDATION STRIP  won't save — 1 problem                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ 17 flows · 5 authors · 3 tasks still running on v4      del · esc        │
└──────────────────────────────────────────────────────────────────────────┘
```

Columns are 300 px · flexible · 272 px. Below 1100 px wide the inspector hides; below 760 px the library hides too.

## Regions

| # | Region | Contents | Note |
|---|---|---|---|
| 1 | **Version chip** | Name, `@author vN`, and `adopted <date>` or `edited — saving makes v(n+1)` or `preview` | *"Which recipe, whose, which version, and whether you've changed it."* Turns amber when edited. |
| 2 | **Library** | Header with flow count, search, domain chips, grouped entries | See [[Flow Library]] |
| 3 | **Canvas** | Grid background, steps as boxes 140 px wide (height follows the content; edges assume 56 px), SVG edges, hint *"drag a step to move it · click to edit it"*, preview bar, canvas bar | *"Drag to arrange, click to edit, and read the routes off the edges."* |
| 4 | **Inspector** | Header `STEP <id>`; fields; needs/produces; problem count; **Delete this step** | *"Everything about the selected step, including what it needs and makes."* |
| 5 | **Validation strip** | Green check, or amber header with one button per problem | *"Green when the recipe holds together; amber, and Save is disabled, when it doesn't."* |
| 6 | **Status bar** | `N flows in the library · N authors · N tasks still running on vN — they keep it until they finish`, key hints | *"Library totals, and how many tasks are still running on the version you're editing."* |

### Canvas bar

`7 steps · 2 conditional routes · 1 approval gate · est. $15.80 ceiling per task`, plus `draft mode — every step forced to haiku` when draft mode is on. *Conditional routes* counts edges that are not `always`. The ceiling sums step budgets (see [[Step Guardrails]]).

As built in run-flow (2026-10-23), a flow states its ceiling instead of summing one: the required top-level `budget_usd` is the most the whole flow may spend, retries and rework included, and `0` means none (Alex's call; see [[Step Guardrails#Ceiling per task]]).

## Step marks on the canvas

| State | Look | Means (guide) |
|---|---|---|
| normal | White box, grey border | *"A step as it sits. The three chips are its model, its thinking effort, and the most it may spend on one attempt."* |
| selected | Dark border and left rail | *"Open in the inspector. … the dark rail matches the row treatment on the monitor."* |
| has a problem | Amber border and wash | *"The validator found something wrong with this step — almost always a file it needs that nothing upstream writes."* |
| preview | Ghosted, dashed | *"You are looking at a library flow, not yours."* |
| gate | Pause-bars glyph after the name | *"this step stops when its agent is done and waits for your approval"* |

Each node shows: name (+ gate glyph), agent, then chips `model · effort · $budget`. Edge marks are in [[Connections And Routes]].

As built in run-flow (2026-10-23), a flow file has no display name or agent reference for a node to show: a step's key is its only name (`name` and `label` are `unknown key`), and positions, display names, an agent reference and sandbox fields stay out of the file (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). `--mermaid` labels a node with its key, plus `(approval)` on a gated step.

As built in the flow designer (2026-10-24), a node shows the step's key (and the gate glyph), then what it runs: its command (`$ pnpm test`), skill or prompt file. Its chips are the model and effort, with an OpenCode id cut to the model's own name, and its `limits.budget_usd`, all with the flow's `defaults` filled in. There is no preview state.

## States of the screen

| State | Chip | Strip | Inspector | Save |
|---|---|---|---|---|
| Adopted, valid | quiet | green | selected step | inert |
| Edited, valid | amber | green | selected step | enabled |
| Edited, invalid | amber | amber | step, with problem chip | disabled |
| Preview | `preview` | green — validation is not run on a preview | preview message | disabled |
| Nothing selected | — | — | *"Select a step on the canvas to edit it."* | — |

The mockup **opens** on *Software delivery @core v4* with `review` selected, the *Code review* group expanded, and one problem (`threat-model` needs `design.md`) while the chip still reads *adopted 12 Sep*. See [[Flow Design Open Questions]] #8.

## Empty states

| Where | Text |
|---|---|
| Library, no match | *"No flow matches that. Try another domain, or clear the search."* |
| Inspector, no selection | *"Select a step on the canvas to edit it."* |
| Inspector, preview | *"You are previewing a library flow. Use it, or go back to yours, to edit steps."* |
| Needs, none | `nothing — it can start cold` |
| Produces, none | `nothing` |

As built in the flow designer (checked 2026-11-10), the texts are:

| Where | Text |
|---|---|
| Library, no match | *"No flow matches that. Clear the search."* There are no domains to try. |
| Library, empty folder | *"No flows in `<dir>` yet. Name one below to start."* |
| Canvas, no flow open | *"Pick a flow from the library, or name a new one."* |
| A file the canvas cannot draw | The **yaml** view, with the notice *"This file cannot be drawn: `<why>`. Fix it by hand; the strip below says what is wrong."* The inspector reads *"This file cannot be drawn. Fix it by hand; the strip below says what is wrong."* |
| Inspector, no selection | The flow's own fields, under *"Select a step on the canvas to edit it."* |
| Needs, none | `nothing — it can start cold` |
| Produces, none | `nothing` |
| May write, none | `anywhere in the folder` |

## Design system

Light only, zero radius, IBM Plex Mono and Sans, hairlines not shadows. PRD §13 says *"Dark-first, dense, keyboard-friendly"* instead — [[Flow Design Open Questions]] #34. Colour roles: petrol `--run` for pass and primary actions, amber `--wait` for problems and edits, red `--fail` for fail routes and delete. The drawio *Harness architecture* page lists the target stack: *"shadcn/ui + Tailwind (light, zero radius, IBM Plex) · xyflow for the designer"*.

> [!warning] Two designs of the editor
> PRD §13 accepts *"A vertical list of steps with an "add step" button and a connections panel"* for v1, and the drawio *Flow editor* card (page *FlowBoard ideation*) reads *"Vertical step list + connections panel"*. The mockup is a canvas, and so is the drawio *Harness architecture* page's *Flow designer* card: *"xyflow canvas; live requires / produces check"*. See [[Flow Design Open Questions]] #27.

## As built in the flow designer (2026-10-24)

The screen is `/flows` in the web app, `code/flowboard/app/flows/` (`pnpm dev`, then `http://localhost:3000/flows`). It edits run-flow recipe files, the YAML that `pnpm run-flow` runs, in `code/flowboard/flows/` or the folder `FLOWBOARD_FLOWS_DIR` names. The canvas is React Flow (xyflow); data, form, state and debouncing are TanStack Query, Form, Store and Pacer (Alex's call, 2026-10-24). Styles are plain CSS in the mockup's tokens, light only, without shadcn/ui (Claude's call, 2026-10-24, open to Alex's review).

| Region | As built |
|---|---|
| Topbar | `flowboard/flows`, the version chip, then **+ Step**, **Save** and **Run** ([[#Run hands off to the runs page]]) |
| Version chip | The flow's name, its file (`flows/delivery.yaml`), and `saved`, or `edited — not saved` in amber. There are no versions: see [[Editing And Saving A Flow]] |
| Notice | A line under the topbar when a flow cannot be opened (the server's reason), or when the open file changed on disk while you have unsaved edits, with **Load the file from disk** ([[Editing And Saving A Flow#Leaving without saving]]) |
| Library | Every `<name>.yaml` in the flows folder: its shape glyph, worked out from the routes; its first line, when that is a comment, as the description; steps, gates and budget; and a problem count when `--check` refuses it, or `open now` on the open flow. Search matches name and description. A name field and **New flow** at the foot start a new recipe, holding only `budget_usd: 0`. There are no domains, authors, variants, preview or **Use this flow**: there is no shared library to draw them from, and authors wait on accounts ([[Flow Design Roadmap#Out of scope (v1)]]). See [[Flow Library]] |
| Canvas | Drag a step to arrange it; drag from a step's right edge to another step to draw a route; click a route's label to cycle its condition, `always → on_pass → on_fail`; `Delete` or `Backspace` removes the selected step or route. The labels read `passed`, `failed`, or `failed ↺` on a rework; an `always` route shows `always` only while selected. A route drawn back to a step before it starts as `on_fail`, a rework. The hint reads *"drag to arrange · drag from a step’s right edge to route it · click to edit"*. The layout: [[Canvas Layout And Board Order]]. A **yaml** tab shows the file as saved, or what Save will write |
| Canvas bar | `N steps · N conditional routes · N approval gates`, then `budget $N.NN for the whole flow`, `no budget ceiling` for `0`, or `no budget set` |
| Inspector | The selected step, the selected route, or, with nothing selected, the flow itself: `budget_usd`, `entry:` and `defaults`. A step's fields sit in one-line groups. The fields: [[Flow Design Controls]] |
| Validation strip | `run-flow --check` on the draft, a quarter of a second after the last edit. Errors in amber disable Save; warnings follow them. Each line is a button that selects the step or route it names. When green, it shows the command that runs the flow |
| Status bar | `N flows in <dir>/ · a run pins its own copy of the flow, so saving here never changes a run already started`, then `del remove · esc deselect · ⌘S save` |

The address names the open flow: `/flows?flow=<name>`. On arrival the designer opens the flow the address names, or else the first in the library, and opening another flow rewrites the address. `/` redirects to `/flows`.

Not built: draft mode ([[Flow Design Open Questions]] #28), versions, the board order and the library's metadata. The flow's `sandbox:` has no field: the designer keeps it as written ([[Flow Design Controls]]). The flows API answers only requests addressed to `localhost` ([[Flow Design API And Routes]]).

### Prompt files

As of 2026-11-10, the designer edits prompt files. The pencil beside a step's **Prompt** field opens the file in a large editor, once the field, or the flow's default, names a file; until then the pencil is disabled, with the tooltip *"Name a prompt file first"*. The file is read and written through `/api/prompts` ([[Flow Design API And Routes]]), and must sit inside the flows folder: any other path opens as *cannot open*, with the server's reason. A file that does not exist yet opens empty, marked *"new file — saving creates it"*; saving creates it. The editor saves the prompt file on its own, apart from the recipe, so `⌘S` inside it saves only the prompt file. The pencil beside **System** opens the inline system prompt the same way, but that text is part of the recipe and is saved with it. See [[Flow Design Controls#In the inspector]].

### Run hands off to the runs page

As of 2026-11-10, **Run** in the topbar goes to `/runs?new=<flow>`, which opens the runs page's **New run** sheet on this flow. A run reads the saved file, so **Run** is disabled while the flow has unsaved edits (*"Save first: a run uses the saved file"*) or fails the check (*"Fix the problems first"*). The sheet has **Flow** (a flow that fails the check is listed but disabled), **Folder** (remembered in this browser), **Task**, a **Budget** that overrides the flow's, and *run even with uncommitted changes in the folder*. **Start run** starts `run-flow --page` in the background. The runs page is in [[Execution Surfaces]]; the flags are in [[Run Flow Reference]].

## Related

- [[Flow Design Controls]]
- [[Flow Library]]
- [[Editing And Saving A Flow]]
- [[Canvas Layout And Board Order]]
