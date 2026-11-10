---
tags: [flowboard, flow-design, api, routes]
module: Flow Design
---

# Flow Design API And Routes

## Web routes

| Route | Screen | Source |
|---|---|---|
| `/p/[slug]/flow` | Flow editor / designer | PRD §13; backlog Story 8.2; drawio |
| `/p/[slug]` | The board, whose columns come from the flow | PRD §13 |
| `flowboard/flows` | The mockup's brand path. No source maps it to a URL. | `flow-designer.html` |

A library shared across projects (see [[Flow Library]]) does not fit under `/p/[slug]`. See [[Flow Design Open Questions]] #1.

As built (checked 2026-11-10), there are no projects, so no route sits under `/p/[slug]`:

| Route | Screen |
|---|---|
| `/` | Redirects to `/flows` |
| `/flows`, `/flows?flow=<name>` | The flow designer, on the named flow or the library's first ([[Flow Design Screen]]) |
| `/runs?new=<flow>` | The runs page with the **New run** sheet open on that flow: where the designer's **Run** goes |
| `/runs`, `/runs?run=<folder>` | The runs page ([[Execution Surfaces]]) |

## Endpoints in the PRD

From PRD §12. *"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."*

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/flows/:id` | Read a flow version |
| `PUT` | `/api/flows/:id` | Save — *"creates a new version"* |
| `POST` | `/api/flows/:id/validate` | *"artifact contract check"*; returns *"readable errors"* (backlog 5.1) |

Flow-adjacent endpoints:

| Method | Path | Flow role |
|---|---|---|
| `POST` | `/api/projects` | Backlog Story 1.3: *"New‑project dialog with flow‑type select ("Empty" allowed); choosing one creates flow v1."* Story 1.3 names no endpoint; tying it to this one is an inference. |
| `GET` | `/api/projects/:id/board` | *"board projection: columns + cards"* — columns from `board_order` |
| `POST` | `/api/tasks/:id/promote` | *"backlog -> todo, pin flow, create worktree"* |
| `GET` | `/api/projects/:id/library` | *"plugins + skills + agents, with used-by"*. The step editor's agent and skill pickers would read it (inference; PRD §13 says only *"from defined agents and installed skills"*). See [[Capability Library API And Routes]] |
| `GET` | `/api/costs?project=&from=&to=` | Spend per step definition and per flow version (PRD §13) |

## Proposal: endpoints the mockup needs

None of these are in any source. They are inferred from the flow-designer mockup's actions.

| Method | Path | For |
|---|---|---|
| `GET` | `/api/flows?domain=&q=` | The library rail: grouped entries with steps, gates, ~$/task, runs, last used |
| `GET` | `/api/flows/:id/preview` | A version's graph for the ghosted preview (or reuse `GET /api/flows/:id`) |
| `POST` | `/api/flows/:id/adopt` | **Use this flow**: copy or fork into the project |
| `PUT` | `/api/projects/:id/flow` | Point a project at a version (if not implied by save) |
| `GET` | `/api/flows/:id/running` | *N tasks still running on vN* (or a field on `GET /api/flows/:id`) |
| `GET` | `/api/flows/:id/export`, `POST /api/flows/import` | `02` §2 idea: export across projects, keys uniquified on import |

Listed in [[Flow Design Open Questions]] #30.

## As built in the flow designer (2026-10-24)

Route handlers in `code/flowboard/app/api/flows/`. They are thin, as the PRD asks: zod checks the input, a function in `packages/cli/src/flow-files.ts` does the work, and the answer is JSON. A flow is named by its file name, less `.yaml`, under the rule for step names; the files sit in `code/flowboard/flows/`, or in the folder `FLOWBOARD_FLOWS_DIR` names.

| Method | Path | Does |
|---|---|---|
| `GET` | `/api/flows` | The library: the folder (`dir`) and every recipe's name, description, steps, routes, gates, budget and problem count |
| `POST` | `/api/flows` | `{ name }`: a new recipe holding only `budget_usd: 0`, `201`. `400` for a bad name; `409` if the name is taken |
| `GET` | `/api/flows/:name` | One recipe: its text, a version (a hash of the text), what it parses to, and what `--check` says of it. `404` if there is no such file |
| `PUT` | `/api/flows/:name` | `{ draft, version }`: saves the draft over the recipe opened at `version`. `400` for another body; `409` if the file changed since or is gone; `422`, with the problems, if the check refuses the result |
| `POST` | `/api/flows/:name/check` | The live check: what saving the draft would write, and what `--check` says of it. Writes nothing. `400` if the body is not a JSON object; `404` if there is no such file |
| `GET` | `/api/prompts?path=<path>` | A prompt file: its text and a version, or `version: null` and no text when it does not exist yet. `400` for a path outside the flows folder (2026-11-10) |
| `PUT` | `/api/prompts` | `{ path, text, version }`: writes the prompt file opened at `version`; `null` creates it. `409` if it changed since; `400` for a path outside the flows folder (2026-11-10) |

Every route under `/api/flows/:name` answers `400` for a name that breaks the rule for step names. A prompt's `path` is relative to the flows folder. It may not be absolute, start with `~`, lead out with `..` or through a symlink, name a folder, or end in `.yaml`, so the prompt editor cannot overwrite a recipe.

The check is run-flow's own loader, run on the edited text, so the designer and `run-flow --check` cannot disagree. The routes read and write files on this machine, so they answer only requests whose `Host` is `localhost`, `127.0.0.1` or `[::1]`: a page elsewhere that points its own name at this machine (DNS rebinding) gets `403`, *"the flows API answers only on localhost"* (Claude's calls, 2026-10-24, open to Alex's review). The prompt and runs routes share the guard. There is no preview, adopt, running-tasks, export or import endpoint, as there is nothing for them to serve yet. The runs routes, `POST /api/runs` among them, are in [[Execution API And Routes]].

## Server actions

The drawio *Harness architecture* page, *API routes + server actions*: *"zod-validated input → write rows → enqueue a job → return"*. No source says which job, if any, saving a flow enqueues.

## Related

- [[Flow Definition Internals]]
- [[Flow Storage]]
- [[Capability Library API And Routes]]
