---
tags: [flowboard, audit, execution, flow-design]
date: 2026-11-10
---

# Flow Design And Execution Gap Audit

This audit checks the notes in [[Flow Design Index|Flow Design]] and [[Execution Index|Execution]] against `dev` at `7c1eb69` (2026-11-10). It is a follow-up to [[Flow Orchestration Conformance Audit]] (2026-10-21, fixed 2026-10-23) and does not repeat what that audit recorded as fixed or decided. Code paths are relative to `code/flowboard/`. Note line numbers are from the note's own folder.

## Short version

- **The engine still matches its notes.** `core/src/flow/engine.ts` and `fingerprint.ts` have not changed since the audit fixes (46a0aea). Every claim checked still holds: routes, joins, gates, rework, attempt counting, stuck detection, escalation, validator messages, exit codes and the attempt line. The 9-step seed and the mockup's *Software delivery* both pass `--check`.
- **The drift comes from four features built after the notes were last corrected.** The Execution notes have not been edited since 2026-10-23. The Flow Design notes were last edited at `6f77f7e`.
  1. **Sandboxes**: the flow-level `sandbox:` key, Docker per step and OpenSandbox per run (`b7a3be0` … `220fb21`).
  2. **`run-flow --page` and the runs page**: decide, answer, stop and resume from `/runs` (`82c089a`, `8e47b72`, `13bcf50`).
  3. **+ New run and the designer's Run button** (`6bcf917`, `c74fdf3`).
  4. **The step panel's one-line groups and the prompt-file editor** (`f890c98`).
- **Many notes still say things that are no longer true:** every step runs on the host; there is no sandbox key; the terminal is the only screen; there is no API in front of the engine; routes never spawn processes; the designer cannot edit prompt files.
- **Five code defects** came out of the comparison (below). Two are confirmed by reading the code; three are likely but were not run.
- **Tests, run on 2026-11-10.**
  - `pnpm test:packages`: 429 tests, 399 pass, 1 fail, 29 skipped. The failure, `cli/test/flow-start.test.ts:21`, passes when run alone, so it looks like a timing flake under load.
  - `pnpm test:app`: 13 of 13 pass.
  - The Docker daemon was down, so none of the container paths ran.

## Fix status

Updated 2026-11-10. Alex said "correct the notes and fix the bugs". The fixes are on branch `fix/gap-audit`, in the worktree `.claude/worktrees/gap-audit`, cut from `dev` at `7c1eb69`.

- **Code.** All five defects below are fixed, and so are the inspector's shell-step note and a sixth defect found while correcting the notes: run-flow ignored `FLOWBOARD_RUNS_DIR`, so a run that + New run started could land outside the folder the runs page lists. Each fix has a test that fails without it, except the two key-handler fixes in the app, which have none (the app's tests cover no components).
  1. `sandbox.env` goes only to agent containers (`flow-run.ts`, `sandboxFor`).
  2. Under Docker, the verdict is written in the run's temp folder and copied to `<NNN>-<step>.outcome.json` (`flow-exec.ts`).
  3. A sandboxed exit 125 is a setup failure, *"exit code 125: the sandbox could not start the command"*, so it opens a *run failed* gate (`flow-exec.ts`, `setupFailure`).
  4. A repeated page Stop is ignored (`flow-run.ts`, `watchStop`).
  5. Only the first open gate takes keys and shows key hints (`run-view.tsx`). ⌘S in the prompt editor stops there (`prompt-editor.tsx`).
  6. run-flow reads `FLOWBOARD_RUNS_DIR` (`flow-run.ts`).
- **Tests.**
  - `pnpm test:packages`: 433 tests, 403 pass, 29 are skipped (Docker was down) and 1 fails. The failure is the known flake in `flow-start.test.ts`, which passes when run alone; the `fix/flow-start-test` worktree has uncommitted work on it.
  - `pnpm test:app`: 13 of 13 pass.
  - Both typechecks are clean.
  - `eslint` reports two errors that were already on `dev`: `prompt-editor.tsx:18` and `run-view.tsx:104`.
