# Knowledge Assets Implementation Plan (projects phase 5: Serena and graphify, built and used)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project's *Knowledge assets* setting (Serena on/off, graphify on/off, rebuild on push, daily or by hand)
stops being stored-and-ignored. Lamproom builds the maps into the repo's `.lamproom/knowledge/`, after a clone, when
the base branch moves, once a day or from a **Rebuild** button, and every agent step of the project's runs can use
them: graphify's map as files, Serena as a read-only MCP server.

**Architecture:** A build is an ordinary run of the project, like the repo analyst: `startKnowledgeBuild` writes a
one-step flow of a single shell step (`knowledgeFlowText`, the command generated from the settings) into the data
folder and starts it with `startRun` (`allowDirty`). So it gets the project's isolation tier (Trusted on this machine
through `uvx`; Normal and Untrusted in a box from the sandbox image, which now carries graphify, Serena and its language
servers), shows in the runs list, takes the folder lock, and counts toward the monthly cap at $0. The record keeps only
`knowledgeBuild: { run, commit }`; the pages read the rest from the run and from git (`knowledgeView`). A scheduler
in the Next server (`instrumentation.ts`, every 10 minutes) starts the builds that are due. lr-run-flow injects Serena
into each agent step through `spec.tools` when the index exists, and tells each agent where graphify's report is.

**Tech Stack:** TypeScript on Node 24 with type stripping, `node --test`, zod 4, Next 16 (`instrumentation.ts`) +
TanStack Query + shadcn/ui + lucide-react; Docker image: uv 0.9.10, `graphifyy==0.7.5`, Serena v2.1.0
(`5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc`) with its TypeScript and Python language servers.

**Spec:** `docs/Lamproom/Projects/Project Settings.md` (the *Knowledge assets* row), `docs/Lamproom/Projects/Projects Storage.md`
(`.lamproom/knowledge/`, stamped with the build's commit), `docs/mockups/README.md` (rebuilt when the base branch
moves, daily or by hand), the controller's brief of 2026-11-15 and Alex's ruling *"extend the image too"*.

**Not in this plan:** repomix (no setting for it); graphify's paid document extraction (`graphify extract`: only the
free code map, `graphify update`, is built); fetching the remote to notice pushes (the base branch is the local one);
knowledge in OpenSandbox boxes (the box holds the last commit, and `.lamproom/` is never committed); Serena for runs in
a task worktree or a subfolder of the repo.

## Global Constraints

- All paths are under the repo root unless they start with `docs/`. Run commands from the repo root.
- Branch `feature/knowledge-assets`, cut from `feature/analysis-agent` at `098340e` in
  `.claude/worktrees/knowledge-assets`. Never merge, never push.
- **A build respects isolation.** It is a run of the project through `startRun`; a cloned repo can never make it run
  on this machine, reach the network or spend money. A Normal or Untrusted build's shell step runs offline
  (`--network none`), so everything it needs is in the image. A Trusted build runs on this machine through `uvx`,
  pinned to the same versions.
- **Nothing a repo or an agent writes decides what Lamproom does.** The record (`projects.json`) holds the build's run
  and commit; `stamp.json` in the repo is for agents to read, and Lamproom never reads it back.
- **Serena is read-only for agents:** context `ide`, modes `planning`, `no-onboarding`, `no-memories`, and the
  project's `project.yml` set to `read_only: true` by the build. Lamproom's Serena config trusts no project, so a repo's
  own `.serena/project.yml` can never run its `activation_command`.
- **One build at a time per project:** the folder lock already refuses a second lr-run-flow; the scheduler also skips a
  project whose last build is still running.
- **The shared `lamproom-cli` image is never rebuilt or retagged.** This branch builds `lamproom-cli:knowledge`
  and points runs at it with `LAMPROOM_IMAGE`.
- No new npm dependencies. Light only, zero radius, house tokens, Lucide icons, pages outside `.fd`, test locators
  scoped to `main:visible`. Spend no money: no real agent runs; shell-only builds are free and may run for real.
- Copy, exact:
  - clone log: `-- knowledge build started: run <run>`; `-- knowledge build not started: <lr-run-flow's first line>`;
    `-- knowledge built at <short commit>`; `-- knowledge build <failed|paused>: <reason>; the analysis starts anyway`
  - card statuses: `off`, `never built`, `building…`, `built at <short> · <when>`, `stale: <base> is at <short> now`,
    `build failed: <reason>`; button **Rebuild** (**Build** when never built)
  - the agent's line: `Lamproom's map of this repo's code (graphify, built at <short>; it may be older than the code): <path>/GRAPH_REPORT.md, with graph.json beside it.`
  - graphify on the settings page: `local, no AI calls, free` · `graphify-out/, readable by every step`

