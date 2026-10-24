FlowBoard's code: the packages (`packages/`: the flow engine, the agent providers, and the `run-agent` and `run-flow` commands) and the web app (`app/`, Next.js).

## The flow designer

```bash
pnpm dev
```

Then open [http://localhost:3000/flows](http://localhost:3000/flows).

The designer edits the recipes in `flows/`, the YAML files that `pnpm run-flow` runs. Set `FLOWBOARD_FLOWS_DIR` to edit another folder.

- **Library**: every `<name>.yaml` in the folder. Name a new one at its foot.
- **Canvas**: drag a step to arrange it; positions are not saved, and the layout follows the routes. Drag from a step's right edge to another step to draw a route, and click a route's label to cycle `always → on_pass → on_fail`. `Delete` removes what is selected.
- **Inspector**: the selected step, the selected route, or with nothing selected, the flow's own budget, entry and defaults.
- **Validation strip**: `run-flow --check` on the draft, as you type. Save stays off while it finds a problem.

Save writes the file in place and changes only the lines whose meaning changed, so comments and alignment written by hand survive. It is refused if the file changed on disk since it was opened. A run already started keeps its own copy of the flow.

The flows API answers only on `localhost`. Notes: `docs/FlowBoard/Flow Design/Flow Design Screen.md`.

## Tests and checks

```bash
pnpm test:app            # the designer's draft model
pnpm test:packages       # the packages; no live runs
pnpm typecheck:packages
pnpm lint
pnpm build               # also typechecks the app
```

`pnpm test:live` runs real agents and costs money.