- **Notes.** Every note this audit names was corrected against the fixed code, in four groups that split the same way as the audit. The groups also corrected [[Run Flow Reference]], where the sandbox field, `FLOWBOARD_RUNS_DIR` and the repeated stop were wrong or missing. New as-built text is dated 2026-11-10.
- **Still open.** None of the container paths has run against a real Docker daemon. That includes the Docker verdict fix, which is tested only with a fake box.

## Code defects found along the way

| # | Defect | Evidence | Confidence |
|---|---|---|---|
| 1 | A Docker sandbox sends `sandbox.env` to **every** spawn, offline shell checks included. Variables such as `CLAUDE_CODE_OAUTH_TOKEN` reach checks, yet the start line still prints `-- shell steps run without: …`. | `adapters/src/exec/docker.ts:51` (`...profile.env` on every spawn), `cli/src/flow-run.ts:554` | Confirmed by reading |
| 2 | Under `runtime: docker`, `set_outcome` probably cannot write its verdict. The outcome file lives in `ctx.logDir` (`flow-exec.ts:259`), which is mounted read-only into the AI step's container (`flow-exec.ts:307` with `flow-run.ts:553`). The shim writes it with `writeFileSync` (`ask-user/src/server.ts:130`), so the step would end with no outcome reported. No test covers it. | code path | Likely, not run |
| 3 | A container that fails to start (docker exits 125, for example a missing image) is read as a `fail` outcome and goes into rework, instead of opening a *run failed* gate. `setupFailure` knows only 126, 127 and signals. | `cli/src/flow-exec.ts:91-96` | Likely, not run |
| 4 | A second **Stop** on the page more than 300 ms after the first acts as a second Ctrl+C: it SIGKILLs every run, leaves the lock behind and exits 130. The Stop button stays visible while the run shows `running`. | `cli/src/ask/page.ts:75-81`, `flow-run.ts:830-835`, `app/runs/run-view.tsx:594` | Confirmed by reading |
| 5 | Two window `keydown` handlers on the page can both act on a single key: (a) with two gates open, each banner adds its own handler, so `a` approves both; (b) `⌘S` in the prompt editor calls `preventDefault` but does not stop the event, so the designer's window handler also saves the recipe. | `app/runs/run-view.tsx:188-196`; `app/flows/prompt-editor.tsx:41-44` with `app/flows/designer.tsx:120-124` | Confirmed by reading |

There is also a UI text that is wrong: the shell-step note in the inspector says *"It runs in the run's folder, with no sandbox"*, which is false when `sandbox:` is set (`app/flows/inspector.tsx:282`).

## Stale or wrong as-built claims

### Sandboxing (both modules)

