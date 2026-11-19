# System status page and lr-doctor docs

Date: 2026-11-17. Branch: `feature/doctor-page` (off `dev` at `1988916`). Approved by Alex in conversation.

## Why

`pnpm lr-doctor` answers "can this machine run my projects now?" in the terminal. Alex wants the same answer in the app,
in the app-wide settings, and the CLI documented on the `/docs` page. The app's own check is also the one that matters
for the app's runs. The Electron app gets only `PATH` from the shell, so only a check run inside the app can say whether
the app has `CLAUDE_CODE_OAUTH_TOKEN`.

## Goals

- A **System status** section at `/settings/status`, second in the settings sidebar under General, with lucide's
  `Activity` icon. It shows `runDoctor`'s report grouped like the terminal table: status mark, label, detail, the
  needed line per group, and the fix with a copy button. A summary line at the top says ready or not, the counts, when
  it was checked, and that the app's environment was checked.
- The checks run when the page opens and on **Check again**. They don't re-run on focus or on a timer: each run takes
  a couple of seconds and calls OpenRouter, Slack and GitHub.
- `GET /api/doctor` returns `runDoctor({ runner: 'app', dataDir: dataDir(), flowsDir: flowsDir() })`, behind
  `refused(request)` like the other routes. It uses the app's own data and flows folders.
- A **Check your machine** section in `docs/Lamproom/Running Agent Work.md` (what the `/docs` page renders), placed
  before Flow Design. It follows the note's section shape (key concepts, how it works, configure and use, limits and
  status, related notes) and covers the CLI, `--json`, the exit codes, needed vs. optional, and the settings page. The
  note's intro and section list change to match.

## Non-goals

- Any change to what the doctor checks. The deferred minor issues in the handoff note stay deferred.
- A status badge elsewhere, such as the sidebar rail or General. That can come later.
- Fixing the Electron token gap. The page makes it visible, which is enough for now.

## Constraints

- shadcn/ui components from `components/ui/`, TanStack Query for the data, and lucide-react icons only (repo
  CLAUDE.md).
- Alex's house style: light, minimal, zero radius, hairlines. Follow the existing settings sections (`agents.tsx`,
  `settings.tsx` `Head`).
- Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md).
- **No blocking the server.** `dockerNotReady`, `dockerHasGvisor`, `dockerDefaultMemoryMb` (`project.ts`) and
  `ghStatus` (`github.ts`) use `spawnSync`. In the Next server that would freeze every request for about 2 s, and up
  to about 20 s with Docker Desktop stuck. Each gets a non-blocking version (`execFile`) that shares its parsing with
  the existing one, so nothing is copied. `doctor.ts`'s `realProbes` use the non-blocking versions. The existing sync
  callers (`flow-run.ts`, `app/api/settings`, `app/api/github`) stay as they are.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. Route calls `runDoctor` directly (picked)** | `app/api/doctor/route.ts` imports `runDoctor`, as `app/api/agents/route.ts` imports `harnessStatus`. | Typed and in-process, the same pattern as the other routes. It needs the non-blocking probes. |
| B. Route spawns `lr-doctor --json` | A child process per request. | It can't block the server, but it's slower, needs PATH, and drops the shared types. |
| C. Page reads a cached report file | | Stale, and needs a refresh story. |

A was decided in the lr-doctor design. The blocking risk it carries is fixed at the source.

## Left to the builder

- The status colours: use the existing tokens (`text-run`, `text-wait`, `text-fail`, `--wait-soft`), as `agents.tsx`
  does.
- The loading state: the existing `<Loader>`.
- The copy button: the clipboard API, with a lucide `Copy` icon that becomes `Check` once copied.
