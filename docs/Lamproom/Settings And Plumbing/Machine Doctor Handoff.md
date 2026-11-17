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
- [[#Deferred minor issues]]: small problems the final review found and left unfixed, each ready to pick up.
- [[#Known problems outside the doctor]]: two things found along the way.
- [[#Next steps]].

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

## Deferred minor issues

None of these blocks merging. Each names the file, what's wrong, and a fix. Line numbers are at `2eab770`.

1. **The image check can demand `lamproom:cli` when no run uses it.**
   - **Where:** `doctor-needs.ts:121`.
   - **What's wrong:** `boxImage()` is added whenever a Normal or Untrusted project exists, even if every flow brings
     its own `sandbox: { runtime: docker, image }`. `isolationFor` then never uses `lamproom:cli`, but the doctor
     fails the image check.
   - **Fix:** add `boxImage()` only when some flow without a docker sandbox runs on a boxed project. A setup where
     every flow sets its own image is rare today.
2. **An OpenCode step on another provider makes `opencode` look unneeded.**
   - **Where:** `doctor-needs.ts:135`.
   - **What's wrong:** `opencode` is needed only through flows that use OpenRouter or Ollama. An `adapter: opencode`
     step on another provider, where `agentNeeds` returns nothing, still runs `opencode` on a Trusted host. `claude`
     is keyed by adapter, so the two are inconsistent.
   - **Fix:** in `readSetup`, also record each flow's adapters (`st.run.adapter`). Key `opencode` on the adapter, and
     `openrouter`/`ollama` on the model.
3. **The OpenSandbox default address is a second copy.**
   - **Where:** `doctor.ts:348`, copied from `packages/adapters/src/exec/opensandbox/box.ts:71`.
   - **What's wrong:** `'127.0.0.1:8080'` appears in both files. If one changes, the doctor probes the wrong address.
   - **Fix:** export the default (for example `OPENSANDBOX_DEFAULT_DOMAIN`) from `box.ts` through `@lamproom/adapters`
     and import it.
4. **The OpenSandbox fix line is wrong in two cases.**
   - **Where:** `doctor.ts:351`.
   - **What's wrong:** the fix always says to build `lamproom:sandbox`, whichever image is missing. With Docker down,
     the missing images read as "not built".
   - **Fix:** build the fix line per missing image, as the `docker.image` check does. Check `dockerDown()` first and
     skip with its reason.
5. **A Docker check that timed out reads as "Docker is not running".**
   - **Where:** `doctor.ts:199-201`.
   - **What's wrong:** `dockerDown` maps anything that isn't ok or "not installed" to "Docker is not running". The
     image and gVisor checks then repeat that, though Docker may be up but slow.
   - **Fix:** pass the Docker check's own detail through, for example "Docker did not answer in 30 s".
6. **Ollama is probed when nothing needs it, and that creates `data/`.**
   - **Where:** `doctor.ts:316`.
   - **What's wrong:** on a fresh clone with Ollama running, the `refreshOllama` cache write creates the data folder,
     while the `data` check in the same report says "no data folder yet".
   - **Fix:** skip the Ollama probe when its need is `no`, as `opensandbox` does. Or run the `data` check before the
     others.
7. **The header can print a long relative path.**
   - **Where:** `doctor-cli.ts:28`.
   - **What's wrong:** `relative(process.cwd(), dataDir)` prints `../../..` chains when the data folder is outside the
     current folder.
   - **Fix:** print the absolute path when the relative one starts with `..`.

Also found, not fixed: an unparseable Node version string grades as `ok`, because `NaN` comparisons are false
(`doctor.ts`, the `node` check). `process.version` is always well formed, so this can't happen in practice; a guard
would only matter if `nodeVersion` came from somewhere else.

## Known problems outside the doctor

- **The app doesn't get the Claude token from your shell.**
  - **What happens:** `electron/path.js` copies only `PATH` from your login shell. A `CLAUDE_CODE_OAUTH_TOKEN`
    exported in `.zshrc` reaches terminal runs, but not the app opened from Finder or Explorer. The terminal doctor
    says the token is set while the app's Normal runs are refused.
  - **What the doctor does:** the report records which environment it checked (`runner`), and the token line says
    "checked in this terminal".
  - **Proposed fix:** keep the token in `secrets.json` like the OpenRouter key: cross-platform, no keychain (see the
    project's CLAUDE.md).
- **Some existing tests are flaky under load.** These files time out or hang when the whole suite runs at full
  parallelism, and pass when run alone:
  - `packages/adapters/test/opensandbox-relay.test.ts`
  - `packages/adapters/test/opencode-provider.test.ts` (the `stop()` test)
  - `packages/cli/test/clone.test.ts`

  The doctor branch doesn't touch them. A run with `--test-concurrency=4` passes: 729 tests, 704 pass, 0 fail, 25
  live tests skipped.

## Next steps

1. **The UI page.**
   - Add `app/api/doctor/route.ts`, behind `refused(request)` like the other routes, returning
     `Response.json(await runDoctor({ runner: 'app' }))`.
   - Add a status page, or a block on Settings → General, keyed on the check ids.
   - The Docker, gVisor and `gh` probes still block while they run; make them async before they run inside the
     Next server.
2. **The token gap above**, so the app and the terminal agree.
3. **Packaging the Electron app** (option 2 in the design), which drops `node` and `pnpm` from the list.
4. **The deferred minor issues above**, in any order.