| Note | Claim | Code |
|---|---|---|
| Step Guardrails:57 | *"every step runs on the host; there are no tiers yet"* | `sandbox.runtime: docker \| opensandbox` (`cli/src/flow-config.ts:70-78`). Docker runs one container per step run (`flow-run.ts:547-557`); OpenSandbox runs one box per flow run (`flow-run.ts:200-211`). |
| Step Guardrails:57, Run Guardrails At Launch:44 | Imply a sandbox relaxes the `bypassPermissions` refusal | It does not. The refusal is the same with or without a sandbox (`cli/src/config.ts:196-203`, checked with `--check`). |
| Step Definitions:46 | `permissions.mode` defaults to `acceptEdits` *"while there is no sandbox"* | The default is `acceptEdits` in every case (`config.ts:196`). |
| Step Definitions:33-34,49; Flow Data Model:98; Flow Design Controls:92; Run Flow Reference:308 | Sandbox and egress fields *"have no key"* | A flow-level `sandbox:` exists, with `runtime`, `image`, `env`, `egress` and `credentials`. Only a per-step `sandbox` is `unknown key`. |
| Check Steps:27,59; Shell Step Execution:22,25,26,64; Runner Pipeline:98; Execution Runtime:94 | A check is spawned directly on the host, not through `ExecHost`; it gets the host env without `_KEY`/`_TOKEN` names; its process-group pid is logged | Under a sandbox a check goes through `ExecHost` (`flow-exec.ts:124-127`). In Docker it runs offline in a hardened container (`docker.ts:18-30`), its pid is not logged (`flow-exec.ts:131`) and it gets `sandbox.env` (defect 1). |
| Agent Launch Contract:68; Runner Pipeline:33,37 | `exec` is left unset; there are no sandbox transforms | `spec.exec` is set for sandboxed AI steps (`flow-exec.ts:298,307`). Under Docker the broker is TCP `host.docker.internal:<port>` plus `FLOWBOARD_ASK_TOKEN` (`flow-exec.ts:300`). |
| Execution Runtime:27,92 | No container and no egress proxy; only the `host` tier, with the old `spawn` signature | Two container-tier hosts exist: `docker.ts` and `opensandbox/relay-host.ts`. `ExecHost` gained `ports`, `tmpDir`, `mapPath`, `exists`, `endpoint` and `tunnel` (`core/src/ports/exec-host.ts:40-62`). There is still no egress proxy for Docker. |
| Run Guardrails At Launch:88,105 | No sandbox backstop; runs are host children with the owner's credentials | Docker always applies `--pids-limit 512`, `--read-only`, `--cap-drop ALL`, `no-new-privileges` and uid 1000. OpenSandbox gives the box fake keys, the server's vault injects the real ones (`opensandbox/box.ts:230,238`), and egress is denied by default. |
| Life Of One Step:35-38; Execution Overview:26 | The agent and the check run on the host; isolation is *later* | See above. |
| Infra Retries:77; Execution Open Questions #41 | *"There is no container to fail to start"* | There is now one (defect 3). #41 needs reopening. |
| Execution Data Model:86 | *"There is no `sandbox`: every run is on the host"* | The tier is pinned in `flow.json` `config.sandbox` and shown on the page (`flow-logs.ts:200-204`). |
| Run Outcomes:71; Execution Storage | The verdict is `<NNN>-<step>.outcome.json` in the run folder; the broker socket is `ask.sock` in `/tmp/fb-*` | Under OpenSandbox the verdict is `<artifacts>/.outcomes/<NNN>-<step>.json` (`flow-exec.ts:259`). The broker is TCP plus a token under Docker, and a tunnel under OpenSandbox. |
| Version Pinning:45 | What `flow.json` pins | It also pins `config.sandbox`, `artifactsDir` and `maxRuns` (`flow-run.ts:191`). It is not immutable: OpenSandbox's Allow host rewrites it during the run (`flow-run.ts:644-647`). |

### The page, `--page` and the routes (Execution)