## Review Focus

1. **A hostile repo gets code run on this machine.** Only a Trusted project's build runs here. In a box, Serena's
   language servers may execute repo code (a `tsconfig` plugin, a build script): that is why the build is boxed. Test:
   the Normal build's flow has no `sandbox:` of its own and so gets the project's docker box (Task 2).
2. **A repo ships `.serena/project.yml`.** Serena prefers its configured folder when it exists; the build makes
   `.lamproom/knowledge/serena/` first, so the repo's file is never read. Test: the command makes the folder before it
   indexes (Task 2).
3. **The scheduler loops.** A build that fails at commit X is not started again until the base moves (push) or 24 h
   pass (daily); a repo whose checked-out branch is not the base is never built by the push rule. Tests in Task 4.
4. **The scheduler starts twice in dev** (HMR, a second `register`). A `globalThis` guard. Test in Task 4.
5. **A clone whose build never ends** holds the wizard on *setting up*: the shell step's 20-minute timeout ends it.

---

### Task 1: The sandbox image carries graphify and Serena

**Files:**
- Modify: `docker/Dockerfile`, `docker/README.md`, `packages/cli/src/isolation.ts` (`boxImage`)
- Create: `docker/lr-serena.sh`, `internal/knowledge/serena_config.yml`
- Test: `packages/cli/test/isolation.test.ts`

