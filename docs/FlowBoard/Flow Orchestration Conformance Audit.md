---
tags: [flowboard, audit, execution, flow-design, agent-providers]
date: 2026-10-21
---

# Flow Orchestration Conformance Audit

This audit checks what the docs say about running flows against what `feature/flow-orchestration` actually does at commit `44dd03d`. The docs come in two kinds:
- the design docs: every note in [[Execution Index|Execution]] and [[Flow Design Index|Flow Design]];
- the docs written with the implementation: [[Run Flow Reference]], [[Testing The Run Flow CLI]], [[Run Flow Deferred Issues]], [[Run Flow Review Loop]] and [[Run Flow Monitor Readiness]], plus the [[Multi-Agent Orchestration Analysis]].

Every finding, with its evidence, is in [[Flow Orchestration Conformance Findings]]. The five Run Flow notes live on `feature/flow-orchestration`, so their links resolve once it merges.

## Short version

**444 findings across 71 notes**: 19 bugs, 18 undecided divergences, 5 missing in scope, 34 partial, 38 doc inaccuracies and 19 undocumented behaviours; 108 decided divergences (stale design notes); 137 matches and 66 out of scope.

- **For ordinary flows, the engine does what the design says.** Routes, joins, approval gates, rework, stuck detection and escalation follow the design: rework spends the target's shared attempt budget, a repeated check failure counts as stuck, and a spent loop escalates instead of failing. A missing outcome never passes. The seeded *Software delivery* flow runs beat for beat as [[Seeded Flow Execution]] describes. All six role flows pass `--check`; DevOps and QA need one small edit first.
- **Most differences from the design notes were decided on purpose.** 108 findings are code that differs from a design note because of a recorded decision: the plan's decisions table, its Left out list, or Alex's design-review calls. In those cases the note is out of date, not the code. [[Execution Open Questions]] still lists as open 38 questions that the branch has answered.
- **The real defects fall into six groups.** Each item below gives its issue numbers under *Fix first*:
  - an engine that routes differently depending on the order edges are written in, and can pick the wrong entry step (issues 1 and 2);
  - shell output that survives only through `produces` (issue 3);
  - stopped agent runs recorded at $0 (issue 4);
  - host gaps around resume, the folder lock and the run folder (issues 5 and 6);
  - holes in the guards (issue 7);
  - notes typed at a gate dropped without warning (issue 8).
- **The run-flow docs are mostly accurate.** Every error, warning, gate text and exit code the checkers tried matched the code, including runs through a pseudo-terminal, Ctrl+C, `--resume`, the lock and timeouts. 38 statements are wrong, mostly about:
  - what `max_attempts` counts;
  - what Retry does at a stuck check;
  - where a note lands in the prompt;
  - where a check's output goes.

  The plan's own text is wrong in three places: the entry rule, the claim that adapters expose no pids, and a citation of Execution #5.

## Fix status