| Note | Claim | Code |
|---|---|---|
| Execution Controls:10; Execution Surfaces:8,18,19,42,52 | The terminal is the only screen; there is no execution screen; the viewer is at `/runs/[id]` and the designer at `/p/[slug]/flow`; there is no empty state | `/runs` and `/runs?run=<folder>` (`app/runs/runs.tsx:26,30`), `/flows`, and `/` redirects to `/flows`. Empty state: *"No runs yet. Start one with + New run."* There is also a banner when the stream is lost. |
| Execution Controls:52 | *"The two retry buttons are mockup-only"* | Allow host & retry is built for OpenSandbox runs, at a *run failed* or escalation gate (`flow-run.ts:632-680`, `run-view.tsx:212`). At *run failed* it reruns the **same** attempt. The page's decisions are Approve (`a`), Send back (`r`), Retry and Fail, with a note field and no `esc`. |
| Stopping And Cancelling:67; Execution State Machines:41; Loop Guard And Escalation:60; Infra Retries:10; Open Questions #29, #49 | With no terminal a gate pauses with exit 3 | Under `--page` the host stays alive while a page question is open and goes on once it is answered (`flow-run.ts:864`, test `flow-run.test.ts:258`). Exit 3 now happens only without `--page`. |
| Execution Glossary:53; Stopping And Cancelling:30; Execution API And Routes:79 | A person can only press Ctrl+C; Stop signals a pid | The page's Stop writes `<run>/stop`. The host checks for it every 400 ms and stops as on a first Ctrl+C (`flow-logs.ts:261-266`, `page.ts:75-84`). Stopping a single run is still not built. |
| Execution Glossary:38 | The broker runs inside `run-agent` and asks in the terminal | run-flow starts one per agent run. Under `--page` its questions also go to the page, and the first answer wins (`page.ts:57-72`). |
| Execution Overview (principle *"Routes never spawn"*); Execution API And Routes:77 | Routes call `packages/core` and never spawn processes | `POST /api/runs` and `/api/runs/:run/resume` start a detached `run-flow` (`cli/src/flow-start.ts:37`, `resume/route.ts:26`), and the routes call `packages/cli`. Nothing records this as a decision. |
| Starting A Task:37 | *"there is one move"* | + New run starts a flow too: it writes `runs/.started/<id>.task.md`, spawns `run-flow --page` and waits up to 20 s for `-- run folder` (`flow-start.ts:24-48`). The start steps also leave out opening the OpenSandbox box and writing `sandbox.json` and `host.json`. |
| Execution Roadmap:22,28,39 | No API sits in front of the engine; Allow host waits for the egress allowlist; sandboxing is optional and unbuilt | All three are built, Allow host for OpenSandbox only. |
| Execution Testing:33,69 | The real adapters meet a flow only in the live test; events do not reach `/runs/[id]` | There are Docker-gated tests (`cli/test/flow-exec.test.ts`, `adapters/test/docker.test.ts`), OpenSandbox tests against a fake box (`flow-run.test.ts:845-936`, not gated) and a live one (`flow-opensandbox-live.test.ts`), and events reach the page through SSE. |
| Prompt Assembly:33 | Part 6's `set_outcome` comes only with an `on_pass` or `on_fail` route | An approval gate adds it too (`flow-config.ts:220-221`). |

### The designer (Flow Design)

| Note | Claim | Code |
|---|---|---|
| Flow Design Screen:108 | The designer neither creates nor edits prompt files | The pencil on Prompt opens `PromptFileEditor`, which reads, creates and writes the file through `GET`/`PUT /api/prompts` (`inspector.tsx:328`, `prompt-editor.tsx:62-85`, `flow-files.ts:185-223`). |
| Flow Definition Internals:22,50,80 | The step rules stay in the loader until a second reader exists; only run-flow calls validation; `FlowConfig`'s fields | The designer is that second reader (`flow-files.ts:44-49`). `FlowConfig` also has `sandbox`, `yamlPath`, `AiStep.verdict` and `timeoutMinutes`. |
| Flows And Flow Versions:45; Glossary *Flow version* | No hash is recorded until the library or the Monitor reads it | The library hashes each file (a 12-character sha1, `flow-files.ts:18,32`), but uses it only to refuse a save over a changed file. The hash is not recorded in `flow.json`. |
| Canvas Layout And Board Order:22 | A dragged step stays put until the page closes | Positions are cleared each time a flow is opened (`app/flows/editor.ts:36`). |
| Editing And Saving A Flow:69 | The offer to load from disk comes after a 409 | It comes earlier: when the window regains focus and the file has changed, a notice appears and Save is disabled (`designer.tsx:100-111,190-199`). A `PUT` on a deleted file also gets 409. |
| Flow Design Screen:82; Flow Library:73 | Empty state *"…Try another domain, or clear the search."* | The built text is *"No flow matches that. Clear the search."*. There is also *"No flows in <dir> yet…"* (`library.tsx:62`). |
| Flow Design Controls:48; Flow Design Screen:103 | Route labels cycle `always → on_pass → on_fail` | The labels read `passed`, `failed` and `failed ↺` (`canvas.tsx:83,93`). This is wording only. |
| Flow Library:59 | The derived shape glyph is a *proposal* | It is built: more than one forward `always` route is a fan; a step with both `on_pass` and `on_fail` forward routes is a branch (`draft.ts:316-329`). |

## Built but not documented

Each item names the note that should carry it.

