Lamproom's code: the packages (`packages/`: the flow engine, the agent providers, and the `lr-run-agent` and `lr-run-flow` commands) and the web app (`app/`, Next.js).

## The flow designer

```bash
pnpm dev
```

Then open [http://localhost:3000/flows](http://localhost:3000/flows).

The designer edits the recipes in `flows/`, the YAML files that `pnpm lr-run-flow` runs. Set `LAMPROOM_FLOWS_DIR` to edit another folder.

- **Library**: every `<name>.yaml` in the folder. Name a new one at its foot.
- **Canvas**: drag a step to arrange it; positions are not saved, and the layout follows the routes. Drag from a step's right edge to another step to draw a route, and click a route's label to cycle `always → on_pass → on_fail`. `Delete` removes what is selected.
- **Inspector**: the selected step, the selected route, or with nothing selected, the flow's own budget, entry and defaults.
- **Validation strip**: `lr-run-flow --check` on the draft, as you type. Save stays off while it finds a problem.

Save writes the file in place and changes only the lines whose meaning changed, so comments and alignment written by hand survive. It is refused if the file changed on disk since it was opened. A run already started keeps its own copy of the flow.

The flows API answers only on `localhost`. Notes: `docs/Lamproom/Flow Design/Flow Design Screen.md`.

## The desktop app

```bash
pnpm electron:dev        # the app in a window, on `next dev`
pnpm build && pnpm electron   # the same, on the production build
```

`electron/main.js` starts the Next server with the `node` on your PATH, bound to `127.0.0.1` on port 3210 (`LAMPROOM_PORT`; a free port when it is taken), and opens a window onto it. Links to other sites open in your browser. Closing the window quits the app and stops the server. Electron downloads its binary the first time it runs.

Opened from Finder or Explorer, an app does not get your terminal's PATH, so `electron/path.js` rebuilds it before the server starts: on macOS and Linux from a login shell (`$SHELL -ilc`, so nvm and Homebrew are found), on Windows from the registry, then the usual install folders that exist. `node --test electron/path.test.js` checks it.

## Tests and checks

```bash
pnpm test:app            # the designer's draft model
pnpm test:packages       # the packages; no live runs
pnpm typecheck:packages
pnpm lint
pnpm build               # also typechecks the app
```

`pnpm test:live` runs real agents and costs money.

## Renamed from FlowBoard

The project was FlowBoard until 2026-11-16. Nothing reads the old names, so an existing setup moves its state by hand:

- `code/flowboard/data` and `code/flowboard/runs` → `code/lamproom/` (git moves only tracked files; ignored folders stay behind). `data/flowboard.db` → `data/lamproom.db`.
- `~/.config/flowboard/` → `~/.config/lamproom/`.
- In each project repo: `.flowboard.yaml` → `.lamproom.yaml`, `.flowboard/` → `.lamproom/`. Task branches are now `lr/task-<id>`; existing `fb/task-<id>` branches and worktrees are no longer listed.
- Environment variables `FLOWBOARD_*` → `LAMPROOM_*`.
- Docker images: rebuild as `lamproom:cli` and `lamproom:sandbox` (see `docker/README.md`).
- Commands: `pnpm run-agent`, `run-flow`, `clean-workspace` → `pnpm lr-run-agent`, `lr-run-flow`, `lr-clean-workspace`. The MCP tools are `mcp__lamproom__*`.
