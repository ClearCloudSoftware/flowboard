<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Do not use the macOS Keychain for secret storage; use cross-platform storage so the app also works on Windows.
- Refer to this project as Lamproom, not FlowBoard, in code, docs, and UI text.
<!-- end claude-reflect -->

## Layout
- `code/lamproom/`: Next.js 16 app (`app/`, `components/`) plus pnpm workspace packages in `packages/` (core, adapters, cli, ask-user); `electron/` is the desktop shell.
- `docs/Lamproom/`: design and handoff notes, one folder per area.

## Commands (run in `code/lamproom`, pnpm 10, Node 24 runs `.ts` directly)
- `pnpm dev`: the web app. `pnpm electron:dev`: the desktop shell.
- `pnpm test:packages` and `pnpm typecheck:packages`: package tests and types. `pnpm test:app`: app tests. `pnpm lint`.
- `pnpm test:live` calls real providers: OpenRouter costs money and Claude uses the subscription login. Run it only when asked.
- `pnpm lr-run-flow <flow.yaml>`: run a flow from the CLI.

## Workflow
- New work goes on a branch cut from `dev`, in its own worktree under `.claude/worktrees/`.
- Other sessions merge into the shared `dev` checkout. List `origin/dev..dev` just before pushing.
