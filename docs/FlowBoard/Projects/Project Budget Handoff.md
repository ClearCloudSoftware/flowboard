---
tags: [flowboard, projects, budget, handoff]
module: Projects
---

# Project Budget Handoff

A project's **Budget** setting (a cap in dollars a month, an alert percentage, and *pause new runs* or *ask me first* once it is spent) now limits what all of the project's runs spend together. Before this branch it was stored and ignored: only a flow's own `budget_usd` stopped a run.

This note is the state of branch `feature/project-budget` on 2026-11-13: cut from `feature/isolation-enforcement` at `efead38`, commits `2726fc9..0f6811b`, not merged or pushed. Merging it into `dev` brings `feature/isolation-enforcement` in too. It records:

- [[#How the cap works]], in brief.
- [[#Decisions open to your review]]: the four choices that shape the feature.
- [[#Rulings made on your behalf]]: every smaller decision taken while building, with what it costs if wrong.
- [[#Open questions]]: what the review set aside for you.
- [[#Deferred findings]]: minor problems left unfixed.

The behaviour in full is in [[Run Flow Reference#Stopping and resuming]]. The plan is `docs/superpowers/plans/2026-11-13-project-budget.md`.

## How the cap works

- **The month's spend** is the cost of the project's runs that started this calendar month, read from the run folders (`projectSpendUsd` in `packages/cli/src/projects.ts`; month helpers in `budget.ts`). A run counts toward the innermost project whose repo holds its folder.
- **At start and resume**, run-flow refuses a run once the month's spend reaches the cap (`projectCap` in `packages/cli/src/flow-run.ts`). For *ask me first*, `--over-project-budget` lets it through; the runs page sends it from **Start anyway** and **Resume anyway**.
- **While a run goes**, each agent call may spend at most what is left of the flow's budget and of the project's, whichever is smaller. The cap and other runs' spend are read again at each check. When the project's money is spent, the run pauses, as it does on its own budget.
- **On the pages**, the project page's header shows `$<spent> of $<cap> this month`, amber past the alert. The card and page list a problem line past the alert and once the cap is spent. The budget page no longer says *"FlowBoard does not act on it yet"*.
- **With no cap**, nothing changes: no lines, no reads of other runs.

## Decisions open to your review

These shape what the feature does. Each was taken to keep the first version small; none is hard to change.

| # | Decision | Why | What changing it takes |
|---|---|---|---|
| 1 | The month is the calendar month in local time, and a run's whole cost counts in the month it started, read from its run folder's name | The cards' *this week* already counts a run on the day it started; one rule for both | A run resumed in a later month still spends against its start month's cap (see [[#Open questions]] #1). Counting by when money is spent needs per-call timestamps in `state.json` |
| 2 | *Ask me first* is a refusal with a **Start anyway** / **Resume anyway** button, asked again on every start and resume | There is no notifier yet; a button is the smallest way to ask | When escalation is built, the question can go to chat instead |
| 3 | The alert shows on a run's start line and on the project's card and page; a run crossing it midway says nothing until the next start | A mid-run line would need a crossing check at every agent call | A line printed once when the spend crosses `alertAt` |
| 4 | Runs going at once may together pass the cap: each agent call is capped at what is left as it starts | Reserving money per call would need a shared ledger between run-flow processes | A lock file or a reservation per call |

## Rulings made on your behalf

The decisions taken while building, in the order they were made.

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| 1 | The branch is cut from `feature/isolation-enforcement`, not `dev` | The cap needs that branch's `findProject`, `isolate` and `resumeRun` | A rebase if that branch changes |
| 2 | The plan was copied onto this branch; it stays on `feature/projects-impl` too | The branch that runs the plan needs it | A duplicate file |
| 3 | The suite runs skip one known flaky test by name: *"a run started from the page is named as soon as run-flow makes its folder"* | It fails under load before any change and passes alone | A real failure in that one test would go unseen; it passed alone at the end |
| 4 | `ownerOf` (the innermost project holding a folder) lives in `projects.ts`, not `isolation.ts`; `findProject` uses it | `isolation.ts` imports `projects.ts`, so the plan's place made an import loop | None |
| 5 | The plan's `projectBudgetCheck` is `projectCap`, and `drive` gets `others(run)` rather than `left()` | A new run's name isn't known when the cap is checked, and its own `state.json` was counted twice | Names only |
| 6 | `--over-project-budget` lifts only an *ask me first* cap, and only once it is reached; for *pause new runs* it changes nothing | *Pause* means refuse outright; below the cap the cap still applies, and the next resume asks again | One condition |
| 7 | The plan's test that "no cap means other runs are not read" was dropped | Not observable without a spy; the code returns before it defines the reader | An extra read per start if that regresses |
| 8 | A resumed run whose folder name has no time counts in the current month | Otherwise it would match every unnamed run folder | A hand-named run's resume checks this month |
| 9 | The month's spend is in the project page's header, beside *in the last 7 days*, not in the settings card | The header already holds the page's spend figure | Moving one element |
| 10 | The page offers *anyway* when run-flow's refusal contains `--over-project-budget` | run-flow's words are what reaches the page; a test pins the text | A reworded refusal would hide the button |
| 11 | The Run Flow Reference's command line also gained `--workspace <task id>` | run-flow's usage already printed it | None |
| 12 | After review: the cap is read again at each check, so raising, lowering or removing it on the project page applies to a run already going | Raising the cap after the alert otherwise still paused the run at the old one | None |
| 13 | After review: a run resumed after its month is over is told *"…for October 2026, the month this run started; raise its monthly cap on the project page"*, without *"or wait for November"* | Waiting never helps such a run | A wording change |
| 14 | After review: when `runs/` sits inside the project's folder, agents may not write any of it, other runs' folders included, not only their own run's | Other runs' `state.json` is what the cap adds up; an agent could zero it and spend more | An agent can't write under `runs/` in that layout |

## Open questions

The final review set these aside as yours to decide.

1. **Which month does a resumed run spend against?** Today, its start month (decision 1). A run that paused on Oct 31 and resumes in November is refused against October's cap until that cap is raised. The alternative is to check a resume against the current month, counting the run's earlier spend in October and its new spend in November.
2. **Should *Start anyway* lift the cap for the rest of that run?** Today it does: after *anyway*, only the flow's own budget limits that run until it next pauses. The alternative is to let it through and then pause again at the next agent call.
3. **Should runs outside the app's `runs/` folder count?** A run started from the command line in another folder, without `FLOWBOARD_RUNS_DIR`, writes its run folder elsewhere, and the cap never sees it. The runs folder layout predates this branch.
4. **Should the analysis agent's cost count?** The budget page used to say so. It will, once the analysis agent (phase 4) writes run folders like any flow; nothing is built for it yet.

## Deferred findings

Minor problems the review found and that were left unfixed.

- **The overshoot bound in the docs is too small.** Parallel steps inside one run each get all that is left, so the cap can be passed by one agent call per call running at once, not one per run.
- **Every check reads every run folder.** `listRuns` also checks each run's status (a second `state.json` read, `host.json`, a process probe), plus a `realpath` per run, on every pass of `drive`'s loop. Fine at hundreds of runs; a lighter reader, or a cache by modification time, past that.
- **Both budgets spent at once.** The end line then names only the flow's budget and suggests `--budget-usd`, and the resume is refused by the project's cap.
- **The *anyway* check is a text match.** run-flow's usage error now contains the flag too; the page can't trigger one today. A separate exit code would be sturdier.
- **The Projects Index overstates the card.** It says the card shows the month's spend; the card shows the week's, plus the problem line past the alert.
- **Week and month figures count nested repos differently.** The week's spend and the run counts use `owns`, so an outer project includes a nested project's runs; the month's spend uses `ownerOf`, so it doesn't.

## Related

- [[Project Settings]]: the Budget row, now built
- [[Run Flow Reference]]: the flag, the lines and the refusals
- [[Isolation Enforcement Handoff]]: the branch this one is cut from
- [[Projects Index]]
