---
tags: [lamproom, settings-and-plumbing, doctor, handoff]
module: Settings And Plumbing
---

# Machine Doctor Handoff

`pnpm lr-doctor` checks whether this machine can run your Lamproom projects right now. For each system it reports
whether it is installed, running and signed in, and gives the command that fixes whatever isn't. Your setup decides
what counts as needed: your projects' trust levels, the level a new project gets, and the agents and sandboxes your
flows use. `pnpm -s lr-doctor --json` prints the same report as one JSON document, which a page in the app will
return later.

This note is the state of branch `feature/lr-doctor` on 2026-11-17: cut from `dev` at `411de0b`, commits
`09eac82..2eab770`, not merged or pushed. It records:

- [[#How it works]], in brief.
- [[#Calls made without asking]]: the decisions taken while designing and building, each with what it costs if wrong.
- [[#Left for later]]: the next steps, the minor problems the final review left unfixed, and two things found along the way.

The design is `docs/superpowers/specs/2026-11-17-lr-doctor-design.md` and the plan is
`docs/superpowers/plans/2026-11-17-lr-doctor.md`.

## How it works

| File (in `code/lamproom/packages/cli/src/`) | What it does |
|---|---|
| `doctor-needs.ts` | `readSetup` reads projects, app settings and every flow in the flows folder. `doctorNeeds` works out, for each check, whether it is needed (`yes`), needed only for a new project (`new`) or not needed (`no`), with a `why` line. |
| `doctor.ts` | `runDoctor(options)` runs each check through the probe the runs or the Settings pages already use, grades it by its need, and returns a `DoctorReport`. Every probe can be swapped out through `options.probes`. |
| `doctor-cli.ts` | `doctorCli` parses `--json`, prints the table or the JSON, and returns the exit code. `renderReport` draws the table. |
| `doctor-main.ts` | The entry point behind `pnpm lr-doctor`. |

The tests are all in `packages/cli/test/doctor.test.ts`: 39 tests, and none needs Docker or the network.

**Grading.**
- A broken check `fail`s only when its need is `yes`. Otherwise it is a `warn`, and its detail ends in
  "(needed for new projects)" or "(optional: <why>)".
- `skip` means the check wasn't run, for example gVisor with no Untrusted project, or the image check with Docker
  down. Its detail says why.
- `summary.ready` is true when nothing failed.
- Exit codes: `0` ready, `1` a needed check failed, `2` a bad argument or a crash.

**The checks, in their fixed order:**
- Core: `node`, `pnpm`, `git`, `data`.
- Containers: `docker`, `docker.image`, `docker.gvisor`, `token.claude`.
- Agents on this machine: `claude`, `opencode`, `uv`.
- Models: `openrouter`, `ollama`.
- Connections: `github`, `slack`, `opensandbox`.

Every id is always present in the report, so a page can lay out a fixed grid.

**What it changes.** Nothing, with one exception: `refreshOllama` saves `ollama-models.json` in the data folder, as the
Models page does. It never installs, builds, logs in or prints a secret; keys and tokens show only as "set" or their
last 4 characters.

**Speed.** About 2 seconds on this machine. The existing Docker, gVisor and `gh` probes use `spawnSync`, which blocks,
so they run one after another first; everything else then runs at once, each with a 30-second timeout.

## Calls made without asking

### While designing

| # | Call | Why | Cost if wrong |
|---|---|---|---|
| 1 | The trust level a new project gets (Normal today) only warns. A machine with only Trusted projects is ready, and so is a fresh clone. | A fresh machine shouldn't be red for things nothing uses yet, but it should hear that its first project will need Docker. | The first Normal project fails at run time on something the doctor only warned about. |
| 2 | `opencode` counts as ok once it is installed; its own login is shown but doesn't decide the status. | Runs give OpenCode the OpenRouter key themselves (`applySavedKey`), and Ollama needs no key. | None found. |
| 3 | A flow's own `sandbox:` counts as `isolationFor` treats it: it can make Docker needed and adds its image to the image check. | So the doctor can't drift from what runs do. | None. |
| 4 | The UI will call `runDoctor()` directly, with no process spawn; the CLI's `--json` is the same object. | It's how `app/api/agents/route.ts` already shows agent status. | None. |

### While building

| # | Call | Why | Cost if wrong |
|---|---|---|---|
| 5 | A corrupt `settings.json` or `projects.json` fails only the `data` check. The doctor carries on with the default settings and no projects. `Setup` gained `dataError`. | `readAppSettings` and `readProjects` throw on bad JSON, which would crash the whole doctor. | While the file is broken, its overrides don't count toward the needs. |
| 6 | No OpenRouter key only **warns** when no OpenRouter step runs in a container and OpenCode is logged in itself. It **fails** when a container needs the key. | Runs on this machine fall back to OpenCode's own login (`HARNESSES.opencode.login` in `settings.ts`); a container gets only the key, and `flow-run` refuses without it. | A host run whose OpenCode login doesn't cover OpenRouter shows as a warning but fails. |
| 7 | Docker counts as up unless `dockerNotReady(boxImage())` says "Docker is not running". The memory shown is `dockerDefaultMemoryMb() × 4`. | It reuses the run's own check. `dockerDefaultMemoryMb` is a step's default limit, a quarter of Docker's memory. | The memory figure is approximate. |
| 8 | The printing lives in `doctor-cli.ts`; `doctor-main.ts` is three lines. The design put the printing in `doctor-main.ts`. | The printing can be tested without running the entry point. It's the same split as `workspace.ts` and `workspace-main.ts`. | One extra file. |
| 9 | The Core group shows no "needed:" line. | It matches the design's sample, and Core is always needed. | None. |
| 10 | The docs say `pnpm -s lr-doctor --json`. | Without `-s`, pnpm prints its own banner before the JSON. | None. |
| 11 | With no project yet, a flow's agents (OpenRouter, Ollama) are only needed for new projects. | The bundled flows use OpenRouter, which made a fresh clone "Not ready". | None. |
| 12 | The Claude token and the OpenRouter key's container rule are worked out per flow: needed when a step that uses them runs in a container. | It follows `isolate` in `flow-run.ts`; before this, any Docker flow made the token needed for all of them. | None. |

## Left for later

What this work left unfixed or open is in [[Deferred Work#Machine doctor]], the one list of deferred work.

