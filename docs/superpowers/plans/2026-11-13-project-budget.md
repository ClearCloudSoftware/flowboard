# Project Budget Implementation Plan (projects phase 3b: the monthly cap in lr-run-flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project's Budget setting (a cap in dollars a month, an alert percentage, and *pause new runs* or *ask me
first* once it is spent) limits what all of the project's runs spend together. Today it is stored and ignored; only
a flow's own `budget_usd` stops a run.

**Architecture:** lr-run-flow already finds the run's project (`findProject`, phase 3a). It adds up what the project's
runs started this calendar month have spent, from the run folders (`listRuns`), and refuses to start or resume once
the cap is reached. A *pause* project's runs are refused outright; an *ask me first* project's run starts only when
`--over-project-budget` is passed, which the runs page sends from a **Start anyway** / **Resume anyway** button.
While a run goes, each agent call may spend at most what is left of the flow's budget *and* the project's, and the
run pauses when either is spent, the same way it pauses on the flow's budget today. The project's month spend shows on
its card and page, with a warning past the alert percentage.

**Tech Stack:** TypeScript on Node 24 with type stripping, `node --test`, zod 4, Next 16 + TanStack Query + shadcn/ui
+ lucide-react.

**Spec:** `docs/Lamproom/Projects/Project Settings.md` (the *Budget* row) and `Budget` in
`packages/cli/src/settings.ts`. Builds on phase 3a, `docs/superpowers/plans/2026-11-13-isolation-enforcement.md`
and `docs/Lamproom/Projects/Isolation Enforcement Handoff.md` on branch `feature/isolation-enforcement`.

**Not in this plan:** a Slack or chat alert at the alert percentage (escalation, phase 6), the analysis agent's cost
(phase 4; it counts here once its runs are run folders like any other), a per-project cap on concurrent runs, and
`pnpm lr-run-agent` (a single agent, not a flow).

## Global Constraints

- All paths are under the repo root unless they start with `docs/`. Run commands from the repo root.
- Branch `feature/project-budget`, cut from `feature/isolation-enforcement` in its own worktree (it needs
  `findProject`, `dataDirOf`, `isolate` and `resumeRun` from there), or from `dev` once that branch is merged.
  Do not merge into `dev`; Alex decides.
- **The month is the calendar month in local time.** A run's whole cost counts in the month it started, read from
  its run folder's name (`2026-11-12T13-32-04-…`), the rule the cards' *this week* already uses. A run folder whose
  name has no time counts in no month.
- **A run counts toward one project:** the innermost project whose repo holds its folder (the rule `findProject`
  uses), so a nested repo's runs never spend its outer project's money.
- **No cap (`capUsd: null`) changes nothing:** no lines, no checks, no reads of other runs.
- **Pause** = refuse to start or resume while the month's spend is at or over the cap. **Ask me first** = the same
  refusal, unless `--over-project-budget` is passed; then that start or resume ignores the project cap (the flow's
  own budget still applies) and says so. The flag is never pinned: every start and resume asks again.
- **Mid-run:** each agent call's `capUsd` is the smaller of what is left of the flow's budget and of the project's.
  The run pauses when the project's is spent, as it pauses on the flow's today.
- Exact copy (`<Month>` is like `November 2026`, `<Next>` like `December 2026`, dollars with two decimals):
  - refusal, pause: `project <name> has spent $<spent> of its $<cap> for <Month>; raise its monthly cap on the project page, or wait for <Next>`
  - refusal, ask: the pause text, then `; to run it anyway, add --over-project-budget`
  - start line: `-- project budget: $<spent> of $<cap> spent in <Month>`
  - alert line: `-- warning: project <name> has spent <pct>% of its $<cap> for <Month>`
  - override line: `-- project budget: over its $<cap> for <Month>; running anyway (--over-project-budget)`
  - pause at end: `-- the project's budget for <Month> is spent: $<spent> of $<cap>`
- Refusals are `printErr` lines and exit code 2, so the New run form and Resume show them as they are.
- No new dependencies. Icons from `lucide-react`. Light only, zero radius, house tokens. Pages stay outside `.fd`.