**Interfaces:**
- Produces: `boxImage(): string`: `LAMPROOM_IMAGE`, else `lamproom-cli`; `isolationFor`'s default box uses it.
- The image: `/usr/local/bin/{uv,uvx,graphify,serena,lr-serena}`, `SERENA_HOME=/opt/serena` holding
  `serena_config.yml` and `language_servers/` (TypeScript, Python). `lr-serena` copies the config to `/tmp/serena`
  (a box's root is read-only) and links the language servers.

- [ ] **Step 1: Failing test:** with `LAMPROOM_IMAGE=lamproom-cli:knowledge`, `isolationFor('normal', undefined, [], false)`
  gives `image: 'lamproom-cli:knowledge'`; without it, `lamproom-cli`.
- [ ] **Step 2: Run it to fail.** `node --test packages/cli/test/isolation.test.ts`
- [ ] **Step 3: Implement**, then build: `docker build -f docker/Dockerfile -t lamproom-cli:knowledge .`
- [ ] **Step 4: Verify the image by hand, offline, as a box runs it** (`--network none --read-only --tmpfs /tmp
  --user 1000:1000 -e HOME=/tmp`, a scratch TS + Python repo mounted): `graphify update` writes the map,
  `lr-serena project index` indexes both languages, and an MCP `tools/list` against `lr-serena start-mcp-server
  --project … --context ide --mode planning --mode no-onboarding --mode no-memories` lists no editing, shell or memory
  writing tool.
- [ ] **Step 5: Commit** `feat(sandbox): the box image carries graphify, Serena and its language servers`

### Task 2: A knowledge build is a run of the project

**Files:**
- Create: `packages/cli/src/knowledge.ts` (no Node imports: the pages use it), `packages/cli/src/knowledge-run.ts`,
  `app/api/projects/[id]/knowledge/route.ts`, `packages/cli/test/knowledge.test.ts`
- Modify: `packages/cli/src/projects.ts` (`Project.knowledgeBuild?`, `setKnowledgeBuild`, `viewProjects` gains
  `knowledgeOf`, `ProjectView.knowledge`), `app/api/projects/route.ts`

**Interfaces:**
- `knowledge.ts`:
  - `SERENA_FROM`, `GRAPHIFY_FROM`, `KNOWLEDGE_DIR = '.lamproom/knowledge'`, `SERENA_ARGS` (the MCP server's args).
  - `buildCommand(kn: { graphify: boolean; serena: boolean }, commit: string | null, host?: { serenaHome: string }): string`:
    one `sh` script; `host` absent means a box (`graphify`, `lr-serena` on PATH), present means this machine (`uvx`).
    It makes `.lamproom/knowledge/serena/` before Serena runs, sets `read_only: true`, writes `stamp.json`
    `{ commit, builtAt, graphify, serena }`, and exits 1 when any asset asked for failed.
  - `knowledgeFlowText(command: string): string`: `budget_usd: 0`, one step `build: { shell, produces: [build], timeout_minutes: 20 }`.
  - `interface KnowledgeView { status: 'off' | 'never' | 'building' | 'built' | 'stale' | 'failed'; run?: string; commit?: string | null; tip?: string | null; builtAt?: string; error?: string }`
- `knowledge-run.ts`:
  - `startKnowledgeBuild(dataDir, runsDir, project, start = startRun)`: refuses `knowledge assets are off` when both
    are off; resolves HEAD (`hostGit`), writes `<dataDir>/internal/knowledge/<id>/knowledge-build.yaml` (and, for a
    Trusted project, `<dataDir>/serena/serena_config.yml`), starts it with `task: KNOWLEDGE_TASK`, `allowDirty: true`,
    saves `knowledgeBuild: { run, commit }`.
  - `knowledgeView(runsDir, project, kn): KnowledgeView`: off when both off; `never` without a record; the run's
    `starting`/`running`/`waiting` → `building`; `done` → `built`, or `stale` when the base branch's tip is another
    commit; `failed`/`paused` → `failed` with the build artifact's last line; a run that is gone → `failed`.
- `POST /api/projects/:id/knowledge` → `{ run }`, 422 `{ error }`, 404.

- [ ] **Step 1: Failing tests:** `buildCommand` for each combination (box and host; makes the serena folder before
  indexing; `read_only: true`; the stamp with the commit); the flow loads (`loadFlow`) and is one shell step with no
  `sandbox:`; `startKnowledgeBuild` with a fake `start` (the args, the record, a refusal keeping nothing, both off
  refused); `knowledgeView` from hand-written run folders (building, built, stale after a commit on the base, failed
  with the artifact's last line, gone, off, never).
- [ ] **Step 2: Run them to fail.** `node --test packages/cli/test/knowledge.test.ts`
- [ ] **Step 3: Implement**, and the route behind `refused(request)`.
- [ ] **Step 4: Run them to pass**, then `pnpm test:packages`.
- [ ] **Step 5: Commit** `feat(projects): a knowledge build is a run of the project`

### Task 3: A clone builds the maps first, then starts the analyst

**Files:**
- Modify: `packages/cli/src/clone.ts` (`Analyse` gains `say`), `packages/cli/src/knowledge-run.ts`
  (`buildThenAnalyse`), `app/api/projects/clone/route.ts`, `packages/cli/test/knowledge.test.ts`

**Interfaces:**
- `type Analyse = (project: Project, say: (line: string) => void) => Promise<{ ok: true; run: string } | { ok: false; error: string }>`
- `buildThenAnalyse(dataDir, runsDir, project, say, deps = { build: startKnowledgeBuild, analyse: startAnalysis, pollMs: 1000 })`:
  with knowledge on, starts the build and says so; waits until its run ends and the folder lock is free (at most 10 s
  after); says built or failed; then starts the analyst. A build that does not start never stops the analyst.

- [ ] **Step 1: Failing tests:** with fakes, the lines in order and the analyst started after the build's run is
  `done`; a refused build still starts the analyst; knowledge off starts only the analyst.
- [ ] **Step 2–4:** fail, implement, pass, `pnpm test:packages`.
- [ ] **Step 5: Commit** `feat(projects): a clone builds the knowledge assets, then starts the analyst`

### Task 4: The scheduler

**Files:**
- Create: `instrumentation.ts`
- Modify: `packages/cli/src/knowledge-run.ts` (`dueBuild`, `knowledgeTick`, `startScheduler`), `packages/cli/test/knowledge.test.ts`

**Interfaces:**
- `dueBuild(project, kn, view, git: { branch: string | undefined; tip: string | undefined }, now): string | undefined`:
  why a build is due, or undefined. `manual` never. Never while `building`. `daily`: never built, or the last build
  started 24 h ago or more. `push`: the base branch is checked out and its tip is not the commit of the last build
  (never built counts).
- `knowledgeTick(dataDir, runsDir, now = Date.now(), start = startKnowledgeBuild)`: one pass over the projects, each
  due build started in turn; returns `{ project, run? , error? }[]`.
- `startScheduler(dataDir, runsDir, everyMs = 600_000)`: once per process (`globalThis.__fbKnowledge`).
- `instrumentation.ts`: `register()` starts it in the Node runtime only, not under `next build`.

- [ ] **Step 1: Failing tests:** `dueBuild` for each rule; `knowledgeTick` with a fake start starts only the due ones;
  `startScheduler` twice keeps one timer.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Commit** `feat(projects): rebuild the knowledge assets when the base branch moves or once a day`

### Task 5: Runs use the maps

**Files:**
- Modify: `packages/cli/src/flow-run.ts` (`Isolated.knowledge`; per agent step: Serena tool and the graphify line),
  `packages/cli/src/knowledge.ts` (`serenaTool`), `packages/cli/test/flow-run.test.ts`

**Interfaces:**
- `serenaTool(where: 'host' | 'box', repoPath: string, serenaHome: string, path?: string): ToolServer`: on this
  machine `uvx -q --from <SERENA_FROM> serena start-mcp-server …` with `SERENA_HOME`; in a box `/usr/local/bin/lr-serena start-mcp-server …`.
- A run gets Serena when its project has `knowledge.serena` on, its folder is the repo's top folder,
  `.lamproom/knowledge/serena/project.yml` exists, and its tier is `host`, `container` or `gvisor`. It gets the
  graphify line when `graphify` is on and `GRAPH_REPORT.md` exists, under the same folder and tier rules.

- [ ] **Step 1: Failing tests (flow-run):** a Trusted project with a built index: the agent's spec has a `serena`
  tool and the line in its preamble; with knowledge off, or no index, neither.
- [ ] **Step 2–4:** fail, implement, pass, `pnpm test:packages`.
- [ ] **Step 5: Commit** `feat(lr-run-flow): agent steps get Serena and graphify's map`

### Task 6: The pages

**Files:**
- Create: `app/projects/knowledge.tsx` (`Knowledge` card)
- Modify: `app/projects/api.ts` (`startKnowledgeBuild`), `app/projects/project.tsx`, `app/projects/settings-pages.tsx`,
  `app/projects/settings-model.ts` (graphify free, no size estimate), `app/projects/settings-model.test.ts`,
  `app/projects/wizard/wizard.tsx`

- [ ] **Step 1: Failing app test:** with graphify on, no warning says it costs money; `graphifyCost` is gone.
- [ ] **Step 2: Build the card:** status lines from Global Constraints, a link to the run, **Rebuild**; polled every
  2 s while building. Copy fixes on the settings page.
- [ ] **Step 3:** `pnpm exec tsc --noEmit`, `pnpm test:app`, `pnpm test:packages`.
- [ ] **Step 4: Browser check (free):** a dev server on a spare port with scratch data/runs folders; register a scratch
  repo as Trusted, **Build**: a real shell-only build on this machine (uvx), the card goes building → built; commit on
  the base: stale; **Rebuild**. Then the same project as Normal with `LAMPROOM_IMAGE=lamproom-cli:knowledge`: the
  build runs in a box. Stop the server.
- [ ] **Step 5: Commit** `feat(projects): the knowledge card, with Rebuild; graphify's code map is free`

### Task 7: Docs

- Modify: `docs/Lamproom/Projects/Project Settings.md` (the *Knowledge assets* row), `Projects Index.md`, `docker/README.md`
- Create: `docs/Lamproom/Projects/Knowledge Assets Handoff.md`
- [ ] **Commit** `docs(projects): knowledge assets are built and used`

## Decisions open to Alex's review

1. **The push rule watches the local base branch, not GitHub.** No `git fetch`: Lamproom builds the working tree,
   which a fetch does not change, and fetching every 10 minutes would need the network and the GitHub login from the
   server. A push someone else makes shows up once you pull. Changing it: fetch, then build from a temporary worktree at
   `origin/<base>` and copy the map back.
2. **The push rule builds only while the base branch is checked out**, since the build maps the working tree. On a
   feature branch the card says *stale* and waits.
3. **A build maps the working tree as it is, uncommitted changes included**, and is stamped with HEAD.
4. **The clone waits for the build** before it starts the analyst and before the wizard says done. A large repo's Serena
   index can take minutes. Changing it: start the analyst when the build ends, in the background, and let the wizard
   finish at once.
5. **graphify's code map is free and goes nowhere** (`graphify update`, no AI calls), so its warning is gone. Its
   paid document extraction is not built; if it ever is, it needs its own setting and warning.
6. **Serena and graphify reach only runs in the repo's own folder** on this machine or in a Docker box. Task worktrees,
   subfolders and OpenSandbox boxes do without.