Updated 2026-10-23. Alex said "fix everything", and later that day answered the three questions the first round left open (see *Alex's answers, built* below). The fixes are on branch `fix/flow-orchestration-audit`, in the worktree `.claude/worktrees/flow-orchestration-audit`, cut from `feature/flow-orchestration` at `44dd03d`. Nothing is committed yet: `dev` (`228489c`, the Agent Providers fixes) is merged in and staged, and the fixes sit on top, unstaged.

- **Tests:** the free suite has 356 tests: 341 pass, 15 live tests are skipped, 0 fail. The typecheck is clean. No live test was run; the live flow test now names its entry, sets a budget, and checks that some run recorded a cost.
- **The merge:** `dev` conflicted in `cli/src/run.ts` and `ask-user/test/shim.test.ts`, as expected. `flow-exec.ts` now follows dev's async `withAsking` and its numbered question batches.
- **Notes:** 66 notes were corrected against the fixed code: six in Agent Providers (the five Run Flow notes and the index), 33 in Execution, 25 in Flow Design and two in Cost And Control. So were the plan, its review and the analysis, which keep their text as a record and carry dated corrections. In each round, agents took groups of notes, checked every behaviour they wrote against the code, and ran `--check` on every flow file the notes show. A separate reviewer read the first round's code changes.

### Code

| Issue | What changed | Code |
|---|---|---|
| 1. Edge order | `--check` refuses a step whose failure would fire a rework route and another `on_fail` route. A rework fires after the `always` routes fired with it, so its reset wins. A test reverses the edges and expects the same commands. | `core/src/flow/flow.ts`, `engine.ts` |
| 2. Entry | A flow names its first step with `entry:`. The rework fallback is gone, so a flow where every step has a route into it must name its entry. `--check` prints the step a flow starts at. | `flow.ts`, `cli/src/flow-config.ts`, `flow-run.ts` |
| 3. Shell output | The output's tail always goes to the run log's `result` line, and the last line is printed as `-- <step>: last output: …`. A stopped or timed-out check keeps its output. `--check` warns about a rework from a step that produces nothing. The Reference example's `review` produces `review_notes`. | `flow-exec.ts`, `flow.ts`, test fixture |
| 4. $0 runs | A stopped run records its running cost: OpenCode's dollars, or `cost unknown` for Claude, which has tokens but no price. A dying stream keeps the last usage, in `run-agent` too. The test provider reports tokens with no price when stopped, and a replayed agent now drives one flow test. | `flow-exec.ts`, `run.ts`, `engine.ts` |
| 5. Resume | `save()` writes `flow.json` again when a check deleted it. `--resume` refuses a folder that has gone, and the lock makes only `.flowboard/`. `flow.json` pins `maxRuns`. | `flow-run.ts` |
| 6. One host per folder | The lock is taken before the uncommitted-changes check. It is published whole (a temp file, then a link). A stale lock is moved aside and checked. An unreadable lock refuses. Exit removes only this host's lock, and a lock a check deleted is taken again. The run folder is claimed with a non-recursive `mkdir`, and `state.json`'s temp file is per process. | `flow-run.ts` |
| 7. Guards | `write_roots: []` leaves only the artifacts folder. The run folder's name keeps only safe characters, and a run folder whose path a glob would misread is refused. Every shell exit stops what the check left in its process group. `.flowboard/` goes into `.git/info/exclude`. Agent steps may not run the git commands that discard uncommitted edits (`DISCARD_COMMANDS`). | `flow-config.ts`, `flow-run.ts`, `flow-exec.ts` |
| 8. Notes | A note goes to the runs the decision starts: Approve's and Reject's to the steps their routes start, and Retry's to its run. With none typed, a Retry keeps the note the attempt started with, or at an escalation the note of the Reject that led to it. Shell steps get it as `FLOWBOARD_NOTE`. | `engine.ts`, `flow-exec.ts`, `flow-run.ts` |
| 9. Smaller | • An escalation stops the work below its target, so no second failure can reach its gate. • Step names YAML reads as numbers are refused. • A second Ctrl+C removes the runs' temp folders. • A run cut off before it launched is `not launched`, not wasted. • A timeout is logged as one. • The timeout clock stops while a question waits. • `set_outcome` is offered only where the verdict is read. • A rework hands on only what the failing run wrote. • Shell steps say a missing input. • The join warning looks further up. • The fingerprint strips UUIDs, durations, and day and month names. | `engine.ts`, `flow.ts`, `fingerprint.ts`, the host |

Also from the audit: shell exit 126 or 127, or death by a signal, opens a *run failed* gate. Each run log has a `pid` line. A run is `queued` in `state.json` until it launches. An unpriced OpenCode model is said aloud. `{{…}}` placeholders warn. An escalation past the budget says so.

Found while fixing, and fixed with tests:

- With notes carried forward, an `always` route fired by a Reject could hand the Reject's note to a later run. A rework now fires after the other routes.
- The new join warning gave false warnings: for a step the condition does not cut off, and for a repair step behind a conditional route. It now asks whether the step it waits for can run at all without the route.
- The error for two unrouted steps suggested `entry:`, which cannot fix that case.
- The host fed a run's launch to the engine only at its next transition, so `state.json` showed a running run as queued.
- An agent run stopped by a timeout logged `stopped` in its result line.
- The git discard guard missed a command followed by a quote, `;` or `)`. It also blocked `git restore --staged` and `git clean -n`.
- A lock could not be taken on a disk without hard links.
- A *run failed* gate could point at a run log that was never written.
- A few smaller gaps:
  - "1 runs";
  - approval steps were offered `set_outcome` but never asked for a verdict;
  - the unrestricted-shell warning did not show under `--check`;
  - the run log did not name the adapter.

### Decisions taken, open to your review

Claude took these under "fix everything". Each is a row in [[Run Flow Reference#Rules this command settles]], marked as Claude's call, and the notes that the question touches cite it.

| | Decision |
|---|---|
| D1 | A flow starts at the step no route points to (Alex's rule); when every step has one, it names its first step with `entry:`. |
| D2 | A rework route must be its step's only `on_fail` route, and it fires after the `always` routes. |
| D3 | A note goes to the runs the decision starts; shell steps get `FLOWBOARD_NOTE`. |
| D4 | An escalation stops and discards the work below its target. |
| D5 | A join reset by a rework keeps the routes steps outside the reset already fired. |
| D6 | Reject still fires `always` routes; use `on_pass` for a route a Reject must not take. |
| D7 | Shell exit 126 or 127, or death by a signal, is a setup failure: a *run failed* gate. |
| D8 | Agent steps may not run the git commands that discard uncommitted edits. |
| D9 | Artifact types stay an open set, with no known-types check. |
| D10 | The step rules stay in the CLI loader until the canvas or the worker reads flow files. |
| D11 | Manual steps are left out until Flow Design #39 is settled; the stand-in is `shell: "true"` with `gate: approval`. |
| D12 | Canvas-only fields stay out of the flow file until the canvas is designed. |
| D13 | `flow.json` is the record of what a run ran. Now that a flow file is a recipe, a hash of it would identify a flow version; none is recorded yet, because nothing reads one. |
| D14 | Skills and plugins are read at every launch, not pinned. |
| D15 | A run is `queued` until the host reports its launch. |
| D16 | No flow-level status is stored; paused and stopped can be read from `state.json`. |
| D17 | `state.json` keeps the engine's fields; each run log keeps the pid, session id, adapter, model, times and usage. |
| D18 | Model ids are native per adapter until a models table exists. |
| D19 | Validation ignores dependencies the artifact contract cannot see. |
| D20 | `set_outcome` is offered, and a verdict asked for, only where a route or a gate reads it. |
| D21 | The timeout clock stops while a person is being asked. |
| D22 | Following Alex's recipe call, a recipe's own paths (`prompt`, `plugins`, `skills`) resolve against the flow file's folder; `--folder` and `--task` against the folder `run-flow` starts in. `write_roots` must be paths inside the folder, relative to it. |

The fingerprint's extra stripping (UUIDs, durations, day and month names) goes beyond the plan's rule, and is marked the same way.

### Alex's answers, built

On 2026-10-23 Alex answered the three questions the first round left open. Each is a row marked *(Alex, 2026-10-23)* in [[Run Flow Reference#Rules this command settles]]; the details beyond his words are Claude's calls, open to his review.

| Alex's call | What run-flow does |
|---|---|
| "A flow is a reusable recipe" (Flow Design #1, #2, #4) | A flow file holds no `folder` or `task`: a run gives them with `--folder` and `--task`, and `flow.json` pins them for `--resume`. A flow file that still has either key is refused. `--check` checks a recipe alone, or with both flags. |
| "A flow should have a budget ceiling that can be set to 0 for no budget" (Flow Design #12) | `budget_usd` is a required top-level key, `0` for no ceiling; `--budget-usd` replaces it for a run or a resume. Each agent run may spend only what is left. When the flow has spent its ceiling, run-flow stops its runs and pauses (exit 3); `--resume` needs a larger ceiling, or `0`. |
| "The processes should also be stopped" (what a host killed with `kill -9` left running) | Each run log's `pid` line records the process's start time. The next run-flow in the folder, finding the dead host's lock, stops the process of every run that never ended, but only while its start time still matches, since its pid may be another process's by now; `--resume` does the same in its own run folder. A second Ctrl+C now kills what still runs. |

Found while building them, and fixed with tests:

- The no-limits warning, and a run's ceiling, ignored `--budget-usd`.
- A lock taken again after a check deleted it held a relative run folder.
- A gate prompt open when the budget ran out stayed open.
- The leftover-process message counted processes, but a check's whole process group is one run.

### Still open

- **Your review** of the decisions above, D1 to D22, and of the details of Alex's three calls.
- **Known ceilings, recorded in [[Run Flow Deferred Issues]]:**
  - runs launched together may each spend all that is left of the budget;
  - a run whose cost is unknown, or an OpenCode model with no price, adds nothing to what is spent;
  - an agent is stopped by its CLI's pid, and what that CLI started and left behind is not reached;
  - shell output is not streamed, so the Monitor has no live log for a check;
  - three hosts racing on one stale lock can let two in;
  - `git checkout <path>` without `--` gets past the discard guard;
  - a commit message that quotes a discard command is refused.
- **Left out by the plan, unchanged:** a default `--max-runs`.
- **Merging:** the branch adds the plan's review, the analysis and these two audit notes. They sit untracked in dev's checkout too, as does the plan, and git will not merge over untracked files. Remove those copies from dev's checkout before merging the branch.

## How this was checked

- **What was compared.** The design docs are the 65 notes in Execution and Flow Design. They were written from the PRD, mockups, backlog and feature map before any engine code existed, and they describe the whole product. The implementation is the pure engine in `packages/core/src/flow/` and the `run-flow` terminal host in `packages/cli/src/flow-*.ts`, plus `set_outcome` in `packages/ask-user`. The worker, queue, database, web app, inbox and Slack were left out on purpose, so their absence is classed *out of scope*, not as a defect.
- **How the work was split.** Eleven areas each had one checker, which read its notes and traced each rule through the code and tests:
  - A: flow model;
  - B: versions and library;
  - C: step configuration;
  - D: advancing;
  - E: loops;
  - F: runner;
  - G: host;
  - H: the reference and testing guide;
  - I: deferred issues, review loop and Monitor readiness;
  - J: Execution's open questions and roadmap;
  - K: Flow Design's open questions and roadmap, and the analysis.

  For any engine behaviour in doubt, the checker ran it: a scratch script fed events to `advance()`, or a shell-only flow ran end to end.
- **Verification.** A skeptic per area then tried to refute every finding that was not a plain *matches* or *out of scope*. It re-read the cited note and code and reran scenarios. Of the 244 findings they checked, 219 were confirmed, 25 corrected (status, severity or wording) and 0 refuted; the skeptics also added 2 they came across. I also reproduced the two high-severity engine findings, 1 and 2, myself.
- **Baseline at `44dd03d`.** 282 tests pass, 0 fail and 15 are skipped (live tests); `tsc` is clean.
- **Nothing was spent.** None of the 106 run folders the agents created pins an ai step. One checker started a flow with ai steps by mistake, without `--check`. It failed validation with exit 2 and launched nothing.
- **Status legend:**
  - *matches*;
  - *partial*;
  - *diverges (decided)*: a recorded decision covers the difference, so the note is stale;
  - *diverges (undecided)*: silent drift that someone has to decide;
  - *bug*;
  - *missing (in scope)*;
  - *out of scope*;
  - *doc inaccurate*: a run-flow doc or the plan is wrong about the code;
  - *undocumented*.

## Fix first

### 1. One failure, several routes: the result depends on edge order

*Bug, high. Findings A-01, D-08, D-09 and E-09; reproduced again for this note.*

When a failing step fires a rework route and another `on_fail` route, `complete()` handles the routes in the order the YAML lists them (`core/src/flow/engine.ts:108-112`). It applies the rework in the middle of that loop. The rework's `redo()` deletes the instances downstream of its target (`:79`). A forward route handled after it then re-creates its target as pending. `validateFlow` accepts all of these shapes. Two shapes show the problem:
- **A rework route plus a failure-only step** (`check → impl` on fail, rework; `check → notify` on fail):
  - when the rework edge comes first, `notify` survives the reset and runs after `check` passes on the next try;
  - when the `notify` edge comes first, `notify` never runs.
- **Two rework routes from one step** (`review → plan` and `review → impl`):
  - when the `plan` edge comes first, `plan` attempt 2 and `impl` start together. `impl`'s counter is back at 1 and it builds on the old plan, and it is never rerun on the new one;
  - in the other order, `impl` attempt 2 is started and stopped in the same transition.

**Fix.** Have `validateFlow` refuse a step whose `on_fail` routes include a rework route plus any other `on_fail` route. If such flows are wanted, decide one rule instead: only the outermost rework fires, and forward routes into its reset region are dropped. Either way, add an engine test that reverses the edge order and expects the same commands.

### 2. The entry fallback can start a flow at the wrong step

*Bug, high. Finding A-M01, raised by the skeptic and reproduced for this note. The plan text it contradicts is in D-28 and J-55.*

Take `draft → judge`, `judge → critique` on fail, and `critique → draft`: the reflexion loop, yamlgraph's own example.
- `isRework` counts `judge → critique` as a rework route, because `critique` reaches `judge` along `always` routes (`core/src/flow/flow.ts:26-28`).
- Every step then has a route into it, so `entries()` falls back to the step that only rework routes point to (`:36-41`). That step is `critique`.
- `--check` prints `flow ok`, and `start` launches `critique` before any draft exists.

Commit `148d7a6` added the fallback after the plan was written. The plan's own rule, "the step no edge points to", would have refused this flow.

**Fix.** Add an `entry:` key, as [[Run Flow Deferred Issues]] already proposes. Until then, have `--check` print the step a flow will start at and warn whenever the fallback chose it. Add the loop-through-a-helper case to `flow.test.ts`.

### 3. A shell step's output survives only as its first produces artifact

*Findings E-04 (undocumented, high), C-23, D-32, I-03, H-07, F-04, H-31 and I-27.*

`execShell` keeps the output tail in memory and writes it only to `produces[0]` (`cli/src/flow-exec.ts:108`). The output is never printed, and the run log holds only the start and result lines. Writing to `produces[0]` "if there is one" was the plan's choice (Task 7, K-25), but nothing documents its consequences and nothing warns about them. This has five effects:
- **A check without `produces` keeps nothing.** Its rework target runs blind and its escalation gate shows no evidence. `--check` gives no warning.
- **A stopped or timed-out check loses its output** even when it declares `produces`, because `over()` returns before writing (`:107`). The *run failed* gate cannot show where the check hung.
- **Rework passes only the failing step's `produces`.** An agent step without `produces` passes nothing either. A failing reviewer's `set_outcome` reason ("no tests for the error path") stays on its run record and never reaches the rework (K-M01). The Reference's own at-a-glance `review` step declares no `produces`, so its `review → implement` loop passes nothing.
- **Testing scenarios 6 and 14 cannot be followed.** They tell the reader to watch shell output that is never shown.
- **The Monitor has nothing to stream for a check.**

**Fix.**
- Always keep the tail: in the run log's result line, or as a default artifact passed to a rework.
- Write it before finishing a stopped run.
- Have `--check` warn about a step that has an `on_fail` route and no `produces`.
- Give the Reference example's `review` step a `produces`.

### 4. Stopped agent runs are recorded at $0

*Findings F-01 and G-01 (bugs, medium), and G-22.*

`execAi` records `result.usage.costUsd ?? 0` (`cli/src/flow-exec.ts:244`). Both adapters set usage only from their final result event and return zero usage when stopped (`adapters/src/agent/claude/provider.ts:138`, `opencode/provider.ts:227`). `streamRun` logs mid-run `usage` events but never keeps them.

So every run cut short is recorded at $0: timed out, stopped with Ctrl+C, superseded by a rework, stopped by *Fail the flow*, or ended by a dying stream. The spent and wasted totals come out low, against the design's "it still shows up in wasted spend". The test fake reports $0.10 for a stopped run, so no test notices.

**Fix.**
- Keep the last `usage` event's cost. OpenCode's carry dollars.
- Have the adapters return running usage on stop.
- Record a Claude run stopped mid-way as unknown, not $0.
- Make the scripted provider report zero on stop, so a test pins it.

### 5. Resume can fail, or continue in the wrong place

*Findings B-04, G-10, H-19, G-08 and G-05.*

- **A check that cleans the run folder makes the run unresumable.** This happens when `runs/` sits inside `folder` and a check runs `git clean -fdx`. `save()` re-creates the folder and `state.json` (`cli/src/flow-run.ts:336`), but `flow.json` was written once, at start (`:135`). The next pause prints a `--resume` hint, and `--resume` then refuses with `cannot resume: no flow.json`. The Reference's "it is made again before the next save" holds for running, not for resuming.
- **`--resume` re-creates a folder that was moved or deleted.** `takeLock` makes `<folder>/.flowboard` recursively (`:165`), so the flow resumes in a new, empty folder and reports `done`.
- **`--resume` forgets `--max-runs`.** The hint leaves it out, and `flow.json` does not record it, so a flow started with `--max-runs 1` resumes with its branches in parallel.

**Fix.**
- Rewrite `flow.json` from memory in `save()` when it is missing.
- Refuse `--resume` when the pinned folder is gone, and have `takeLock` create only `.flowboard`.
- Pin `maxRuns` in `flow.json`.

### 6. One host per folder is not guaranteed

*Findings G-02, I-16, H-20, G-03 and G-04.*

- **The stale-lock path races** (`cli/src/flow-run.ts:162-185`). The lock file is created empty and filled on the next line, an empty lock reads as stale, and a stale lock is deleted with `rmSync` before a retry. Two hosts starting together on a dead lock both ran in 3 of 12 trials.
- **A check that cleans `.flowboard/` deletes the lock.** A second host can then take the folder, and when the first host ends, its cleanup removes the second host's lock.
- **Two flows with the same file name, started in the same second from one directory, share a run folder.** The name is picked with `existsSync`, and `mkdirSync({ recursive: true })` succeeds on a folder that already exists. Both hosts also write through one fixed `state.json.tmp`. Both the checker and the skeptic reproduced it: one host crashed, and its resume hint then pointed at another flow's state.
- **The dirty-tree check runs before the lock check.** A second host is told to "commit or stash" the live flow's edits, instead of being told that another run-flow is working there.

**Fix.**
- Publish the lock atomically: write a temp file, then `link()` it, failing on `EEXIST`.
- Break a stale lock by renaming it aside and checking again.
- Remove the lock on exit only while it still holds this host's pid.
- Claim the run folder with a non-recursive `mkdir`, using a unique temp file name.
- Check the lock before the dirty tree.

### 7. Holes in the guards

*Findings C-32, C-33, C-24, F-02, G-06 and C-35.*

- **`write_roots: []` leaves the whole folder writable.** The empty list is accepted, but it replaces the default only when non-empty (`cli/src/flow-config.ts:152`).
- **Glob characters in the flow file's name break the run-folder deny.** The deny is a `matchesGlob` pattern built from the run folder's name (`cli/src/flow-run.ts:130`). Names such as `review[1].yaml` or `a{b,c}.yaml` let agents write `state.json` and forge outcome files.
- **A check's background command outlives the check when it redirects its output.** This covers `pnpm start > log 2>&1 &`. The process group is killed only by the drain timer, which `close` cancels (`cli/src/flow-exec.ts:123-133`). The Reference says such leftovers are stopped.
- **`.flowboard/` is not kept out of git.** An agent's `git add -A && git commit` commits the lock, and after the host deletes it, the next run refuses with "uncommitted changes". [[Execution Storage]] uses `.git/info/exclude` for this purpose.
- **Nothing blocks git commands that discard earlier steps' uncommitted edits.** The deny list does not cover `git checkout .`, `git restore`, `git stash` or `git clean -fd`. The design's base-branch rule is also absent: `guard.ts` says the runner adds it, but no runner does.

### 8. Notes typed at a gate are dropped without warning

*Findings H-13, C-19, E-12, J-19, I-02, E-10, E-11, E-13 and F-37.*

Every gate asks *Note for the next attempt (optional)*, but a note reaches a run only after a Retry or after a Reject into a rework. Five cases lose it:
- **Approve, or a Reject whose `on_fail` route goes forward.** Already an open decision in [[Run Flow Deferred Issues]]. The Reference still promises "A note goes into the prompt of the next run it starts".
- **A Reject whose rework escalates because the loop is spent or stuck.** The note is stored nowhere, and a later Retry runs without it (I-02, E-10).
- **Retry at a *run failed* gate.** It replaces the attempt's note with the gate's, often empty (`core/src/flow/engine.ts:166`), while `resume` keeps it (`:178`). The fix is one line: `event.note ?? inst.note`.
- **A Retry whose rerun is a shell step.** `execShell` never reads the note. Testing scenario 5 asks for a note in exactly this case.

**Fix.**
- Settle the Deferred Issues row: ask for a note only when the decision can use it, or carry it to the runs the decision starts.
- Keep a Reject note on the escalation gate.
- Apply the one-line fix at `engine.ts:166`.

### 9. Smaller defects

- **A second failure routed into a target already waiting at an escalation gate** reworks past the gate or replaces its evidence (E-21, bug).
- **Step names YAML reads as numbers** (`007:`) are renamed or rejected with the wrong message (A-39).
- **A second Ctrl+C exits without removing live runs' `/tmp/fb-*` folders**, unlike `run-agent` (G-09).
- **Runs still queued behind `--max-runs` when the flow stops** are recorded as interrupted, wasted runs with no log, and the summary counts them (G-11, H-17).
- **A timeout is logged as `stopped`** in the run log, while `state.json` says it timed out (H-22).
- **`timeout_minutes` counts time spent waiting for a person's answer** (C-27).
- **`set_outcome` is offered to every agent step.** A `fail` reported by a last step holds a finished flow at a gate (F-25).
- **A rework can read the previous round's artifact** when the failing step did not write one this round (E-05).
- **Shell steps never say that an input is missing**, unlike agent steps (A-06, F-36).
- **The join-behind-a-conditional-route warning looks only at the join's own routes.** A condition further up passes `--check`, and the join runs without its input (A-03).
- **The fingerprint misses UUIDs and named timestamps.** Repeats that contain them are never seen as stuck (E-31).

## Decide

The code differs from the design here, or the design never said, and nothing recorded decides it. Each needs a call. They are grouped by when the call starts to matter.

**Before more flows are written**
- **Is a step's failure a work failure or an infra failure when its shell exits 126 or 127, or is killed by a signal?** Today it is a work failure, so it reworks an agent step until the loop counts as stuck (J-33, Execution #41).
- **Does Reject fire only the step's `on_fail` routes?** Today Reject also fires `always` routes, so `ship` and `fix` both start (C-18).
- **When a loop escalates at a fan-out point, does the branch below keep running?** Either choice at the gate discards its work (D-15).
- **Does a join reset by a rework keep a route that a sibling outside the reset already fired?** Today it forgets it, and the flow can end `done` without the join (D-14).
- **Should a rework that escalates keep the Reject's note?** (E-10)
- **What happens when a second failure is routed into a target already at an escalation gate?** Keep the gate and add the evidence (E-21).
- **Should the git commands that discard work be on the default deny list, or recorded as a known gap?** (C-35)

**Before the canvas reads and writes flow files**
- **Where do canvas-only fields go?** The schema is strict at the root, on steps and on edges, so node positions, display names (`grill` versus "Grill me"), an `agent:` reference and sandbox fields have nowhere to go (B-18, B-15). Relative paths also resolve against the working folder, not the file's folder.
- **Do the step rules move into core?** Today they live in the CLI loader, mixed with file reads: names, kinds, "an ai step needs prompt, skill or system_prompt", "a shell step writes one artifact", and the limits warning. Core's `StepDef` has no `kind` (A-05).
- **Are artifact types an open set or the PRD's seeded list?** No known-types check exists (A-04).
- **Manual steps:** add them to the plan's Left out list, blocked on Flow Design #39. Nothing says what they do yet (A-16, J-04, J-34). The stand-in today is `shell: "true"` plus `gate: approval`.

**Before the worker or the Monitor**
- **A version identity for what a run ran.** `flow.json`'s `version: 1` is the file format, so there is no content hash or flow version (B-03).
- **Pinning skills and plugins.** They are read again at every launch, so an edited `SKILL.md` reaches a flow already under way (B-02, F-09, G-15).
- **Queued versus running.** A run waiting for a `--max-runs` slot looks like a running one in `state.json` (J-11, J-62).
- **A flow-level status.** The flow keeps only `running`, `done` and `failed`, so a flow stopped by Ctrl+C or paused at a gate is saved as `running` (D-18, G-14).
- **Run records.** They need pid, session id, start and end times, model, adapter and usage (G-07). `AgentRun.pid` exists on both adapters; run-flow never reads it.
- **Logical model ids for OpenCode.** A step moved between adapters must rewrite its model (C-14).
- **`.flowboard/` and git.** Exclude it the way [[Execution Storage]] does (G-06).

## Correct the docs

**[[Run Flow Reference]]**
- **`max_attempts` counts every run of the step, gate Retries included.** Only rework is checked against it, so Retries at a verdict gate can make the first rework escalate at once (C-07, E-26, H-15).
- **The at-a-glance `max_attempts: 2` on `review` does nothing**, because no rework route targets `review` (E-27, H-05). The same is true in the test fixture.
- **Retry at a stuck check stays within the budget.** The next failure escalates at once only after a spent loop (E-23, H-14).
- **A note reaches only a Retry run or a Reject's rework run** (H-13). The note and missing-inputs lines end the preamble, not the prompt (F-26, H-11).
- **A check's output is neither printed nor logged; `produces` is the only way to keep it** (H-07). A background command that redirects its output is not stopped (F-02).
- **A join also waits for an upstream step held at a gate** (D-12).
- **The fingerprint removes only hex ids that contain a digit** (H-09). Errors come in stages (H-03). The terminal-lines paragraph leaves out the resume, agent-summary and unrestricted-shell lines (H-23).
- **Ctrl+C *stops* the flow; *paused* means a gate with no terminal** (H-25).
- **The settled-rules table cites Execution #5 and Flow Design #25 for questions those numbers do not ask** (H-24, J-03).
- **List the whole Left out set**, or point to the plan. Seven deferred items appear in no run-flow doc (I-17).

**[[Testing The Run Flow CLI]]**
- **Scenarios 6 and 14 tell the reader to watch shell output that is never shown** (H-31).
- **The flow-only test command leaves out `shim.test.ts`**, which holds the `set_outcome` tests (H-27).
- **Plain `pnpm test:live` runs nine other live tests, not twelve**; it is twelve only with `FLOWBOARD_OPENCODE_MODEL` set (H-28).
- **Scenario 14's note ends the preamble, not the prompt** (H-32).

**[[Run Flow Deferred Issues]]**
- **Add these rows:**
  - shell output without `produces` (I-03);
  - checks orphaned by `kill -9`, which agent pids would not reach (I-05);
  - the stale-lock race (I-16);
  - a Reject note lost when the rework escalates (I-02).
- **Correct these:**
  - the guards also check Bash commands against `deny_commands` (I-07);
  - the cited review file is untracked on `dev` and on no branch (I-18).

**[[Run Flow Review Loop]]**
- **The `set_outcome` reason is also kept** in the run's outcome file and log (I-21).
- **Qualify the approval variation's note promise** (I-02).

**[[Run Flow Monitor Readiness]]**
- **Shell runs have no live log** (I-27).
- **Runs stopped by *Fail the flow* are not wasted** (I-28).
- **Answering a question is not a decide event** (I-29).
- **OpenCode already logs live dollars** (I-31).
- **Placeholder files for `--check` must not be empty** (I-25).

**The plan and its review**
- **The entry rule.** The rule now includes the rework fallback, and issue 2 shows it needs a guard (D-28, J-55).
- **The adapters do expose pids**; what is deferred is recording them (F-18, G-13, J-56).
- **Resume replays nothing.** It loads `state.json` and feeds one `resume` event (B-05).
- **Commit the review next to the plan.** It exists only untracked on `dev` (I-18).

**Design notes now out of date**
- 108 decided divergences across 40 notes. Each is listed by note, with the decision that replaced it, in [[Flow Orchestration Conformance Findings#Design notes now out of date]].
- **[[Execution Open Questions]] reads every question as open.** 38 of them are answered by the branch, and the code follows the answer. #43, #52 and #53 were settled on `dev` before this branch (J).
- **[[Execution Index]]'s headline no longer describes the built engine.** It says *"Rate limits and crashes are retried by the runner"*, but by the plan's decision the built engine opens a *run failed* gate and retries nothing.
- **[[Execution Roadmap]]** is stale in its milestone order and its Claude-only line.

## Flow Design questions, the roadmaps and the analysis

**[[Flow Design Open Questions]]**
- **The branch answers nine of the questions, and the note still treats them as open, moot or pending:**
  - #9: a provider per step, as the `adapter` key;
  - #11: `max_attempts` and the cap;
  - #19: joins behind conditional routes;
  - #20: downstream attempts reset;
  - #22: back-edges are not ancestry;
  - #23: one entry and one producer per type;
  - #24: type keys rather than file names;
  - #31: edge conditions in a top-level `edges:` list;
  - #37: optional limits with a warning.
- **Still undecided:**
  - logical or native model ids, now that flows mix providers (#15);
  - a known-types check (#25). The plan and the Reference also cite #25 for a question it does not ask;
  - dependencies the contract cannot see (#33). A check wired before the code it tests passes `--check`;
  - what a manual step does (#39).
- **What a flow file is** (#1, #2, #4). The plan deferred this ("decide later"), but it has to be settled before the canvas writes these files. A flow file carries `folder` and `task`, so it describes one run of one task rather than a reusable recipe. Its name is its file name, and nothing versions it (K-20).
- **What the canvas will need from the format:**
  - the strict schema refuses positions and library metadata (#3, #5);
  - without an `entry:` key, a flow with both a loop and a repair step is refused (K-11) or starts at the wrong step (issue 2);
  - an unwired new step is reported only as "more than one entry step", with no step attached for the strip to select (K-28, #18).
- **`{{placeholders}}` in a task or prompt file pass `--check` and reach the agent literally** (K-07). Warn until placeholders exist.

**[[Flow Design Roadmap]] and [[Execution Roadmap]]**
- **The M5 engine items are built in core, with no API in front of them.** The roadmaps still order the M3 worker first.
- **Validation is partial:** no known types. Shell checks are partial: issue 3. Reachability is partial: K-28. Draft mode, versions, the board order and the designer are not built, as planned.

**[[Multi-Agent Orchestration Analysis]]**
- **§6 was followed closely, and every §8 rule was decided and built as decided.** The analysis is wrong in four places, each recorded in the plan or the Reference:
  - `set_outcome` writes a file instead of using the broker socket (§6.5);
  - artifacts have fixed per-type paths, and nothing scans for them (§6.4);
  - the broker's queue covers one run's askers only, so the host added its own turn-taking for parallel steps (§6.4);
  - the §6.1 `name:` and `agent:` keys do not exist.
- **§10 "loop limits that fail at load time" is not met.** A `max_attempts` on a step that no rework route targets does nothing, and `--check` says nothing. The Reference's own example and the test fixture do this (K-56, E-27, H-05). There is no content hash and no overlay of a run's route.
- **§9's spend risks remain:**
  - there is no flow-wide ceiling;
  - there is no warning for an OpenCode model with no price, which never trips `budget_usd`;
  - `--max-runs` is unlimited by default;
  - a person's Retry goes past `max_attempts`;
  - stopped runs count $0 (issue 4).

## Coverage

All 71 assigned notes were reported: 60 in full, 8 in part and 3 as not applicable (two source lists and a hub). The partial ones left a section to another area or to the unchanged adapters. Testing scenarios 12 to 17 and the live test cost money, so they were checked with `--check` and by reading the code rather than run. [[Flow Orchestration Conformance Findings#Coverage]] has the full table. The out-of-scope findings give the run-flow equivalent where one exists, for example:
- `--check` as the validator that refuses a save;
- `--mermaid` as the picture;
- `flow.json` as the pinned version;
- `--max-runs` as the concurrency cap;
- Ctrl+C with `--resume` as stop and restart recovery.

## Related

- [[Flow Orchestration Conformance Findings]]
- [[Multi-Agent Orchestration Analysis]]
- [[Run Flow Reference]], [[Run Flow Deferred Issues]], [[Testing The Run Flow CLI]], [[Run Flow Review Loop]], [[Run Flow Monitor Readiness]]
- [[Execution Index]], [[Flow Design Index]]