## Review Focus

1. **Two runs of one project at once** (two task workspaces): each may spend what is left. Each agent call is
   capped at what is left as it starts, and the check runs again as each call ends, so the overshoot is at most one
   agent call per running run. Test: a second run's spend, written while the first runs, pauses the first.
2. **A nested repo:** a run in a project inside another project's repo counts only toward the inner one. Test in Task 1.
3. **Resume after the cap is raised:** a run the project cap paused resumes; with the cap unchanged it is refused
   with the refusal text. Test in Task 2.
4. **The month turns:** a run started on Oct 31 counts toward October as a whole, also when resumed in November.
   Test in Task 1 (`projectSpendUsd` with a run folder dated the 31st).
5. **A run folder an agent can write:** a run folder inside `--folder` is already off limits to agents' file tools
   (`denyRun`); nothing here reads a number from a file an agent writes except `state.json`, as the flow budget does.

---

### Task 1: The month's spend

**Files:**
- Create: `packages/cli/src/budget.ts`, `packages/cli/test/budget.test.ts`
- Modify: `packages/cli/src/projects.ts` (export `startOf`; add `projectSpendUsd`), `packages/cli/src/isolation.ts`
  (extract `ownerOf`, used by `findProject`), `packages/cli/test/projects.test.ts`

**Interfaces:**
- Consumes: `RunSummary` (`flow-logs.ts`: `name`, `folder`, `spentUsd`), `Project`, `owns`, `Budget` (`settings.ts`).
- Produces:
  - `budget.ts`, no Node imports (the pages use it):
    - `monthOf(ms: number): string`: `'2026-11'`, local time; `''` for NaN.
    - `monthName(month: string): string`: `'November 2026'`. `nextMonthName(month: string): string`: `'December 2026'`.
    - `interface BudgetState { capUsd: number | null; spentUsd: number; leftUsd: number; pct: number; alert: boolean; over: boolean }`
    - `budgetState(b: Budget, spentUsd: number): BudgetState`: `leftUsd` is `Infinity` with no cap; `alert` when
      `spentUsd >= capUsd * alertAt / 100`; `over` when `spentUsd >= capUsd`; `pct` rounded down.
  - `isolation.ts`: `ownerOf(projects: Project[], realFolder: string): Project | undefined`: the innermost owner.
  - `projects.ts`: `startOf(runName: string): number` (exported as is), and
    `projectSpendUsd(runs: RunSummary[], projects: Project[], projectId: string, month: string, except?: string): number`:
    the spend of runs whose `ownerOf` (on the folder's real path; the path as recorded when it is gone) is
    `projectId` and whose `monthOf(startOf(name))` is `month`, leaving out the run named `except`.

- [ ] **Step 1: Write the failing tests**

  `budget.test.ts`: `monthOf(new Date(2026, 10, 30, 23, 59).getTime()) === '2026-11'`; `monthOf(NaN) === ''`;
  `monthName('2026-11') === 'November 2026'`; `nextMonthName('2026-12') === 'January 2027'`;
  `budgetState({ capUsd: 50, alertAt: 80, onLimit: 'pause' }, 40)` → `{ leftUsd: 10, pct: 80, alert: true, over: false }`;
  at 50 → `over: true`, `leftUsd: 0`; at 60 → `leftUsd: -10`; `capUsd: null` → `leftUsd: Infinity`, `alert: false`, `over: false`.

  `projects.test.ts`: `projectSpendUsd` over runs `2026-11-02T…` ($3, in the repo), `2026-11-20T…` ($2, in a task
  worktree under the repo's `.lamproom/worktrees/`), `2026-10-31T23-10-00-…` ($7, October), `scratch` (no time, $9),
  and one in a nested project's repo ($4) → `5` for `'2026-11'`, `7` for `'2026-10'`; with `except` the Nov 20 run → `3`;
  the nested project's own id → `4`. A run whose folder is gone still counts by its recorded path.

- [ ] **Step 2: Run them to verify they fail**

  Run: `node --test packages/cli/test/budget.test.ts packages/cli/test/projects.test.ts`
  Expected: FAIL, `budget.ts` not found and `projectSpendUsd` not exported.

- [ ] **Step 3: Implement** `budget.ts`, `ownerOf` (then `findProject` calls it), `startOf` exported, `projectSpendUsd`.

- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`.
  Expected: PASS; the suite as before (the known `flow-start` failure, if still there, unchanged).

- [ ] **Step 5: Commit** `feat(projects): a project's spend this month, from its runs`

### Task 2: lr-run-flow keeps to the cap

**Files:**
- Modify: `packages/cli/src/flow-run.ts`, `packages/cli/test/flow-run.test.ts`, `packages/cli/test/fixtures/flow.ts`
  (if a helper for a project with a budget override and dated run folders is needed)

**Interfaces:**
- Consumes: Task 1; `findProject`, `dataDirOf`, `readAppSettings`, `resolveSettings`, `listRuns`, `readProjects`.
- Produces:
  - Flag `--over-project-budget` on start and `--resume`; both usage lines name it.
  - `Drive` gains `project?: { name: string; month: string; capUsd: number; left: () => number }`, absent with no cap
    or with the flag. `left()` is `capUsd - projectSpendUsd(listRuns(runsDir), readProjects(dataDir), id, month, runName) - sumCost(state.runs)`,
    read again at each check, so another run's spend counts as it is written.
  - `function projectBudgetCheck(project: Project, dataDir: string, runsDir: string, month: string, over: boolean, self?: string):
    { refused: string } | { lines: string[]; drive?: Drive['project'] }`: the refusal or the start lines, and what
    `drive` gets.

- [ ] **Step 1: Write the failing tests** (each with a data dir holding one project whose override is
  `budget: { capUsd: 10, alertAt: 80, onLimit }` and a runs dir with dated, costed run folders):
  - `a project over its cap refuses a new run (pause)`: $10.50 spent this month → exit 2, stderr has the pause
    refusal text, no run folder made.
  - `ask me first refuses without the flag and runs with it`: without → the ask refusal; with `--over-project-budget` → runs,
    stdout has the override line, and a fake agent asked for `capUsd` gets the flow's ceiling only.
  - `the start line and the alert`: $8.50 spent → `-- project budget: $8.50 of $10.00 spent in <Month>` and the alert line with `85%`.
  - `an agent call may spend only what the project has left`: $9 spent, flow budget $5 → the first agent call's `capUsd` is `1`.
  - `the run pauses when the project's money is spent`: the fake agent costs $2 with $9 spent → status paused, stdout
    has the pause-at-end line; `--resume` → refused with the pause text; after the override's cap is raised to 20 → resumes.
  - `another run's spend counts while this one runs`: a second run folder's `state.json` gains $5 while the first run
    waits at a gate → the first pauses at its next check.
  - `no cap, no lines`: app defaults (`capUsd: null`) → no `project budget` line, and `listRuns` is not called (a runs
    dir that throws on read does not matter).

- [ ] **Step 2: Run them to verify they fail**

  Run: `node --test --test-name-pattern "project|cap|budget" packages/cli/test/flow-run.test.ts`
  Expected: FAIL, the new tests only.

- [ ] **Step 3: Implement.** Work out `runsDir` before the lock (it is only a path). After `isolate`, call
  `projectBudgetCheck` with this month; a refusal is `printErr` + exit 2, before the lock. Print its lines after the
  `-- run folder` line. In `drive`, `capUsd` becomes the smaller of the flow's and `project.left()`; `spentOut` is also
  true when `project.left() <= 0`, which sets `overProject` for the end line and the resume hint
  (`--resume <dir>` after raising the cap; `--resume <dir> --over-project-budget` for ask). On `--resume`, the month is
  `monthOf(startOf(<run folder name>))` and `self` is the run's name.
  `// ponytail: listRuns reads every run's state.json at each check; cache by mtime if run folders reach the thousands`

- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(lr-run-flow): a project's monthly cap stops its runs`

### Task 3: The pages

**Files:**
- Modify: `packages/cli/src/flow-start.ts` (`StartInput.overProjectBudget`, `resumeRun(..., over?)`, `askOver` on a
  refusal), `app/api/runs/route.ts`, `app/api/runs/[run]/resume/route.ts`, `app/runs/api.ts`, `app/runs/new-run.tsx`,
  `app/runs/run-view.tsx`, `packages/cli/src/projects.ts` (`viewProjects`), `app/projects/project.tsx`,
  `app/projects/settings-pages.tsx`, `packages/cli/test/flow-start.test.ts`, `packages/cli/test/projects.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `StartInput.overProjectBudget?: boolean` → `--over-project-budget`. `Started` refusal gains `askOver?: true` when
    lr-run-flow's words contain `--over-project-budget`; `resumeRun(runDir, dataDir, budgetUsd?, overProjectBudget?)`
    returns the same.
  - `POST /api/runs` and `POST /api/runs/:run/resume` accept `overProjectBudget?: boolean`; a 422 body is
    `{ error, askOver? }`.
  - `ProjectView.monthSpendUsd: number` (this month, `projectSpendUsd`), and a problem line when the state is alert or
    over: `spent $<spent> of its $<cap> for <Month>; new runs are paused` (pause) or `…; new runs ask first` (ask), and
    `spent <pct>% of its $<cap> for <Month>` at the alert.

- [ ] **Step 1: Write the failing tests:** `flow-start.test.ts`: a fake lr-run-flow that prints the ask refusal →
  `{ ok: false, askOver: true }`; `overProjectBudget: true` puts the flag in its arguments. `projects.test.ts`:
  `viewProjects` with $9 of a $10 cap → `monthSpendUsd: 9` and the alert problem line; with $10 and `ask` → the over line.

- [ ] **Step 2: Run them to verify they fail.** Run: `node --test packages/cli/test/flow-start.test.ts packages/cli/test/projects.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** The New run form shows **Start anyway** beside the refusal when `askOver`, sending the
  same start with `overProjectBudget: true`; the run page's Resume shows **Resume anyway** the same way. The project
  page's settings card shows the budget as `$<spent> of $<cap> this month` (`text-wait` at the alert). The budget
  page's footnote loses *"Saved now; Lamproom does not act on it yet."* and becomes: `Everything the project’s runs
  cost in a calendar month counts. Each flow’s own budget still applies inside it.`

- [ ] **Step 4: Run them to verify they pass**, then `pnpm test:packages`, `pnpm test:app`, `pnpm exec tsc --noEmit`. Expected: PASS, clean.

- [ ] **Step 5: Check it in the browser.** On the dev server, give a test project a $0.01 cap and *ask me first*;
  start a run from New run → the refusal and **Start anyway**; click it → the run starts with the override line;
  the project card shows the over line. Set the cap back.

- [ ] **Step 6: Commit** `feat(projects): the monthly cap on the runs and project pages`

### Task 4: Docs

**Files:**
- Modify: `docs/Lamproom/Projects/Project Settings.md` (the Budget row's status: built, with the month rule and
  what *ask me first* does), `docs/Lamproom/Projects/Projects Index.md` (the *Built* callout: the budget is no
  longer in the *not yet acted on* list), the Run Flow Reference (the flag and the four lines)

- [ ] **Step 1: Edit the three notes.** Each claim names the function or the line it describes.
- [ ] **Step 2: Commit** `docs(projects): the monthly cap is enforced`

## Decisions open to Alex's review

1. The month is the calendar month, local time, and a run counts in the month it started.
2. *Ask me first* is a refusal with a **Start anyway** button (`--over-project-budget`), asked again on every start
   and resume; the escalation phase may later ask in chat instead.
3. The alert shows on the run's start line and on the project's card and page; a run crossing it mid-way says
   nothing until the next start.
4. Two runs at once may together overshoot the cap by up to one agent call each.
