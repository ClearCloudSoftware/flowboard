<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Do not use the macOS Keychain for secret storage; use cross-platform storage so the app also works on Windows.
- Refer to this project as Lamproom, not FlowBoard, in code, docs, and UI text.
- Store project data in SQLite accessed through Prisma ORM instead of JSON files, so the database can be swapped later.
<!-- end claude-reflect -->

## Layout
- The repo root is the app: Next.js 16 (`app/`, `components/`) plus pnpm workspace packages in `packages/` (core, adapters, cli, ask-user); `electron/` is the desktop shell.
- `docs/Development.md`: developer guide for the app (designer, desktop app, checks).
- `docs/Lamproom/`: design and handoff notes, one folder per area.
- `docs/Lamproom/Deferred Work.md`: the only list of work left for later (unfixed findings, known problems, open questions). Add leftovers there, not in handoff notes; remove an item when it is fixed.

## Commands (run at the repo root, pnpm 10, Node 24 runs `.ts` directly)
- `pnpm dev`: the web app. `pnpm electron:dev`: the desktop shell.
- `pnpm test:packages` and `pnpm typecheck:packages`: package tests and types. `pnpm test:app`: app tests. `pnpm lint`.
- `pnpm test:live` calls real providers: OpenRouter costs money and Claude uses the subscription login. Run it only when asked.
- `pnpm lr-run-flow <flow.yaml>`: run a flow from the CLI.

## UI
- Build UI from shadcn/ui components in `components/ui/`. When one is missing, add it with `pnpm dlx shadcn@latest add <name>` (configured in `components.json`) instead of hand-rolling it.
- Use TanStack for app state and data: Query for server data, Form for forms, Store for shared client state, Pacer for debounce and throttle. Use React Flow (`@xyflow/react`) for graphs.
- Icons come from `lucide-react` only.

## Workflow
- New work goes on a branch cut from `dev`, in its own worktree under `.claude/worktrees/`.
- Other sessions merge into the shared `dev` checkout. List `origin/dev..dev` just before pushing.

@AGENTS.md