- **The `sandbox:` rules and messages** (Flow Validation, Step Definitions, Step Guardrails):
  - `image` is required, and `runtime` defaults to `docker`.
  - `env` is only for `docker`; `egress` and `credentials` are only for `opensandbox`.
  - IP addresses are refused.
  - `credentials` must be `CLAUDE_CODE_OAUTH_TOKEN` or `OPENROUTER_API_KEY`.
  - Two warnings, which also print under `--check`: Docker AI steps have open network and `sandbox.env`; OpenSandbox edits come back as `changes.patch` (`flow-config.ts:70-78,233-250`).
  - Egress and credentials default from the steps' adapters (`flow-config.ts:65,239-243`).
- **The OpenSandbox lifecycle** (Check Steps, Shell Step Execution, Runner Pipeline, Stopping And Cancelling, Task Completion):
  - One box per run holds the folder at its last commit.
  - Artifacts are pushed into the box and pulled back.
  - A done or failed run writes `changes.patch` for you to `git apply`, and the box is killed.
  - A paused run keeps its box for up to 24 h for `--resume`, which refuses when the box has gone (`flow-run.ts:200-211,503-517,544,892-903`).
- **Docker networking** is all-or-nothing (Step Guardrails): agents are online with `['*']`, checks are offline, and an allowlist is refused because no proxy exists (`docker.ts:13-19`).
- **New run-folder files** (Execution Storage, Execution Data Model):
  - `host.json` `{pid, page}`;
  - `asks/<id>.json` and `answers/<id>.json`;
  - `stop`;
  - `sandbox.json` (mode 0600);
  - `changes.patch`;
  - `resume.log`;
  - `runs/.started/<id>.task.md` and `.log`;
  - the `FLOWBOARD_RUNS_DIR` and `FLOWBOARD_FLOWS_DIR` defaults.
- **The derived run status** `starting | running | waiting | paused | done | failed` (Execution State Machines, Execution Surfaces). The page derives it from `state.json` and whether the host is alive (`flow-logs.ts:13-17,87-93`). A Ctrl+C stop, a budget pause and a crash all show as `paused`.
- **The built routes** (Execution API And Routes, Flow Design API And Routes). All of them refuse a non-localhost Host (`app/api/flows/local.ts:17-21`).
  - Runs: `GET`/`POST /api/runs`, where `POST` answers 422 with run-flow's refusal; `GET /api/runs/[run]`, `/logs`, `/artifact?type=`, `/built` and `/events`, where `/events` is SSE over `fs.watch` with a 15 s heartbeat; `POST /answer`, `/stop` and `/resume`.
  - Prompt files: `GET`/`PUT /api/prompts`.
  - Missing status codes for `/api/flows`: 201, 400 and 404.
- **The page's guards** (Execution Controls):
  - Answers need a `--page` host that is alive.
  - Answers are checked against the question's options.
  - A run without `--page` shows a *"terminal only"* banner.
  - Resume is offered only for a paused run.
  - Resume with more budget is available.
- **Run viewer features** (Execution Surfaces): the steps bar, the artifacts, spend and failures panes, plan vs built, time waiting at gates, and a cost estimate from tokens before Claude's result arrives (`log-lines.ts:121-135`).
- **The designer UI** (Flow Design Screen, Flow Design Controls, Flow Library):
  - The topbar is **+ Step · Save · Run**. Run goes to `/runs?new=<flow>` and is disabled while the flow is unsaved or invalid.
  - The New run sheet has Flow, Folder (remembered), Task, a Budget override and an allow-dirty option. Invalid flows are disabled in it.
  - The step panel is one-line groups (Agent, Limits, Prompt, Files, Control, and Command for shell steps), one open at a time.
  - Problem chips on steps and on the flow.
  - Flow budget is required.
  - `?flow=` in the address.
  - A notice when a file cannot be drawn.
  - A route from a step to itself is drawn as an arc, and a duplicate route is refused.
  - The library shows `open now`, a **New flow** button, and skips files with bad names.
