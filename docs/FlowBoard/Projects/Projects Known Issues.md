---
tags: [flowboard, projects, issues]
module: Projects
---

# Projects Known Issues

Minor problems the final review of the new project wizard found (branch `feature/projects-impl`, 2026-11-12) and left unfixed. None loses data or opens a hole; each is small. Paths are under `code/flowboard/`. Strike one off here when it is fixed.

## Input checks

- **`.` and `..` pass as repo names.** `REPO` in `packages/cli/src/clone.ts` and the `name` check in `app/api/projects/clone/route.ts` accept them. GitHub refuses those names, so no real repo has one.
- **`Infinity` passes the page's budget and CPU check.** `Number()` in `app/projects/settings-model.ts` (`toSettings`, `toLimits`) turns `Infinity` into a number the page accepts; the server refuses it, with its own message.

## GitHub (`packages/cli/src/github.ts`)

- **The restricted-organization check reads only the last line of `gh`'s error.** `ghRepos` tests `why(r)`, which keeps the last non-empty line; if `gh` puts *OAuth App access restrictions* earlier, the owner shows as a plain error instead of *no access* with *Request access*.
- **`gh` runs synchronously.** Every call is `spawnSync`, about 0.65 s each, and blocks the server while it runs: `/api/settings`, `/api/github`, `/api/github/repos`. Fix: `execFile` with a promise.

## Wizard

- **The repo step hides two errors.** A failed organizations list (`ghOwners`) and a failed account switch show nothing (`app/projects/wizard/repo-step.tsx`).
- **After an account switch the wizard keeps the old account's owner and repo selected.** Clear both on switch.
- **The done screen says *".flowboard.yaml is new in the repo"* whenever limits were set,** even when the repo already had one (`app/projects/wizard/finish.tsx`). The clone job knows whether the file existed; it should say so.

## Server

- **Finished clone jobs are never dropped.** `globalThis.__fbClones` in `clone.ts` keeps every job until the server restarts. Drop done or failed jobs after some minutes.
- **A malformed `data/settings.json` gives a 500** on `/api/settings` and every page that reads it (`readAppSettings` in `packages/cli/src/app-settings.ts`). Fall back to the defaults and say the file was ignored.
- **A project record with an unknown `type` crashes `GET /api/projects`.** `PROJECT_TYPES[record.type]` is undefined for a hand-edited record. Skip or mark that record instead.

## Code

- **`/settings` resolves the app's values through the `research` type** (`app/settings/settings.tsx`, two places). It works only because Research sets nothing; once it gets defaults, `/settings` shows them as the app's. Resolve with no type.
- **A doc comment in `packages/cli/src/project.ts` sits above the wrong function.** The `setLimits` comment is directly above `limitsError`, not `setLimits`.

## Related

- [[Projects Index]]
- [[Projects Roadmap]]
- [[Project Settings]]