- **Others:**
  - `--max-runs <n>` (Branching Joining And Loops cites only `VIBE_MAX_RUNS`).
  - The default `timeout_minutes` is 30 for shell steps and none for agents (Step Definitions).
  - Shell-step key errors and `unknown key` (Flow Validation).
  - The designer refuses to save a file with check errors (Flow Validation).
  - The new test files and `pnpm test:app` (Execution Testing). `test:live` leaves out `flow-opensandbox-live.test.ts`.

## Designed, not built, and not flagged as such

- **Draft mode**: Models And Effort, Draft Mode And Spec Transforms and Flow Storage:42 all present it as current. No code implements it; `draftFlow` is an unsaved edit, not draft mode.
- **Artifact Contract table**: the artifact scanner, the park/resume prompt repeat and questions as `produces: questions` are not built.
- **Flow Validation**: the *Hooks missing* and *Unattended and unsandboxed* rows are not built.
- **Adopting And Adapting A Flow**: preview, Use this flow, Back to yours and the version walkthrough. The note has no as-built line.
- **Flow Library**: same-name grouping, variant cards, `★ org default`, domain chips and `@author` search. The callout says only *"not in the PRD"*.
- **Execution Surfaces**: the board, Monitor, task detail and inbox rows read as current.
- **Execution Testing**: no Docker egress-allowlist test (the code refuses an allowlist outright), and no test that `bypassPermissions` behaves the same on every tier.

## Open questions the code now answers

| Question | Answer | Code |
|---|---|---|
| Execution #1 | Runs start explicitly: + New run or the CLI. | `flow-start.ts` |
| Execution #11 | At a gate the page shows `waiting` with a gate banner. | `flow-logs.ts:93`, `run-view.tsx:81-92` |
| Execution #24, Flow Design #14 | Allow host & retry exists for OpenSandbox only. It edits the run's pinned `flow.json` egress and the live box, never the recipe, so it makes no version. At *run failed* it reruns the same attempt. | `flow-run.ts:632-680`, test `flow-run.test.ts:910` |
| Execution #40, #61 | Docker gives each step run (shell or AI) its own container; OpenSandbox gives the whole flow one box. | `flow-run.ts:200-211,547-557` |
| Execution #41 | Reopen: a container that fails to start becomes a `fail` (defect 3). | `flow-exec.ts:91-96` |
| Execution #47 | The built routes are keyed by run folder; Fail and Allow host are answer values, not endpoints. | `app/api/runs/**` |
| Execution #53, Flow Design #13 | No tier relaxes the `bypassPermissions` or `auto` refusal. The levels are host, `docker` and `opensandbox`. | `config.ts:196-203` |
| Execution #56 | The host that holds the run's handles finalises a stopped run; the route only drops a `stop` file. | `flow-logs.ts:261-266` |
| Execution #62 | The page estimates a running Claude cost from tokens; `state.json` records cost only at the end. | `log-lines.ts:121-135` |
| Execution #68 | Its answer is now partly stale: Docker caps pids at 512. Memory and CPU are still unset. | `docker.ts:25` |
| Flow Design #8 | The designer cannot save a recipe with errors. A hand-edited invalid file opens with an amber strip, cannot be started from the UI, and run-flow refuses it with exit 2. | `flow-files.ts:110`, `designer.tsx:182`, `new-run.tsx:62` |
| Flow Design #10 | The shell kind is in the designer, as the Runs select. Skill is free text, and there is no manual kind. | `inspector.tsx:252-260` |
| Flow Design #3, #2, #4 (partly) | The description is the file's first-line comment, the shape is derived from the routes, and identity is a content hash. None of these is stored per run. | `flow-files.ts:32,68`, `draft.ts:316` |
| Flow Design #36 | Moot: nothing is adopted. The chip reads `saved` or `edited — not saved`. | `designer.tsx:167` |

## Not checked

- Containers, because the Docker daemon was down.
- A live `set_outcome` under Docker (defect 2) and exit 125 (defect 3).
- The six role starter flows, which were not run through `--check` again.
- Whether Enter selects a focused step on the canvas.

## Related

- [[Flow Orchestration Conformance Audit]]
- [[Run Flow Reference]]
- [[OpenSandbox Runtime]]
- [[Flow Design Open Questions]]
- [[Execution Open Questions]]
