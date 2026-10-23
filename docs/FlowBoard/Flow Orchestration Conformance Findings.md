---
tags: [flowboard, audit, execution, flow-design, agent-providers]
date: 2026-10-21
---

# Flow Orchestration Conformance Findings

Every finding behind [[Flow Orchestration Conformance Audit]], after verification: the design notes in Execution and Flow Design, the run-flow notes and the analysis, checked against `feature/flow-orchestration` at `44dd03d`. They describe the code as it was then; what the fixes of 2026-10-23 changed is in [[Flow Orchestration Conformance Audit#Fix status]]. Code paths are relative to `code/flowboard/packages/`. Each entry gives the doc's claim, what the code does, any decision on record, what to do and, for bugs and undecided divergences, the evidence a skeptic found. A finding's id names its area: A flow model, B versions and library, C step configuration, D advancing, E loops, F runner, G host, H reference and testing guide, I deferred issues, review loop and Monitor readiness, J Execution's open questions, K Flow Design's open questions and the analysis. An id with M (A-M01) was added by a skeptic.

**444 findings across 71 notes**: 19 bugs, 18 undecided divergences, 5 missing in scope, 34 partial, 38 doc inaccuracies and 19 undocumented behaviours; 108 decided divergences (stale design notes); 137 matches and 66 out of scope. Of the 244 findings they checked, 219 were confirmed, 25 corrected (status, severity or wording) and 0 refuted; the skeptics also added 2 they came across.

## Bugs

**A-01 · A failure that fires a rework route and another on_fail route** · bug · high · confirmed by the skeptic
- **Doc** (Connections And Routes — How the engine resolves edges; Branching Joining And Loops — Designing a rework loop): "`on_pass` / `on_fail` edges fire based on `step_instances.outcome`" (PRD §8). A rework re-runs the target and resets what follows it: "downstream `done` → `skipped` so they re-instantiate".
- **Code** (`core/src/flow/engine.ts:108`): validateFlow accepts a step with a rework on_fail route plus another on_fail route, and complete() fires them in the order they are written in the YAML, with results that change with that order. With review→plan written before review→impl (both rework), a failed review starts plan attempt 2 and impl attempt 1 at the same time, so impl rebuilds on the old plan and is never redone; written the other way round, impl attempt 2 is launched and stopped in the same batch. With check→impl (rework) written before check→notify (forward on_fail), notify stays pending and runs after check passes on the retry; written the other way round, notify never runs.
- **On record:** None for several on_fail routes from one step; Execution #9 defines a rework route and #17 says what a rework resets
- **Do:** Make validateFlow refuse a step whose on_fail routes include a rework route plus any other route, or define one rule (only the outermost rework fires; no forward route into its reset region). Add an engine test that writing the edges in reverse order changes no command.
- **Evidence:** Ran advance() from /private/tmp/claude-501/-Users-alex-projects-personal-flowboard-flowboard-v3/c93fab94-c162-4647-bdd6-cd738eae775e/scratchpad/audit/verify-A/a01.ts. validateFlow returns [] for all four edge orders. (1) review→plan written before review→impl, both rework: 'end review:fail -> run:plan:2(in=review) run:impl:1(in=plan+review)'. Whichever of impl or plan ends first, the next command is 'run:review:1', so impl is never rerun on the new plan. (2) Reverse order: 'end review:fail -> run:impl:2(#4) stop:4 run:plan:2(#5)', then 'end plan -> run:impl:1'. The host never actually starts…

**A-M01 · Entry step when a loop goes back to the first step through another step** · bug · high · found by the skeptic, not separately verified
- **Doc** (Run Flow Reference — Edges, loops and joins (The entry); Flow Design Glossary — Entry step): "The entry is the step no edge points to. When every step has an edge into it, the entry is the step that only rework edges point to, so a flow may loop back to its first step. A flow has exactly one entry."
- **Code** (`core/src/flow/flow.ts:36`): Take draft→judge, judge→critique (on_fail), critique→draft. isRework counts judge→critique as rework, because critique reaches judge along always routes. Every step then has a route in, and critique is the only step with no forward route in, so entries() returns [critique]. validateFlow reports nothing, --check prints '-- flow ok: 3 steps' with no warning, and advance(start) emits run:critique:1 before draft runs (scratch critic.ts and y/critic.yaml). build→check, check→report (on_fail), report→build behaves the same way: the entry is report.
- **On record:** (Alex) routes row: 'the entry is the step no edge points to'. This flow has no such step, so the plan's rule would have refused it. The rework fallback came later, in 148d7a6. Run Flow Deferred Issues covers only the two-entries case.
- **Do:** Add an `entry:` key, as Run Flow Deferred Issues already proposes. Short of that, have --check name the step the flow will start at whenever the fallback chooses it, and warn about it. Add a flow.test.ts case for a loop back to the first step through a helper step, and describe the trap in Run Flow Reference's entry bullet.

**B-04 · The pinned flow.json survives a check that cleans the run folder** · bug · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference, Safety; plan, Decisions: Where run state lives): Reference: "When runs/ sits inside folder ... If a check deletes it, it is made again before the next save." Plan: "the host re-creates the folder before each state write, so a check running git clean -fdx cannot crash it".
- **Code** (`cli/src/flow-run.ts:335`): flow.json is written once (flow-run.ts:135), and save() re-creates the run folder but writes only state.json, so a check that cleans untracked files leaves the run without its pinned copy (and without the folder lock). Reproduced in scratch with `folder: .`, a shell check `git clean -fdx` and then a shell step with `gate: approval`: the run pauses with exit 3 and prints the --resume hint, and --resume answers `cannot resume: no flow.json` with exit 2. The first run's log and the start of flow.jsonl are lost as well.
- **On record:** Where run state lives: ... re-creates the folder before each state write, so a check running git clean -fdx cannot crash it
- **Do:** Have save() write flow.json again when it is missing (the config is in memory), or keep the pinned config inside state.json. Then the Reference's 'it is made again' also holds for resuming.
- **Evidence:** Reproduced in scratch b04/repo, a committed git repo run from inside itself so that runs/ is inside folder. The flow was `clean: { shell: 'git -C <repo> clean -fdx' }` → `sign: { shell: 'true', gate: approval }`, run with </dev/null. Output: `-- sign needs a decision`, `-- flow paused: 2 runs`, `-- continue with: pnpm run-flow --resume runs/2026-10-21T21-39-30-flow`, exit 3. The run folder then held only 002-sign.jsonl, flow.jsonl and state.json: no flow.json and no 001-clean.jsonl. flow.jsonl's first line is run 1's run_ended, so the start line is gone, and .flowboard/ has no lock. Running `…

**C-24 · A check's leftover background commands are stopped when its shell exits** · bug · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Shell steps): "It ends when its shell exits: a background command it left running is stopped then, so pnpm start & pnpm e2e ends with the tests."
- **Code** (`cli/src/flow-exec.ts:130`): The process group is killed only by the drain timer, which fires when a background command still holds the check's pipes. When the pipes close with the shell, `close` cancels that timer and nothing is killed. A scratch execShell of `sleep 4 > /dev/null 2>&1 & ...` passed in 309 ms and left the sleep running, while plain `sleep 4 & ...` was stopped.
- **Do:** Kill the check's process group whenever its shell exits, on the close path too, so `pnpm start > log 2>&1 & pnpm e2e` cannot leave a server holding the port for the next round.
- **Evidence:** Scratch verify-C/c24.ts, calling execShell directly. `sleep 9.111 > /dev/null 2>&1 & echo started` ended pass in 4 ms, and its sleep was still running 0.5 s later. `sleep 9.222 > server.log 2>&1 & echo e2e done` ended in 6 ms with its sleep still running. `sleep 9.333 & echo started` ended in 210 ms and its sleep was gone. The leftovers were killed afterwards. In flow-exec.ts:123-133, only the 200 ms drain timer signals the group, and the 'close' handler clears it whenever the pipes close with the shell. flow-exec.test.ts:64-73 covers only the pipe-holding case. Run Flow Reference: 'a backgro…

**C-32 · An empty write_roots list** · bug · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Step fields (write_roots)): write_roots: "The only folders this agent step may edit files in. Its artifacts folder is always allowed".
- **Code** (`cli/src/flow-config.ts:152`): The schema accepts `write_roots: []`, but the roots replace the default only when `roots.length` is non-zero, so an empty list leaves the whole folder writable. A scratch load of `r: { …, write_roots: [] }` gave writeRoots `[<folder>]`, where the reference implies only the artifacts folder.
- **On record:** Task 5: "spec.guards.writeRoots is the resolved write_roots, when set"
- **Do:** Treat a present write_roots as the whole list, so `[]` allows only the artifacts folder, or refuse an empty list at load.
- **Evidence:** A scratch loadFlow of verify-C/c32.yaml gave: step empty (write_roots: []) → writeRoots [<scratch>/proj], identical to step none, which has no write_roots; step narrow (write_roots: [src]) → [<scratch>/proj/src]. --check printed '-- flow ok: 3 steps'. flow-config.ts:36 accepts an empty array, and :152 reads `if (roots.length) spec.guards = …`. Plan Task 5, line 781: 'spec.guards.writeRoots is the resolved write_roots, when set'. Reference: 'The only folders this agent step may edit files in. Its artifacts folder is always allowed'. No test pins [].

**C-33 · The run folder is off limits to agents when it sits inside folder** · bug · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Safety (The run folder is off limits)): "When runs/ sits inside folder, agent steps' file tools may not write to the run folder."
- **Code** (`cli/src/flow-run.ts:130`): The run folder is denied through a denyPaths glob, `<relative run folder>/**`, which guard.ts matches with path.matchesGlob. The folder name contains the YAML file's name, which nothing restricts. Running guard.ts's checkToolCall on the same glob allowed writes into run folders from `review[1].yaml` and `a{b,c}.yaml` (forged outcome files, state.json), while plain names were refused; no test covers the run-folder guard.
- **On record:** "Where run state lives \| ... When that is inside folder, ai steps' guards.denyPaths cover the run folder"
- **Do:** Escape glob characters in the run folder path, or deny by path prefix instead of a glob. Add a test with runs/ inside folder.
- **Evidence:** Scratch verify-C/c33.ts builds the glob as flow-run.ts:130 does (`${relative(folder, realRun)}/**`) and calls core/src/guard.ts checkToolCall for writes to state.json and an outcome file. Run folders named …-review, …-x*, …-v(2) and …-q? were refused ('Path is a non-goal: …'). …-review[1], …-a{b,c} and …-@(a) were ALLOWED for both files. The flow name is the YAML basename with no restriction (flow-config.ts:157). No test in cli/test/flow-*.test.ts mentions denyPaths.

**D-08 · Rework reset when a step also fires a forward on_fail route** · bug · medium · confirmed by the skeptic
- **Doc** (Advancement Rules, advance_task (Rework)): 'an on_fail edge pointing at an earlier step increments that step instance's attempts and creates a new run'; downstream instances are reset so they are created again (02 §3).
- **Code** (`core/src/flow/engine.ts:108`): complete() fires routes in edge order (engine.ts:108-111), and redo deletes only the downstream instances that exist at that moment (engine.ts:79). With t → s, s → t on_fail, s → y on_fail in that order, s's failure reworks t and then creates y as pending; y survives the loop and runs after s passes in the next round. With the two on_fail edges swapped, y is deleted and never runs (scratch edges.ts cases 1a and 1b; validateFlow accepts both).
- **Do:** Make the result independent of edge order: decide whether a forward target of a reworked step runs, apply the rework reset after all routes fire, and test both orders.
- **Evidence:** verify-D/d08_d09.ts. Order A (t->s, s->t:on_fail, s->y:on_fail; validateFlow []): 'end s#2 fail -> run:t:2#3 \| t=running@2 y=pending@0', then 'end s#4 pass -> run:y:1#5'. y runs on a failure that the loop has since fixed. Order B (s->y first; validateFlow []): 'end s#2 fail -> run:t:2#3 \| t=running@2', so redo deleted y; then 'end s#4 pass -> end:done', and y never runs. The cause is complete() firing routes in edge order (engine.ts:108-111) while redo deletes only the instances that exist at that moment (engine.ts:79). Plan Task 2 says 'Each forward route that fires creates a pending insta…

**D-09 · Two rework routes from one failing step** · bug · medium · confirmed by the skeptic
- **Doc** (Advancement Rules, advance_task (Rework)): 'an on_fail edge pointing at an earlier step increments that step instance's attempts and creates a new run.'
- **Code** (`core/src/flow/engine.ts:86`): With a → b → c, plus c on_fail → a and c on_fail → b (validateFlow accepts this), c's failure reruns a; rework(b) then finds b's instance deleted (attempts 0, engine.ts:86) and starts b at attempt 1 beside a's rerun, on a's old output. When a finishes, b's instance already exists, so b is not rerun (engine.ts:111): c runs on stale work and the flow ends done. With the edges swapped, b is started and stopped in the same transition (scratch two-reworks.ts, edges.ts case 2b).
- **Do:** When several rework routes fire, rerun only the most upstream target, or have validateFlow refuse two rework routes from one step; add the case to engine.test.ts.
- **Evidence:** verify-D/d08_d09.ts (a->b->c, c->a:on_fail, c->b:on_fail; validateFlow []). Order A: 'end c#3 fail -> run:a:2#4[] run:b:1#5[]', so b starts beside a's rerun although its upstream a is live, which the settle loop would never allow. Then 'end a#4 -> (none)' (b is not rerun, engine.ts:111) and 'end c#6 pass -> end:done'. This contradicts the Reference's 'those steps start again'. Order B: 'run:b:2#4[] stop:4 run:a:2#5[]', then a, b:1, c. The host removes the queued #4 before launching it (flow-run.ts:358-361), so nothing spawns. With the same fingerprint on both failures, the one failure opens t…

**E-09 · Other routes fired by the failure that fires a rework** · bug · medium · confirmed by the skeptic
- **Doc** (Rework Loop — Step by step; Run Flow Reference — Loops): Downstream instances are reset "so they re-instantiate" (02 §3). The Reference: the steps after the target "start again from attempt 1".
- **Code** (`core/src/flow/engine.ts:108`): complete() fires routes in edge order, and a rework's redo runs in the middle, so routes listed after it act on the reset steps. Scratch: with check→impl (rework) listed before check→notify (forward on_fail), notify survives the reset and runs once check later passes; in the other order it never runs. With check→plan listed before check→impl, impl#1 runs alongside plan#2 and is never rerun on the new plan.
- **Do:** When a fired route is a rework, apply it after the other fired routes (keeping only the outermost rework), or have validateFlow refuse a step with a rework route plus another on_fail route.
- **Evidence:** engine.ts:108-111 fires routes in edge order. It calls rework(), which deletes downstream instances and starts the target, partway through the loop, and creates a pending instance for any later forward route 'unless one exists'. Scratch verify-E/e09.ts with edges [impl→check, check→impl on_fail, check→notify on_fail]: after check fails, the instances are 'impl:running@2 notify:pending@0'; after impl#2, check passes and the engine emits 'run:notify:1', so notify runs on a failure that was superseded. With check→notify listed first, check passes and the engine emits 'end:done', so notify never…

**E-11 · Retry at a run_failed gate drops the attempt's note** · bug · medium · confirmed by the skeptic
- **Doc** (Rework Loop — What the new run gets; Loop Guard And Escalation — What counts (Infra retries excluded)): A rejection reason or Retry note goes "into the next attempt". An infra retry "doesn't use up a try".
- **Code** (`core/src/flow/engine.ts:166`): Retry at a run_failed gate reruns the same attempt with inst.inputs but only the note typed at that gate. So the note the attempt started with (a Reject reason, an escalation note) is lost when the person leaves the field blank. resume reruns the same attempt with inst.note (:178), so the two same-attempt paths disagree (scratch 7a vs 7b).
- **On record:** Task 2: "retry at a run_failed gate: start the same attempt with the same inputs and the new note."
- **Do:** Use event.note ?? inst.note at engine.ts:166, as resume does.
- **Evidence:** engine.ts:166 is `startRun(event.step, inst.attempts, inst.inputs, event.note)`, while resume at engine.ts:178 passes inst.note. Scratch verify-E/e10_11.ts: Reject 'add tests' gives 'run:impl:2[review]{note=add tests}'. impl then ends with err=rate limited, which opens a run_failed gate, and a Retry with no note gives 'run:impl:2[review]' with no note. If the same attempt is interrupted and resumed instead, the engine emits 'run:impl:2[review]{note=add tests}'. The Reference promises that for a Reject 'a rework run it starts gets the note', and for a Retry 'At a run failed gate, the same atte…

**E-21 · A second failure into a target already at an escalation gate** · bug · medium · confirmed by the skeptic
- **Doc** (Loop Guard And Escalation — When it escalates; Run Flow Reference — Loops): "Either way, start nothing." Reference: when the budget is spent, "the target waits at an escalation gate … and nothing runs it", and a stuck check "escalates at once".
- **Code** (`core/src/flow/engine.ts:85`): rework() ignores a gate already open on the target. Scratch 1c: check fails the same way twice, which opens a stuck gate on impl with budget left; then lint, which also routes on_fail to impl and is still running, fails, so impl attempt 3 starts and the host takes the person's prompt down (flow-run.ts:349). Scratch 1b: with the budget spent, lint's failure replaces the gate (from: lint), and Retry gives impl lint_output but not check_output.
- **Do:** In rework(), when the target is already at an escalation gate, keep the gate and add the new failing step's evidence and inputs, rather than reworking or replacing it.
- **Evidence:** rework() at engine.ts:85-95 never checks instance(t).gate. redo, through startRun, replaces the instance and so drops the gate, and escalate, through openGate, overwrites the gate and its from. In the host, flow-run.ts:349 aborts the prompt of a step that is no longer awaiting_approval, and askGate (flow-run.ts:307) aborts the step's previous prompt when the gate is emitted again. Scratch verify-E/e20_21.ts, case 1c (impl → [check, lint], both on_fail → impl, max 3): 'end check#5 fail fp=A -> gate:impl:escalation(check failed the same way twice…)', then 'end lint#6 fail fp=L -> run:impl:3[lin…

**F-01 · Cost of an agent run that is stopped or dies before its result** · bug · medium · confirmed by the skeptic
- **Doc** (Infra Retries, The classification (feature map §4); Runner Pipeline, Events and cost while it runs): An infra failure "doesn't use up a try, but it still shows up in wasted spend." PRD §7 wants per-message usage accumulated so a running cost exists before the run ends.
- **Code** (`cli/src/flow-exec.ts:244`): execAi takes `result.usage.costUsd ?? 0`. Both adapters set usage only on the final result event (adapters/src/agent/claude/provider.ts:105-108,138; opencode/provider.ts:106-108,227), and streamRun's catch uses ZERO_USAGE (cli/src/run.ts:99-101). A scratch ClaudeCodeProvider fed a fake query that streamed 5,000 input tokens, then stopped, returned all-zero usage: so timed-out, Ctrl+C'd, rework-superseded, Fail-the-flow and stream-died agent runs are all recorded at $0.00 in state.json and in the spent/wasted totals (the flow-run tests' fake provider returns $0.10 even when halted).
- **On record:** Execution #17: "Also interrupted runs, infra-failed runs" are wasted; the engine records a stopped run's late cost (core/src/flow/engine.ts:129)
- **Do:** Keep the last `usage` event's cost in streamRun (OpenCode's carry dollars), and have the adapters return running usage on stop. Where no dollar figure exists (Claude mid-run), record the cost as unknown, not $0.
- **Evidence:** Docs: Infra Retries line 24 quotes feature map §4, "It doesn't use up a try, but it still shows up in wasted spend." Runner Pipeline line 59 says "Accumulate per-message token usage as you stream...". Monitor Readiness #17 counts "runs cut off by Ctrl+C" as wasted. Code: flow-exec.ts:244 is `result.usage.costUsd ?? 0`. In claude/provider.ts:99,105-108,138 `usage` is set only from a result event, and a stop before the result returns `{ usage, exitCode: 130, error: 'stopped' }` with zero usage. opencode/provider.ts:99,106-108,227 works the same way. run.ts:99-101 uses ZERO_USAGE. engine.ts:129…

**G-01 · A stopped run's spend moves to wasted** · bug · medium · confirmed by the skeptic
- **Doc** (Stopping And Cancelling — Stop a run (Money); plan Task 9 rule 6): Monitor guide: "Everything it had spent moves to wasted — stopping saves the future spend, not the past." Plan: "end: wait until the live runs settle and their late costs are fed".
- **Code** (`cli/src/flow-exec.ts:244`): A stopped agent run's cost is `result.usage.costUsd ?? 0`, and both adapters return ZERO_USAGE when stopped before their result (adapters/src/agent/claude/provider.ts:138, opencode/provider.ts:227). streamRun ignores mid-run `usage` events, even OpenCode's, which carry dollars. So runs cut off by Ctrl+C, a timeout, a rework or Fail the flow are recorded at $0 and left out of the spent and wasted totals; the scripted test provider reports $0.10 when stopped (cli/test/flow-run.test.ts:56), so no test catches it.
- **On record:** Execution #17: wasted includes "interrupted runs, infra-failed runs, and a run replaced by a gate Retry"
- **Do:** In execAi, keep the last `usage` event's costUsd as a stopped run's cost, and make the scripted provider return zero usage on stop so a test pins it. Until Claude has a price table, Run Flow Reference (and Monitor Readiness's 'the cost stays on the run') should say that a stopped Claude run records $0.
- **Evidence:** Doc: Stopping And Cancelling: "**Money.** Monitor guide: *Everything it had spent moves to wasted — stopping saves the future spend, not the past.*" Plan Task 9 rule 6: "`end`: wait until the live runs settle and their late costs are fed". Code: flow-exec.ts:244 `const costUsd = result.usage.costUsd ?? 0`. claude/provider.ts:99,105-108,138 sets usage only from a `result` event, then `if (stopped && !finished) return { usage, exitCode: 130, error: 'stopped' }`. opencode/provider.ts:99,106-108,227 does the same. run.ts:89-97 streamRun only logs `usage` events. Script verify-G/g01/stop-cost.ts r…

**G-02 · One run-flow per folder (the lock)** · bug · medium · confirmed by the skeptic
- **Doc** (Plan — Decisions: Two hosts in one folder; Run Flow Reference — Safety): "Two hosts in one folder: Refused, by <folder>/.flowboard/lock. A lock whose pid is dead is replaced, with a warning".
- **Code** (`cli/src/flow-run.ts:173`): takeLock creates the file with openSync('wx') and only then writes the pid (166-167). A reader that finds the file empty treats it as stale, and a stale lock is broken by rmSync and a retry (182-184), so two hosts can delete each other's new lock. With a dead-pid lock in proj, two run-flows started together both ran in proj in 3 of 12 trials; one printed "a run-flow (pid undefined) ended without cleaning up".
- **On record:** Two hosts in one folder: "Refused, by <folder>/.flowboard/lock"
- **Do:** Make the lock's content visible together with the file (write a temp file, then link() it to the lock name, failing on EEXIST). Break a stale lock by renaming it aside and checking again, not by rmSync.
- **Evidence:** Plan: "Two hosts in one folder \| Refused, by `<folder>/.flowboard/lock`. A lock whose pid is dead is replaced, with a warning"; Reference Safety says the same. Code: flow-run.ts:166-167 calls openSync('wx') and only then writeSync(pid). At 174-178 an empty or unreadable file gives held = {}. At 179-184 a dead pid prints the warning, calls rmSync(path) and retries, so a host can delete another host's fresh lock. Reproduced in verify-G/g02 over 12 trials: a dead-pid lock in proj, then `node flow-main.ts flow-a.yaml & node flow-main.ts flow-b.yaml`, both with folder: proj and one `sleep 1` step…

**G-03 · A unique run folder per run** · bug · medium · confirmed by the skeptic
- **Doc** (Plan — Global Constraints (Files); Run Flow Reference — Files written): "runs/<stamp>-<flow name>/ holds flow.json, state.json, flow.jsonl … A taken folder name gets -2, -3, …."
- **Code** (`cli/src/flow-run.ts:108`): The name is picked with existsSync and then made with mkdirSync({ recursive: true }) (121), which succeeds on a folder that already exists, and state.json is saved through a fixed state.json.tmp (338). x/flow.yaml and y/flow.yaml (different folders), started together from one cwd, shared runs/<stamp>-flow in 3 of 3 trials. One crashed with ENOENT renaming state.json.tmp, and its --resume hint then failed with "the flow already ended (done)", because state.json and flow.json now came from different flows.
- **Do:** Claim the run folder with a non-recursive mkdirSync (after making runs/) and try the next suffix on EEXIST. Give the state temp file a name unique to the process.
- **Evidence:** Plan Global Constraints: "A taken folder name gets `-2`, `-3`, …"; Reference Files written says the same. Code: flow-run.ts:106-108 picks the name with existsSync; 121 is mkdirSync(runDir, { recursive: true }); 338-339 write through a fixed `state.json.tmp`. Reproduced in verify-G/g03: x/flow.yaml (folder x/proj) and y/flow.yaml (folder y/proj), each 8 `true` steps, started together from one cwd. Trials 1 and 3 shared runs/<stamp>-flow; trial 2 got -2. In each shared trial one host printed "-- continue with: pnpm run-flow --resume runs/2026-10-21T21-39-43-flow" and died with "Error: ENOENT: n…

**G-08 · --resume continues in the pinned folder** · bug · medium · corrected by the skeptic
- **As corrected:** `--resume` never checks that the pinned folder still exists, and takeLock's mkdirSync(<folder>/.flowboard, { recursive: true }) re-creates a missing folder. A flow whose folder was moved or deleted after a stop therefore resumes in a new, empty folder. It reruns the cut-off step there, and an agent step spends money doing so. In the reproduction it ended `-- flow done` with exit 0, and nothing said the folder had been re-created. Refuse with `cannot resume: folder not found: <path>` before taking the lock, and have takeLock create only .flowboard, never the folder. This is a bug of medium severity: an edge case with silently wrong behaviour, not a cosmetic issue.
- **Doc** (Run Flow Reference — Stopping and resuming): "--resume <run folder> continues from the folder's flow.json and state.json". It refuses a missing state.json or flow.json, another version, an ended flow and a held lock.
- **Code** (`cli/src/flow-run.ts:165`): resume never checks that the pinned folder still exists, and takeLock's mkdirSync(<folder>/.flowboard, recursive) recreates it. After Ctrl+C, proj was renamed; --resume made a new, empty proj and ran the step there (its output: "no seed.txt here: an empty folder"). An agent step would spend money working in the empty folder.
- **Do:** Refuse with `cannot resume: folder not found: <path>` before taking the lock, and have takeLock create only .flowboard, never the folder itself.
- **Evidence:** Run Flow Reference: `folder` is "An existing folder where every step works", and the resume refusals list no missing-folder check; a fresh start refuses a missing folder (flow-config.ts:88). Code: resume (flow-run.ts:230-247) never checks the folder, and takeLock's `mkdirSync(join(path, '..'), { recursive: true })` (165) re-creates `<folder>/.flowboard`, and with it the folder. Reproduced in verify-G/g08 with step a `sleep 1; cat seed.txt \|\| echo no seed.txt here: an empty folder`, produces [out]. SIGINT (exit 130), then `mv proj proj-moved`, then --resume. It printed "-- a attempt 1 (shell…

**A-39 · Step names written as numbers** · bug · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Rules for the whole file (Names)): "Step names and artifact types become file names, so they may use only lowercase letters, digits, `-` and `_`, starting with a letter or digit."
- **Code** (`cli/src/flow-config.ts:39`): YAML reads unquoted digits as numbers: a step written `007:` silently becomes "7", and `to: 1` fails with 'one step name; write one edge per pair of steps', the message meant for a list. Run Flow Deferred Issues already notes that numeric names move to the front.
- **Do:** Refuse step keys and edge ends that YAML did not read as strings, with a message to quote them (read the YAML key nodes). Give a non-string from/to its own message.
- **Evidence:** Scratch y/num4.yaml has a step `007:` and an edge to "7": --check prints '-- flow ok: 2 steps', and --mermaid draws n0["7"] first. num1.yaml (edge to "007") gives 'edges.0: unknown step "007"'. num2.yaml (to: 1) gives 'edges.0.to: one step name; write one edge per pair of steps'. num3.yaml (from: 007) gives 'edges.0.from: one step name; write one edge per pair of steps'. The message comes from StepName = z.string({ error: 'one step name; write one edge per pair of steps' }) at flow-config.ts:39.

**G-09 · A second press cleans up like run-agent's** · bug · low · confirmed by the skeptic
- **Doc** (Plan — Task 11 rule 1; Run Agent CLI Decisions R29): "Ctrl+C, SIGTERM and SIGHUP behave like run-agent's (R13, R29)". R29: "the second Ctrl+C deletes the temp folder before exiting".
- **Code** (`cli/src/flow-run.ts:427`): A second press more than 300 ms after the first calls exit(130) at once. Each live agent run's /tmp/fb-* folder (its socket and skill copies) is removed only in execAi's finally, which then never runs; run-agent removes its temp folder before exiting (cli/src/run.ts:154).
- **Do:** Track live runs' temp folders and remove them before the second press exits, or correct the plan's R29 reference.
- **Evidence:** Plan Task 11 rule 1: "Ctrl+C, SIGTERM and SIGHUP behave like `run-agent`'s (R13, R29)". Run Agent CLI Decisions R29: "the second Ctrl+C deletes the temp folder before exiting". Code: flow-run.ts:425-427 calls `(deps.exit ?? process.exit)(130)` at once. execAi's /tmp/fb-* folder (flow-exec.ts:204) is removed only in its finally (257), which runs after the stopped agent settles, and that can take up to KILL_GRACE_MS = 5000 (adapters/src/exec/terminate.ts:4). run-agent removes its tmp before exiting (run.ts:154). The test at flow-run.test.ts:468-481 asserts only `exits` == [130]. Traced in code,…

**I-16 · Replacing a stale lock is racy** · bug · low · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues (no row for it); Run Flow Reference, Safety): The reference promises "One run-flow per folder", and the deferred list names no way around the lock.
- **Code** (`cli/src/flow-run.ts:184`): takeLock reads the lock, judges it stale, then deletes the file without checking it is the same lock. If two run-flows start together on a stale lock, the second can delete the first's fresh lock, and both run. A lock read between openSync('wx') and writeSync is empty, parses as stale and is deleted too.
- **On record:** Two hosts in one folder \| Refused, by <folder>/.flowboard/lock
- **Do:** List it. To fix, treat an unreadable lock as held, and re-read the lock after replacing it before running.
- **Evidence:** flow-run.ts:166-167: openSync(path,'wx') creates the file, and writeSync fills it on the next line. On EEXIST (173-178) the lock is read, and a parse failure leaves held = {}. The comment there reads "unreadable: whoever wrote it is not a run-flow that can still be working". A held pid that is not alive leads to the warning and an unconditional rmSync(path) at 184, with no check that the file is still the one judged stale. Scratch i16 (shell only) with an empty proj/.flowboard/lock printed `-- warning: a run-flow (pid undefined) ended without cleaning up; ...`, ran the flow (exit 0) and delet…

## Diverges, undecided

**A-04 · Known artifact types** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Flow Validation — The checks (Known types); Flow Definition Internals — Inputs validation needs): Known types: "known types", blocks save (`02` §2; backlog 5.1). The check needs "the artifact type list", the PRD §6 seed list.
- **Code** (`cli/src/flow-config.ts:75`): Any name matching /^[a-z0-9][a-z0-9_-]*$/ is accepted in requires and produces, and there is no type registry (searched core and cli for known types, ARTIFACT_TYPES, research_brief, implementation_notes). A required type nobody produces fails only as 'no step before it produces that'; a produced type is never checked.
- **On record:** Flow Design #24, #25: 'Type keys, each saved as <type>.md' (says nothing about a registry)
- **Do:** Decide whether types stay open-ended: if the worker and canvas will check the seeded list, flows written for run-flow (notes, greeting, review_notes) will stop loading. Update the Known types row in Flow Validation either way.
- **Evidence:** Scratch y/types.yaml uses produces [whatever_i_like] and [zz-top]; --check prints '-- flow ok: 2 steps'. flow-config.ts:73-76 checks only the NAME regex. Searching core/src and cli/src for known type, ARTIFACT_TYPES, registry and research_brief finds only a comment at core/src/ports/agent-provider.ts:71. The plan, the review and the run-flow docs never mention a type list. The #24/#25 row (plan line 34) says only 'Type keys, each saved as <type>.md'. The analysis (line 201) still lists 'known types' among FlowBoard's checks.

**A-05 · Where step-level validation lives** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Flow Definition Internals — Component #2 and Who calls validation): Flow definition and validation is "pure functions over graph JSON — no I/O, no provider. The most reusable piece in the system", called by the editor, the API and, through saved flows, the worker.
- **Code** (`cli/src/flow-config.ts:111`): core's validateFlow checks only the graph and the artifact contract. The name rule, START/END, 'an ai step needs prompt, skill or system_prompt', 'a shell step writes one artifact', launch keys on shell steps and the no-limits warning are all in loadFlow, mixed in with file reads. StepDef has no kind, so core could not express these rules.
- **Do:** Move the step rules that need no I/O into core beside validateFlow, adding kind to StepDef, before the canvas or worker reads flow files. Otherwise record that they stay CLI-only.
- **Evidence:** These rules are all in loadFlow: names and START/END at flow-config.ts:71-81, launch keys and the one-artifact rule on shell steps at :116-119, 'an ai step needs prompt, skill or system_prompt' at :133-134, and the limits warning at :138-140. They sit between file reads of the task and prompt files (:90-92, :126-132). core's validateFlow (flow.ts:66-119) covers only edges, entry, forward loops, reachability, producers, requires and the join warning. StepDef (flow.ts:8) has no kind. No decision row, Left out item or run-flow doc says these step rules stay CLI-only. Analysis §6.5 says only that…

**B-02 · Skills and plugins pinned at task start** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Version Pinning, What is pinned and what is not): A task's plugin commits and agent rows: Yes, at task start (tasks.capability_pins); "an update never reaches a running task; agent rows are pinned the same way".
- **Code** (`cli/src/run.ts:48`): flow.json keeps skills and plugins only as absolute paths (config.ts:166, config.ts:211). Every launch, including each run after --resume, copies the skill folders fresh (run.ts:48, via flow-exec.ts:216) and mounts plugin folders where they are. So an edited SKILL.md or plugin reaches the next run of a flow already under way, while the task, prompt and inline system_prompt texts stay pinned.
- **Do:** Copy skill and plugin folders into the run folder at start and mount the copies, or hash them and warn on --resume. At least say in Run Flow Reference that they are read at every launch (the review defers only re-reading prompts).
- **Evidence:** Doc (Version Pinning, 'What is pinned and what is not'): 'A task's plugin commits and agent rows \| Yes, at task start — tasks.capability_pins, "set when the task starts"; "an update never reaches a running task; agent rows are pinned the same way"'. Code: config.ts:166 `skills.push({ name: basename(path), path })` and config.ts:211 `mount: { kind: 'plugin_dir', path: real(p) }` keep only paths. flow-exec.ts:216 calls withAsking at every launch, and run.ts:48 runs `cpSync(s.path, join(plugin, 'skills', s.name), { recursive: true })`. Plugin folders are passed in place as `plugins: [{ type: 'l…

**B-03 · A version identity (number or content hash) for what a run ran** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Flows And Flow Versions, Versions are immutable; Why versions matter beyond safety): "Tasks pin flow_id at start; in-flight tasks never move." Cost by version: "Cost per completed task … trended by flow version".
- **Code** (`cli/src/flow-run.ts:242`): flow.json's `version: 1` is the file-format version that --resume checks, not a flow version. A search of core and cli for a hash or version id finds only the stuck-check fingerprint (core/src/flow/fingerprint.ts:24). A flow's name is its file name, so runs of an edited YAML and of the original can be told apart only by diffing their flow.json files.
- **On record:** 7.2 Where flows live: Decide later (the analysis's §10 content hash is neither adopted nor on Left out)
- **Do:** Record a content hash of the pinned config (graph, task and prompt texts, skill contents) in flow.json and on each run record. It is the version id under option 7.2(a) and lets cost be grouped by version (Monitor Readiness #3).
- **Evidence:** Doc (Flows And Flow Versions): 'Editing creates a new version. Tasks pin flow_id at start; in-flight tasks never move.' and 'Cost by version — "Cost per completed task … trended by flow version"'. A grep of core/src and cli/src for hash, sha256 or version finds only fingerprint.ts:24 (createHash for the stuck check) and flow-run.ts:135/242: `version: 1`, which is the file format that resume checks ('made by a different version of run-flow'). The flow name is basename(yaml) (flow-config.ts:157). Analysis §10 recommends 'A content hash over the flow and every prompt file it uses, recorded on ea…

**B-18 · A step's display name, separate from its key** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Flow Design Screen, Step marks on the canvas; Seeded Flows, 1. The PRD default flow): "Each node shows: name (+ gate glyph), agent, then chips"; the seed has key `grill` with name "Grill me" and key `check` with name "Lint & test".
- **Code** (`cli/src/flow-config.ts:23`): A step's mapping key is its only name and must match ^[a-z0-9][a-z0-9_-]*$; `name` and `label` on a step are `unknown key`. The seeded names (Research, Grill me, Lint & test, Code review) fit only in YAML comments, which parse() drops and which a canvas that rewrites the file would lose.
- **On record:** Names: step names match /^[a-z0-9][a-z0-9_-]*$/ because they become file names (covers keys, not labels)
- **Do:** Add an optional step label key (the PRD's step_defs.name, the board's column header), or decide that keys are shown as they are.
- **Evidence:** Doc: Flow Design Screen says 'Each node shows: name (+ gate glyph), agent, then chips'. The Seeded Flows table has key `grill` with name 'Grill me' and key `check` with name 'Lint & test'. Step Definitions has 'Name (column header) \| name \| … \| label on the node'. `--check b18.yaml` prints `steps.grill.name: unknown key` and `steps.check.label: unknown key`. b18b, which uses the labels as keys, prints `steps.Grill me: name may only use lowercase letters, digits, - and _` and the same for `Lint & test`. NAME is defined at flow-config.ts:23. The plan's Names constraint covers keys only. The…

**C-14 · Logical model ids resolved per provider** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Models And Effort — Logical model ids): "A flow authored for Claude runs on Codex unchanged; only the resolution table differs." D20 treats haiku/sonnet/opus as the logical ids; "the mapping arrives with the second provider".
- **Code** (`cli/src/run.ts:55`): Claude's resolveModel passes ids through unchanged, but OpenCode is built with an empty `models` table, so only `providerID/modelID` works. `--check` refuses `sonnet` on an OpenCode step, including one inherited from `defaults` (scratch inherit.yaml). Moving a step to another adapter means rewriting its model.
- **Do:** Decide the logical-id question for two providers (Agent Providers Open Questions #11), for example a haiku/sonnet/opus table for OpenCode, or record native ids per adapter as the rule in Models And Effort and the plan.
- **Evidence:** run.ts:55 builds `new OpencodeProvider({ models: {} })`. opencode/provider.ts:59-62 resolveModel throws unless the id contains '/'. claude/provider.ts:52-54 passes ids through unchanged. config.ts:179 refuses an opencode model without '/'. Scratch --check on c14-inherit.yaml (defaults model: sonnet; step b: adapter: opencode) gave 'steps.b.model: opencode model must be "providerID/modelID"', exit 2. D20 says 'The mapping arrives with the second provider', and Agent Providers Open Questions #11 says 'Decided for v1 (aliases); open for the second provider.' No plan row, Left out item, review it…

**C-18 · Where a Reject sends the work when the step also has always routes** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Approval Gates — What approve and reject mean): "So a gated step's on_fail edge decides where a rejection sends the work."
- **Code** (`core/src/flow/engine.ts:108`): Reject runs `complete(step, 'fail')`, which fires every always route as well as on_fail. In a scratch engine run, an approval step `review` with `always → ship` and a forward `on_fail → fix` was rejected and started both `ship` and `fix`. When the on_fail route is a rework route, the rework resets the always target instead.
- **Do:** Decide whether Reject should fire only on_fail routes. At least have `--check` warn about a gated step that has both an always route and a forward on_fail route.
- **Evidence:** Scratch verify-C/c17-19.ts: review (approval) with review → ship (always) and a forward review → fix (on_fail). Reject with note 'too risky' emitted [run ship attempt 1, run fix attempt 1], whichever edge is listed first. engine.ts:164 calls complete(step,'fail'), and :108-112 fires every always route plus on_fail. With a rework on_fail (review → impl), Reject started only impl attempt 2. ship was deleted, or, when the always edge comes after the rework edge, re-created as pending behind the live impl. Approval Gates says 'a gated step's on_fail edge decides where a rejection sends the work'.…

**D-14 · A join reset by a rework forgets a sibling's route** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Fan-Out And Join, After a rework): The join downstream of the loop target is reset; 'the new join instance waits again, but the sibling's instance is still done, so under either join wording only the loop target's new run is awaited.'
- **Code** (`core/src/flow/engine.ts:79`): redo deletes the join's instance (engine.ts:79), and only a route that fires again creates it again (engine.ts:111), so the sibling's earlier route is forgotten. With b → d, c → d on_pass, c → y on_fail and d on_fail → c: d fails, c reruns and fails, y runs, and the flow ends done without d. Yet b had fed d, and --check says d 'runs without it' (scratch edges.ts case 5).
- **On record:** Execution #18: 'Downstream instances are recreated' (silent on joins fed from outside the reset)
- **Do:** Decide whether a reset join keeps routes that steps outside the reset already fired (create it again as pending), and test it; otherwise correct the --check warning's wording.
- **Evidence:** Fan-Out And Join, After a rework: 'the new join instance waits again ... only the loop target's new run is awaited.' verify-D/d11_d15.ts (a->b, a->c, b->d, c->d:on_pass, c->y:on_fail, d->c:on_fail): 'end d#4 fail -> run:c:2#5 \| (d deleted)', 'end c#5 fail -> run:y:1#6', 'end y#6 -> end:done', and d never runs. Control, the same failure of c in round 1: 'end b#2 -> run:d:1#5', so d runs on b's feed. Control, round 2 passes: d is created again and runs. --check promises 'if it does not fire, d runs without it'. Plan #18 says only 'Downstream instances are recreated', and nothing decides whethe…

**D-15 · An escalation at a fan-out point leaves a branch below it running** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Fan-Out And Join, Gaps (One branch escalates)): 'If one branch is blocked at an escalation gate, the other keeps running; the task status is blocked while a branch is still running. Not addressed (#49).'
- **Code** (`core/src/flow/engine.ts:92`): An escalation only opens a gate on the rework target (engine.ts:91-93) and stops nothing. With p → a, p → b, a and b on_fail → p, and p's budget spent, a's failure escalates p while b keeps running and spending. Retry then wastes b's run (redo, engine.ts:70-78) and Fail stops it, so b's work is discarded either way (scratch edges.ts case 6).
- **On record:** Execution #49, #50: 'A gate on one branch doesn't stop the others' (silent on a gate upstream of a branch)
- **Do:** Decide whether an escalation stops the live runs downstream of its target, since both choices discard them, and add an engine test.
- **Evidence:** Fan-Out And Join Gaps quote verified. verify-D/d11_d15.ts (p max 1, p->a, p->b, a/b->p on_fail): 'end a#2 fail -> gate:p:escalation(p has used 1 of 1 attempts)' while run 3 (b) stays live. Retry gives 'stop:3 run:p:2'; Fail gives 'stop:3 end:failed'. If b passes first (cost 1.5), Retry marks run 3 wasted:true. If b fails first, p's gate reopens with from=b. So b's spend is discarded whatever the person decides. Loop Guard And Escalation quotes the inbox guide for a spent loop, 'Nothing is running; nothing is being spent', and PRD §8 'start nothing'. Plan #49 covers 'a gate on one branch', not…

**E-10 · A Reject's reason when the rework escalates instead** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Rework Loop — What the new run gets (Your reason, when a human rejected)): "a rejection carries your reason into the next attempt" (feature map §4).
- **Code** (`core/src/flow/engine.ts:91`): Reject passes its note to rework(). When the budget is spent or the check is stuck, escalate() opens a gate and stores the note nowhere. A later Retry at that gate starts the next attempt with only the note typed there: in scratch 6a, Reject "add tests" with max_attempts 1, then Retry, runs impl#2 without it.
- **On record:** Run Flow Deferred Issues "Needs a decision" covers notes at Approve and at a forward Reject, not this case.
- **Do:** Keep the Reject note on the escalation gate and use it for the Retry's run when the Retry note is empty, and add the case to the Deferred Issues row.
- **Evidence:** At engine.ts:164, Reject calls complete(step,'fail',note), which calls rework(t, step, note). escalate() (engine.ts:91-92) calls openGate without the note, and Gate (engine.ts:12) has no field for one. A Retry at an escalation (engine.ts:167) passes only event.note. Scratch verify-E/e10_11.ts (impl max_attempts 1, review with approval): 'decide review reject note=add tests -> gate:impl:escalation(impl has used 1 of 1 attempts…)', then 'decide impl retry -> run:impl:2[review]' with no note. Rework Loop says 'a rejection carries your reason into the next attempt'. Plan Task 3's escalate(t, s, r…

**G-06 · FlowBoard's own files kept out of the project's git** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Execution Storage — Ignored by git): "In each managed project's repo, git's local exclude file is used instead": FlowBoard adds .flowboard/skills/ to .git/info/exclude, and promote appends .vibe-worktrees/ "so the parent repo stays clean".
- **Code** (`cli/src/flow-run.ts:111`): run-flow writes <folder>/.flowboard/lock and <folder>/.flowboard/<run>/ and excludes neither: cli/src has no exclude or ignore handling. A `git add -A && git commit` during a flow, as an agent might run, committed .flowboard/lock. Once the host deleted it, the next run exited 2 with "uncommitted changes in 1 file(s)" (git status: D .flowboard/lock).
- **On record:** "run-flow never touches .gitignore (R14)": covers .gitignore and runs/ logs only
- **Do:** At start, add .flowboard/ to the repo's .git/info/exclude, as the design does for .flowboard/skills/, or have the dirty check ignore .flowboard/. Record the choice in Run Flow Reference.
- **Evidence:** Execution Storage — Ignored by git: "In each managed project's repo, git's local exclude file is used instead: ... `.flowboard/skills/`, which FlowBoard adds to that repo's `.git/info/exclude`" and promote appends `.vibe-worktrees/` "so the parent repo stays clean". grep of cli/src for exclude/gitignore finds nothing. Reproduced in verify-G/g06 (proj is a git repo): during a 3-step flow I ran `git add -A && git commit`, as an agent might. The commit contained `.flowboard/2026-10-21T21-40-49-flow/out.md` and `.flowboard/lock`. After the flow, `git status --porcelain` showed ` D .flowboard/lock…

**J-33 · #41 shell steps that cannot start, or are killed** · diverges (undecided) · medium · confirmed by the skeptic
- **Doc** (Execution Open Questions, #41 Shell steps that cannot start): A shell step's non-zero exit is an outcome. A missing command, an out-of-memory kill, or a container that never starts would loop as fail rather than block.
- **Code** (`cli/src/flow-exec.ts:116`): Any exit but 0 is outcome fail, including 127 (command not found) and a shell killed by a signal (code null). The on_fail route fires and reruns the target, usually an agent, until the second identical failure escalates as stuck. Only a spawn or setup error, or a timeout, reaches a run_failed gate.
- **Do:** Decide whether exit 126/127 and signal deaths of a shell step are infra failures (a run_failed gate), as PRD §7's 'process killed by a signal' class implies, and record it in #41.
- **Evidence:** flow-exec.ts:116 `outcome: code === 0 ? 'pass' : 'fail'`; :117 fingerprints any non-blank tail. A null code (shell killed by a signal) and 127 are both fail. Errors come only from setup (:67), spawn (:103), 'cannot save the output' (:113) and stop or timeout. A repeated 'command not found' tail gives the same fingerprint, so engine.ts:93 escalates on the second failure, after one agent rework. Nuance: the code follows PRD §7's literal shell rule (Shell Step Execution:12; plan Task 7 'anything else is fail'), and Infra Retries:67 says the transient class is for 'an agent run'. No plan row addr…

**A-16 · Manual steps** · diverges (undecided) · low · corrected by the skeptic
- **As corrected:** run-flow has no manual step kind. A step with shell: is a shell step, every other step is an agent step, and `kind: manual` is refused as an unknown key. The design lists manual as a third kind, but it does not say what a manual step does, how it finishes or which outcome it sets (Step Kinds; Flow Design #39 is open). So there is nothing defined to build yet. This is undecided drift, not a missing in-scope feature: nothing recorded says manual steps were left out. Record it in the plan's Left out list, blocked on #39. Until then, the nearest stand-in is a shell step running `true` with `gate: approval`.
- **Doc** (Step Kinds — manual): `manual` is "A human task". "No source says what a manual step does when it runs, how it finishes or what outcome it sets" (#39).
- **Code** (none): There is no manual kind: `kind: manual` gives 'unknown key', and every step without `shell` is an ai step (searched core and cli for manual). The closest stand-in is a shell step running `true` with `gate: approval`.
- **Do:** Add manual steps to the plan's Left out list, blocked on Flow Design #39.
- **Evidence:** Scratch y/manual.yaml with b: { kind: manual } gives 'manual.yaml: steps.b.kind: unknown key', exit 2. flow-config.ts:115 treats every step without shell as an ai step. Step Kinds gives manual's verdict as 'Not specified' and says 'No source says what a manual step does when it runs, how it finishes or what outcome it sets'. Flow Design #39 is still open. Neither the decisions table nor the Left out list mentions manual steps.

**D-18 · Task status, including blocked** · diverges (undecided) · low · confirmed by the skeptic
- **Doc** (Execution State Machines, Task status; Execution Glossary, Blocked): tasks.status is 'backlog'\|'todo'\|'running'\|'blocked'\|'done'\|'failed'\|'cancelled'. A running task becomes blocked on a non-transient infra failure, a spent or stuck loop, or a parked run.
- **Code** (`core/src/flow/engine.ts:15`): FlowState.status is only running, done or failed; every gate lives on its step, and the flow stays running. The host reports paused (exit 3) and stopped (exit 130) without saving either (flow-run.ts:465). backlog, todo and cancelled have no counterpart.
- **On record:** Left out: 'cancel' (covers cancelled only)
- **Do:** Execution State Machines should say run-flow keeps no blocked status. Decide whether the worker stores one or derives 'waiting on you' from the steps at a gate and their gate kinds.
- **Evidence:** Execution State Machines (lines 12, 20-22) and the Glossary's Blocked entry: 'set for an infra failure that is not transient (PRD §7), a spent or stuck loop (PRD §8), and a parked run'. engine.ts:15 has status 'running'\|'done'\|'failed'. flow-run.ts:465 computes 'stopped' or 'paused' only for the summary and the exit code. state.json keeps 'running', which --resume requires (flow-run.ts:243). No plan row, review item or run-flow doc decides a blocked status. The #49 row covers branches, and Left out covers cancel.

**K-06 · #15 Model ids and effort values** · diverges (undecided) · low · confirmed by the skeptic
- **Doc** (Flow Design Open Questions — Steps, #15): For v1, D20 makes the aliases haiku, sonnet and opus the logical ids; 'the abstract names are open until a second provider'. The PRD allows effort low \| medium \| high \| xhigh \| max.
- **Code** (`cli/src/run.ts:55`): A step's model goes to its adapter exactly as written: a Claude alias or id, or OpenCode's providerID/modelID (config.ts:179 requires the slash). run-flow creates OpenCode with an empty logical-model map, so no logical ids exist. Effort takes the PRD's five values.
- **Do:** The second provider is here and flows mix the two. Decide whether flow files name logical or native model ids before the canvas or library stores flows, and record it under #15 and in Logical Model Ids.
- **Evidence:** #15: 'For v1, D20 makes the aliases the logical ids; the abstract names are open until a second provider'. In the code, run.ts:55 is `new OpencodeProvider({ models: {} })` (the same on dev). OpenCode's resolveModel is `this.models[logical] ?? (logical.includes('/') ? logical : undefined)` (opencode/provider.ts:60), and Claude's is the identity (claude/provider.ts:52-53). config.ts:179 gives 'opencode model must be "providerID/modelID"', and config.ts:38 allows the five effort values. Grepping the plan, the review, Run Flow Reference, Run Flow Deferred Issues and the analysis for logical/model…

**K-13 · #25 Seeded artifact types and a known-types check** · diverges (undecided) · low · confirmed by the skeptic
- **Doc** (Flow Design Open Questions — Validation, #25 (and #24's type registry)): PRD §6 seeds ten types; Story 1.1 says the nine PRD types plus sources and grounding_report. Story 5.1 validates 'known types', which needs a type registry either way (#24).
- **Code** (`core/src/flow/flow.ts:93`): There is no registry or seeded list: any lowercase name is a type. A typo in produces that no step requires, such as revew, passes --check (checked in scratch). The plan's row and Run Flow Reference put #25 under 'type keys or file names' but answer only #24.
- **On record:** Flow Design #24, #25 row: 'Type keys, each saved as <type>.md' (it says nothing about seeded or known types)
- **Do:** Decide whether flows get a known-types check: a seeded list, or a warning about a produced type that nothing requires. Remove #25 from the plan's and Run Flow Reference's row.
- **Evidence:** #25 asks which types are seeded (PRD §6 lists ten; Story 1.1 says nine plus two), and #24 says 'A known types check needs a type registry either way.' The code has no registry. flow.ts:93-107 checks only duplicate producers and unmet requires, so any lowercase name is a type. A scratch --check where review produces [revew] and nothing requires it printed '-- flow ok: 3 steps' (exit 0). The plan row 'Flow Design #24, #25: type keys or file names \| Type keys, each saved as <type>.md' and the matching Run Flow Reference row answer only key-versus-filename. Neither the Left out list nor any deci…

**K-16 · #33 Dependencies the contract cannot see** · diverges (undecided) · low · confirmed by the skeptic
- **Doc** (Flow Design Open Questions — Naming and seed details, #33): The seeded check step requires nothing but must run after implement and tests. 'Should a check step implicitly require the code-producing steps, or should validation ignore this?'
- **Code** (`core/src/flow/flow.ts:102`): Validation ignores it: only requires is checked against upstream producers. A flow wired check → implement → review, with the check before the code, passes --check (checked in scratch).
- **Do:** Record that run-flow's answer to #33 is to ignore the dependency, or decide on a --check warning for a shell step with no ai step before it.
- **Evidence:** #33: 'Should a check step implicitly require the code-producing steps, or should validation ignore this?' In the code, flow.ts:102-107 checks only `requires` against forward ancestors. A scratch --check of check (shell) → implement → review, where review requires [notes, check_output], printed '-- flow ok: 3 steps' (exit 0). Neither the plan's decisions table nor the review mentions #33.

**K-18 · #39 What a manual step does** · diverges (undecided) · low · confirmed by the skeptic
- **Doc** (Flow Design Open Questions — Added in the second grounding pass, #39): kind='manual' is in the schema and the step form, 'but no source says how a manual step starts, who completes it, how it finishes, or which outcome it sets'.
- **Code** (`cli/src/flow-config.ts:115`): There is no manual kind: a step is either a shell step or an ai step. The only points where a person acts are gates on a step's result and agents' ask_user questions; gate: approval on a shell step that does nothing is the nearest stand-in.
- **Do:** Either add the manual kind to the plan's Left out list or define it in #39 before the canvas offers it.
- **Evidence:** #39: "kind='manual' is in the schema and the step form ... but no source says how a manual step starts, who completes it, how it finishes, or which outcome it sets". The code has only shell and ai steps (flow-config.ts:115) and refuses `kind: manual` (scratch: 'steps.check.kind: unknown key'). A shell step accepts gate: approval because gate is not a launch key. Testing The Run Flow CLI uses `draft: { shell: 'echo "draft v1" \| tee draft.txt', produces: [draft], gate: approval }`. Grepping the plan for 'manual' finds nothing, so the manual kind is neither decided nor on the Left out list.

## Missing, in scope

**J-11 · #13 queued versus running** · missing (in scope) · medium · confirmed by the skeptic
- **Doc** (Execution Open Questions, #13 queued is not a state): PRD §5 has no such step state. Inferred: a pending instance with a queued start_run job.
- **Code** (`core/src/flow/engine.ts:53`): Emitting a run command marks the instance running and the run live at once. Under --max-runs, waiting runs sit in the host's in-memory queue (cli/src/flow-run.ts:395), so state.json cannot tell queued from running. On Ctrl+C a run that never launched is fed as interrupted and counted as a wasted $0 run.
- **Do:** Decide whether the engine takes a 'launched' event to separate queued from running, as Run Flow Monitor Readiness suggests; until then, #13 stays open.

**K-56 · §10 Loop limits that fail at load time when they cannot apply** · missing (in scope) · medium · confirmed by the skeptic
- **Doc** (Multi-Agent Orchestration Analysis §10): 'Loop limits that fail at load time when they can't apply, instead of doing nothing silently.'
- **Code** (`core/src/flow/engine.ts:87`): max_attempts is read only when a rework route targets the step; on any other step it does nothing, and --check stays silent. The plan's DELIVERY fixture and Run Flow Reference's At a glance example both set max_attempts: 2 on review, which no rework route targets. In a scratch engine run of that flow, review ran three times before implement escalated.
- **On record:** Not on the Left out list
- **Do:** Have --check refuse, or warn about, max_attempts on a step that no rework route targets. Remove it from the reference example and the test fixture.

**J-04 · #6 what a manual step does** · missing (in scope) · low · confirmed by the skeptic
- **Doc** (Execution Open Questions, #6 What a manual step does): PRD §5 allows kind = 'manual'. No rule says how the engine runs it, what it waits for, or what sets its outcome.
- **Code** (`cli/src/flow-config.ts:115`): A step is an ai step unless it has shell:. There is no manual kind in the flow file, StepDef or the engine (a search of core/src, cli/src, the plan and the run-flow docs for 'manual' finds none). A shell step 'true' with gate: approval approximates one.
- **Do:** List manual steps in the plan's Left out and the Reference's 'Left for later', so #6 and Flow Design #39 stay visibly open.

**J-62 · Roadmap beyond PRD: queued as a visible step state** · missing (in scope) · low · confirmed by the skeptic
- **Doc** (Execution Roadmap, Designed beyond the PRD, queued row): queued as a visible step state \| monitor and task-detail mockups \| not a PRD state
- **Code** (`core/src/flow/engine.ts:53`): Not built. A run waiting for a --max-runs slot shows as running in state.json and prints nothing until it launches (J-11).
- **Do:** Keep the row open until the queued/launched distinction in J-11 exists.

**K-55 · §10 A content hash over the flow and its prompt files, recorded on each run** · missing (in scope) · low · confirmed by the skeptic
- **Doc** (Multi-Agent Orchestration Analysis §10 (and §7.2 option a)): 'A content hash over the flow and every prompt file it uses, recorded on each run. It ties every run to exact bytes, and it doubles as the version id if flows live in files.'
- **Code** (`cli/src/flow-run.ts:135`): No hash is computed; sha256 is used only in fingerprint.ts. flow.json pins the loaded config, including the task and prompt text. But skill folders and plugin folders stay as paths, which every launch reads from disk, including a resumed one (run.ts:45-50, config.ts:211).
- **On record:** 7.2: 'pins its loaded copy (flow.json)'; the hash is not on the Left out list
- **Do:** Record a hash of flow.json and of each skill and plugin folder in state.json, or put the hash on the Left out list. Say in Run Flow Reference that skills are not pinned.

## Partial

**A-03 · The --check warning for a join behind a conditional route** · partial · medium · confirmed by the skeptic
- **Doc** (Branching Joining And Loops — Designing a join): "A join behind a conditional route can wait forever if that route never fires." See Flow Design Open Questions #19.
- **Code** (`core/src/flow/flow.ts:110`): The warning fires only when the conditional route is itself one of the join's forward in-routes. `a→b (on_pass), b→c, c→d, a→e, e→d` passes --check with no warning, and when a fails the engine runs d without the b/c branch, including a `requires` that d declares from b.
- **On record:** Flow Design #19: 'The join runs once nothing can still feed it, and --check warns about it'
- **Do:** Warn for a join whenever a conditional route lies on a forward path into it, not only on its own in-routes; or narrow the Joins bullet in Run Flow Reference to the join's own routes.

**B-15 · The inspector's step fields stored in the flow file** · partial · medium · confirmed by the skeptic
- **Doc** (Flow Design Controls, In the inspector): Agent (free text), Model, Effort, Budget (≥ 0, step 0.10), Retries (0–5), Approval, Sandbox (none, container, sealed container), × on a need.
- **Code** (`cli/src/flow-config.ts:30`): The YAML holds model, effort, limits.budget_usd (only above 0: a budget of 0 fails with `Too small: expected number to be >0`), max_attempts (retries + 1), gate: approval, requires and produces. It cannot hold Agent as a name (`steps.a.agent: unknown key`; system_prompt carries text only) or Sandbox (`steps.a.sandbox: unknown key`). A step added with + Step fails until it has a lowercase key and a prompt, skill or system_prompt.
- **On record:** Left out: an agent: file key (use system_prompt)
- **Do:** Before the canvas, decide how Agent is stored (an agent: key naming a file or row, or the system_prompt text), and line up the Budget minimum. Sandbox waits for the sandbox tier.

**C-23 · A check's output saved for the next attempt** · partial · medium · confirmed by the skeptic
- **Doc** (Check Steps — The rules; Designing with checks): "It writes stdout and stderr (tail, ~20 kB) to a check_output artifact." Feature map: "the error output goes to the next attempt word for word".
- **Code** (`cli/src/flow-exec.ts:108`): The last 20,000 characters of stdout and stderr, in arrival order, go to the step's one declared output (`produces[0]`, whatever its name), and a rework adds that output to the target's inputs. A check with no `produces` keeps its output nowhere (its log holds only exitCode, outcome and fingerprint), so the rework target and the escalation gate have nothing to read: the scratch engine run started `build:2` with no inputs. `--check` does not warn.
- **On record:** Global Constraints: "The last 20 000 characters go to the step's artifact."
- **Do:** Have `--check` warn about a shell step with an on_fail route and no `produces`, or always keep the tail somewhere, in the run log or a default check_output.

**C-35 · Destructive commands blocked inside the agent** · partial · medium · corrected by the skeptic
- **As corrected:** run-flow reuses run-agent's built-in deny list. It blocks git push, git reset --hard, curl or wget piped into a shell, and recursive rm of paths starting with /, ~ or .. (guard.ts:5-11). The design's base-branch `git checkout` rule is missing. guard.ts:4 says 'the runner adds' it, but neither run-agent nor run-flow does, and run-flow has no base branch to name: one folder, no worktree, and worktrees are on the Left out list. The guards also do not block `git checkout .`, `git restore`, `git stash` or `git clean -fd`. Those would discard earlier steps' uncommitted edits in the shared folder, and the (Alex) uncommitted-changes check protects only work that existed before the flow. The default permission mode limits the exposure. Under acceptEdits, both adapters refuse a Bash command that is not in permissions.allow. So the risk needs one of three things: an allow entry such as `Bash(git *)`, which is trusted as written without the opt-in; bypassPermissions or auto with allow_unrestricted_shell; or a check command that runs such commands. Either add those git commands to run-flow's default deny list, or record the gap in Run Flow Deferred Issues.
- **Doc** (Run Guardrails At Launch — The hooks (inside)): The hooks deny "destructive commands: rm -rf outside the worktree, any git push, git reset --hard or git checkout of the base branch, and piping a download into a shell."
- **Code** (`core/src/guard.ts:5`): The built-in list blocks git push, git reset --hard, curl or wget piped to a shell, and recursive rm of /, ~ or ... guard.ts says "The runner adds the base-branch git checkout rule", but run-flow does not (grep finds no base branch). Steps leave their edits uncommitted in one folder, so nothing stops a later agent's `git checkout .`, `git restore`, `git stash` or `git clean -fd` from discarding earlier steps' work.
- **On record:** (Alex) "Uncommitted changes at start \| Refused unless --allow-dirty" protects only the work that existed before the flow
- **Do:** Add the git commands that discard work (checkout or restore of paths, stash, clean) to run-flow's default deny list, or record the gap in Run Flow Deferred Issues.

**D-32 · A check's raw output feeds the next attempt** · partial · medium · confirmed by the skeptic
- **Doc** (Execution Overview, Design principles (Sensors before autonomy)): 'Check steps run real commands. The exit code is the verdict, and the raw output feeds the next attempt.'
- **Code** (`cli/src/flow-exec.ts:108`): A shell step saves its output tail only as the artifact of its first produces type (flow-exec.ts:108-115); its run log keeps only the exit code and outcome (flow-exec.ts:95). A rework adds only the failing step's produces to the target's inputs (engine.ts:81), so a check written without produces, such as check: { shell: pnpm test } with an on_fail route, reworks with no failing output and escalates with no evidence. --check gives no warning.
- **Do:** Always keep the output tail in the run log, whatever produces says, and have --check warn about a shell step that has an on_fail route but no produces.

**G-07 · Run records: session id, pid, times, usage** · partial · medium · corrected by the skeptic
- **As corrected:** The engine's RunRecord (core/src/flow/engine.ts:14) keeps only id, step, attempt, live, costUsd, wasted, outcome, reason, error and fingerprint, a subset of the designed runs columns. No pid is recorded anywhere: AgentRun.pid is never read, and execShell reads child.pid only to signal the process group. The session id survives only as a logged `system` event in NNN-step.jsonl. Model and effort are in that log's `start` line (the launched spec), and tokens, turns and exit code in its `result` line. The adapter is recorded only per step in flow.json's pinned config, and times only as `at` stamps. Some of this is already listed as left for later: times, model, tokens and turns in Run Flow Monitor Readiness, and pids in Run Flow Reference and Run Flow Deferred Issues. Session id, exit code, effort and provider are not documented. The worker needs pid and session id for Stop, re-attach and session resume, so record pid and start time when a run starts, and session id, end time, model, adapter and usage in run_ended. Also add the session-id gap to Monitor Readiness.
- **Doc** (Execution Data Model — Written: runs and events): runs has claude_session_id ("--session-id, and --resume on a resume"), pid ("for Stop and restart re-attach"), started_at, ended_at, token counts, num_turns, exit_code, model, effort and provider.
- **Code** (`core/src/flow/engine.ts:14`): RunRecord keeps only id, step, attempt, live, costUsd, wasted, outcome, reason, error and fingerprint. The session id survives only as a `system` event line in NNN-step.jsonl. Model, adapter, tokens, turns and exit code are only in the log's start and result lines, and times only as `at` stamps; no pid is recorded anywhere, because AgentRun.pid and child.pid are never read or logged.
- **Do:** Record pid and start time when a run starts, and session id, end time, model, adapter and usage in run_ended, so the worker can stop, re-attach and resume sessions. Run Flow Monitor Readiness lists times, model and tokens, but not session ids or pids.

**H-19 · Run folder deleted by a check** · partial · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Safety (The run folder is off limits)): If a check deletes it, it is made again before the next save.
- **Code** (`cli/src/flow-run.ts:336`): save() re-creates only the folder and state.json. flow.json is written once at start (flow-run.ts:135), and the earlier logs and flow.jsonl lines are gone. A later --resume refuses with `cannot resume: no flow.json` (flow-run.ts:240-241), so `git clean -fdx` with runs/ inside folder makes the run unresumable.
- **On record:** Where run state lives: “the host re-creates the folder before each state write, so a check running git clean -fdx cannot crash it”
- **Do:** Rewrite flow.json in save() when it is missing; the host still holds it in memory. Otherwise, say the run can no longer be resumed.

**I-27 · Shell runs' logs as a Monitor source** · partial · medium · confirmed by the skeptic
- **Doc** (Run Flow Monitor Readiness, What already matches (Events already have one shape); Order to build it in, step 3): "Each run's log holds the provider's events as normalized events, with the raw line kept"; a read-only Monitor would show "each run's live log".
- **Code** (`cli/src/flow-exec.ts:95`): A shell run's log has only its start and result lines. Its output is never logged or shown, and reaches an artifact only after the shell exits, and only with produces. A check has no live log or events for the Monitor's row log or Open the log, and What's missing does not say so.
- **Do:** Add check output to What's missing, and log a check's output as it arrives (lines or tool_result-like events).

**J-19 · #21 where the reject reason and Retry note go** · partial · medium · corrected by the skeptic
- **As corrected:** Under Execution #21 the note goes into the preamble. A gate's note reaches the preamble ('A person's note for this attempt: …') only in three cases: a Retry at any gate, a Reject over a rework route that reruns its target, and the Retry at an escalation gate. It is dropped without notice at Approve, at a Reject whose on_fail route goes forward, and at a Reject whose rework escalates because the loop is spent or stuck. On a shell step's rerun it has no effect. Every gate still asks for a note. Run Flow Reference also says 'A note goes into the prompt of the next run it starts', so a user who approves the plan in the Reference's own example with guidance for implement loses that guidance. This is partial: the reject and retry notes are carried, the rest are lost. Severity is medium, not low: this is user input lost silently in an ordinary approval flow, and a run-flow doc invites it. Settle the Deferred Issues row (skip the note question when the decision cannot use it, or carry the note to the runs the decision starts), then fix the Reference line.
- **Doc** (Execution Open Questions, #21; Run Flow Reference, Gates and their choices): a rejection carries your reason into the next attempt (feature map §4) ... Proposal: the preamble.
- **Code** (`cli/src/flow-exec.ts:228`): A note reaches the preamble ('A person's note for this attempt: ...') of a rerun of the same step or of a rework target. A note typed at Approve or at a Reject whose on_fail route goes forward is dropped (probed), and on a shell step's rerun it has no effect. Every gate still asks for a note.
- **On record:** Execution #21: where a note goes \| Into the next run's preamble
- **Do:** Settle the open Run Flow Deferred Issues row (skip the note question, or carry the note forward). Then fix the Reference's 'A note goes into the prompt of the next run it starts'.

**A-06 · A missing input is reported** · partial · low · corrected by the skeptic
- **As corrected:** The plan's missing-input rule ('The step still runs; the host says so, and the prompt names it') is implemented only for agent steps. execAi shows '-- <step>: missing input <type>; it runs without it' and names the type in the prompt. execShell never looks at run.inputs. So a shell step whose `requires` artifact was not written runs with no notice, for example a check that requires notes after a person approved a 'did not write: notes' gate. The code follows the plan's tasks: Task 8 put the line in execAi, and Task 7 has none for shell steps. What is missing is the shell-step half of the decision and of Run Flow Reference's general wording. Either print the line in execShell, or say in Run Flow Reference that only agent steps report it.
- **Doc** (Run Flow Reference — How a step's outcome is decided): "A missing input doesn't stop a step: it runs, `-- plan: missing input notes; it runs without it` is printed". The plan: "the host says so, and the prompt names it".
- **Code** (`cli/src/flow-exec.ts:60`): execShell never reads run.inputs; only execAi prints the missing-input line (flow-exec.ts:221-222). A shell step whose `requires` artifact was never written runs with no notice.
- **On record:** 'A missing input: The step still runs; the host says so, and the prompt names it'
- **Do:** Print the missing-input line for shell steps too, or say in Run Flow Reference that only agent steps report it.

**B-28 · A step that is only a person's sign-off or test** · partial · low · confirmed by the skeptic
- **Doc** (Role Starter Flows, The six role flows): BA: "get stakeholder sign-off", with "sign-off changes → elicit"; UX: "prototype and usability-test".
- **Code** (`core/src/flow/engine.ts:147`): There is no manual step kind, and the design leaves it undefined (Flow Design Open Questions #39). A sign-off works as `shell: "true"` plus `gate: approval`, as gate.yaml in Testing The Run Flow CLI does: the BA file passes --check, and Reject reruns elicit with the note. The gate then reads 'approval needed; the agent says pass', although no agent ran.
- **Do:** Until manual steps are defined, document the no-op shell step with an approval gate as the pattern, and leave 'the agent says' out of the gate reason for shell steps.

**C-19 · A rejection's note reaches the next attempt** · partial · low · confirmed by the skeptic
- **Doc** (Approval Gates — What approve and reject mean): "a rejection carries your reason into the next attempt" (feature map §4).
- **Code** (`core/src/flow/engine.ts:110`): The note typed at Reject reaches the rework run's preamble (`A person's note for this attempt: …`) only when the on_fail route is a rework route. With a forward on_fail route the note is dropped, as is a note typed at Approve (scratch engine run), and nothing tells the person. The note question is asked at every gate.
- **On record:** Run Flow Deferred Issues, Needs a decision: "A note typed at Approve, or at Reject when the edge it takes goes forward, is dropped"
- **Do:** Settle the Deferred Issues row: skip the note question when the choice cannot use it, or pass the note to the steps the decision starts.

**D-20 · Run states** · partial · low · confirmed by the skeptic
- **Doc** (Execution State Machines, Run state): runs.state is 'starting'\|'running'\|'parked'\|'succeeded'\|'failed'\|'cancelled'; which state a failing check records is an open question (#57).
- **Code** (`core/src/flow/engine.ts:14`): RunRecord has no state field. live is true from the run command until the run ends, including while the run waits in the --max-runs queue. After that, error marks an infra failure or timeout, 'interrupted' (Ctrl+C or a crash), 'superseded' (rework) or 'stopped' (Fail the flow), and a failing check ends with outcome fail and no error, which settles #57 as a result; starting and parked have no counterpart.
- **On record:** Left out: 'parking and the 20-minute hold'
- **Do:** Execution State Machines should map runs.state onto these fields; add an explicit state before the worker's runs table needs one.

**D-21 · Execution entities in code** · partial · low · confirmed by the skeptic
- **Doc** (Execution Entities, The three, plus the job): Run key fields: 'attempt, pid, state, exit_code, cost and tokens, wasted, fingerprint, error'. A step definition carries kind, command, model, effort, advance_mode, max_attempts, requires, produces and is_entry.
- **Code** (`core/src/flow/engine.ts:14`): StepDef keeps id, requires, produces, approval and maxAttempts; kind, command, model and effort live in the host's FlowConfig.steps, and is_entry is derived (flow.ts:36). StepInstance and RunRecord follow 'How they multiply': one instance per step that its rework reuses, downstream instances created again, and runs that share an attempt. But RunRecord lacks pid, exit_code and tokens even though AgentRun.pid exists, and there is no job entity.
- **Do:** Execution Entities could map each entity to its run-flow type; recording pid on RunRecord is already in Run Flow Deferred Issues.

**D-24 · Life of one step: build, stream and ask beats** · partial · low · confirmed by the skeptic
- **Doc** (Life Of One Step, The nine beats (C, E, G, H)): C: 'the runner builds the RunSpec and the prompt: contract, read-first paths, output paths.' G and H: events stream to run_events with live cost over SSE; questions go to the Inbox and to Slack after 5 minutes, and the agent parks after 20.
- **Code** (`cli/src/flow-exec.ts:224`): C: launch builds the RunSpec from the inputs that exist, the output paths, and the task text plus any note and missing-inputs lines (flow-exec.ts:220-233), with no job lease. E: the flowboard MCP server (ask_user, set_outcome) and the guards are added, but no permission tier. G and H: each normalized event goes to <NNN>-<step>.jsonl and a terminal line, with cost only at the end, and questions take turns in the terminal or are refused, with no inbox, Slack or parking.
- **On record:** Left out: 'parking and the 20-minute hold'
- **Do:** Nothing for run-flow now; Run Flow Monitor Readiness already lists live cost and an asking state as next steps.

**D-35 · Stop: its meanings** · partial · low · confirmed by the skeptic
- **Doc** (Execution Glossary, Moves (Stop)): Stop: '(1) Kill one run's process. (2) Monitor guide: "Ends that run now. It is recorded as failed". (3) At a gate "the task stops here and asks for you".'
- **Code** (`core/src/flow/engine.ts:80`): The engine's stop command ends only runs that a rework superseded (marked wasted) or that Fail the flow cut off (error 'stopped', not wasted) (engine.ts:80, 123). A person can only press Ctrl+C, which stops every run, records each one as interrupted and wasted, and lets --resume rerun it at the same attempt (flow-run.ts:400-411). No single run can be stopped and recorded as failed.
- **On record:** Execution #49, #50: 'There is no cancel: Ctrl+C pauses (resumable)'
- **Do:** The Glossary's Stop entry should add run-flow's meanings; stopping one run is already listed in Run Flow Monitor Readiness.

**E-12 · Where a person's note goes** · partial · low · confirmed by the skeptic
- **Doc** (Rework Loop — What the new run gets; Execution Open Questions #21): Retry "carries my note into it, like a rejection reason" (PRD §8). The prompt part is not stated (#21).
- **Code** (`cli/src/flow-exec.ts:228`): A note reaches the run command, and execAi appends "A person's note for this attempt: <note>" to the preamble. That happens for a Reject into a rework, a Retry at any gate, and resume. Approve passes no note (engine.ts:163), and a Reject whose on_fail route goes forward drops it, though every gate asks for one.
- **On record:** Execution #21: "Into the next run's preamble"; Deferred Issues "Needs a decision": a note typed at Approve or at a forward Reject is dropped.
- **Do:** Settle the Deferred Issues row: skip the note question when the choice cannot use the note, or carry the note to the steps the decision starts.

**E-31 · Timestamps and ids the normaliser misses** · partial · low · confirmed by the skeptic
- **Doc** (Stuck Detection And Fingerprints — The fingerprint): "Strip digits, hex ids, absolute paths and timestamps".
- **Code** (`core/src/flow/fingerprint.ts:6`): There is no timestamp rule, so "Mon Oct 19 …" and "Tue Oct 20 …" give different fingerprints. A UUID's 4-character groups keep their letters, so two UUIDs differ, and durations that change unit differ too (980ms vs 1.02s). Such repeated failures are never seen as stuck; only the budget stops the loop.
- **Do:** Also strip UUIDs and timestamps with weekday or month names, with tests, or document these limits in the Reference.

**F-09 · Pinning a step's skills and plugins** · partial · low · confirmed by the skeptic
- **Doc** (Runner Pipeline, The stages (1)): Stage 1: "Resolve the step, task, pinned capabilities" (PRD §7 capability_pins).
- **Code** (`cli/src/run.ts:48`): flow.json pins the task and prompt texts, but `skills:` and `plugins:` only by path: withAsking copies each skill folder again at every launch, and plugin_dir paths are mounted as they are. A skill edited mid-flow or before --resume therefore changes later runs, though the Reference presents flow.json as the pinned flow.
- **On record:** "7.2 Where flows live \| … pins its loaded copy (`flow.json`) for the run, so `--resume` never re-reads the YAML"
- **Do:** Copy skills and plugins into the run folder when the flow starts, or state in Run Flow Reference that only prompt and task text are pinned.

**F-36 · A shell step whose input is missing** · partial · low · confirmed by the skeptic
- **Doc** (Plan, Decisions this plan makes (A missing input); Run Flow Reference, How a step's outcome is decided): "The step still runs; the host says so, and the prompt names it."
- **Code** (`cli/src/flow-exec.ts:60`): execShell never reads run.inputs, so only agent steps print `missing input`. In a scratch flow where the producer's on_fail route never fired, consumer c (`requires: [x]`) ran with nothing printed, and its own test printed no-x.
- **On record:** "A missing input \| The step still runs; the host says so, and the prompt names it"
- **Do:** Print the same `-- <step>: missing input <type>; it runs without it` line for shell steps.

**G-14 · Instance and task states** · partial · low · confirmed by the skeptic
- **Doc** (Execution Data Model — Written: task and instance state; Missing columns): step_instances.state is pending, running, awaiting_answers, awaiting_approval, done, failed or skipped, and tasks.status adds blocked and cancelled. Missing columns: task paused, run stop reason, escalation kind, retry note.
- **Code** (`core/src/flow/engine.ts:8`): InstanceState has no awaiting_answers or skipped, and FlowState.status is only running, done or failed, so a flow stopped by Ctrl+C, paused at a gate or crashed is saved as running. The missing columns map as follows: the stop reason is in RunRecord.error (interrupted, stopped, superseded, timed out), the gate's kind and reason are on the instance, and the retry note is StepInstance.note.
- **Do:** Save the host's last status (stopped or paused) for the Monitor, and record the column mapping in Execution Data Model and Open Questions #21.

**G-15 · Capabilities pinned at start** · partial · low · confirmed by the skeptic
- **Doc** (Starting A Task — What promote does): "tasks.capability_pins is 'set when the task starts'", and "project flow edits never move in-flight tasks".
- **Code** (`cli/src/run.ts:48`): flow.json pins the YAML, the task text and each step's prompt text. Folders listed under skills: are copied again at every launch (withAsking runs per run, cli/src/flow-exec.ts:216), and plugins: folders are mounted as they stand, so a later attempt or a --resume uses whatever those folders hold by then.
- **Do:** Copy skills and plugins into the run folder at start, or say in Run Flow Reference that only the YAML, the task and the prompt texts are pinned.

**G-22 · Test doubles for whole flows** · partial · low · confirmed by the skeptic
- **Doc** (Execution Testing — The lanes; ReplayProvider): "ReplayProvider drives whole flows at $0"; the integration lane "spawns the real worker against a fake claude binary".
- **Code** (`cli/test/flow-run.test.ts:27`): Flow tests run whole flows at $0 with a hand-written `scripted` provider that writes outcome files, asks questions through the broker and hangs on demand. No flow test uses ReplayProvider or the adapters' fake-claude scripts, so real adapters meet a flow only in the live test, and unlike them the scripted provider reports $0.10 for a stopped run.
- **Do:** Add one flow test that runs through ReplayProvider or a fake-claude script, and make the scripted provider report zero usage when stopped. Note the choice of lane in Execution Testing.

**G-23 · Execution acceptance checks** · partial · low · confirmed by the skeptic
- **Doc** (Execution Testing — Acceptance checks for execution): "A step runs, streams live to /runs/[id], and records a non-zero cost"; "implement and tests start at the same time and review waits for both"; "three failed attempts fail the task".
- **Code** (`cli/test/flow-live.test.ts:46`): Tests cover approval gates, fan-out with a join (two runs live at once, the join after both) and Reject sending the work back as attempt 2; a spent loop escalates instead of failing the task. The live flow test asserts exit 0, status done and the judge's set_outcome file, but not a non-zero cost. The worker, worktree, draft mode, parking and memory checks have no counterpart.
- **On record:** Execution #14, #16: "Escalate, never fail on its own (D3)"
- **Do:** Assert a non-zero cost in flow-live.test.ts, and mark in Execution Testing which checks run-flow covers.

**J-34 · #43 step kinds** · partial · low · confirmed by the skeptic
- **Doc** (Execution Open Questions, #43 Step kinds): PRD §5: ai \| shell \| manual. 02 §3: skill \| agent \| shell \| manual.
- **Code** (`cli/src/flow-config.ts:16`): The flow file has two kinds: ai (any step without shell:) and shell. An ai step names a skill, prompt or system_prompt through run-agent keys. manual is absent (J-04), although D27 on dev already settled the kinds as ai \| shell \| manual.
- **On record:** Left out: an agent: file key (use system_prompt)
- **Do:** Mark #43 settled by D27, and note that run-flow builds only ai and shell.

**J-46 · #62 event envelope version and live cost** · partial · low · confirmed by the skeptic
- **Doc** (Execution Open Questions, #62 The event envelope and live cost): events.ts has no v, which 01-ports.md and PRD §7 require. Usage arrives only on result, yet PRD §7 wants a running cost from per-message tokens.
- **Code** (`core/src/ports/events.ts:32`): A usage event now carries running token totals mid-run (from dev), which answers the live-token half. NormalizedEvent still has no v, and run-flow records cost only when a run ends (RunEnd.costUsd).
- **Do:** Update #62: the usage kind exists, v is still missing, and run-flow shows no live cost.

**J-61 · Roadmap beyond PRD: Retry as-is, Allow host & retry** · partial · low · confirmed by the skeptic
- **Doc** (Execution Roadmap, Designed beyond the PRD, Retry as-is row): Retry as-is, Allow host & retry \| monitor and inbox mockups \| not in PRD
- **Code** (`core/src/flow/engine.ts:166`): Retry as-is is built as 'Retry this step' at a run_failed gate (same attempt, uncounted). Allow host & retry is not: run-flow has no egress allowlist.
- **On record:** New: infra failures \| Retry keeps the attempt number
- **Do:** Mark Retry as-is as built in run-flow; Allow host waits for the sandbox.

**J-64 · Roadmap beyond PRD: run spec snapshot and replay** · partial · low · confirmed by the skeptic
- **Doc** (Execution Roadmap, Designed beyond the PRD, Run spec snapshot row): Run spec snapshot and replay \| 03 §6, drawio Run records \| idea
- **Code** (`cli/src/flow-exec.ts:234`): The snapshot exists: each run's full spec is its log's start line, the events follow, and flow.json pins the flow. Nothing replays a past run from it.
- **Do:** Mark the snapshot half as done.

**K-02 · #10 Step kind and capability on a step** · partial · low · confirmed by the skeptic
- **Doc** (Flow Design Open Questions — Steps, #10): 'Model resolved — D27. kind is ai \| shell \| manual; an ai step names an agent, a skill or both.'
- **Code** (`cli/src/flow-config.ts:115`): A step with `shell:` is a shell step. Any other step is an ai step, which needs `prompt`, `skill` or `system_prompt`, in any combination. There is no `kind` key (it is refused as unknown) and no manual kind, and the agent is an inline `system_prompt` string rather than a named agent.
- **On record:** Left out: 'an agent: file key (use system_prompt)'; analysis §6.2 maps shell to kind = 'shell'.
- **Do:** Record in #10 that run-flow infers the kind from `shell:` and has no manual kind and no named agents. Decide whether files the canvas writes carry an explicit `kind`.

**K-23 · Roadmap: validation with readable errors (ancestor-produced requires, one entry, known types)** · partial · low · confirmed by the skeptic
- **Doc** (Flow Design Roadmap — v1 scope, from M5 and Epic 5): 'POST /api/flows/:id/validate with readable errors: ancestor-produced requires, one entry, known types (Story 5.1)'
- **Code** (`core/src/flow/flow.ts:66`): validateFlow is a pure core function, and run-flow --check prints its problems as '<yaml>: <field>: <message>' lines with exit 2. It reports unknown steps, repeated edges, the entry count, forward loops, unreachable steps, duplicate producers and unmet requires. There is no known-types check and no HTTP endpoint.
- **On record:** Flow Design #23, Execution #65: one entry step and one producer per artifact type
- **Do:** Track known types under #25 (see K-13); the endpoint waits for the web app.

**K-47 · §9 Writes collide in one shared folder** · partial · low · confirmed by the skeptic
- **Doc** (Multi-Agent Orchestration Analysis §9): 'Parallel coding steps share one folder (Execution #48). The guards limit file-editing tools, but shell commands can still write anywhere.'
- **Code** (`cli/src/flow-config.ts:136`): Every step still works in the one folder. write_roots, plus the artifacts folder, limits an ai step's file-editing tools, and --max-runs 1 runs branches one at a time. Agents' shell commands and shell steps are not path-guarded.
- **On record:** 7.5: 'One folder. write_roots narrows a step's file edits, and --max-runs 1 runs branches one at a time'; Left out: 'dynamic fan-out and worktrees'
- **Do:** None in code now; Run Flow Deferred Issues already records the unguarded shell writes.

**K-50 · §9 Spend multiplies across fan-out, loops and attempts** · partial · low · confirmed by the skeptic
- **Doc** (Multi-Agent Orchestration Analysis §9): Fan-out multiplies spend, loops multiply it again, and OpenCode on an unpriced model never trips budget_usd. A ceiling for the whole flow (#12) and required caps (#37) are still open.
- **Code** (`cli/src/flow-run.ts:396`): Spend is bounded per run by limits (with a warning when an ai step has none) and per loop by max_attempts. There is no flow ceiling and no warning for an unpriced model, and --max-runs has no limit by default. A person's Retry goes past max_attempts, and an inner loop's budget resets whenever an outer rework fires (checked in scratch).
- **On record:** Flow Design #37: 'Optional. --check warns'; Left out: 'a flow-wide budget ceiling', 'capability-gap warnings'
- **Do:** Revisit the flow ceiling on the Left out list before flows run unattended. A default --max-runs is the cheapest first limit.

**K-26 · Roadmap: flow tests for a conditional edge that never fires, cancel mid-fan-out, retry after failure, downstream attempts** · partial · info · confirmed by the skeptic
- **Doc** (Flow Design Roadmap — v1 scope, Story 5.3): 'Flow tests, plus "conditional edge never fires, cancel mid‑fan‑out, retry after failure, downstream attempts" (Story 5.3)'
- **Code** (`core/test/engine.test.ts:120`): Engine tests cover a join whose conditional route never fired, Fail the flow stopping a sibling run that is still going (:73), retry at run_failed and verdict gates (:97, :105), and downstream instances recreated on rework (:145). Cancel does not exist; the flow-run tests cover Ctrl+C, its nearest equivalent.
- **On record:** Left out: 'cancel'; Execution #49, #50: 'There is no cancel'
- **Do:** None; cancel's test comes with cancel.

**K-54 · §10 A diagram export with an overlay of a run's route** · partial · info · confirmed by the skeptic
- **Doc** (Multi-Agent Orchestration Analysis §10): 'A diagram export, with an overlay of the route a run actually took.'
- **Code** (`cli/src/flow-config.ts:161`): --mermaid prints a flowchart LR of the flow, with approval steps marked and rework routes dotted. It never reads a run, so there is no overlay.
- **On record:** Left out: 'a Mermaid overlay of a run's route'
- **Do:** None now.

## Doc inaccurate

**E-27 · max_attempts on a step no rework route targets** · doc inaccurate · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — At a glance): The example sets `review: { …, max_attempts: 2 }`, but both on_fail routes go to implement, so no rework route targets review.
- **Code** (`core/src/flow/engine.ts:87`): maxAttempts is read only for a rework target, so on review it does nothing, and the review→implement loop is capped by implement's 3. --check accepts it silently. The plan's DELIVERY fixture and cli/test/fixtures/flow.ts:21 do the same.
- **Do:** Move max_attempts in the example to implement, and have --check warn when max_attempts is set on a step that no rework route targets.

**F-02 · Background commands left running after a check exits** · doc inaccurate · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference, Shell steps): "It ends when its shell exits: a background command it left running is stopped then, so `pnpm start & pnpm e2e` ends with the tests."
- **Code** (`cli/src/flow-exec.ts:123-133`): The process group is signalled only when the pipes are still open 200 ms after the shell exits. If 'close' fires first, because the background command redirected its output, over() finishes without signalling anything. The scratch check `sleep 47 > /dev/null 2>&1 & echo started` passed in about 1 s, and `sleep 47` was still running after run-flow exited.
- **On record:** Run Flow Deferred Issues: fixed "a check held open by its own background command" (scoped to commands that hold the pipes)
- **Do:** Signal the group whenever the shell has exited, since only leftovers remain in it then. Otherwise narrow the Reference: a server started as `pnpm start > log 2>&1 &` survives into the next rework round.

**H-31 · Shell output in scenarios 6 and 14** · doc inaccurate · medium · confirmed by the skeptic
- **Doc** (Testing The Run Flow CLI — Free scenarios #6; Agent scenarios #14): #6: draft prints `draft v1`, then asks. #14: approve the second time; build prints the plan.
- **Code** (`cli/src/flow-exec.ts:80`): Shell output is never shown. The gate.yaml run printed the attempt lines and the prompt but no `draft v1`, which is only in draft.md. In review.yaml, build has no produces, so the plan it cats is thrown away and appears neither in the terminal nor in a log.
- **On record:** Global Constraints: “The last 20 000 characters go to the step's artifact.”
- **Do:** Say that draft writes `draft v1` to draft.txt and to its artifact. Give build `produces: [build_output]` and point the reader to that file.

**K-59 · Plan: the adapters expose no pids, so orphaned agents cannot be stopped** · doc inaccurate · medium · confirmed by the skeptic
- **Doc** (Run-flow plan — Decisions ('Two hosts in one folder') and Left out; design review, landmine #1 and the Deferred table): 'A lock whose pid is dead is replaced, with a warning that its agents may still be running: the adapters expose no pids to stop them.' Left out: 'stopping agents orphaned by kill -9 (the adapters expose no pids, so the lock only warns)'.
- **Code** (`core/src/ports/agent-provider.ts:186`): AgentRun.pid: Promise<number> exists, and both adapters resolve it from the child process they start (claude/provider.ts:79, opencode/provider.ts:127). run-flow never reads it, and takeLock only warns about a dead lock holder (flow-run.ts:182-184).
- **On record:** Two hosts in one folder; Left out: 'stopping agents orphaned by kill -9'
- **Do:** Correct the plan and the review: the pids exist, so stopping orphaned agents only needs run-flow to record them in state.json, as Run Flow Deferred Issues says.

**B-05 · How --resume uses the pinned flow** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Design review of the plan, What holds up): "Resume is simple. flow.json pinning makes resume a matter of replaying events. No version tables are needed."
- **Code** (`cli/src/flow-run.ts:250`): --resume replays nothing. It loads the saved engine state from state.json and feeds a single `resume` event (engine.ts:173-183). flow.jsonl is never read back, and Run Flow Deferred Issues notes that it can miss the transition during which run-flow crashed.
- **Do:** Reword it as 'resume loads state.json and the pinned flow.json', so the worker's design does not count on rebuilding state from flow.jsonl.

**C-07 · A Retry at a verdict gate uses up max_attempts** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Step fields (max_attempts); Gates and their choices): max_attempts is "How many times rework may run this step, counting the first run". A Retry at other gates is "the next attempt; the run it replaces counts as wasted".
- **Code** (`core/src/flow/engine.ts:171`): A Retry at a verdict gate (approval, no outcome, did not write) starts `attempts + 1` with no cap, and a later rework counts those attempts. In a scratch engine run, an approval step with max_attempts 3 got two gate Retries and then Approve. Its check's first failure escalated at once with `impl has used 3 of 3 attempts`, before any rework had run.
- **On record:** Task 2: "retry at a verdict gate: ... start attempts + 1, past maxAttempts if need be"
- **Do:** Say in the reference that a Retry at a verdict gate uses one of the step's max_attempts, so a later rework can escalate at once.

**D-12 · A gated upstream holds a join** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference, Edges, loops and joins (Joins)): 'A step with several edges into it waits for each of those steps while it is running, or while something running can still reach it.'
- **Code** (`core/src/flow/engine.ts:39`): LIVE counts pending and awaiting_approval as well as running (engine.ts:39). So a join also waits for an upstream step held at any gate, and for one that only a gated step can reach. Scratch edges.ts case 3 (approval gate) and more.ts case 3 (run_failed gate) show the join starting only after the decision; the design notes don't cover this case.
- **Do:** The Reference should say 'while it is waiting to start, running or waiting for a decision', and Fan-Out And Join should add the gate case.

**D-28 · Which step a flow starts at** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (run-flow plan, Decisions this plan makes (Flow Design #23, Execution #65)): 'Exactly one entry step (no route into it), and one producer per artifact type.' Task 2: 'start begins the entry step (the step no route points to)'.
- **Code** (`core/src/flow/flow.ts:36`): entries() returns the steps no route points to. When every step has a route into it, it returns those that only rework routes point to (flow.ts:36-41), so a flow may loop back to its first step (flow.test.ts:55). For the seeded flow it picks research, as Seeded Flow Execution expects, and Run Flow Reference states the actual rule.
- **Do:** Correct the plan's decision row, or mark it as superseded by Run Flow Reference.

**E-23 · Retry at a stuck escalation, as the Reference describes it** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Gates and their choices (retry)): "At an escalation, one more attempt beyond the budget, so the next failure escalates at once."
- **Code** (`core/src/flow/engine.ts:167`): A stuck escalation can open with attempts left, so Retry's attempts + 1 is still within the budget. A next failure with a different fingerprint is then reworked without asking: in scratch 3a (max 5), Retry gave attempt 3, then attempts 4 and 5 ran on their own.
- **Do:** Reference: say that at a spent loop Retry grants one attempt past the budget, and at a stuck check it resumes the loop with the attempts left.

**E-26 · A Retry at a verdict gate spends the loop budget** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Step fields (max_attempts)): max_attempts: "How many times rework may run this step, counting the first run".
- **Code** (`core/src/flow/engine.ts:171`): Retry at a verdict gate starts attempts + 1 without checking max_attempts, and rework() later checks that same count. In scratch 11a, two Retries at impl's approval gate, then check's first failure, escalate with "impl has used 3 of 3 attempts". This fits PRD's "total runs of the step", not "times rework may run".
- **On record:** Task 2: "retry at a verdict gate: … start attempts + 1, past maxAttempts if need be."
- **Do:** Reference: describe max_attempts as the total runs of the step, a person's Retries included, of which only rework is checked against the limit.

**F-18 · Process ids of agent runs** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Plan, Left out and the Two hosts decision; design review, landmine #1 and Deferred table): Plan: "stopping agents orphaned by `kill -9` (the adapters expose no pids, so the lock only warns)"; review: "the adapters expose no process IDs (pids)".
- **Code** (`adapters/src/agent/claude/provider.ts:79`): AgentRun.pid is a Promise<number> (core/src/ports/agent-provider.ts:186): Claude resolves it with the CLI child's pid and OpenCode with its server's (opencode/provider.ts:127). run-flow never reads it (searched cli/src for `.pid` and sessionId); Run Flow Deferred Issues already flags the plan's error.
- **Do:** Correct the plan's Left out line and Two hosts decision, and the review's landmine #1 and Deferred table, as Run Flow Deferred Issues proposes.

**F-26 · Where the note and missing-inputs lines appear in the prompt** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference, How a step's outcome is decided; Testing The Run Flow CLI, scenario 14): Reference: "its prompt ends with *Missing inputs (an earlier step did not write them): notes*"; Testing: "that run's prompt ends with *A person's note for this attempt: <your note>*".
- **Code** (`cli/src/flow-exec.ts:226-229`): Both lines are appended to the preamble (part 1), so the rendered prompt goes on with Read these first, Write your output to, the template and the closing (a scratch render confirmed this). Only spec.prompt.preamble ends with them.
- **Do:** In both docs, say the preamble (the task text) ends with these lines, not the prompt.

**G-13 · Adapters expose run pids** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Plan — Left out; Decisions: Two hosts in one folder; plan review — landmine #1 and Deferred table): "stopping agents orphaned by kill -9 (the adapters expose no pids, so the lock only warns)".
- **Code** (`core/src/ports/agent-provider.ts:186`): AgentRun has `pid: Promise<number>`, and both the Claude Code and OpenCode providers resolve it when they spawn. Run Flow Deferred Issues already records that the plan got this wrong.
- **Do:** Correct the plan's Left out item and its Two hosts row, and the review's landmine #1 and Deferred table.

**H-03 · Order in which errors are reported** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Rules for the whole file (Errors)): Shape errors come first: unknown keys, wrong types, bad names, and yamlgraph's START and END. Nothing else is checked until they are fixed; then every other problem is listed at once.
- **Code** (`cli/src/flow-config.ts:67`): Schema errors return before names and START/END are checked: a file with both `promt` and `Plan` reports only the unknown key. validateFlow also returns early, after unknown-step or repeated edges and again after a forward loop (core/src/flow/flow.ts:76, 84). That hides the entry, reachability, producer and requires errors; the staged.yaml case took three fix-and-rerun rounds.
- **Do:** Say that schema errors hide name and START/END errors, and that edge errors and forward loops hide the rest of the graph checks.

**H-05 · max_attempts on review in the at-a-glance example** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — At a glance): `review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], max_attempts: 2 }`, with `review -> implement` as on_fail rework.
- **Code** (`core/src/flow/engine.ts:87`): max_attempts is read only for the step a rework route targets. No route reworks review, so its `max_attempts: 2` has no effect; the review loop is bounded by implement's default of 3.
- **Do:** Move `max_attempts: 2` to implement in the example and in the DELIVERY fixture, or drop it.

**H-09 · Which hex ids the fingerprint removes** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Loops (Stuck checks)): Absolute paths are cut to their file name, and hex ids of 7 or more characters and digits are removed.
- **Code** (`core/src/flow/fingerprint.ts:6`): HEX_ID removes a run of 7 or more hex characters only when it contains a digit. An all-letter run such as `deadbeef` or `defaced` stays in the fingerprint.
- **On record:** Execution #19: “Keep the PRD algorithm, with one change: an absolute path shrinks to its file name”
- **Do:** Write “hex ids of 7 or more characters that contain a digit”.

**H-11 · Position of the missing-inputs line** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — How a step's outcome is decided (A missing input)): Its prompt ends with *"Missing inputs (an earlier step did not write them): notes"*.
- **Code** (`cli/src/flow-exec.ts:224`): The line is appended to the preamble, the task text. renderPrompt then adds Read these first, Write your output to, the step's own prompt and the closing after it (core/src/prompt.ts:8-15). A prompt rendered for review.yaml shows the line second, not last.
- **On record:** Global Constraints: “Missing-inputs line, appended to the preamble after the note”
- **Do:** Say the line comes after the task text and any note, before the inputs and the step's own prompt.

**H-13 · Where a gate note goes** · doc inaccurate · low · corrected by the skeptic
- **As corrected:** A note typed at Approve, or at a Reject whose on_fail route goes forward, reaches no run. Approve completes the step with no note (engine.ts:163), and a forward target is started by the settle loop without one (engine.ts:111, 194). Only Retry, and a Reject that fires a rework route, pass the note on. The behaviour is already tracked in Run Flow Deferred Issues under "Needs a decision". What remains is the Run Flow Reference's sentence "A note goes into the prompt of the next run it starts" (Gates and their choices), which overstates; the reject row next to it is accurate. Reword the sentence to say a note reaches only a Retry run or a Reject's rework run, and link the open decision. Low, because the behaviour gap itself is already recorded.
- **Doc** (Run Flow Reference — Gates and their choices): A note goes into the prompt of the next run it starts: *"A person's note for this attempt: <note>"*.
- **Code** (`core/src/flow/engine.ts:163`): Only a Retry or a Reject that fires a rework route passes the note on. Approve calls complete(step,'pass') without it, and a Reject over a forward on_fail route starts its target without it (engine.ts:111). An engine script confirmed both, and the note question is asked after every choice, so the note is dropped silently.
- **On record:** Execution #21: “Into the next run's preamble”
- **Do:** Say the note reaches only a Retry run or a Reject's rework run. Better still, skip the note question for Approve and Fail, or pass the note to the runs they start.

**H-14 · Retry at a stuck escalation** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Gates and their choices (retry)): At an escalation, one more attempt beyond the budget, so the next failure escalates at once.
- **Code** (`core/src/flow/engine.ts:167`): Retry runs attempts+1. At a `failed the same way twice` gate with budget left, that attempt is within the budget, and a different next failure is reworked normally. In an engine script, fix (max 5) ran attempt 3 after Retry, then a new fingerprint started attempt 4 with no escalation.
- **On record:** Execution #14, #16: “Retry does not reset the count, so the next failure escalates at once”
- **Do:** Split the row. A spent budget gives one attempt beyond it; a stuck check gives the next attempt, which escalates again only if it fails the same way or spends the budget.

**H-15 · Retry at a verdict gate versus max_attempts** · doc inaccurate · low · corrected by the skeptic
- **As corrected:** A Retry at a verdict gate (did not write, approval, no outcome, unhandled fail) starts attempts + 1 with no max_attempts check. The plan's Task 2 rule says so ("past maxAttempts if need be"), so that part is documented. Because the attempt count is also the rework budget, those Retries use it up: impl (max_attempts 2), retried twice after `did not write`, ran as attempt 3, and its first check failure escalated at once with `impl has used 3 of 2 attempts`. The Run Flow Reference defines max_attempts as "How many times rework may run this step, counting the first run", which is wrong once gate Retries have run the step. It should say that every attempt counts against the budget, gate Retries included, and that Retry itself is never capped.
- **Doc** (Run Flow Reference — Step fields (max_attempts); Gates and their choices): `max_attempts`: how many times rework may run this step, counting the first run. Retry at other gates: the next attempt, and the run it replaces counts as wasted.
- **Code** (`core/src/flow/engine.ts:171`): Retry at a verdict gate (did not write, approval, no outcome, unhandled fail) is never refused at max_attempts, and it raises the attempt count that later rework uses. In an engine script, impl (max 2) was retried twice after `did not write` and ran as attempt 3. The first check failure then escalated at once with `impl has used 3 of 2 attempts`.
- **Do:** Say that gate Retries are not capped by max_attempts and that they use up the step's rework budget.

**H-23 · Terminal lines** · doc inaccurate · low · corrected by the skeptic
- **As corrected:** The Run Flow Reference's terminal paragraph (Files written) says an attempt line is printed as each run ends. That is wrong for runs cut off by Ctrl+C or another stop: flow-run.ts:387 skips their end line, and a scratch run printed `-- x attempt 1 (shell)`, `-- stopping`, then the summary. The paragraph also leaves out several lines. --resume prints `-- resuming <run folder>` instead of the header, secrets and warning lines (the Testing guide shows it, the Reference does not). Agent steps print one line per event plus `-- N tool calls failed` and `-- last message: …`, documented only for run-agent in Run Config Reference. An opted-in step prints `-- warning: <step>: unrestricted shell: …`. The `-- <step>: missing input …` line is already documented in the Reference, under How a step's outcome is decided. Status doc_inaccurate, low.
- **Doc** (Run Flow Reference — Files written (terminal paragraph)): The terminal shows the flow and run-folder lines at start, an attempt line as each run starts and ends, and `-- flow <done \| failed \| paused \| stopped>: …` at the end.
- **Code** (`cli/src/flow-run.ts:249`): The quoted lines match, with these gaps: --resume prints `-- resuming <run folder>` instead of the header and skips the secrets line, and runs cut off by Ctrl+C get no end line. Agent steps also print `-- <step>: missing input …`, `-- N tool calls failed` and `-- last message: …` (flow-exec.ts:222, 242). An opted-in step prints `-- warning: <step>: unrestricted shell: …` (flow-run.ts:140).
- **Do:** List the resume line, the agent summary lines and the unrestricted-shell warning.

**H-24 · Design-note question numbers in the settled-rules table** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Rules this command settles): Execution #5, #71: a silent approval step is gated once. Flow Design #24, #25: type keys or file names; the answer is type keys.
- **Code** (none): Execution Open Questions #5 is “Approval and questions on one step”, and Flow Design Open Questions #25 is “Which artifact types are seeded?”; neither row answers its question. The other numbers I checked match their titles.
- **On record:** Plan rows “Execution #5, #71: a silent approval step” and “Flow Design #24, #25: type keys or file names”
- **Do:** Drop Execution #5 and Flow Design #25 from those rows, both here and in the plan, or answer them in rows of their own.

**H-25 · What Ctrl+C is called** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Rules this command settles (Execution #49, #50)): There is no cancel: Ctrl+C pauses, and *Fail the flow* stops every run.
- **Code** (`cli/src/flow-run.ts:465`): Ctrl+C ends the flow as `stopped` with exit 130. `paused` means a gate with no terminal to answer it (exit 3). Both can be resumed.
- **On record:** Execution #49, #50: “Ctrl+C pauses (resumable)”
- **Do:** Write “Ctrl+C stops the flow, and --resume continues it”.

**H-27 · Automated suite commands and the flow-only subset** · doc inaccurate · low · corrected by the skeptic
- **As corrected:** The Testing guide's commands work, and the full suite covers set_outcome as stated. The command offered "to run only the flow tests" runs 84 tests (83 pass, 1 skipped: flow-live). It leaves out packages/ask-user/test/shim.test.ts, whose set_outcome tests (lines 201, 216) were added for flows, so the subset is narrower than its label. Add shim.test.ts to the command. The status is doc_inaccurate, not partial: no code is missing.
- **Doc** (Testing The Run Flow CLI — 1. Automated suite (free)): Expect `fail 0` with 15 skipped; the suite covers set_outcome. To run only the flow tests: `node --test packages/core/test/flow.test.ts … packages/cli/test/flow-*.test.ts`.
- **Code** (`../package.json:10`): The test:packages and typecheck:packages scripts exist, and the baseline is 282 pass, 15 skipped. The subset command runs 84 tests (83 pass, 1 skipped). It leaves out packages/ask-user/test/shim.test.ts, which holds the set_outcome tests (shim.test.ts:201, 216).
- **Do:** Add packages/ask-user/test/shim.test.ts to the flow-only command.

**H-28 · How many live tests pnpm test:live runs** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Testing The Run Flow CLI — 2. Live test): `pnpm test:live` runs it together with the other twelve live tests, and `FLOWBOARD_OPENCODE_MODEL=providerID/modelID` picks another judge model.
- **Code** (`adapters/test/opencode-live.test.ts:17`): Of the 15 live tests, 2 also need FLOWBOARD_LIVE_SLOW (ask-live.test.ts:16), and 3 OpenCode adapter tests skip unless FLOWBOARD_OPENCODE_MODEL is set. Plain `pnpm test:live` therefore runs the flow test with 9 others; it is twelve only when FLOWBOARD_OPENCODE_MODEL is set.
- **Do:** Say “with nine others, or twelve when FLOWBOARD_OPENCODE_MODEL is set”, and note that this variable also enables the OpenCode adapter tests.

**H-32 · Where the note sits in the rework prompt** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Testing The Run Flow CLI — Agent scenarios #14): Plan runs again as attempt 2, and that run's prompt ends with *A person's note for this attempt: <your note>* (see *Reading a run*).
- **Code** (`cli/src/flow-exec.ts:228`): The note ends the preamble, which renderPrompt puts first; Read these first, Write your output to, plan.md and the closing follow it. Rendering review.yaml's plan step confirmed this. The guide's own jq command reads `.config.prompt.preamble`, which does end with the note.
- **On record:** Execution #21: “Into the next run's preamble”
- **Do:** Write “that run's preamble ends with …”, which matches the jq command.

**I-07 · What guards cover** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues, Safety and leftovers (row 4); Run Flow Review Loop, Things to get right): "Guards cover file-editing tools only." / "Guards cover the agent's file edits, not its shell commands."
- **Code** (`core/src/guard.ts:41`): checkToolCall applies write_roots and deny_paths only to Write, Edit, MultiEdit and NotebookEdit. It also checks every Bash command against deny_commands (the PRD §7 defaults plus the step's own), so only the path rules skip shell commands.
- **Do:** Write "path guards (write_roots, deny_paths) cover file-editing tools only; shell commands meet only the deny_commands patterns".

**I-17 · Where the plan's left-out scope is listed** · doc inaccurate · low · corrected by the skeptic
- **As corrected:** The deferred note says the scope the plan left out is listed at the end of the reference. The reference's closing line (line 249) names only 7 of the plan's 17 Left out items: the worker and queue, dynamic fan-out and worktrees, routing on labels, a budget for the whole flow, prompt placeholders, scanning hand-offs, and stopping agents after a crash. Seven more appear in no run-flow doc at all: parking and the 20-minute hold, declare_artifact, a JSON outcome fallback, memory, capability-gap warnings, a Mermaid overlay of a run's route, and the agent: file key. The other three are covered elsewhere, not at the end of the reference. No automatic infra retry is stated as a rule in the reference (lines 145 and 247) and listed as missing in the readiness note (line 113). Cancel is in the rules table. Untracked files are in Safety and a deferred row. Copy the plan's whole Left out list to the end of the reference, or point the deferred note at the plan.
- **Doc** (Run Flow Deferred Issues, introduction): "The scope the plan left out (the worker, dynamic fan-out, routing on labels and the rest) is listed at the end of the reference, not here."
- **Code** (none): The reference's closing line lists 7 of the plan's 17 Left out items. Parking and the 20-minute hold, automatic infra retry backoff, declare_artifact, a JSON outcome fallback, memory, capability-gap warnings, a Mermaid run overlay and the agent: key appear in neither run-flow doc.
- **On record:** The plan's Left out list
- **Do:** Copy the plan's whole Left out list to the end of Run Flow Reference, or point the deferred note at the plan.

**I-18 · Cited design review file** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues, Rough edges (last row)): The plan's Left out list and its Two hosts decision, and "landmine #1 and the Deferred table in docs/superpowers/plans/2026-10-19-run-flow-orchestration-review.md", still say the adapters expose no pids.
- **Code** (`core/src/ports/agent-provider.ts:186`): All four places still say so, although AgentRun.pid exists. The review file is untracked in the main checkout and on no branch, so the path leads nowhere from the branch or after a merge.
- **Do:** Commit the review next to the plan, or say where it lives.

**I-21 · Where the set_outcome reason shows** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Review Loop, Things to get right): "The one-line reason given with set_outcome shows only in the terminal and in state.json. The implementer reads only the reviewer's outputs."
- **Code** (`cli/src/flow-run.ts:390`): The reason is also kept in <NNN>-review.outcome.json (ask-user/src/server.ts:130) and in the run log's tool_use event. The run-end line omits it, so without a gate the terminal shows it only inside the agent's tool_use line, cut at 160 characters (cli/src/run.ts:95). Rework passes only produces, so the implementer never sees it.
- **Do:** Say the reason is kept in state.json, the run's outcome file and its log, and appears in the terminal only at a gate or in the truncated tool_use line.

**I-25 · Placeholder files for --check** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Monitor Readiness, The Monitor's flow as a run-flow file): "p.md, task.md and the folder proj stand in for real prompts, a task and a project; --check only needs them to exist."
- **Code** (`cli/src/flow-config.ts:131`): An empty prompt file is an error ('steps.research.prompt: file is empty', once per step, exit 2), and so is an empty task file (flow-config.ts:92). Placeholders made with touch fail.
- **Do:** Write "--check only needs them to exist and not be empty".

**I-28 · The note's answer to #17: what counts as wasted** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Monitor Readiness, Monitor open questions the engine answers (#17)): Wasted is "Failed runs, runs cut off by Ctrl+C, runs replaced by Retry, and on a send-back every run so far of build and the steps after it … That's the guide's broad definition".
- **Code** (`core/src/flow/engine.ts:118`): failFlow marks the runs it stops live: false with error 'stopped' but does not mark them wasted. In a scratch run, tests' $0.30 stayed unwasted after Fail the flow, although the guide counts "a run you stopped" as wasted.
- **On record:** Plan Task 2, Fail the flow: "every live run gets live = false and error = 'stopped' (not wasted)"
- **Do:** Add that runs stopped by Fail the flow are not wasted, by the plan's choice.

**I-29 · Answering questions from outside the terminal** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Monitor Readiness, Controls from outside the terminal): "Approve, Send back, Retry, Fail and answering work only in the terminal … The engine already takes these decisions as decide events."
- **Code** (`cli/src/flow-exec.ts:206`): Gate decisions are decide events, but answers never reach the engine: each agent run's broker calls the host's Answerer (the terminal, or noTerminal's refusal). A web page that answers questions needs a new Answerer, not decide events.
- **On record:** Left out: parking and the 20-minute hold
- **Do:** Treat answering separately: it needs an Answerer the page can reach, such as the worker broker's park path.

**I-31 · Live cost for OpenCode runs** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run Flow Monitor Readiness, Data the engine doesn't keep yet (Live cost)): "So there's nothing yet for a row's live cost or for burn".
- **Code** (`adapters/src/agent/opencode/normalize.ts:76`): OpenCode's mid-run usage events carry a running costUsd, and run-flow logs every event to the run log (cli/src/run.ts:90). A Monitor reading the run folders could show live dollars for OpenCode runs today; only Claude's usage events lack dollars.
- **Do:** Limit the bullet to Claude runs, as the #38 row already does.

**J-03 · #5 approval and open questions on one step (mis-cited by the plan)** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Plan, Decisions this plan makes, row 'Execution #5, #71'; same row in Run Flow Reference, Rules this command settles): Execution #5, #71: a silent approval step \| Gated once. The approval gate's decision is the outcome.
- **Code** (`cli/src/flow-exec.ts:239`): #5 is about a step with both an approval gate and unanswered questions, not about a silent step. In run-flow, questions are answered live, and any still open are withdrawn (broker.close) when the run ends, before the engine opens the approval gate, so #5 cannot arise. Parking is Left out.
- **On record:** Left out: parking and the 20-minute hold (the terminal answers live)
- **Do:** Cite only #71 on that row in the plan and the Reference. Record #5 as moot in run-flow and open for the worker.

**J-55 · Plan's definition of the entry step** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Plan, Decisions this plan makes: '(Alex) Where routes live' and 'Flow Design #23, Execution #65' rows; Task 2 'First run of a step'): the entry is the step no edge points to ... Exactly one entry step (no route into it).
- **Code** (`core/src/flow/flow.ts:36`): Since commit 148d7a6, when every step has an edge into it, the entry is the step only rework edges point to, so a flow may loop back to its first step. Run Flow Reference states the refined rule; the plan does not.
- **Do:** Bring the plan's two decision rows and Task 2 in line with the Reference's wording.

**J-56 · Plan says the adapters expose no pids** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Plan, Decisions 'Two hosts in one folder' and Left out 'stopping agents orphaned by kill -9'; design review landmine #1 and its Deferred table): A lock whose pid is dead is replaced, with a warning that its agents may still be running: the adapters expose no pids to stop them.
- **Code** (`core/src/ports/agent-provider.ts:186`): AgentRun.pid (a Promise<number>) exists on dev, and both real adapters resolve it; run-flow just does not record pids in state.json (cli/src/flow-run.ts:182). Run Flow Deferred Issues already flags this as the plan's wrong fact.
- **Do:** Correct the plan and the review: the pids exist, and what is deferred is recording them in state.json.

**K-60 · Plan: the entry is the step no edge points to** · doc inaccurate · low · confirmed by the skeptic
- **Doc** (Run-flow plan — Decisions ('Where routes live'; 'Flow Design #23, Execution #65') and Task 2; Analysis §6.2 is_entry row): 'the entry is the step no edge points to'; 'Exactly one entry step (no route into it)'; Task 2: 'start begins the entry step (the step no route points to)'.
- **Code** (`core/src/flow/flow.ts:36`): When every step has a route into it, entries falls back to the steps that only rework routes point to. So impl → review with review → impl on_fail is valid and starts at impl (commit 148d7a6, tested at flow.test.ts:55). Analysis §6.2's is_entry row, 'The step no route points to', has the same gap.
- **On record:** (Alex) Where routes live; Flow Design #23, Execution #65
- **Do:** Update the plan's two rows and Task 2 to the rule Run Flow Reference states.

## Undocumented behaviour

**E-04 · A failing step that declares no produces** · undocumented · high · confirmed by the skeptic
- **Doc** (Rework Loop — What the new run gets; Loop Guard And Escalation — When it escalates): The rework sees "the raw check_output or review"; feature map: "the error output goes to the next attempt word for word". The gate shows "the failing step's last artifact (the error log or review)".
- **Code** (`cli/src/flow-exec.ts:108`): Only the failing step's produces reach the rework run and the escalation gate (engine.ts:81, :91). execShell saves its output only to produces[0], never to the run log or the terminal. So a check without produces loses its output and its rework runs blind, and --check warns about neither (flow-config.ts:109, :139). The Reference's At a glance review step has no produces, so its review→implement loop passes nothing.
- **Do:** Always keep a shell step's output (in its run log, or a default artifact passed to the rework), and have --check warn when a step with an on_fail route declares no produces. Give the Reference example's review step a produces.

**F-04 · Output of a shell step that is stopped or times out** · undocumented · medium · confirmed by the skeptic
- **Doc** (Shell Step Execution, Gaps (Timeouts); Run Flow Reference, Step fields (timeout_minutes)): Reference: "A run that lasts longer is stopped, and waits at a *run failed* gate." Neither doc says the output is lost.
- **Code** (`cli/src/flow-exec.ts:107`): over() returns error 'stopped' before writing the tail, so a hung check leaves no artifact and its gate has evidence []. A scratch step that printed `partial-output` and then timed out left the artifacts folder empty. Its log's result line says error "stopped" while state.json says "timed out after 0.005 minutes".
- **Do:** Write the captured tail before finishing a stopped shell run, so the run_failed gate shows where the check hung. Log the timeout as the reason instead of "stopped".

**G-04 · Refusing a second host while a flow works in the folder** · undocumented · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Safety): Another run-flow refuses with "flow.yaml: folder: another run-flow (pid 4242) is working here on runs/…". Uncommitted changes refuse with "commit or stash them first, or pass --allow-dirty".
- **Code** (`cli/src/flow-run.ts:93`): The git check (91-102) runs before takeLock (112), in the order plan Task 9 gives. A step had edited a tracked file, and a second `run-flow other.yaml` in the same folder printed "folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty"; only with --allow-dirty did it name the live run-flow. Stashing as advised pulls the running agents' edits out from under them.
- **Do:** Check the lock (or read a live lock) before the uncommitted-changes check, so a second host is refused as another run-flow rather than told to stash.

**G-05 · The concurrency cap across --resume** · undocumented · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Commands; Plan — Decisions 7.5): "--max-runs <n>: At most n runs at once; with 1, parallel branches take turns." 7.5: "--max-runs 1 runs branches one at a time".
- **Code** (`cli/src/flow-run.ts:472`): --resume takes the cap from its own arguments (72), flow.json does not record it (135), and the printed hint is `pnpm run-flow --resume <run folder>` without --max-runs. A flow started with --max-runs 1, stopped with SIGINT and resumed from the hint ran a and b together (order.log: start-a, start-b, end-a, end-b).
- **On record:** 7.5: "One folder. write_roots narrows a step's file edits, and --max-runs 1 runs branches one at a time"
- **Do:** Pin maxRuns in flow.json and use it on --resume unless it is given again (or add --max-runs to the hint). Say which in Run Flow Reference.

**G-10 · Surviving a check that deletes the run folder** · undocumented · medium · corrected by the skeptic
- **As corrected:** When a check (or anything else) deletes a run folder that sits inside `folder`, save() re-creates it and keeps writing state.json, so the flow keeps running as the Reference says. But flow.json is written only once at start, and the earlier run logs and flow.jsonl lines are gone. If the flow then pauses at a gate or is stopped, it prints a `--resume` hint that cannot work: `--resume` refuses with `cannot resume: no flow.json`, and the flow must be rerun from scratch, re-spending its agent steps. No doc says a flow loses resumability this way. When save() has to re-create the folder, rewrite flow.json from memory, or state the limit in Run Flow Reference. This is undocumented behaviour of medium severity: an edge case with real loss, not wording.
- **Doc** (Run Flow Reference — Safety): "When runs/ sits inside folder … If a check deletes it, it is made again before the next save."
- **Code** (`cli/src/flow-run.ts:336`): save() re-creates the folder and writes state.json, but flow.json is written only once, at start (135), and the earlier run logs are gone with the folder. The flow keeps running, but any later --resume refuses with "cannot resume: no flow.json" (241).
- **On record:** "the host re-creates the folder before each state write, so a check running git clean -fdx cannot crash it"
- **Do:** When save() has to re-create the folder, write flow.json again from memory, or say in the Reference that such a flow can no longer be resumed.

**H-07 · Where a shell step's output goes** · undocumented · medium · confirmed by the skeptic
- **Doc** (Run Flow Reference — Shell steps): It writes at most one artifact (`produces: [check_output]`): the last 20,000 characters of its output, stdout and stderr in order of arrival.
- **Code** (`cli/src/flow-exec.ts:80`): Output only goes into `tail`. It is never shown in the terminal, and the run log has just a start line and a result line (exit code, outcome). A shell step without `produces` keeps its output nowhere, so a failing check leaves no record of why.
- **On record:** Global Constraints: “The last 20 000 characters go to the step's artifact.”
- **Do:** Say that shell output is neither printed nor logged, and that `produces` is the only way to keep it. Consider adding the tail to the result log line.

**I-02 · Reject note dropped when the rework target's attempts are spent** · undocumented · medium · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues, Needs a decision; also Run Flow Review Loop, Variations, and Run Flow Monitor Readiness, What already matches): The deferred row names only Approve and Reject over a forward edge. The Review Loop says Reject sends the work back "with your note in the implementer's next prompt", and the readiness note says "The note typed at Reject goes into the prompt of build's next run".
- **Code** (`core/src/flow/engine.ts:92`): Once used+1 > max_attempts, rework() opens an escalation gate instead of calling redo(), and the note is neither stored on the gate nor passed on. Scratch script (implement max_attempts 2, review gate: approval): the second Reject with a note gave only 'gate:implement:escalation (implement has used 2 of 2 attempts)', and no run received the note.
- **On record:** Execution #21: where a note goes \| Into the next run's preamble; Execution #14, #16: a spent loop \| Escalate
- **Do:** Add the spent-loop case to the Needs a decision row and qualify the Review Loop variation and the readiness bullet. Alternatively, carry the Reject note onto the escalation gate so Retry uses it when no new note is typed.

**I-03 · Output of a shell step without produces** · undocumented · medium · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues (no row for it); Run Flow Reference, Shell steps): The deferred list names no loss of check output. The reference says a shell step "writes at most one artifact (produces: [check_output]): the last 20,000 characters of its output".
- **Code** (`cli/src/flow-exec.ts:108`): The output tail is saved only when produces[0] is set. The run log's result line holds only exitCode, outcome and fingerprint, and the terminal never shows check output. A scratch failing check with no produces left its output nowhere under runs/ or proj/, and a rework from such a check passes its target no failure output.
- **Do:** List it in the deferred note and the reference. Have --check warn about a shell step with a conditional edge but no produces, or log the output tail in the result line.

**K-M01 · A failing step that produces nothing sends its rework target back blind; Run Flow Reference's headline example wires one** · undocumented · medium · found by the skeptic, not separately verified
- **Doc** (Run Flow Reference — At a glance, and Loops ('What rework does'); Multi-Agent Orchestration Analysis §6.1, §4.2): Run Flow Reference: rework 'reruns the target with the failing step's artifacts added to its inputs'. Its At a glance example has `review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], max_attempts: 2 }` with no produces, plus `{ from: review, to: implement, condition: on_fail }`. Analysis §6.1 gives review `produces: [review]`.
- **Code** (`core/src/flow/engine.ts:81`): redo() starts the target with inputs = target.requires + the failing step's produces. The failing run's set_outcome reason, which OUTCOME_CLOSING asks for, stays on its RunRecord and is not passed on: a note reaches the next run only from a person's Reject. Scratch engine on the example's shape: review failing with reason 'no tests for the error path' emitted {run 5, implement, attempt 2, inputs: ['plan']}, with no note, and --check on the same file printed '-- flow ok: 5 steps' with no warning.
- **On record:** None on the agent's reason. Execution #21 sends only a person's note into the next run's preamble; Flow Design #22: 'Rework inputs are implicit'
- **Do:** Give review `produces: [review_notes]` in Run Flow Reference's At a glance example and in the DELIVERY fixture, as Run Flow Review Loop does. Say in Run Flow Reference that the agent's reason is not passed to the rework run. Either carry the failing run's reason into the rework run's preamble, or have --check warn about a rework route from a step with no produces, the ai-step twin of K-25.

**C-27 · An agent step's timeout counts time spent waiting for a person's answer** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Step fields (timeout_minutes); Run Config Reference — Asking the owner): Run Config Reference: "The run waits as long as you take; waiting spends no quota or credit." Run Flow Reference: "A run that lasts longer is stopped, and waits at a run failed gate."
- **Code** (`cli/src/flow-run.ts:377`): The timer starts at launch and never pauses. An agent step with `timeout_minutes` that asks through ask_user is stopped as timed out if the person answers late, and that run is lost.
- **Do:** Say in the reference that time spent on a question counts toward timeout_minutes, or pause the timer while a question is open.

**E-05 · An earlier round's artifact reaches a rework and its gate** · undocumented · low · confirmed by the skeptic
- **Doc** (Rework Loop — What the new run gets): The new run "also gets the artifacts the failing step produced".
- **Code** (`cli/src/flow-exec.ts:221`): Inputs and gate evidence are filtered by whether the file exists, not when it was written (flow-exec.ts:221, flow-run.ts:310). If the failing step did not write its output this round (a did-not-write gate, then Reject), the rework target reads the previous round's file as the failing step's artifact.
- **Do:** Pass an input only when its file was written after the producing step's latest run started, or remove a reset step's outputs on rework, and state the rule in the Reference.

**E-13 · A note for a run that is a shell step** · undocumented · low · confirmed by the skeptic
- **Doc** (Loop Guard And Escalation — When it escalates): "Retry grants one more attempt and carries my note into it, like a rejection reason."
- **Code** (`cli/src/flow-exec.ts:60`): execShell never reads run.note; it only logs it. A note typed at a gate whose rerun is a shell step is dropped, though the gate asks "Note for the next attempt (optional)". Testing The Run Flow CLI scenario 5 asks for a note in exactly this case: in stuck.yaml, fix is a shell step.
- **Do:** Skip the note question when the run it starts is a shell step, or pass the note as an environment variable, and add this case to the Deferred Issues note row.

**F-25 · Which agent steps are offered set_outcome** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Reference, Step fields (closing line); How a step's outcome is decided): The closing gains the set_outcome line only "When an `on_pass` or `on_fail` edge leaves the step"; "A step with only `always` edges needs none."
- **Code** (`cli/src/flow-exec.ts:216`): Every agent run gets FLOWBOARD_OUTCOME_FILE, so set_outcome is offered on every agent step, and its description says "Call it once before you stop". A verdict reported unasked is still acted on: on a step with no outgoing edges, a `fail` opens the `failed, and no edge handles a failure` gate (engine.ts:102-104), so a final summarizer that judges the work can hold up a finished flow.
- **Do:** Offer the tool only to steps whose routes or approval gate use the verdict, or document that any agent step may report one and what a fail does on a last step.

**F-37 · A note given for a shell step's next run** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Reference, Gates and their choices): "A note goes into the prompt of the next run it starts: *A person's note for this attempt: <note>*."
- **Code** (`cli/src/flow-exec.ts:60`): A gate on a shell step (run failed, or no edge handles a failure) still asks "Note for the next attempt (optional)", and the engine passes the note on Retry. execShell ignores run.note, so the note reaches no one and nothing says so; Run Flow Deferred Issues lists dropped notes only for Approve and forward Reject.
- **Do:** Skip the note question at a shell step's gate, or add this case to the Deferred Issues entry on dropped notes.

**G-11 · Queued runs when the flow stops** · undocumented · low · confirmed by the skeptic
- **Doc** (Execution Surfaces — How each state reads (queued); Job Queue — The concurrency cap): Queued means "ready, no free worker", inferred as "a pending instance with a queued start_run job".
- **Code** (`cli/src/flow-run.ts:410`): The engine records a run as live, and its step as running, as soon as it emits the run command, before the host launches it; on a stop, stopAll feeds never-launched runs as interrupted. With --max-runs 1 and SIGTERM during branch a, state.json recorded run 3 (b) as wasted with error "interrupted" and no 003-b.jsonl, and the summary said "3 runs".
- **Do:** Drop never-launched runs on a stop, or record them as queued rather than as wasted runs, so the run count and the wasted runs mean launched runs.

**H-17 · Queued runs when the flow stops** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Stopping and resuming; Files written): A run that was cut off counts as wasted. `…/<NNN>-<step>.jsonl`: one log per run.
- **Code** (`cli/src/flow-run.ts:410`): stopAll records every queued, never-launched run as an interrupted run (flow-run.ts:405-410). It becomes a wasted run in state.json with no log file, and the summary counts it. With --max-runs 1 and two branches, Ctrl+C printed `-- flow stopped: 3 runs` after only 2 launches, and there is no 003-y.jsonl.
- **On record:** Execution #17: “Also interrupted runs, infra-failed runs, and a run replaced by a gate Retry”
- **Do:** Say that runs waiting for a --max-runs slot are recorded as interrupted runs without a log, or leave them out of the run list.

**H-20 · Lock removed by a cleaning check** · undocumented · low · corrected by the skeptic
- **As corrected:** The folder lock is written once at start and removed unconditionally when the host ends (flow-run.ts:112, 146-148). That a check or an agent's rm can delete <folder>/.flowboard/, lock included, is already recorded in Run Flow Deferred Issues (Safety and leftovers). No doc records the consequence. With the lock gone, a second run-flow is let into the same folder. When the first host ends, its cleanup deletes the second host's lock, so a third run-flow would also be let in. A scratch run showed both steps. Name the consequence in that Deferred Issues row or under the Reference's Safety section. A cheap fix is to remove the lock only when it still holds this host's pid.
- **Doc** (Run Flow Reference — Safety (One run-flow per folder)): `<folder>/.flowboard/lock` holds the running host's process id. Another run-flow refuses.
- **Code** (`cli/src/flow-run.ts:111`): From the code: the lock is an untracked file inside folder, written once at start and never checked again. A check that runs `git clean -fdx` deletes it, along with the artifacts folder. A second run-flow can then take the folder, and when the first host finishes, its finally block deletes the second host's lock.
- **On record:** Two hosts in one folder: “Refused, by <folder>/.flowboard/lock.”
- **Do:** Note this gap under Safety, or take the lock again before each launch.

**H-22 · How a timeout is recorded** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Reference — Step fields (timeout_minutes); Files written): A run that lasts longer is stopped and waits at a run failed gate. The per-run log ends with the result.
- **Code** (`cli/src/flow-run.ts:389`): The terminal and state.json say `timed out after 0.1 minutes`. The step's own log records the result as `"error":"stopped"`, with exitCode null (flow-exec.ts:107), as 001-wait.jsonl of the timeout run shows.
- **On record:** A step that hangs: “A timeout is an infra failure, so it opens a run_failed gate”
- **Do:** Pass the timeout reason to stop() so the run log says it timed out, or note the difference in the docs.

**I-05 · Checks orphaned by kill -9** · undocumented · low · confirmed by the skeptic
- **Doc** (Run Flow Deferred Issues, Safety and leftovers (row 1)): "Agents left running after kill -9, or after run-flow itself crashes, are not stopped"; the proposed fix records live runs' pids in state.json.
- **Code** (`cli/src/flow-exec.ts:76`): Shell steps are spawned detached, in their own process group, and their timeout timer lives in the host (flow-run.ts:377). After kill -9, a quiet check (a sleep or a server) keeps running with no timeout. Recording agents' pids would not reach it.
- **On record:** Left out: "stopping agents orphaned by kill -9"
- **Do:** Name checks in the row, and record each live check's process group id next to the agents' pids.

## Design notes now out of date

Code that differs from these notes because of a recorded decision, grouped by the note the finding cites first. The note is what should change.

**[[Advancement Rules]]**
- D-06 · Approval steps wait; a silent one is gated once: An approval step's run always opens a verdict gate, 'approval needed' plus the agent's verdict if it gave one (engine.ts:147-150), so rule 1 holds. Approve completes it with pass (engine.ts:163), so a silent approval step never gets a second 'no outcome reported' gate. *On record:* Execution #5, #71: 'Gated once. The approval gate's decision is the outcome'

**[[Agent Launch Contract]]**
- F-12 · The RunSpec run-flow launches, and how it reaches the CLI: Each agent run gets run-agent's spec (model, effort, permission mode, system prompt, plugins and skills, limits, cwd = folder), plus structured inputs and outputs, the flowboard shim with FLOWBOARD_ASK_SOCKET and FLOWBOARD_OUTCOME_FILE, Claude's AskUserQuestion denied (run.ts:44), and writeRoots plus the artifacts folder. exec is left unset, so both adapters spawn on the host, and both always all… *On record:* Claude Code Adapter note: `tools` → `mcpServers` with `strictMcpConfig: true`; guards → "an in-process `PreToolUse` hook"
- F-17 · Capability checks and fallbacks: Nothing in cli/src or core/src/flow reads provider.capabilities. Every agent step gets the MCP shim, and set_outcome has no file fallback. Both selectable adapters declare all eleven capabilities, and Replay, which lacks mcp_tools, cannot be selected (config.ts:36). *On record:* "7.4 … There are no capability-gap warnings, because both providers declare the same capability set today"; Left out: "capability-gap warnings", "a JSON outcome fallback"

**[[Approval Gates]]**
- C-17 · Reject on a step with no on_fail route: `openGate` leaves `reject` out of the choices when the step has no on_fail route, so the person gets Approve, Retry and Fail the flow, and a decision the gate did not offer is ignored (engine.ts:162). *On record:* "Reject with no on_fail route (PRD: 'fails the task') \| Not offered: a gate lists Reject only when its step has an on_fail route"

**[[Artifact Contract]]**
- A-12 · Ancestry for requires, and rework inputs: A step's ancestors are the other steps that reach it along forward routes; rework routes never count, so implement cannot require the review whose only route to it is the send-back. On rework the engine adds the failing step's produces to the target's inputs without a requires entry (engine.ts:81). *On record:* Flow Design #22: 'No. Rework inputs are implicit'
- A-13 · Type keys versus file names, and where an artifact is written: requires and produces hold type keys matching /^[a-z0-9][a-z0-9_-]*$/, so file names are not allowed. Each type is the file `<folder>/.flowboard/<run folder name>/<type>.md`: always .md, with no NN- prefix, a check's output included. *On record:* Flow Design #24, #25: 'Type keys, each saved as <type>.md. Names cannot contain a dot today'

**[[Branching Joining And Loops]]**
- A-32 · The join rule and when a flow is done: A pending step waits for the source of each forward (non-rework) route into it, while that source is live or downstream of a live step. So a forward on_fail route does make a join, and a route that can no longer fire stops blocking. The flow ends done when no instance is pending, running or waiting for a decision, so nothing is left stranded. *On record:* Execution #4: 'Rework routes never make a join'; Flow Design #19: 'The join runs once nothing can still feed it'
- A-34 · The rules a designer sets up with a rework loop: As designed: attempts sit on the target and every loop into it shares them, the first run is attempt 1, a spent or stuck loop opens an escalation gate, and the target also reads the failing step's outputs. Downstream instances are deleted, not marked skipped, and are recreated at attempt 1 when the work reaches them again. *On record:* Execution #17, #18: 'Reset. Downstream instances are recreated, and only the target's count carries'

**[[Check Steps]]**
- C-22 · Where a check runs: The command runs in the flow's one `folder`, not a worktree. It is spawned directly with `detached: true`, so a stop kills its whole process group, rather than through ExecHost; a `ponytail:` comment marks the way back. *On record:* Review landmine #3: shell steps "no longer go through ExecHost ...; a ponytail: comment marks the way back"; 7.5: "One folder"
- C-25 · A check's environment: no credentials; FLOWBOARD_ARTIFACTS: A shell step gets the host environment without names ending in _KEY, _TOKEN, _SECRET or _PASSWORD (any case), printed at start as `-- shell steps run without: …`. It also gets `FLOWBOARD_ARTIFACTS` (so it can read earlier outputs that `requires` cannot hand it) and stdin from /dev/null. Credentials under other names stay reachable: SSH_AUTH_SOCK, a DATABASE_URL with a password, files such as ~/.n… *On record:* "Secrets and shell steps \| Variables named *_KEY, *_TOKEN, *_SECRET or *_PASSWORD are removed ... the sandbox is the real fix"

**[[Connections And Routes]]**
- A-30 · A failure with no on_fail route: Reject is offered only when the step has an on_fail route. A fail with no always or on_fail route (including a final check that exits 1) waits at a verdict gate, 'failed, and no edge handles a failure', offering Approve, Retry and Fail the flow; a pass that fires nothing ends its branch. *On record:* 'Reject with no on_fail route: Not offered'; (Alex) 'a fail that fires no route: Waits at a verdict gate'
- A-31 · Edge shape, identity and endpoints: An edge is a strict { from, to, condition } with no id. An unknown step, a second edge between the same pair, START/END, and a list in from/to are all errors, so from→to identifies the edge. Problems still point at an edge by its array index (FlowProblem.edge, printed as edges.<i>). *On record:* (Alex) 'At most one edge goes from one step to another, so from and to identify it ... There is no START or END'
- A-38 · Drawing a flow (toMermaid): --mermaid prints a flowchart LR: approval steps read '<step> (approval)', always draws as -->, on_pass as -->\|pass\|, a forward on_fail as a solid -->\|fail\|, and a rework route as a dotted -.->\|fail ↺\|. Shell and agent steps look alike, requires/produces are not drawn, and an invalid flow gets its errors and exit 2 instead of a drawing. *On record:* Task 5: 'A forward on_fail route draws as -->\|fail\|'; Left out: 'a Mermaid overlay of a run's route'

**[[Execution Glossary]]**
- D-34 · Retry: its meanings: Nothing retries by itself. A person's Retry reruns the same attempt at a run_failed gate (engine.ts:166) and grants one attempt past the budget at an escalation (167); at a verdict gate it starts the next attempt and marks the old run wasted, even past max_attempts (169-171). A later rework then escalates at once, with a reason such as 'impl has used 2 of 1 attempts' (scratch more.ts case 2). *On record:* New: infra failures: 'Not retried automatically ... Retry keeps the attempt number'; Execution #14, #16: 'Retry does not reset the count'

**[[Execution Index]]**
- J-67 · Index: the engine only sees work outcomes; the runner retries crashes: The engine's RunEnd carries error, missing and interrupted as well as the outcome, and advance opens a run_failed gate for any error. Nothing retries automatically; 'doesn't use up a try' still holds, because Retry keeps the attempt. *On record:* New: infra failures \| Not retried automatically. They wait at a gate; Left out: automatic infra retry backoff

**[[Execution Open Questions]]**
- J-02 · #4 rework target is not a join; forward on_fail routes still join: The settle loop waits only on forward (non-rework) routes, so rework routes never make a join, but a forward on_fail route does. Probed with a->b, a->c, c->d, b->d on_fail: d waits while b runs. validateFlow only warns about it. *On record:* Execution #4: A step waits for each step with a forward route into it ... Rework routes never make a join
- J-05 · #7 which source carries the outcome: The verdict set_outcome wrote to the outcome file wins, then the provider's RunResult.outcome, then none. No produced JSON is read for an outcome. *On record:* Execution #7: The set_outcome file, then RunResult.outcome, then none; Left out: a JSON outcome fallback
- J-06 · #8 where set_outcome's reason goes: The agent's reason is kept on the run record (RunRecord.reason), not on the instance, and is quoted in approval and unhandled-fail gate reasons; it never reaches the next step's prompt. A person's reject or retry text is a separate StepInstance.note. *On record:* Task 2 interfaces: RunRecord.reason, StepInstance.note; Global Constraints gate reasons
- J-07 · #9 how an 'earlier' step is decided: An on_fail edge is rework when its source is the target itself or can be reached from the target along always/on_pass edges. Every other edge is forward, and validateFlow refuses forward loops. *On record:* Execution #9: An on_fail route to its own step, or to an ancestor along always/on_pass routes, is a rework route
- J-08 · #10 task done rule: A pending step starts as soon as no live step is, or can reach, one of its forward upstreams, so no pending instance is left behind; done means nothing is pending, running or awaiting_approval. In Task Completion's stranding example, join C runs without A's route and the flow ends done (probed), while the proposal resolves the task without running C. *On record:* Flow Design #19: The join runs once nothing can still feed it, and --check warns about it
- J-10 · #12 instance states after Reject, Fail task and infra failure: As proposed, Reject leaves the step done with outcome fail and fires its on_fail route, and Fail the flow marks every pending, running or awaiting_approval instance failed (a failed instance keeps its last gate object). An infra failure leaves the instance awaiting_approval at a run_failed gate, not the proposed failed. *On record:* New: infra failures \| Not retried automatically. They wait at a gate: Retry keeps the attempt number, Fail ends the flow
- J-15 · #17 which runs are wasted on rework: On rework, every run so far of the target and of every step downstream of it is wasted, the failing run included; a parallel sibling that is not downstream (tests in the Monitor flow) is not (probed). Interrupted, infra-failed and verdict-retried runs are wasted too; runs stopped by Fail the flow are not. *On record:* Execution #17: every run so far of the target and of every step downstream of it, including the failing run. Also interrupted runs, infra-failed runs, and a run replaced by a gate Retry
- J-17 · #19 stripping digits versus fewer failing tests: Digits are still removed, so outputs that differ only in counts ('Tests: 3 failed' vs 'Tests: 2 failed') get the same fingerprint (probed) and escalate as stuck. Only failing test names within the last 20 non-empty lines show progress. *On record:* Execution #19: Keep the PRD algorithm, with one change: an absolute path shrinks to its file name
- J-22 · #26 what Retry does after a non-transient failure: Retry at a run_failed gate reruns the same attempt with the same inputs and the new note. It uses up no attempt, and the failed run is marked wasted. *On record:* New: infra failures \| They wait at a gate: Retry keeps the attempt number
- J-23 · #27 a stopped run: cancelled or failed: There is no per-run Stop. A run cut off by Ctrl+C is recorded with error 'interrupted' and marked wasted, and its step stays running for --resume. Runs stopped by Fail the flow get 'stopped' (not wasted); runs stopped by a rework get 'superseded' (wasted). *On record:* Execution #49, #50: There is no cancel: Ctrl+C pauses (resumable)
- J-24 · #28 what the engine does after a Stop: After Ctrl+C the instance stays running, with no gate, and --resume reruns it at the same attempt; nothing reruns it by itself. A run that ends with an error while still live (a timeout) gets a run_failed gate, which is close to the proposal. *On record:* Execution #49, #50: Ctrl+C pauses (resumable); Task 3 resume rule
- J-25 · #29 Pause: The only pause is Ctrl+C (or SIGTERM or SIGHUP). It stops every live run mid-flight, marks them wasted and exits 130 for --resume; nothing lets the current run finish while starting nothing new. A gate no one can answer also pauses the flow (exit 3). *On record:* Execution #49, #50: Ctrl+C pauses (resumable)
- J-26 · #30 restart: fail with a hint, or retry: The resume event marks runs still flagged live as interrupted and wasted, then reruns each running step at the same attempt, so a crashed host's work is retried, not failed. The retry is not automatic: a person runs --resume. *On record:* Task 3 resume rule; Execution #49, #50: Ctrl+C pauses (resumable)
- J-28 · #32 graceful shutdown and re-queue: SIGTERM and SIGHUP stop the flow as Ctrl+C does. Every live or queued run is fed as interrupted (wasted, not cancelled), the state is saved, and the host exits 130; --resume reruns those runs at the same attempt. *On record:* Task 11 rule 1: Ctrl+C, SIGTERM and SIGHUP behave like run-agent's; Task 3 resume
- J-29 · #36 run cap default and shell slots: The cap is the --max-runs flag, per flow and unlimited by default. Shell runs, and agents waiting on a question, each hold a slot. *On record:* 7.5: --max-runs 1 runs branches one at a time; Task 9: There is no limit by default
- J-30 · #38 args.json or spec.json: Neither file exists. Each run's full RunSpec is the start line of runs/<stamp>-<flow>/<NNN>-<step>.jsonl (a shell run logs its command), its events follow in the same log, and flow.json pins the flow. *On record:* Global Constraints, Files: flow.json, state.json, flow.jsonl, <NNN>-<step>.jsonl, <NNN>-<step>.outcome.json
- J-31 · #39 where per-run mcp.json and settings.json are written: No such files are written. The Claude adapter passes MCP servers inline with strictMcpConfig and settingSources: [], and OpenCode uses a temporary config home. run-flow keeps only a per-run /tmp/fb-* socket folder, removed when the run ends (cli/src/flow-exec.ts:204). *On record:* Claude Code Adapter (dev): tools -> mcpServers (stdio) with strictMcpConfig: true; settingSources: []
- J-36 · #46 wasted in an append-only journal: Run records are mutable state: wasted, live, error and a late cost are set after a run ends, and state.json is rewritten on every transition. The append-only record is flow.jsonl, with one {at, event, commands} line per transition. *On record:* Task 3 redo: every run [of t and below] gets wasted = true; Task 9: flow.jsonl, one line per transition
- J-38 · #49 one branch blocked, the other running: A gate stops only its own step: the settle loop keeps starting other branches, and the flow status stays running. The host pauses (exit 3) only when nothing else can run and no terminal can answer. *On record:* Execution #49, #50: A gate on one branch doesn't stop the others
- J-40 · #52 empty --settings file or a hooks file: Neither. Claude runs get settingSources: [] (no user or project settings), and the guards run as an in-process PreToolUse hook through the Agent SDK, with no settings file. run-flow reuses this unchanged. *On record:* Claude Code Adapter (dev): 'This settles Agent Providers Open Questions #24 for the host tier'
- J-41 · #53 bypassPermissions on the host tier: run-agent's checks, which every run-flow ai step goes through, refuse bypassPermissions or auto unless permissions.allow_unrestricted_shell: true. run-flow then prints '-- warning: <step>: unrestricted shell' at start. *On record:* Run Agent CLI Decisions R3, R4 (dev)
- J-43 · #55 would a stopped run be retried automatically: Nothing reruns a stopped run by itself. Runs stopped by Ctrl+C or SIGTERM are fed as interrupted, whatever their exit code, and rerun only on --resume; a timed-out run waits at a run_failed gate. *On record:* New: infra failures \| Not retried automatically
- J-44 · #57 a failing shell run's run state: A failing check is a completed run with outcome fail and a fingerprint, never an error. Run records have no state field; only a spawn error, a setup error or a timeout makes a shell run an error. *On record:* Task 7: exit 0 is pass, anything else is fail; a spawn error ends with error
- J-45 · #58 finding a check's previous failed run: The lookup searches the flow's flat run list by step name, so it crosses rework rounds. It compares with the latest earlier failed run that has a fingerprint, skipping quiet failures. *On record:* Execution #58, #67: escalates (PRD wording), across instances
- J-47 · #64 approving over an agent's fail: At every verdict gate, Approve completes the step with pass and Reject with fail, whatever the agent reported. An engine test pins Approve over an agent's fail. *On record:* Execution #64: The person wins: approve sets pass, reject sets fail
- J-48 · #65 how many entry steps: validateFlow requires exactly one entry and one producer per type, but the entry is derived rather than flagged: the step no edge points to, else the one only rework edges point to. A flow that loops back to its first step and also has a repair step reached only by rework is refused with 'more than one entry step: impl, fix' (probed). *On record:* Flow Design #23, Execution #65: Exactly one entry step (no route into it), and one producer per artifact type
- J-50 · #67 twice in a row or previous failed run: A check that fails the same way as its previous failure escalates even when a pass came in between. The engine test 'even across a pass' pins it. *On record:* Execution #58, #67: A failing shell run whose fingerprint equals that step's previous failed run escalates (PRD wording)
- J-51 · #68 how a limit or timeout kill is classified: A timeout_minutes stop ends as 'timed out after <n> minutes', and an agent's turn or budget cap as the provider's error. Both wait at a run_failed gate and are never retried automatically, as backlog 3.5 says. run-flow sets no memory, CPU or pid limits, and a shell step killed by a signal is a fail outcome (J-33). *On record:* A step that hangs: timeout_minutes ... A timeout is an infra failure, so it opens a run_failed gate
- J-52 · #71 proving the no-outcome gate: A silent approval step is gated once: the approval gate opens first and its decision is the outcome, so no no-outcome gate follows (probed). The no-outcome gate is proved on a non-approval step with an on_pass edge, in an engine test and in flow-run's 'a gate asks in the terminal' test. *On record:* Execution #5, #71: a silent approval step \| Gated once. The approval gate's decision is the outcome
- J-53 · #72 test runner: Neither. The packages test with node:test and node:assert/strict under Node 24's type stripping (node --test), engine rules and fingerprints included; there is no database path. *On record:* Global Constraints: tests with node:test and node:assert/strict

**[[Execution Overview]]**
- D-30 · Work, not weather: the engine and infra failures: An agent error, a non-zero exit, a limit hit or a timeout becomes RunEnd.error, and any outcome the agent gave is dropped (flow-exec.ts:245-246). Nothing below the engine retries, so the engine itself opens a run_failed gate and marks the run wasted (engine.ts:141-143). Retry at that gate keeps the attempt number (engine.ts:166), so max_attempts still counts only work. *On record:* New: infra failures: 'Not retried automatically. They wait at a gate: Retry keeps the attempt number'

**[[Execution Roadmap]]**
- J-58 · Roadmap milestone order: The M5 engine is built before M3's worker, queue, SSE viewer and database, and before M4's parking. Runs stream to the terminal and to JSONL logs, and costs land in state.json. *On record:* 7.3 CLI or worker first: CLI. The worker, queue and web app are out of scope (analysis §6.6: the PRD's milestone order changes)
- J-60 · Roadmap beyond PRD: Pause a task: Pause exists only as Ctrl+C: it stops runs mid-flight, saves the state and continues with --resume (J-25). There is no pause after the current run. *On record:* Execution #49, #50: Ctrl+C pauses (resumable)
- J-63 · Roadmap beyond PRD: graceful shutdown to cancelled: Built differently: SIGTERM and SIGHUP stop the flow as Ctrl+C does, recording runs as interrupted and wasted (not cancelled) for --resume (J-28). *On record:* Task 11 rule 1: Ctrl+C, SIGTERM and SIGHUP behave like run-agent's
- J-66 · Roadmap out of scope: every model call through the claude CLI: Claude steps still go through the installed claude CLI (via the Agent SDK). But any step may name adapter: opencode, and its model calls then go through OpenCode and OpenRouter. *On record:* 7.4 Provider per step: Yes: adapter per step, with a flow-level defaults

**[[Execution Runtime]]**
- G-21 · Where processes run (ExecHost): Shell steps call node's spawn('sh', ['-c', …], { detached: true }) directly rather than ExecHost, so stop() can kill the whole process group; a ponytail comment marks the way back. Agent steps still go through the adapters' default host ExecHost. *On record:* Review landmine #3: "They no longer go through ExecHost, the hook a future sandbox would use"

**[[Execution State Machines]]**
- D-19 · Step instance states and transitions: InstanceState has no awaiting_answers or skipped. A rework deletes the downstream instances (engine.ts:79) and creates them again when a route fires; parking is Left out. Verdict and run_failed gates go straight from running to awaiting_approval, so the no-outcome gate never passes through done as Execution State Machines draws it, and an infra failure waits at a run_failed gate instead of going… *On record:* Execution #18: 'Downstream instances are recreated'; New: infra failures 'wait at a gate'; Left out: parking, cancel

**[[Fan-Out And Join]]**
- D-11 · What a join waits for: A pending step waits while any step with a forward route into it is pending, running or at a gate, or can still be reached from one that is (engine.ts:192-194). So it also waits for a branch that has not reached it yet (engine.test.ts:46). Rework routes never hold it, but a forward on_fail route does, unlike the backlog's wording (scratch edges.ts case 11). *On record:* Execution #4: 'A step waits for each step with a forward route into it while that step is live or can still be reached from a live step. Rework routes never make a join'

**[[Flow Definition Internals]]**
- A-28 · The shape of a flow definition, and who consumes it: core's StepDef holds only what the engine reads (id, requires, produces, approval, maxAttempts), and FlowDef adds the edges; kind and every launch setting are in the CLI's FlowConfig.steps. flow.json pins both, prompt text included, and takes the place of the saved flow version. *On record:* Task 1 interfaces; §7.2: 'The engine takes a plain FlowDef. run-flow reads YAML and pins its loaded copy (flow.json)'

**[[Flow Design Controls]]**
- B-16 · Flow-file keys with no field on the canvas: Several run-flow keys have no place in the mockup's step record (id, label, agent, model, effort, budget, gate, needs, produces, x, y, retries, sandbox), so a canvas that rebuilt the file from that record would drop them. Some of them also appear nowhere in the Flow Design Controls list of fields that lack a control. The keys are: a per-step adapter, the flow-level defaults block, write_roots, ti… *On record:* 7.4 adapter per step with a flow-level defaults; 7.5 write_roots; A step that hangs: timeout_minutes
- B-22 · An entry flag per step: The entry step is derived: the step no route points to, or else the one only rework routes point to. `entry:` on a step is `unknown key`. A flow that loops back to its first step and also has a repair step reached only by rework is refused with 'more than one entry step' (Run Flow Deferred Issues). *On record:* Flow Design #23, Execution #65: Exactly one entry step (no route into it)

**[[Flow Design Glossary]]**
- A-07 · Telling a rework route from a forward one: isRework counts an on_fail route as rework when it goes to its own step, or to a step that reaches its source along always/on_pass routes only. A route back whose path to the source passes through a forward on_fail route counts as forward: `build→check, check→report (on_fail), report→build (on_fail)` fails --check with 'no entry step' and 'routes loop without an on_fail route back: build, check,… *On record:* Execution #9: 'An on_fail route to its own step, or to an ancestor along always/on_pass routes, is a rework route'

**[[Flow Design Open Questions]]**
- K-01 · #9 Whether a step names its provider: Every step takes run-agent's `adapter` key (claude-code or opencode), merged over the flow-level `defaults`; the step's own key replaces the default whole. Each step launches its own provider. The key is `adapter`; a `provider:` key is refused as unknown. *On record:* 7.4 Provider per step: 'Yes: adapter per step, with a flow-level defaults.'
- K-08 · #19 Joins behind conditional routes: A pending step starts once no forward upstream is live or reachable from a live step, so a join whose conditional route never fired runs without that input. validateFlow warns about each non-always forward route into a step that has two or more forward routes in (flow.ts:109-117). A forward on_fail route also makes the join wait, unlike Story 5.2's wording. *On record:* Flow Design #19: 'The join runs once nothing can still feed it, and --check warns about it'
- K-11 · #23 One entry step, and one producer per artifact type: Both rules hold: zero entries or several is an error, and so is a second producer of a type (flow.ts:78-100). The entry is derived, with no entry key (an `entry:` key is refused as unknown): it is the step no route points to, or else the steps that only rework routes point to. So a flow with a review loop back to its first step and a repair step reached by rework fails with 'more than one entry s… *On record:* Flow Design #23, Execution #65: 'Exactly one entry step (no route into it), and one producer per artifact type'
- K-12 · #24 Artifact type keys or file names: Types are keys matching /^[a-z0-9][a-z0-9_-]*$/, so a file name such as plan.md is refused at load. Each artifact is saved as <folder>/.flowboard/<run folder>/<type>.md, with no NN- prefix, always as .md, and each attempt overwrites it. *On record:* Flow Design #24, #25: 'Type keys, each saved as <type>.md. Names cannot contain a dot today'
- K-17 · #37 Budget and turn cap on every ai step: Both stay optional. An ai step that has neither limits.max_turns nor limits.budget_usd after the defaults merge gets the warning 'steps.<name>: no limits.max_turns or limits.budget_usd; nothing stops a looping agent', printed by --check and before a run. *On record:* Flow Design #37: 'Optional. --check warns when an ai step has neither'
- K-20 · #1, #2, #4 Where flows live and what identifies a flow, in the flow file format: A flow file must carry folder (where every step works) and task (every step's preamble) beside steps and edges, so one file describes one task's run rather than a reusable recipe. The flow's name is the file's base name, and name, author and version keys are refused as unknown. This divergence from #1, #2 and #4 is recorded: the plan's 7.2 row says 'Decide later' for where flows live, Task 5 fixe… *On record:* 7.2 Where flows live: 'Decide later'; (Alex) Where routes live: 'because the Flow Design canvas will read and write these files'

**[[Flow Design Overview]]**
- A-36 · Provider-agnostic flows: The FlowDef graph names no provider, but each ai step names an adapter and a provider-specific model (OpenCode needs providerID/modelID), so moving a step to another provider means editing both. There are no logical model ids. *On record:* §7.4: 'Provider per step: Yes: adapter per step, with a flow-level defaults'

**[[Flow Design Roadmap]]**
- K-25 · Roadmap: shell check steps (PRD §7): Shell steps run sh -c in folder in their own process group, outside ExecHost (review landmine #3), and exit 0 is pass. The last 20,000 characters of output are written only to produces[0], exactly as plan Task 7 specifies ('if there is one'). The run log keeps the command, exit code, outcome and fingerprint but not the output, and the terminal shows only the verdict line. Both departures from PRD… *On record:* Review landmine #3: shell steps run in their own process group, not through ExecHost; Task 7: 'write the tail to produces[0]'s artifact, if there is one'
- K-28 · Roadmap: the reachability check; #18 an unwired new step: An unwired step has no route into it, so run-flow counts it as a second entry. --check prints one flow-level line, 'steps: more than one entry step: a, new', which names the step but has no step field. The per-step 'no route leads here from the entry step' message appears only for steps a single entry cannot reach, such as a disconnected loop. The plan decided this behaviour ('Exactly one entry s… *On record:* Flow Design #23, Execution #65: 'Exactly one entry step (no route into it)'

**[[Flow Storage]]**
- B-09 · A flow file is self-contained and portable: folder, task, prompt, skills and plugins resolve against the working folder, not the YAML file's folder (flow-config.ts:87, 90, 127; config.ts:148). The seeded file that passes --check from its own folder fails from the parent folder with `folder: not a directory` and three `prompt: not a file` lines. flow.json stores absolute paths, so the pinned copy is tied to one machine. *On record:* Global Constraints: relative paths ... resolve against the folder the command was run from (R2)

**[[Flow Validation]]**
- A-08 · Forward routes must not loop: validateFlow repeatedly removes steps with no forward route in or out, and refuses what is left: 'routes loop without an on_fail route back: <steps>'. A step routing to itself on always or on_pass is refused; on on_fail it is rework. The list can also name steps that only sit between two loops (in s→a⇄b→x→c⇄d it lists x). *On record:* Execution #9: 'forward routes must not loop'
- A-09 · Exactly one entry step: There is no entry key. entries() takes the steps no route points to, or, if every step has a route in, the steps that only rework routes point to; validateFlow requires exactly one, and the engine starts entries(flow)[0]. A stray step with no edges is reported as a second entry rather than as unreachable, and next to a loop back to the first step it becomes the entry: `impl→review, review→impl (o… *On record:* (Alex) routes row: 'the entry is the step no edge points to'; Flow Design #23: 'Exactly one entry step (no route into it)'

**[[Infra Retries]]**
- F-05 · Transient versus other infra failures, and automatic backoff: run-flow does not classify failures and never retries on its own. Every run_ended with an error opens an engine-owned run_failed gate, `run failed: <error>`, offering Retry or Fail. A rate limit therefore holds the step until a person answers, or pauses the flow with exit 3 when there is no terminal. *On record:* "New: infra failures \| Not retried automatically. They wait at a gate: Retry keeps the attempt number, Fail ends the flow"; Left out: "automatic infra retry backoff"

**[[Loop Guard And Escalation]]**
- E-20 · Live runs downstream of an escalated target: escalate() stops nothing. In impl → [check, lint] with check's loop spent, lint runs to its end, and settle then holds whatever follows it (scratch 2b). A Retry wastes lint's run, and resume restarts it if it was cut off while the gate waited. *On record:* Execution #49, #50: "A gate on one branch doesn't stop the others."
- E-24 · Wording of the person's choices: The labels are "Retry this step" and "Fail the flow", followed by the question "Note for the next attempt (optional)". *On record:* Global Constraints: "Gate choices (value: label): … retry: Retry this step; fail: Fail the flow."

**[[Models And Effort]]**
- C-03 · Capability negotiation for knobs a step's provider or model cannot honour: run-flow never reads a provider's `capabilities` (grep of cli/src and core/src/flow), and both adapters declare the same set. Per model, though, OpenCode drops `effort` silently when the model has no such variant (:170). Its budget check compares reported cost, so a model with no listed price never trips `budget_usd`. `--check` accepts an OpenCode step whose only cap is `budget_usd` without any w… *On record:* 7.4 Provider per step: "There are no capability-gap warnings, because both providers declare the same capability set today"; Left out: "capability-gap warnings"
- C-13 · Model and effort per agent step, and their defaults: Each agent step takes `adapter`, `model` and `effort` from itself or `defaults`. `model` has no default (`--check` printed `steps.a.model: required`), `effort` is optional and unset unless given, and a shell step may set neither. The terminal shows `-- <step> attempt <n> (<adapter> <model>)`. *On record:* 7.4: "adapter per step, with a flow-level defaults"; Run Flow Reference: run-agent keys are checked "as run-agent checks it" (model required; effort "the model's own")

**[[Multi-Agent Orchestration Analysis]]**
- K-31 · §6.1 The flow file's name: and agent: keys: Both keys are refused: the §6.1 file as written fails with 'name: unknown key' and 'steps.plan.agent: unknown key' (checked in scratch). The flow's name is its file's base name, and a system prompt is run-agent's inline system_prompt string. *On record:* Left out: 'an agent: file key (use system_prompt)'; Task 5: 'there is no name key'
- K-33 · §6.3 The engine as one pure function: advance(flow, state, event) works on a structuredClone and does no I/O. Its events are start, run_ended (cost, outcome, reason, error, missing outputs, fingerprint), decide and resume; its commands are run, gate, stop and end (done or failed). There is no answers or cancel event and no cancelled end, and the host tests use a scripted provider (cli/test/flow-run.test.ts:27), not Replay. *On record:* Left out: 'parking and the 20-minute hold (the terminal answers live)'; 'cancel'
- K-35 · §6.4 Questions, gates and escalations through the existing broker: Each ai run starts its own broker on its own socket (flow-exec.ts:206), so R23's queue covers only one run, and gates never go through a broker. run-flow added a terminal() closure that asks gate prompts and every run's question batches one at a time, and holds event lines while a prompt is open. *On record:* Task 10: 'Keep the terminal (turn-taking and held lines) as one small closure in flow-run.ts'; Review Focus 3
- K-37 · §6.4 Artifacts found by modification time and matched to produces: Nothing is scanned: each declared type has the fixed path <artifacts>/<type>.md, which the prompt names, and counts as written only if its mtime is at or after the run's start. A file an agent writes anywhere else is never picked up, and a missing one opens a 'did not write' gate. *On record:* Flow Design #24, #25: 'Type keys, each saved as <type>.md'; New: exit 0 without a declared output waits at a gate
- K-39 · §6.5 set_outcome on the ask-user server's socket protocol: set_outcome is registered only when FLOWBOARD_OUTCOME_FILE is set, and it writes {outcome, reason?} straight to that file without touching the broker socket. The host reads the file after the run and prefers it to RunResult.outcome. declare_artifact does not exist. *On record:* Global Constraints: 'FLOWBOARD_OUTCOME_FILE tells the shim where set_outcome writes'; Left out: 'declare_artifact'

**[[Prompt Assembly]]**
- F-19 · Part 1, the preamble: The preamble is the task file's text as written, the same for every agent step. There are no title, criteria or non-goal fields and no headings; Testing The Run Flow CLI advises keeping the task a goal, since every step reads it. *On record:* Plan Task 5: "`task` (required: a file whose text is every step's preamble)"
- F-22 · Part 4, the skill invocation: Claude Code sends the `/plugin:slug` invocation first, before the preamble (a scratch render confirmed this), because the CLI treats only a leading `/` as a slash command. OpenCode keeps part 4's position but rewrites it as `Use the "<slug>" skill.`, and the port comment now lets each adapter place the parts (core/src/ports/agent-provider.ts:77-82). *On record:* Claude Code Adapter: "the canonical render, with `invocation` moved first"; OpenCode Adapter: "a `/<plugin>:<slug>` invocation becomes `Use the "<slug>" skill.`"
- F-23 · Part 5, the template's placeholders: The step's prompt file is used verbatim as the template. A scratch render showed `{{task_title}}` and `{{worktree}}` reaching both adapters unchanged, and --check said nothing about them. *On record:* Left out: "prompt `{{placeholders}}`"

**[[Rework Loop]]**
- E-06 · Steps after the target: skipped vs deleted: redo deletes the instance of every step downstream of the target along forward routes and keeps the target's. InstanceState has no skipped state; those steps get fresh instances when routes reach them again. A branch not downstream of the target keeps its result: in scratch 2a, tests stays done while build is reworked. *On record:* Execution #18, Flow Design #20: "Reset. Downstream instances are recreated"; Task 3 redo: "Every downstream instance other than t is deleted."

**[[Role Starter Flows]]**
- B-27 · A repair step reached only by rework declares its inputs: Ancestry for requires follows forward routes only, and health → rollback is a rework route, so `rollback: { requires: [release] }` fails with `steps.rollback: requires "release", and no step before it produces that`; QA's triage fails the same way. Without requires both flows pass, and the repair step gets only the failing step's outputs (engine.ts:81). It also owns the loop's attempt budget (`ro… *On record:* Flow Design #22: back-edges as ancestry: No. Rework inputs are implicit

**[[Run Guardrails At Launch]]**
- C-34 · Non-goal paths denied to agents: The task file is free text, and nothing reads non-goals from it. A step, or `defaults`, lists `guards.deny_paths` globs relative to folder, and matching edits are refused with `Path is a non-goal: <glob>`. *On record:* Run Flow Reference: "Guards are run-agent's, per step, plus write_roots"; analysis §6.2 maps guards.deny_paths to "the task's non-goals written as paths"

**[[Seeded Flow Execution]]**
- D-27 · What starts the review loop in the seeded flow: review is an approval step, so its own fail only opens 'approval needed; the agent says fail: <reason>' (engine.ts:147-150). The loop runs only when a person rejects (engine.ts:164), and Approve passes the work over the agent's fail (scratch seeded.ts). *On record:* Execution #64: 'The person wins'; Execution #5, #71: 'The approval gate's decision is the outcome'

**[[Seeded Flows]]**
- B-24 · Seeded agents as reusable named rows (scout, architect, ...): Steps cannot name an agent (`steps.a.agent: unknown key`), so each run-flow step repeats its agent's text in system_prompt and its tool limits in permissions. The plan decides this with Left out 'an agent: file key (use system_prompt)'. A scout with no write tool cannot deliver research_brief in run-flow: an output counts only if this run wrote it (flow-exec.ts:251), and the plan's 'exit 0 withou… *On record:* Left out: an agent: file key (use system_prompt); declare_artifact

**[[Shell Step Execution]]**
- F-03 · Where a shell step's output goes: The 20,000-character tail is written only to produces[0]. Without produces it is fingerprinted and then dropped, and the run log keeps only exitCode, outcome and fingerprint. A scratch failing check with no produces and an on_fail rework escalated with evidence [] and left its output nowhere; --check gave no warning. *On record:* Plan Task 7: "write the tail to `produces[0]`'s artifact, if there is one"
- F-33 · Shell steps and the ExecHost: execShell spawns `sh` with node:child_process directly; a ponytail comment says it bypasses ExecHost, "which cannot kill a process group". Agent steps go through each adapter's default host ExecHost, because spec.exec is never set. *On record:* Review landmine #3: "They no longer go through `ExecHost`, the hook a future sandbox would use; a `ponytail:` comment marks the way back"
- F-35 · A check that hangs: Shell steps default to timeout_minutes 30, and any positive value can be set. When it runs out, flow-run stops the run and reports `timed out after <n> minutes`, which opens a run_failed gate (flow-run.ts:375-389); agent steps have no default timeout. *On record:* "A step that hangs \| `timeout_minutes` per step. Shell steps default to 30; ai steps have none"

**[[Starting A Task]]**
- G-16 · The workspace at start: a worktree, or one folder: Every step works in the given folder, and artifacts go to <folder>/.flowboard/<run folder name>/. Instead of a worktree, a folder with changed tracked files is refused unless --allow-dirty is passed (untracked files don't count, and a folder outside git gets a warning); --resume never checks. *On record:* 7.5 "One folder"; (Alex) "Uncommitted changes at start: Refused unless --allow-dirty"; Left out "dynamic fan-out and worktrees"

**[[Step Definitions]]**
- A-20 · Prompt template: `prompt` names a file whose text becomes spec.prompt.template (part 5), placed after the flow's `task` text, which is the preamble. The file must exist and be non-empty, even when a skill is set, and the key can come from defaults. `{{…}}` is passed through as plain text. *On record:* Left out: 'prompt {{placeholders}}'
- A-21 · Model, effort, permission mode, allowed tools: These come from run-agent's RunSchema, set per step or through `defaults`. adapter and model are required with no default (OpenCode needs providerID/modelID); effort is optional and unset means the model's own; permissions.mode defaults to acceptEdits, and bypassPermissions/auto are refused unless allow_unrestricted_shell is set (config.ts:188-194); tools are permissions.allow and permissions.den… *On record:* Task 5: step keys are 'every run-agent key except folder'; §7.4: 'adapter per step, with a flow-level defaults'
- A-22 · Turn and budget limits: limits.max_turns and limits.budget_usd are optional, per step or in defaults; --check warns 'no limits.max_turns or limits.budget_usd; nothing stops a looping agent' for an ai step with neither. There is no ceiling for the whole flow. *On record:* Flow Design #37: 'Optional. --check warns when an ai step has neither'; Left out: 'a flow-wide budget ceiling (Flow Design #12)'
- A-23 · max_attempts: max_attempts (a whole number of 1 or more, default 3, no upper limit) is read only when a rework route targets the step, which escalates when attempts + 1 > max. Retry at a verdict or escalation gate can go past it, and on a step that no rework route targets it does nothing, without a warning. *On record:* Execution #66: 'the first run sets 1. Escalate when attempts + 1 > max_attempts'; Task 2: retry 'past maxAttempts if need be'

**[[Step Guardrails]]**
- C-09 · Permission mode per step and its default: `permissions.mode` can be set per step or in `defaults`, takes one of six modes, and defaults to `acceptEdits`. The adapter maps it: Claude's permissionMode, OpenCode's permission rules. *On record:* Run Agent CLI Decisions R8: "permissions.mode defaults to acceptEdits" (steps are checked "as run-agent checks it", Run Flow Reference)
- C-10 · No bypassPermissions on the host tier: Every step runs on the host. bypassPermissions, auto, or an allow entry giving any Bash command is refused unless the step or defaults sets permissions.allow_unrestricted_shell: true (config.ts:188-194); with the opt-in, the step runs on the host. That is the owner's R3 decision. It is also the 'trusted opt-out' that backlog D7 allows, which Step Guardrails itself quotes ('host only for non-bypas… *On record:* Run Agent CLI Decisions R3 (owner): "A setting that lets the agent run any shell command is refused unless permissions.allow_unrestricted_shell: true"

**[[Step Kinds]]**
- A-14 · An ai step names an agent, a skill or both: A step without `shell` is an ai step. The agent is inline `system_prompt` text, the skill is `skill: /plugin:name` (or `/name` from `skills`), and plugins are folders; there are no library ids or capability pins. loadFlow requires prompt, skill or system_prompt, so a step with only a prompt, and no agent or skill, is valid. *On record:* Task 5: 'an ai step needs prompt, skill or system_prompt'; Left out: 'an agent: file key (use system_prompt)'

**[[Stopping And Cancelling]]**
- G-17 · What a stop does to the step and its attempt: There is no Stop for a single run: Ctrl+C stops every run. Each cut-off run counts as wasted with error 'interrupted', uses no attempt and leaves its step running, so --resume reruns it at the same attempt without asking and asks open gates again. The only per-run stop, timeout_minutes, opens a run_failed gate (Retry at the same attempt, or Fail), which is the shape the proposal gives. *On record:* #49, #50: "There is no cancel: Ctrl+C pauses (resumable)"; #17: interrupted runs are wasted
- G-18 · Cancel a task: There is no Cancel. The nearest control is Fail the flow at a gate: it stops every live and queued run, takes down other open gate prompts, marks pending, running and gated instances failed (not skipped) and ends the flow failed, with exit 1. Agents' open questions are withdrawn when their runs stop. *On record:* Left out: "cancel"; #49, #50: "Fail the flow at a gate stops every live run"
- G-19 · Wasted spend when a person ends the flow: Fail the flow sets each live run to live: false with error 'stopped' and leaves wasted false, so those runs count as spent but not wasted. Interrupted, failed, superseded and retry-replaced runs are counted as wasted. *On record:* Execution #17 lists the wasted runs; Task 2: "error = 'stopped' (not wasted)"
- G-20 · Pause a task: No control lets live runs finish while starting nothing new. Ctrl+C stops runs mid-flight and counts their spend as wasted; the code reports this as `stopped` (exit 130) and uses `paused` only for a gate with no terminal (exit 3). *On record:* #49, #50: "Ctrl+C pauses (resumable)"
- G-26 · Timeouts, and automatic retry of a killed run: timeout_minutes (30 for shell steps, none for agent steps) stops the run and replaces its end with `timed out after <n> minutes`, which opens a run_failed gate. There, Retry reruns the same attempt and Fail ends the flow. Nothing is retried on its own. *On record:* "A step that hangs: … opens a run_failed gate"; "New: infra failures: Not retried automatically"; Left out "automatic infra retry backoff"

**[[Stuck Detection And Fingerprints]]**
- E-30 · Absolute paths become their file name: An absolute path is replaced by its last segment rather than removed, so failures in different files differ. Files with one name in different folders still match: /p/src/a/index.ts and /p/src/b/index.ts give the same fingerprint. *On record:* Execution #19: "an absolute path shrinks to its file name rather than disappearing, so different failing files stay different"
- E-34 · A failing check that prints nothing: A failing check with blank output gets no fingerprint and never counts as stuck (flow-exec.test.ts:48). Quiet checks such as grep -q or test -f loop on the budget alone. *On record:* "A failing check that prints nothing \| Gets no fingerprint, so it never counts as stuck"; design review landmine #8.

**[[Task Completion]]**
- D-05 · Reject with no on_fail edge fails the task: A gate lists reject only when its step has an on_fail route (engine.ts:58-59), and decide ignores a choice the gate does not offer (engine.ts:162). The only way a flow ends failed is a person's Fail the flow (engine.ts:165). *On record:* Reject with no on_fail route (PRD: 'fails the task'): 'Not offered'
- D-13 · A join behind a route that never fires: C starts once nothing live can feed it (engine.ts:194). In the note's example C runs without A's input after B finishes, then the flow ends done (scratch more.ts case 1; engine.test.ts:120). --check warns that 'c runs without it' (flow.ts:109-116). *On record:* Flow Design #19: 'The join runs once nothing can still feed it, and --check warns about it'
- D-17 · A missing row fails the task cleanly: def() is flow.steps.find(...)!, and run_ended reads s.steps[r.step] without a guard (engine.ts:45, 137), so a state that names a step the flow lacks makes advance throw. run-flow reaches this only with a hand-edited state.json or flow.json. The host then treats it as a host error: it stops every run, saves, prints the --resume hint and exits 1 (flow-run.ts:453-460). *On record:* Task 2: 'The flow is assumed valid, so add a ponytail comment that validateFlow ran first' (engine.ts:41)

## Area by area

Every finding, including those that match and those out of scope.

### A. Flow definition and validation

The flow model and validator do what the core of Flow Design describes. Steps carry requires/produces, edges are always/on_pass/on_fail, a flow has one entry and one producer per type, inputs must come from forward ancestors, every step must be reachable from the entry, and a pure validator in core runs before anything is spent. Most differences from the design notes are recorded decisions, so the notes are out of date rather than the code wrong: type keys saved as <type>.md, an entry worked out from the edges instead of an is_entry column, one edge per pair of steps with no START or END, rework defined as an on_fail route back to an always/on_pass ancestor, and Reject offered only when there is an on_fail route. The most serious gap: validateFlow accepts a step whose failure fires a rework route plus another on_fail route, and the engine then behaves according to the order the edges are written in the YAML. Depending on that order, a step can rebuild on an out-of-date upstream artifact without anyone being told, or a step meant only for failures can run after a pass. The artifact-contract check and the join warning both accept any forward ancestor as "before", so a producer that runs only on a failure path, or sits behind a conditional route further up than the join's own edges, passes --check; the consumer then runs without its input, and for shell steps nothing is printed. Two rules are missing with no recorded decision: there is no known-types check, and the name, kind and limits rules live only in the CLI loader rather than in core, where the canvas and worker will need them. Out of scope as expected: versions, the library, board order and positions, sandbox fields and capability checks. Manual steps are absent and not on the Left out list.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| A-01 | A failure that fires a rework route and another on_fail route | bug | high | Connections And Routes — How the engine resolves edges; Branching Joi… | `core/src/flow/engine.ts:108` |
| A-02 | A required artifact is written by a step that runs before the step needing it | matches | info | Artifact Contract — The contract; Flow Validation — Inputs are produc… | `core/src/flow/flow.ts:105` |
| A-03 | The --check warning for a join behind a conditional route | partial | medium | Branching Joining And Loops — Designing a join | `core/src/flow/flow.ts:110` |
| A-04 | Known artifact types | diverges (undecided) | medium | Flow Validation — The checks (Known types); Flow Definition Internals… | `cli/src/flow-config.ts:75` |
| A-05 | Where step-level validation lives | diverges (undecided) | medium | Flow Definition Internals — Component #2 and Who calls validation | `cli/src/flow-config.ts:111` |
| A-06 | A missing input is reported | partial | low | Run Flow Reference — How a step's outcome is decided | `cli/src/flow-exec.ts:60` |
| A-07 | Telling a rework route from a forward one | diverges (decided) | low | Flow Design Glossary — Rework loop; Connections And Routes — The thre… | `core/src/flow/flow.ts:26` |
| A-08 | Forward routes must not loop | diverges (decided) | low | Flow Validation — The checks; Flow Design Overview — Purpose | `core/src/flow/flow.ts:83` |
| A-09 | Exactly one entry step | diverges (decided) | low | Flow Validation — Exactly one entry; Flow Data Model — step_defs.is_e… | `core/src/flow/flow.ts:36` |
| A-10 | Every step is reachable | matches | info | Flow Validation — Every step is reachable; How the mockup validates | `core/src/flow/flow.ts:86` |
| A-11 | Exactly one producer per artifact type | matches | info | Flow Validation — Exactly one producer | `core/src/flow/flow.ts:93` |
| A-12 | Ancestry for requires, and rework inputs | diverges (decided) | low | Artifact Contract — Rework inputs; Flow Validation — How the mockup v… | `core/src/flow/flow.ts:103` |
| A-13 | Type keys versus file names, and where an artifact is written | diverges (decided) | low | Artifact Contract — Type keys versus filenames | `cli/src/flow-exec.ts:35` |
| A-14 | An ai step names an agent, a skill or both | diverges (decided) | low | Step Kinds — ai; Step Definitions — Agent and/or skill, Extra plugins… | `cli/src/flow-config.ts:133` |
| A-15 | Shell (check) steps | matches | info | Step Kinds — shell; Step Definitions — Command; Flow Validation — Che… | `cli/src/flow-config.ts:115` |
| A-16 | Manual steps | diverges (undecided) | low | Step Kinds — manual | none |
| A-17 | The StepExecutor idea | matches | info | Step Kinds — The StepExecutor idea | `core/src/flow/engine.ts:16` |
| A-18 | Step key | matches | info | Step Definitions — Key; Flow Design Glossary — Step key | `cli/src/flow-config.ts:23` |
| A-19 | Display name, board_order and position | out of scope | info | Step Definitions — Name, Board order, Position; Flow Data Model — ste… | none |
| A-20 | Prompt template | diverges (decided) | low | Step Definitions — The prompt template | `cli/src/flow-config.ts:126` |
| A-21 | Model, effort, permission mode, allowed tools | diverges (decided) | low | Step Definitions — Model, Effort, Permission mode, Allowed tools; Flo… | `cli/src/config.ts:35` |
| A-22 | Turn and budget limits | diverges (decided) | info | Step Definitions — Max turns, Budget; Flow Design Glossary — Budget,… | `cli/src/flow-config.ts:138` |
| A-23 | max_attempts | diverges (decided) | low | Step Definitions — Attempts; Flow Design Glossary — max_attempts | `core/src/flow/engine.ts:92` |
| A-24 | Advance mode (approval gate) | matches | info | Step Definitions — Advance mode; Flow Design Glossary — Approval gate | `cli/src/flow-config.ts:100` |
| A-25 | Sandbox, egress allowlist, unattended-and-unsandboxed flag | out of scope | info | Step Definitions — Sandbox, Egress allowlist; Flow Validation — Unatt… | `cli/src/flow-run.ts:140` |
| A-26 | Capability contract, provider match, tool intersection, missing hooks | out of scope | info | Flow Validation — The checks | none |
| A-27 | Validation as pure core functions, run before anything is spent | matches | info | Flow Validation — Where validation runs; Flow Definition Internals —… | `core/src/flow/flow.ts:66` |
| A-28 | The shape of a flow definition, and who consumes it | diverges (decided) | low | Flow Definition Internals — Consumers of a saved flow version; Types | `core/src/flow/flow.ts:8` |
| A-29 | The three conditions and when they fire | matches | info | Connections And Routes — The three conditions; How the engine resolve… | `core/src/flow/engine.ts:101` |
| A-30 | A failure with no on_fail route | diverges (decided) | low | Connections And Routes — How the engine resolves edges | `core/src/flow/engine.ts:59` |
| A-31 | Edge shape, identity and endpoints | diverges (decided) | low | Connections And Routes; Flow Data Model — step_edges, Changes from th… | `core/src/flow/flow.ts:70` |
| A-32 | The join rule and when a flow is done | diverges (decided) | low | Branching Joining And Loops — The four topologies (Join); Designing a… | `core/src/flow/engine.ts:193` |
| A-33 | Fan-out | matches | info | Branching Joining And Loops — The four topologies (Fan-out); Designin… | `core/src/flow/engine.ts:111` |
| A-34 | The rules a designer sets up with a rework loop | diverges (decided) | info | Branching Joining And Loops — Designing a rework loop | `core/src/flow/engine.ts:79` |
| A-35 | Flow versions, the flows table and the library | out of scope | info | Flow Design Overview — Design principles (Versioned and immutable); F… | `cli/src/flow-run.ts:135` |
| A-36 | Provider-agnostic flows | diverges (decided) | low | Flow Design Overview — Design principles (Provider-agnostic) | `cli/src/config.ts:179` |
| A-37 | Code names against the Glossary's terms | matches | info | Flow Design Glossary | `core/src/flow/flow.ts:5` |
| A-38 | Drawing a flow (toMermaid) | diverges (decided) | low | Connections And Routes — The three conditions (Canvas mark); Branchin… | `cli/src/flow-config.ts:161` |
| A-39 | Step names written as numbers | bug | low | Run Flow Reference — Rules for the whole file (Names) | `cli/src/flow-config.ts:39` |
| A-M01 | Entry step when a loop goes back to the first step through another step | bug | high | Run Flow Reference — Edges, loops and joins (The entry); Flow Design… | `core/src/flow/flow.ts:36` |

### B. Flow versions, pinning, storage, library, seeded flows, designer screen

Pinning works where it matters most. run-flow reads the YAML once, puts the task and prompt texts into flow.json, and neither the run nor --resume reads the YAML, task or prompt files again. Three gaps surround it: skill and plugin folders are pinned only as paths and read again at every launch (the design pins capabilities at task start); there is no version id or content hash; and a check that cleans the run folder deletes flow.json, after which the run cannot be resumed (reproduced). The nine-step seeded Software delivery flow and all six role flows fit today's keys and pass --check (DevOps and QA only after their repair step drops `requires`), and the engine runs the seeded flow as Seeded Flow Execution describes; agents referenced by name, display labels and manual steps do not fit. For the canvas, the strict schema rejects every extra key at the root, on steps, on edges and in defaults, so positions, step labels and flow metadata have nowhere to go, while edges already carry a stable from→to id; relative paths in a flow file also resolve against the working folder, not the file's own folder. Storage, library, adopt/save and the API are out of scope, with --check as the validator that refuses a flow and --mermaid as the picture. To reproduce B-04 I ran a shell-only flow and its --resume inside the scratch folder; separately, by mistake I ran one invalid flow with ai steps without --check (scratchpad/audit/B/seeded/adapt.yaml): it failed validation with exit 2 and launched nothing.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| B-01 | Pin the flow at start; a started run never moves | matches | info | Version Pinning, The rule | `cli/src/flow-run.ts:135` |
| B-02 | Skills and plugins pinned at task start | diverges (undecided) | medium | Version Pinning, What is pinned and what is not | `cli/src/run.ts:48` |
| B-03 | A version identity (number or content hash) for what a run ran | diverges (undecided) | medium | Flows And Flow Versions, Versions are immutable; Why versions matter… | `cli/src/flow-run.ts:242` |
| B-04 | The pinned flow.json survives a check that cleans the run folder | bug | medium | Run Flow Reference, Safety; plan, Decisions: Where run state lives | `cli/src/flow-run.ts:335` |
| B-05 | How --resume uses the pinned flow | doc inaccurate | low | Design review of the plan, What holds up | `cli/src/flow-run.ts:250` |
| B-06 | Immutable versions, Save creates vN, adopted version, ownership | out of scope | info | Flows And Flow Versions, Versions are immutable; Adopted version; Who… | none |
| B-07 | When pinning happens, and pinned-version edge cases | out of scope | info | Version Pinning, When pinning happens; Edge cases | `cli/src/flow-run.ts:135` |
| B-08 | Flow storage: SQLite rows, JSON templates, packs, export | out of scope | info | Flow Storage, Live flows: SQLite; Templates: JSON files; Flows inside… | `cli/src/flow-run.ts:135` |
| B-09 | A flow file is self-contained and portable | diverges (decided) | medium | Flow Storage, Export (idea) | `cli/src/flow-config.ts:87` |
| B-10 | Flow library: variants, authors, domains, shape glyph | out of scope | info | Flow Library | `cli/src/flow-config.ts:161` |
| B-11 | Borrowing a step brings its needs; the validator catches them | out of scope | info | Adopting And Adapting A Flow, Adapt: borrow a step | `core/src/flow/flow.ts:105` |
| B-12 | Lifecycle: adopted, edited, won't save, saved | out of scope | info | Editing And Saving A Flow, When Save is disabled | `cli/src/flow-run.ts:75` |
| B-13 | Flow API: read, save as a version, validate | out of scope | medium | Flow Design API And Routes, Endpoints in the PRD | `cli/src/flow-config.ts:40` |
| B-14 | Designer screen: version chip, canvas, inspector, validation strip, status bar | out of scope | info | Flow Design Screen, Regions; States of the screen | `cli/src/flow-run.ts:80` |
| B-15 | The inspector's step fields stored in the flow file | partial | medium | Flow Design Controls, In the inspector | `cli/src/flow-config.ts:30` |
| B-16 | Flow-file keys with no field on the canvas | diverges (decided) | medium | Flow Design Controls, In the inspector | `cli/src/flow-config.ts:124` |
| B-17 | Node positions saved with the flow | out of scope | medium | Canvas Layout And Board Order, Canvas position is arrangement, not me… | `cli/src/flow-config.ts:40` |
| B-18 | A step's display name, separate from its key | diverges (undecided) | medium | Flow Design Screen, Step marks on the canvas; Seeded Flows, 1. The PR… | `cli/src/flow-config.ts:23` |
| B-19 | Flow-level metadata: name, author, version, domain, description, lineage | out of scope | medium | Flow Design Screen, Regions (version chip); Flow Library, A variant c… | `cli/src/flow-config.ts:157` |
| B-20 | Board column order | out of scope | low | Canvas Layout And Board Order, Board order | `cli/src/flow-config.ts:96` |
| B-21 | Edge record and stable edge id | matches | info | Flow Design Controls, Keyboard; Canvas Layout And Board Order, Edge d… | `cli/src/flow-config.ts:47` |
| B-22 | An entry flag per step | diverges (decided) | low | Flow Design Controls, In the inspector | `core/src/flow/flow.ts:36` |
| B-23 | The seeded Software delivery flow, written as YAML and run | matches | info | Seeded Flows, 1. The PRD default flow | `cli/src/flow-config.ts:62` |
| B-24 | Seeded agents as reusable named rows (scout, architect, ...) | diverges (decided) | low | Seeded Flows, 1. The PRD default flow | `cli/src/flow-exec.ts:251` |
| B-25 | Shipping the seed, and the project's check_command | out of scope | low | Seeded Flows, 2. Backlog flow templates; Flow Storage, Templates: JSO… | none |
| B-26 | Role starter flows expressed with pass/fail routes | matches | info | Role Starter Flows, The six role flows | `core/src/flow/flow.ts:36` |
| B-27 | A repair step reached only by rework declares its inputs | diverges (decided) | medium | Role Starter Flows, The six role flows (Cloud / DevOps, QA) | `core/src/flow/flow.ts:103` |
| B-28 | A step that is only a person's sign-off or test | partial | low | Role Starter Flows, The six role flows | `core/src/flow/engine.ts:147` |
| B-29 | Hand-offs between role flows, role toolboxes, domains | out of scope | info | Role Starter Flows, The handoff relay; Where the mockup uses them | none |

### C. Step configuration: guardrails, models, approval gates, check steps

Most of the step configuration follows the design. run-flow takes run-agent's keys on each step and merges them shallowly with `defaults`, as the Run Flow Reference says. Caps, tools, max_attempts, approval gates and check steps work the way the plan decided. Everything that needs the sandbox, the capability library, the inbox or the canvas is missing on purpose. Several design notes are now stale because of recorded decisions: the acceptEdits default, bypass allowed on the host behind the R3 opt-in, Reject not offered without an on_fail edge, a required model with no default effort, checks run outside ExecHost, and secrets removed by name only. Four reachable bugs sit in the guards and checks, all reproduced in scratch runs: `write_roots: []` leaves the whole folder writable; `[` or `{` in the flow file's name breaks the run-folder deny; a check's background command that redirects its output keeps running after the check, although the reference says it is stopped; and a check without `produces` throws its output away, so the rework target never sees why it failed. Undecided gaps: the logical model ids never arrived with the second provider (OpenCode needs native ids); draft mode is missing entirely; per-model capability gaps (an OpenCode model with no listed price never trips `budget_usd`) pass `--check` silently; Reject also fires `always` routes; nothing blocks agents' git commands that discard earlier steps' uncommitted work; and a Retry at a verdict gate uses up max_attempts, which the reference does not say.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| C-01 | Per-step budget and turn caps; what happens when none is set | matches | info | Step Guardrails — The fields; Logical caps, physical backstops | `cli/src/config.ts:219` |
| C-02 | Flow-wide defaults and how a step's keys merge with them | matches | info | Run Flow Reference — Flow fields (defaults); Step Guardrails — The fi… | `cli/src/flow-config.ts:124` |
| C-03 | Capability negotiation for knobs a step's provider or model cannot honour | diverges (decided) | medium | Models And Effort — Capability negotiation; Step Guardrails — Logical… | `adapters/src/agent/opencode/provider.ts:200` |
| C-04 | Per-step tool allow/deny, with ask_user always reachable | matches | info | Step Guardrails — Tools; Run Guardrails At Launch — Tools | `adapters/src/agent/claude/options.ts:59` |
| C-05 | Effective tools (agent ∩ skill ∩ step), capability pins, git plugins on the host tier | out of scope | info | Step Guardrails — Tools, Steps the host tier refuses; Run Guardrails… | none |
| C-06 | max_attempts: default, what it counts, who owns it, and what happens at the cap | matches | info | Step Guardrails — The fields (Attempts); Retries versus max_attempts | `core/src/flow/engine.ts:92` |
| C-07 | A Retry at a verdict gate uses up max_attempts | doc inaccurate | low | Run Flow Reference — Step fields (max_attempts); Gates and their choi… | `core/src/flow/engine.ts:171` |
| C-08 | Infra retries: automatic reruns after a transient failure | out of scope | info | Step Guardrails — Retries versus max_attempts; Flow Design Glossary —… | `core/src/flow/engine.ts:141` |
| C-09 | Permission mode per step and its default | diverges (decided) | low | Step Guardrails — The fields (Permission mode); Run Guardrails At Lau… | `cli/src/config.ts:188` |
| C-10 | No bypassPermissions on the host tier | diverges (decided) | low | Step Guardrails — The sandbox rule; Run Guardrails At Launch — The pe… | `cli/src/config.ts:194` |
| C-11 | Sandbox tier, egress allowlist, Docker probe, physical limits, credential proxy | out of scope | info | Step Guardrails — Sandbox, Egress allowlist, sandbox value mapping, S… | none |
| C-12 | Per-task spending ceiling from step budgets | out of scope | info | Step Guardrails — Ceiling per task, Ideas | `cli/src/flow-run.ts:467` |
| C-13 | Model and effort per agent step, and their defaults | diverges (decided) | low | Models And Effort — The fields; intro | `cli/src/config.ts:37` |
| C-14 | Logical model ids resolved per provider | diverges (undecided) | medium | Models And Effort — Logical model ids | `cli/src/run.ts:55` |
| C-15 | Draft mode: force every step onto the cheap model, as a RunSpec transform | out of scope | info | Draft Mode And Spec Transforms — What it does, Where execution applie… | none |
| C-16 | When an approval gate opens; Approve and Fail the flow | matches | info | Approval Gates — The setting, Advance modes, Gates you don't design,… | `core/src/flow/engine.ts:147` |
| C-17 | Reject on a step with no on_fail route | diverges (decided) | low | Approval Gates — What approve and reject mean | `core/src/flow/engine.ts:59` |
| C-18 | Where a Reject sends the work when the step also has always routes | diverges (undecided) | medium | Approval Gates — What approve and reject mean | `core/src/flow/engine.ts:108` |
| C-19 | A rejection's note reaches the next attempt | partial | low | Approval Gates — What approve and reject mean | `core/src/flow/engine.ts:110` |
| C-20 | Gate surfaces beyond the terminal, waiting for answers, seeded gates, ideas | out of scope | info | Approval Gates — The setting (Needs you band), Advance modes, Choosin… | `cli/src/flow-run.ts:306` |
| C-21 | A check runs a command, the exit code is its verdict, and it costs nothing | matches | info | Check Steps — The rules | `cli/src/flow-exec.ts:116` |
| C-22 | Where a check runs | diverges (decided) | low | Check Steps — The rules | `cli/src/flow-exec.ts:73` |
| C-23 | A check's output saved for the next attempt | partial | medium | Check Steps — The rules; Designing with checks | `cli/src/flow-exec.ts:108` |
| C-24 | A check's leftover background commands are stopped when its shell exits | bug | medium | Run Flow Reference — Shell steps | `cli/src/flow-exec.ts:130` |
| C-25 | A check's environment: no credentials; FLOWBOARD_ARTIFACTS | diverges (decided) | low | Check Steps — The sensor idea; Gaps | `cli/src/flow-exec.ts:37` |
| C-26 | Wall-clock limit on a step (timeout_minutes) | matches | info | Run Guardrails At Launch — Limits; Step Guardrails — The fields (Budg… | `cli/src/flow-run.ts:375` |
| C-27 | An agent step's timeout counts time spent waiting for a person's answer | undocumented | low | Run Flow Reference — Step fields (timeout_minutes); Run Config Refere… | `cli/src/flow-run.ts:377` |
| C-28 | Keys a shell step refuses | matches | info | Run Flow Reference — Shell steps; Models And Effort — intro | `cli/src/flow-config.ts:115` |
| C-29 | Falling back to the project's check_command | out of scope | info | Check Steps — The rules; Designing with checks (command left null) | `cli/src/flow-config.ts:35` |
| C-30 | Fingerprints and stuck checks | matches | info | Check Steps — Designing with checks (Two identical failures); Gaps | `core/src/flow/engine.ts:93` |
| C-31 | In-agent write guard: folder, write_roots and the artifacts folder | matches | info | Run Guardrails At Launch — The hooks (inside) | `cli/src/flow-exec.ts:233` |
| C-32 | An empty write_roots list | bug | medium | Run Flow Reference — Step fields (write_roots) | `cli/src/flow-config.ts:152` |
| C-33 | The run folder is off limits to agents when it sits inside folder | bug | medium | Run Flow Reference — Safety (The run folder is off limits) | `cli/src/flow-run.ts:130` |
| C-34 | Non-goal paths denied to agents | diverges (decided) | low | Run Guardrails At Launch — The hooks (inside) | `core/src/guard.ts:37` |
| C-35 | Destructive commands blocked inside the agent | partial | medium | Run Guardrails At Launch — The hooks (inside) | `core/src/guard.ts:5` |
| C-36 | Mount only the step's own plugins and skills, isolated from the operator's config | matches | info | Run Guardrails At Launch — Plugins; Isolation from the operator's own… | `cli/src/config.ts:210` |

### D. Engine: outcomes, advancement, fan-out and join, completion

For ordinary flows the engine does what the Execution notes describe. Outcomes come from the exit code or set_outcome, and a missing outcome never passes. Approval and escalation gates stop the right step, fan-out starts every fired target, and joins wait for every live branch. The seeded Software delivery flow runs beat for beat as Seeded Flow Execution describes. Most differences from the design notes are recorded decisions that the notes should now cite: no skipped or blocked state, Reject offered only with an on_fail edge, a silent approval step gated once, and infra failures handled as run_failed gates. The real defects are in how complete() fires several routes from one failing step: a rework route plus a forward on_fail route, or two rework routes where one target sits upstream of the other, give results that depend on edge order. They can run a stale step, or a step alongside its own upstream, and validateFlow accepts both shapes. Two interplays have no decision yet: a join reset by a rework forgets a sibling's route, and an escalation at a fan-out point lets a branch below it keep spending on work that either choice discards. A shell step without produces keeps its output nowhere, so its rework and escalation get no failing output, and nothing warns. The scratch scripts are in /private/tmp/claude-501/-Users-alex-projects-personal-flowboard-flowboard-v3/c93fab94-c162-4647-bdd6-cd738eae775e/scratchpad/audit/D/.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| D-01 | Where a step's outcome comes from | matches | info | Run Outcomes, Where an outcome comes from | `cli/src/flow-exec.ts:248` |
| D-02 | Outcome written into an artifact's JSON | out of scope | info | Run Outcomes, Where an outcome comes from (Agent step, JSON) | none |
| D-03 | A missing outcome is never a pass | matches | info | Run Outcomes, Rules (A missing outcome is never a pass) | `core/src/flow/engine.ts:101` |
| D-04 | A person's Approve overrides the agent's verdict | matches | info | Run Outcomes, Rules (Human wins) | `core/src/flow/engine.ts:163` |
| D-05 | Reject with no on_fail edge fails the task | diverges (decided) | low | Task Completion, Failed | `core/src/flow/engine.ts:59` |
| D-06 | Approval steps wait; a silent one is gated once | diverges (decided) | low | Advancement Rules, After a run succeeds (rule 1) and Gaps (A silent a… | `core/src/flow/engine.ts:147` |
| D-07 | Unanswered questions park a step (awaiting_answers) | out of scope | info | Advancement Rules, After a run succeeds (rule 2) | `core/src/flow/engine.ts:8` |
| D-08 | Rework reset when a step also fires a forward on_fail route | bug | medium | Advancement Rules, advance_task (Rework) | `core/src/flow/engine.ts:108` |
| D-09 | Two rework routes from one failing step | bug | medium | Advancement Rules, advance_task (Rework) | `core/src/flow/engine.ts:86` |
| D-10 | Fan-out starts every fired target at once | matches | info | Fan-Out And Join, The rules (Fan-out) | `core/src/flow/engine.ts:194` |
| D-11 | What a join waits for | diverges (decided) | low | Fan-Out And Join, The rules (Join, PRD and backlog) | `core/src/flow/engine.ts:192` |
| D-12 | A gated upstream holds a join | doc inaccurate | low | Run Flow Reference, Edges, loops and joins (Joins) | `core/src/flow/engine.ts:39` |
| D-13 | A join behind a route that never fires | diverges (decided) | low | Task Completion, Stranded | `core/src/flow/engine.ts:194` |
| D-14 | A join reset by a rework forgets a sibling's route | diverges (undecided) | medium | Fan-Out And Join, After a rework | `core/src/flow/engine.ts:79` |
| D-15 | An escalation at a fan-out point leaves a branch below it running | diverges (undecided) | medium | Fan-Out And Join, Gaps (One branch escalates) | `core/src/flow/engine.ts:92` |
| D-16 | When a flow is done | matches | info | Task Completion, Done | `core/src/flow/engine.ts:196` |
| D-17 | A missing row fails the task cleanly | diverges (decided) | medium | Task Completion, Failed (A missing row) | `core/src/flow/engine.ts:45` |
| D-18 | Task status, including blocked | diverges (undecided) | low | Execution State Machines, Task status; Execution Glossary, Blocked | `core/src/flow/engine.ts:15` |
| D-19 | Step instance states and transitions | diverges (decided) | low | Execution State Machines, Step instance state | `core/src/flow/engine.ts:8` |
| D-20 | Run states | partial | low | Execution State Machines, Run state | `core/src/flow/engine.ts:14` |
| D-21 | Execution entities in code | partial | low | Execution Entities, The three, plus the job | `core/src/flow/engine.ts:14` |
| D-22 | Jobs, the queue and the worker | out of scope | info | Execution State Machines, Job state; Execution Glossary, Worker and J… | `cli/src/flow-run.ts:396` |
| D-23 | Life of one step: web, database, memory and sandbox beats | out of scope | info | Life Of One Step, The nine beats (A, B, D, E, F) | `cli/src/flow-exec.ts:73` |
| D-24 | Life of one step: build, stream and ask beats | partial | low | Life Of One Step, The nine beats (C, E, G, H) | `cli/src/flow-exec.ts:224` |
| D-25 | Life of one step: exit, outcome and advance (beat I) | matches | info | Life Of One Step, The nine beats (I) | `cli/src/flow-exec.ts:251` |
| D-26 | The seeded Software delivery flow, run through the engine | matches | info | Seeded Flow Execution, A clean run and The two loops | `core/src/flow/engine.ts:42` |
| D-27 | What starts the review loop in the seeded flow | diverges (decided) | low | Seeded Flow Execution, The two loops | `core/src/flow/engine.ts:147` |
| D-28 | Which step a flow starts at | doc inaccurate | low | run-flow plan, Decisions this plan makes (Flow Design #23, Execution… | `core/src/flow/flow.ts:36` |
| D-29 | Core purity and a provider-blind engine | matches | info | Execution Overview, Design principles (The core is framework-free; Pr… | `core/src/flow/engine.ts:43` |
| D-30 | Work, not weather: the engine and infra failures | diverges (decided) | low | Execution Overview, Design principles (Work, not weather); Run Outcom… | `core/src/flow/engine.ts:143` |
| D-31 | Escalate, don't fail | matches | info | Execution Overview, Design principles (Escalate, don't fail) | `core/src/flow/engine.ts:92` |
| D-32 | A check's raw output feeds the next attempt | partial | medium | Execution Overview, Design principles (Sensors before autonomy) | `cli/src/flow-exec.ts:108` |
| D-33 | Attempt: what counts | matches | info | Execution Glossary, Overloaded words (Attempt) | `core/src/flow/engine.ts:53` |
| D-34 | Retry: its meanings | diverges (decided) | low | Execution Glossary, Overloaded words (Retry) | `core/src/flow/engine.ts:166` |
| D-35 | Stop: its meanings | partial | low | Execution Glossary, Moves (Stop) | `core/src/flow/engine.ts:80` |

### E. Engine: rework, loop guard, escalation, stuck detection

The engine follows the three notes closely. isRework treats an on_fail route to the step itself, or to an ancestor along always/on_pass routes, as rework. The target reruns with its own requires plus the failing step's produces. Every run of the target and of the steps after it is flagged wasted, and live ones are stopped. The counter sits on the target and counts the first run. A spent or stuck loop escalates to a Retry/Fail gate and never fails on its own, and the fingerprint follows the PRD algorithm with the plan's path change. Where the code departs from the notes, a recorded decision covers it: downstream instances are deleted instead of marked skipped, blank output is never stuck, an absolute path becomes its file name, the choices read "Retry this step"/"Fail the flow", and the flow has no blocked status. The real gaps are cases the plan did not consider. A failing step with no produces gives its rework nothing, and a shell check without produces keeps its output nowhere; the Reference's own example review step has no produces. A second failure routed to a target already at an escalation gate silently reworks past a stuck gate, or drops the first failure's evidence. Routes fired alongside a rework behave differently depending on edge order. A person's note is lost when a Reject's rework escalates, or when a run_failed Retry reruns a rework attempt. Smaller items: the Reference says Retry at an escalation makes the next failure escalate at once, which is wrong for a stuck check; max_attempts on a step that no rework route targets has no effect, yet the Reference's example sets one; and the normaliser misses UUIDs and named timestamps.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| E-01 | What fires a rework; what "earlier" means | matches | info | Rework Loop — The rule; Gaps (on_fail edge to a later step) | `core/src/flow/flow.ts:26` |
| E-02 | A loop back whose path passes through another on_fail route | matches | low | Rework Loop — Gaps; Run Flow Reference — Loops | `core/src/flow/flow.ts:84` |
| E-03 | What the rework target reruns with | matches | info | Rework Loop — The rule; What the new run gets | `core/src/flow/engine.ts:81` |
| E-04 | A failing step that declares no produces | undocumented | high | Rework Loop — What the new run gets; Loop Guard And Escalation — When… | `cli/src/flow-exec.ts:108` |
| E-05 | An earlier round's artifact reaches a rework and its gate | undocumented | low | Rework Loop — What the new run gets | `cli/src/flow-exec.ts:221` |
| E-06 | Steps after the target: skipped vs deleted | diverges (decided) | low | Rework Loop — The rule (02 §3); Execution State Machines (done → skip… | `core/src/flow/engine.ts:79` |
| E-07 | Which runs count as wasted | matches | info | Rework Loop — What it costs; Gaps (Which runs are superseded?) | `core/src/flow/engine.ts:70` |
| E-08 | Live runs a rework stops; parallel branches | matches | info | Rework Loop — Step by step; Run Flow Reference — Loops | `core/src/flow/engine.ts:73` |
| E-09 | Other routes fired by the failure that fires a rework | bug | medium | Rework Loop — Step by step; Run Flow Reference — Loops | `core/src/flow/engine.ts:108` |
| E-10 | A Reject's reason when the rework escalates instead | diverges (undecided) | medium | Rework Loop — What the new run gets (Your reason, when a human reject… | `core/src/flow/engine.ts:91` |
| E-11 | Retry at a run_failed gate drops the attempt's note | bug | medium | Rework Loop — What the new run gets; Loop Guard And Escalation — What… | `core/src/flow/engine.ts:166` |
| E-12 | Where a person's note goes | partial | low | Rework Loop — What the new run gets; Execution Open Questions #21 | `cli/src/flow-exec.ts:228` |
| E-13 | A note for a run that is a shell step | undocumented | low | Loop Guard And Escalation — When it escalates | `cli/src/flow-exec.ts:60` |
| E-14 | Task-scope memory and the /costs view | out of scope | info | Rework Loop — What the new run gets (Task-scope memory); What it costs | none |
| E-15 | max_attempts default 3, first run included | matches | info | Loop Guard And Escalation — What counts; gap "When does attempts coun… | `core/src/flow/engine.ts:92` |
| E-16 | Counter on the target, shared by every loop into it | matches | info | Loop Guard And Escalation — What counts | `core/src/flow/engine.ts:86` |
| E-17 | Downstream attempt counters reset | matches | info | Rework Loop — Gaps (Downstream attempts) | `core/src/flow/engine.ts:79` |
| E-18 | Escalation when a loop is spent | matches | info | Loop Guard And Escalation — When it escalates; Escalate or fail | `core/src/flow/engine.ts:91` |
| E-19 | Task blocked, inbox, Slack, API, Allow host & retry | out of scope | info | Loop Guard And Escalation — When it escalates; Where the escalation l… | none |
| E-20 | Live runs downstream of an escalated target | diverges (decided) | low | Loop Guard And Escalation — Where the escalation lands | `core/src/flow/engine.ts:91` |
| E-21 | A second failure into a target already at an escalation gate | bug | medium | Loop Guard And Escalation — When it escalates; Run Flow Reference — L… | `core/src/flow/engine.ts:85` |
| E-22 | Retry at an escalation | matches | info | Loop Guard And Escalation — Retry semantics | `core/src/flow/engine.ts:167` |
| E-23 | Retry at a stuck escalation, as the Reference describes it | doc inaccurate | low | Run Flow Reference — Gates and their choices (retry) | `core/src/flow/engine.ts:167` |
| E-24 | Wording of the person's choices | diverges (decided) | low | Loop Guard And Escalation — When it escalates | `cli/src/flow-run.ts:27` |
| E-25 | Infra retries don't use an attempt but count as wasted | matches | info | Loop Guard And Escalation — What counts (Infra retries excluded) | `core/src/flow/engine.ts:166` |
| E-26 | A Retry at a verdict gate spends the loop budget | doc inaccurate | low | Run Flow Reference — Step fields (max_attempts) | `core/src/flow/engine.ts:171` |
| E-27 | max_attempts on a step no rework route targets | doc inaccurate | medium | Run Flow Reference — At a glance | `core/src/flow/engine.ts:87` |
| E-28 | A rework target that is the entry step | matches | info | Rework Loop — The rule | `core/src/flow/flow.ts:36` |
| E-29 | The fingerprint algorithm | matches | info | Stuck Detection And Fingerprints — The fingerprint | `core/src/flow/fingerprint.ts:13` |
| E-30 | Absolute paths become their file name | diverges (decided) | low | Stuck Detection And Fingerprints — The fingerprint | `core/src/flow/fingerprint.ts:20` |
| E-31 | Timestamps and ids the normaliser misses | partial | low | Stuck Detection And Fingerprints — The fingerprint | `core/src/flow/fingerprint.ts:6` |
| E-32 | Where fingerprints come from | matches | info | Stuck Detection And Fingerprints — Scope (Shell steps only; Infra ret… | `cli/src/flow-exec.ts:117` |
| E-33 | Which runs are compared | matches | info | Stuck Detection And Fingerprints — Scope; Execution Open Questions #5… | `core/src/flow/engine.ts:90` |
| E-34 | A failing check that prints nothing | diverges (decided) | low | Stuck Detection And Fingerprints — The fingerprint | `cli/src/flow-exec.ts:117` |
| E-35 | Stuck check before or after the budget check | matches | info | Loop Guard And Escalation — When it escalates (diagram); Stuck Detect… | `core/src/flow/engine.ts:92` |

### F. Runner: launching steps, prompts, outcomes, artifacts, infra failures

The runner side of run-flow broadly follows the design. execAi and execShell build the spec, launch the run, read the verdict and find outputs much as Runner Pipeline, Agent Launch Contract and Prompt Assembly describe. Most divergences are covered by the plan's decisions or its Left out list: no automatic infra retries, no placeholders, no memory, a free-text preamble, and shell steps bypassing ExecHost. The biggest gaps are in what a run leaves behind. Agent runs that are stopped, time out or lose their stream are recorded at $0, because both adapters report usage only on the final result, so the spent and wasted totals come out too low. A shell step keeps its output only when it declares produces, and loses it entirely when it is stopped or times out. A background command that redirects its output outlives the check, although the Run Flow Reference says leftovers are stopped. Smaller gaps: shell steps ignore missing inputs and notes, set_outcome is offered to every agent step, skills and plugins are pinned only by path, and two run-flow docs say a line ends the prompt when it ends the preamble.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| F-01 | Cost of an agent run that is stopped or dies before its result | bug | medium | Infra Retries, The classification (feature map §4); Runner Pipeline,… | `cli/src/flow-exec.ts:244` |
| F-02 | Background commands left running after a check exits | doc inaccurate | medium | Run Flow Reference, Shell steps | `cli/src/flow-exec.ts:123-133` |
| F-03 | Where a shell step's output goes | diverges (decided) | medium | Shell Step Execution, The rule; What it feeds | `cli/src/flow-exec.ts:108-117` |
| F-04 | Output of a shell step that is stopped or times out | undocumented | medium | Shell Step Execution, Gaps (Timeouts); Run Flow Reference, Step field… | `cli/src/flow-exec.ts:107` |
| F-05 | Transient versus other infra failures, and automatic backoff | diverges (decided) | low | Infra Retries, The classification; The timeline | `core/src/flow/engine.ts:141-143` |
| F-06 | An infra failure never uses up an attempt | matches | info | Infra Retries, The classification; Gaps (Unblocking) | `core/src/flow/engine.ts:166` |
| F-07 | What counts as a failed run | matches | info | Infra Retries, On completion; Gaps (A failure on exit 0; Physical lim… | `cli/src/flow-exec.ts:245-246` |
| F-08 | Stops and restarts are not treated as infra failures | matches | info | Infra Retries, Restart: transient or failed?; Gaps (Stops) | `core/src/flow/engine.ts:138-140` |
| F-09 | Pinning a step's skills and plugins | partial | low | Runner Pipeline, The stages (1) | `cli/src/run.ts:48` |
| F-10 | Memory: recall, prompt part 7, and commit | out of scope | info | Runner Pipeline, Memory around launch (stages 2, 10); Prompt Assembly… | none |
| F-11 | RunSpec transforms (draft mode, sandbox profile) | out of scope | info | Runner Pipeline, The stages (4) | none |
| F-12 | The RunSpec run-flow launches, and how it reaches the CLI | diverges (decided) | info | Agent Launch Contract, RunSpec; Runner Pipeline, The stages (5, 7) | `cli/src/flow-exec.ts:216-233` |
| F-13 | Snapshot of what was launched | matches | info | Runner Pipeline, The stages (6); Gaps (args.json or spec.json) | `cli/src/flow-exec.ts:234` |
| F-14 | Streaming events and the running cost | out of scope | info | Runner Pipeline, Events and cost while it runs (stage 8) | `cli/src/run.ts:89-96` |
| F-15 | Recording a finished run and handing it to the engine | matches | info | Runner Pipeline, On exit (stages 9, 11) | `cli/src/flow-exec.ts:239-253` |
| F-16 | Resume prompts, session ids and the exit race | out of scope | info | Prompt Assembly, What changes on resume; Agent Launch Contract, RunSp… | none |
| F-17 | Capability checks and fallbacks | diverges (decided) | low | Agent Launch Contract, Capabilities the engine and runner check | `cli/src/run.ts:54` |
| F-18 | Process ids of agent runs | doc inaccurate | low | Plan, Left out and the Two hosts decision; design review, landmine #1… | `adapters/src/agent/claude/provider.ts:79` |
| F-19 | Part 1, the preamble | diverges (decided) | low | Prompt Assembly, The parts (1) | `cli/src/flow-config.ts:144` |
| F-20 | Where a person's note goes | matches | info | Prompt Assembly, What changes on rework | `cli/src/flow-exec.ts:224-229` |
| F-21 | Parts 2 and 3 (inputs and outputs), and missing inputs | matches | info | Prompt Assembly, The parts (2, 3); What changes on rework | `cli/src/flow-exec.ts:220-232` |
| F-22 | Part 4, the skill invocation | diverges (decided) | low | Prompt Assembly, The parts (4); Where the sources disagree | `adapters/src/agent/claude/options.ts:23-26` |
| F-23 | Part 5, the template's placeholders | diverges (decided) | low | Prompt Assembly, The parts (5) | `cli/src/flow-config.ts:150` |
| F-24 | Part 6, the closing | matches | info | Prompt Assembly, The parts (6) | `cli/src/flow-config.ts:151` |
| F-25 | Which agent steps are offered set_outcome | undocumented | low | Run Flow Reference, Step fields (closing line); How a step's outcome… | `cli/src/flow-exec.ts:216` |
| F-26 | Where the note and missing-inputs lines appear in the prompt | doc inaccurate | low | Run Flow Reference, How a step's outcome is decided; Testing The Run… | `cli/src/flow-exec.ts:226-229` |
| F-27 | set_outcome on the ask-user server | matches | info | Agent Launch Contract, The port (RunResult.outcome); Runner Pipeline,… | `ask-user/src/server.ts:117-136` |
| F-28 | Which outcome source wins | matches | info | Agent Launch Contract, The port (RunResult) | `cli/src/flow-exec.ts:248-250` |
| F-29 | declare_artifact, and an outcome inside an artifact's JSON | out of scope | info | Runner Pipeline, On exit (Artifact scan) | none |
| F-30 | Finding a run's outputs | matches | info | Runner Pipeline, On exit (Artifact scan) | `cli/src/flow-exec.ts:251-252` |
| F-31 | A shell step's verdict | matches | info | Shell Step Execution, The rule; Gaps (Run state on a failing check; N… | `cli/src/flow-exec.ts:116` |
| F-32 | A shell step's environment, input and stopping | matches | info | Shell Step Execution, Run time sequence | `cli/src/flow-exec.ts:73-78` |
| F-33 | Shell steps and the ExecHost | diverges (decided) | low | Shell Step Execution, The rule; Runner Pipeline, Shell steps | `cli/src/flow-exec.ts:70-73` |
| F-34 | The check_command fallback and the check's container | out of scope | info | Shell Step Execution, The rule (step_defs.command); Gaps (Fresh conta… | `cli/src/flow-config.ts:35` |
| F-35 | A check that hangs | diverges (decided) | low | Shell Step Execution, Gaps (Timeouts) | `cli/src/flow-config.ts:120` |
| F-36 | A shell step whose input is missing | partial | low | Plan, Decisions this plan makes (A missing input); Run Flow Reference… | `cli/src/flow-exec.ts:60` |
| F-37 | A note given for a shell step's next run | undocumented | low | Run Flow Reference, Gates and their choices | `cli/src/flow-exec.ts:60` |

### G. Host: start, stop, resume, persistence, concurrency, controls, testing

In this area the terminal host does what the docs and the plan ask in the ordinary cases. It pins the flow in flow.json at start and starts the single entry step. Ctrl+C, SIGTERM and SIGHUP stop every run without failing it. --resume reruns cut-off steps at the same attempt and asks open gates again, and the exit codes and resume refusals match the plan. The design's worker, queue, database, screens, Cancel and Pause are absent, and recorded decisions cover most of the divergences (one folder instead of a worktree, Fail the flow instead of Cancel, no automatic retry). The real gaps are in the host's concurrency and money accounting. A stopped agent run is always recorded at $0, because both adapters report zero usage when stopped and the test fake hides this. Two run-flows can both take a folder's lock (reproduced 3 of 12 times with a stale lock). Same-named flows started in the same second share one run folder and break each other (3 of 3). There are also usability traps. The dirty check runs before the lock, so a second host is told to stash the live flow's edits. --resume forgets --max-runs and the printed hint leaves it out. .flowboard/ (artifacts and the lock) is not excluded from git, so an agent's commit makes the next run refuse. For the worker and the Monitor, run records lack session ids, pids, start and end times, and token usage, and a stopped or paused flow is saved as plain 'running'.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| G-01 | A stopped run's spend moves to wasted | bug | medium | Stopping And Cancelling — Stop a run (Money); plan Task 9 rule 6 | `cli/src/flow-exec.ts:244` |
| G-02 | One run-flow per folder (the lock) | bug | medium | Plan — Decisions: Two hosts in one folder; Run Flow Reference — Safety | `cli/src/flow-run.ts:173` |
| G-03 | A unique run folder per run | bug | medium | Plan — Global Constraints (Files); Run Flow Reference — Files written | `cli/src/flow-run.ts:108` |
| G-04 | Refusing a second host while a flow works in the folder | undocumented | medium | Run Flow Reference — Safety | `cli/src/flow-run.ts:93` |
| G-05 | The concurrency cap across --resume | undocumented | medium | Run Flow Reference — Commands; Plan — Decisions 7.5 | `cli/src/flow-run.ts:472` |
| G-06 | FlowBoard's own files kept out of the project's git | diverges (undecided) | medium | Execution Storage — Ignored by git | `cli/src/flow-run.ts:111` |
| G-07 | Run records: session id, pid, times, usage | partial | medium | Execution Data Model — Written: runs and events | `core/src/flow/engine.ts:14` |
| G-08 | --resume continues in the pinned folder | bug | medium | Run Flow Reference — Stopping and resuming | `cli/src/flow-run.ts:165` |
| G-09 | A second press cleans up like run-agent's | bug | low | Plan — Task 11 rule 1; Run Agent CLI Decisions R29 | `cli/src/flow-run.ts:427` |
| G-10 | Surviving a check that deletes the run folder | undocumented | medium | Run Flow Reference — Safety | `cli/src/flow-run.ts:336` |
| G-11 | Queued runs when the flow stops | undocumented | low | Execution Surfaces — How each state reads (queued); Job Queue — The c… | `cli/src/flow-run.ts:410` |
| G-12 | Processes orphaned by a crashed host | out of scope | low | Worker Lifecycle — Restart recovery; Plan — Left out | `cli/src/flow-exec.ts:76` |
| G-13 | Adapters expose run pids | doc inaccurate | low | Plan — Left out; Decisions: Two hosts in one folder; plan review — la… | `core/src/ports/agent-provider.ts:186` |
| G-14 | Instance and task states | partial | low | Execution Data Model — Written: task and instance state; Missing colu… | `core/src/flow/engine.ts:8` |
| G-15 | Capabilities pinned at start | partial | low | Starting A Task — What promote does | `cli/src/run.ts:48` |
| G-16 | The workspace at start: a worktree, or one folder | diverges (decided) | low | Starting A Task — What promote does; Execution Storage (task worktree… | `cli/src/flow-run.ts:91` |
| G-17 | What a stop does to the step and its attempt | diverges (decided) | low | Stopping And Cancelling — Stop a run | `core/src/flow/engine.ts:178` |
| G-18 | Cancel a task | diverges (decided) | low | Stopping And Cancelling — Cancel a task | `core/src/flow/engine.ts:121` |
| G-19 | Wasted spend when a person ends the flow | diverges (decided) | low | Stopping And Cancelling — Cancel a task | `core/src/flow/engine.ts:119` |
| G-20 | Pause a task | diverges (decided) | low | Stopping And Cancelling — Pause a task | `cli/src/flow-run.ts:465` |
| G-21 | Where processes run (ExecHost) | diverges (decided) | low | Execution Runtime — Ports execution touches | `cli/src/flow-exec.ts:73` |
| G-22 | Test doubles for whole flows | partial | low | Execution Testing — The lanes; ReplayProvider | `cli/test/flow-run.test.ts:27` |
| G-23 | Execution acceptance checks | partial | low | Execution Testing — Acceptance checks for execution | `cli/test/flow-live.test.ts:46` |
| G-24 | Start: pin the flow and start the entry step | matches | info | Starting A Task — Two moves; What Start does | `cli/src/flow-run.ts:135` |
| G-25 | Stopping the host (Ctrl+C, SIGTERM, SIGHUP) | matches | info | Worker Lifecycle — Shutting down; Stopping And Cancelling — Worker sh… | `cli/src/flow-run.ts:400` |
| G-26 | Timeouts, and automatic retry of a killed run | diverges (decided) | low | Stopping And Cancelling — Would a Stop be retried automatically? | `cli/src/flow-run.ts:389` |
| G-27 | Exit codes and --resume refusals | matches | info | Plan — Global Constraints (Exit codes); Run Flow Reference — Exit cod… | `cli/src/flow-run.ts:473` |
| G-28 | The concurrency cap | matches | info | Job Queue — The concurrency cap | `cli/src/flow-run.ts:396` |
| G-29 | Gate controls and answering questions | matches | info | Execution Controls — Decide at a gate; Recover a failure or a spent l… | `cli/src/flow-run.ts:306` |
| G-30 | Engine scenario tests | matches | info | Execution Testing — Engine scenarios | `core/test/engine.test.ts:120` |
| G-31 | The job queue and leasing | out of scope | info | Job Queue — The table; Job kinds; Leasing; Known bug | `cli/src/flow-run.ts:274` |
| G-32 | Restart recovery | out of scope | info | Worker Lifecycle — Restart recovery | `core/src/flow/engine.ts:175` |
| G-33 | Where execution state lives | out of scope | info | Execution Storage — the storage table; Execution Data Model — tables | `cli/src/flow-run.ts:345` |
| G-34 | Processes and packages | out of scope | info | Execution Runtime — Processes; Code layout | `cli/src/flow-main.ts:4` |
| G-35 | Execution API routes | out of scope | info | Execution API And Routes | none |
| G-36 | Screens and their controls other than gates | out of scope | info | Execution Surfaces; Execution Controls — Start and go back; Stop; Sha… | none |

### H. Run-flow reference and testing guide

Both notes are mostly accurate. Every error, warning, gate reason, choice label, exit code, file name and terminal line I tried matched the code at 44dd03d. I tried them with shell-only flows, --check and --mermaid, gates answered in a pseudo-terminal through expect, Ctrl+C (once and twice), --resume, the folder lock, a dirty git tree, a timeout and --max-runs 1. The biggest gaps are four. First, a gate note is silently dropped on Approve and on a Reject whose on_fail route is forward. Second, shell-step output is never printed or logged, so the guide's "draft prints draft v1" and "build prints the plan" cannot be seen. Third, the note and missing-inputs lines come right after the task text, not at the end of the prompt. Fourth, a check that cleans untracked files leaves the run unresumable, because flow.json is not rewritten, and it also deletes the folder lock. Smaller inaccuracies: errors arrive in more stages than described; the Retry rule at a stuck escalation is wrong; Retries at a verdict gate are not capped by max_attempts and use up its budget; the guide's live-test count and flow-only test command are off; two design-note numbers in the settled-rules table point to other questions; and the max_attempts in the at-a-glance example has no effect.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| H-01 | Usage lines, flag combinations and exit codes | matches | info | Run Flow Reference — Commands; Exit codes | `cli/src/flow-run.ts:60` |
| H-02 | Keys, names, flow name, relative paths, error line format | matches | info | Run Flow Reference — Rules for the whole file | `cli/src/flow-config.ts:66` |
| H-03 | Order in which errors are reported | doc inaccurate | low | Run Flow Reference — Rules for the whole file (Errors) | `cli/src/flow-config.ts:67` |
| H-04 | Flow and step fields, defaults, closing line, limits warning | matches | info | Run Flow Reference — Flow fields; Step fields | `cli/src/flow-config.ts:124` |
| H-05 | max_attempts on review in the at-a-glance example | doc inaccurate | low | Run Flow Reference — At a glance | `core/src/flow/engine.ts:87` |
| H-06 | Shell steps: command, env, stdin, output tail, process group | matches | info | Run Flow Reference — Shell steps | `cli/src/flow-exec.ts:73` |
| H-07 | Where a shell step's output goes | undocumented | medium | Run Flow Reference — Shell steps | `cli/src/flow-exec.ts:80` |
| H-08 | Edges, entry, routes, joins, rework, budget, stuck checks | matches | info | Run Flow Reference — Edges, loops and joins; Loops | `core/src/flow/engine.ts:85` |
| H-09 | Which hex ids the fingerprint removes | doc inaccurate | low | Run Flow Reference — Loops (Stuck checks) | `core/src/flow/fingerprint.ts:6` |
| H-10 | The provider's result as an outcome source | matches | info | Run Flow Reference — How a step's outcome is decided | `cli/src/flow-exec.ts:248` |
| H-11 | Position of the missing-inputs line | doc inaccurate | low | Run Flow Reference — How a step's outcome is decided (A missing input) | `cli/src/flow-exec.ts:224` |
| H-12 | Gate prompts, reasons, choices, Reject rule, turns, no-terminal pause | matches | info | Run Flow Reference — Gates and their choices | `cli/src/flow-run.ts:306` |
| H-13 | Where a gate note goes | doc inaccurate | low | Run Flow Reference — Gates and their choices | `core/src/flow/engine.ts:163` |
| H-14 | Retry at a stuck escalation | doc inaccurate | low | Run Flow Reference — Gates and their choices (retry) | `core/src/flow/engine.ts:167` |
| H-15 | Retry at a verdict gate versus max_attempts | doc inaccurate | low | Run Flow Reference — Step fields (max_attempts); Gates and their choi… | `core/src/flow/engine.ts:171` |
| H-16 | Ctrl+C, second press, resume rules, refusals, totals | matches | info | Run Flow Reference — Stopping and resuming | `cli/src/flow-run.ts:417` |
| H-17 | Queued runs when the flow stops | undocumented | low | Run Flow Reference — Stopping and resuming; Files written | `cli/src/flow-run.ts:410` |
| H-18 | Uncommitted-changes check, folder lock, stale lock | matches | info | Run Flow Reference — Safety | `cli/src/flow-run.ts:93` |
| H-19 | Run folder deleted by a check | partial | medium | Run Flow Reference — Safety (The run folder is off limits) | `cli/src/flow-run.ts:336` |
| H-20 | Lock removed by a cleaning check | undocumented | low | Run Flow Reference — Safety (One run-flow per folder) | `cli/src/flow-run.ts:111` |
| H-21 | Files written and their contents | matches | info | Run Flow Reference — Files written | `cli/src/flow-run.ts:135` |
| H-22 | How a timeout is recorded | undocumented | low | Run Flow Reference — Step fields (timeout_minutes); Files written | `cli/src/flow-run.ts:389` |
| H-23 | Terminal lines | doc inaccurate | low | Run Flow Reference — Files written (terminal paragraph) | `cli/src/flow-run.ts:249` |
| H-24 | Design-note question numbers in the settled-rules table | doc inaccurate | low | Run Flow Reference — Rules this command settles | none |
| H-25 | What Ctrl+C is called | doc inaccurate | low | Run Flow Reference — Rules this command settles (Execution #49, #50) | `cli/src/flow-run.ts:465` |
| H-26 | Left for later: process ids | matches | info | Run Flow Reference — Rules this command settles (Left for later) | `core/src/ports/agent-provider.ts:186` |
| H-27 | Automated suite commands and the flow-only subset | doc inaccurate | low | Testing The Run Flow CLI — 1. Automated suite (free) | `../package.json:10` |
| H-28 | How many live tests pnpm test:live runs | doc inaccurate | low | Testing The Run Flow CLI — 2. Live test | `adapters/test/opencode-live.test.ts:17` |
| H-29 | Scratch setup, alias and sample output | matches | info | Testing The Run Flow CLI — 3. Hand-run scenarios (Set up a scratch fo… | `cli/src/flow-main.ts:4` |
| H-30 | Free scenarios 1-5 and 7-11 with their flow files | matches | info | Testing The Run Flow CLI — Free scenarios: shell steps only; Free flo… | `cli/src/flow-run.ts:465` |
| H-31 | Shell output in scenarios 6 and 14 | doc inaccurate | medium | Testing The Run Flow CLI — Free scenarios #6; Agent scenarios #14 | `cli/src/flow-exec.ts:80` |
| H-32 | Where the note sits in the rework prompt | doc inaccurate | low | Testing The Run Flow CLI — Agent scenarios #14 | `cli/src/flow-exec.ts:228` |
| H-33 | Agent scenarios 12-17 and their files | matches | info | Testing The Run Flow CLI — Agent scenarios (cost a little) | `core/src/flow/engine.ts:81` |
| H-34 | Reading a run: files and jq commands | matches | info | Testing The Run Flow CLI — Reading a run | `cli/src/flow-exec.ts:54` |

### I. Run-flow deferred issues, review loop, Monitor readiness

The three notes match the code at 44dd03d closely. No code changed after 20e6f7a, so every Run Flow Deferred Issues row is still open and correctly located. The Review Loop's flow and its variations pass --check and behave as described when fed to advance(). The readiness note's Monitor flow gives exactly the --check line and Mermaid block it quotes. A scratch script confirms the recorded open decision (notes typed at Approve, or at Reject over a forward edge, reach no run), but the problem is wider than recorded: a Reject note is also dropped when the rework target's attempts are spent, which contradicts the Review Loop's approval variation and the readiness note. Three gaps are missing from the deferred list: a shell step without produces keeps none of its output (so a rework from it starts blind); checks orphaned by kill -9 fall outside the proposed pid fix; and a rare lock-replacement race lets two hosts share a folder. The readiness note says every run's log holds events, but shell runs log no output at all. Its other errors are small wording slips: answering is not a decide event, OpenCode already logs live dollars, runs stopped by Fail the flow are not wasted, and placeholder files must not be empty.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| I-01 | Gate note dropped at Approve and at Reject over a forward on_fail edge | matches | info | Run Flow Deferred Issues, Needs a decision | `core/src/flow/engine.ts:163` |
| I-02 | Reject note dropped when the rework target's attempts are spent | undocumented | medium | Run Flow Deferred Issues, Needs a decision; also Run Flow Review Loop… | `core/src/flow/engine.ts:92` |
| I-03 | Output of a shell step without produces | undocumented | medium | Run Flow Deferred Issues (no row for it); Run Flow Reference, Shell s… | `cli/src/flow-exec.ts:108` |
| I-04 | Stale lock only warns; agent pids exist but are not recorded | matches | info | Run Flow Deferred Issues, Safety and leftovers (row 1) | `cli/src/flow-run.ts:183` |
| I-05 | Checks orphaned by kill -9 | undocumented | low | Run Flow Deferred Issues, Safety and leftovers (row 1) | `cli/src/flow-exec.ts:76` |
| I-06 | Second Ctrl+C leaves a SIGTERM-ignoring check running | matches | info | Run Flow Deferred Issues, Safety and leftovers (row 2) | `cli/src/flow-run.ts:427` |
| I-07 | What guards cover | doc inaccurate | low | Run Flow Deferred Issues, Safety and leftovers (row 4); Run Flow Revi… | `core/src/guard.ts:41` |
| I-08 | Two entries: a loop back to the first step plus a repair step reached only by rework | matches | info | Run Flow Deferred Issues, Flow rules (row 1) | `core/src/flow/flow.ts:36` |
| I-09 | A failing step whose only edges are always moves on | matches | info | Run Flow Deferred Issues, Flow rules (row 2) | `core/src/flow/engine.ts:102` |
| I-10 | Whole-number step names move to the front | matches | info | Run Flow Deferred Issues, Flow rules (row 4) | `cli/src/flow-config.ts:96` |
| I-11 | --resume messages for corrupt or shapeless state | matches | info | Run Flow Deferred Issues, Rough edges (rows 2-3) | `cli/src/flow-run.ts:243` |
| I-12 | No test pins the missing flow.json refusal | matches | info | Run Flow Deferred Issues, Rough edges (row 7) | `cli/src/flow-run.ts:241` |
| I-13 | Unquoted --resume hint | matches | info | Run Flow Deferred Issues, Rough edges (row 4) | `cli/src/flow-run.ts:472` |
| I-14 | flow.jsonl misses the transition run-flow crashed in | matches | info | Run Flow Deferred Issues, Rough edges (row 5) | `cli/src/flow-run.ts:345` |
| I-15 | Shell and agent run logs shape the result line differently | matches | info | Run Flow Deferred Issues, Rough edges (row 10) | `cli/src/flow-exec.ts:95` |
| I-16 | Replacing a stale lock is racy | bug | low | Run Flow Deferred Issues (no row for it); Run Flow Reference, Safety | `cli/src/flow-run.ts:184` |
| I-17 | Where the plan's left-out scope is listed | doc inaccurate | low | Run Flow Deferred Issues, introduction | none |
| I-18 | Cited design review file | doc inaccurate | low | Run Flow Deferred Issues, Rough edges (last row) | `core/src/ports/agent-provider.ts:186` |
| I-19 | The review loop: rework inputs, wasted runs, reset attempts, escalation | matches | info | Run Flow Review Loop, The flow and What happens | `core/src/flow/engine.ts:92` |
| I-20 | The Review Loop variations | matches | info | Run Flow Review Loop, Variations | `cli/src/flow-config.ts:151` |
| I-21 | Where the set_outcome reason shows | doc inaccurate | low | Run Flow Review Loop, Things to get right | `cli/src/flow-run.ts:390` |
| I-22 | The reviewer must rewrite its output every round | matches | info | Run Flow Review Loop, Things to get right | `cli/src/flow-exec.ts:251` |
| I-23 | deny_paths blocks the reviewer's edits, not its reads | matches | info | Run Flow Review Loop, The flow; Things to get right | `core/src/guard.ts:33` |
| I-24 | The Monitor's flow as a run-flow file | matches | info | Run Flow Monitor Readiness, The Monitor's flow as a run-flow file | `cli/src/flow-config.ts:161` |
| I-25 | Placeholder files for --check | doc inaccurate | low | Run Flow Monitor Readiness, The Monitor's flow as a run-flow file | `cli/src/flow-config.ts:131` |
| I-26 | Hand-off rules, send-back and wasted accounting | matches | info | Run Flow Monitor Readiness, What already matches | `core/src/flow/engine.ts:68` |
| I-27 | Shell runs' logs as a Monitor source | partial | medium | Run Flow Monitor Readiness, What already matches (Events already have… | `cli/src/flow-exec.ts:95` |
| I-28 | The note's answer to #17: what counts as wasted | doc inaccurate | low | Run Flow Monitor Readiness, Monitor open questions the engine answers… | `core/src/flow/engine.ts:118` |
| I-29 | Answering questions from outside the terminal | doc inaccurate | low | Run Flow Monitor Readiness, Controls from outside the terminal | `cli/src/flow-exec.ts:206` |
| I-30 | Stopping one run is host-only work | matches | info | Run Flow Monitor Readiness, Controls from outside the terminal | `core/src/flow/engine.ts:141` |
| I-31 | Live cost for OpenCode runs | doc inaccurate | low | Run Flow Monitor Readiness, Data the engine doesn't keep yet (Live co… | `adapters/src/agent/opencode/normalize.ts:76` |
| I-32 | Times, queued, asking, model and tokens are not in state.json | matches | info | Run Flow Monitor Readiness, Data the engine doesn't keep yet | `core/src/flow/engine.ts:14` |
| I-33 | Agent Providers Index lines for the run-flow notes | matches | info | Agent Providers Index, the five lines the branch added (most concerns… | none |

### J. Execution open questions and roadmap

About 50 of the 72 Execution Open Questions bear on the engine, the flow file, the runner or the terminal host. The branch's plan decisions settle nearly all of them, and the code at 44dd03d follows those decisions. The Open Questions note still reads every one as open; #43, #52 and #53 were already settled by D27, the Claude Code Adapter and run-agent's R3/R4 on dev. The real gaps: #41 (a shell step killed by a signal, or exiting 127, counts as a work fail and reworks an agent step), #13 (a run waiting for a --max-runs slot cannot be told from a running one in state.json), #6 (no manual step kind, and no Left out entry for it), and #21 (notes typed at Approve or at a forward Reject are dropped). The plan's own text is wrong in three places: it cites #5 for 'a silent approval step', it defines the entry as the step with no route into it (since 148d7a6 the code allows rework routes into it), and it says the adapters expose no pids. The Execution Index's headline, 'the engine only ever sees work outcomes; the runner retries crashes', no longer describes the built engine, which opens run_failed gates and retries nothing. The Roadmap is stale in milestone order (the M5 engine now exists ahead of the M3 worker) and in its claude-CLI-only out-of-scope line.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| J-01 | #2 what Start does and what it pins | matches | info | Execution Open Questions, #2 What Start does, and what it pins | `core/src/flow/engine.ts:155` |
| J-02 | #4 rework target is not a join; forward on_fail routes still join | diverges (decided) | low | Execution Open Questions, #4 Is implement a join? | `core/src/flow/engine.ts:193` |
| J-03 | #5 approval and open questions on one step (mis-cited by the plan) | doc inaccurate | low | Plan, Decisions this plan makes, row 'Execution #5, #71'; same row in… | `cli/src/flow-exec.ts:239` |
| J-04 | #6 what a manual step does | missing (in scope) | low | Execution Open Questions, #6 What a manual step does | `cli/src/flow-config.ts:115` |
| J-05 | #7 which source carries the outcome | diverges (decided) | low | Execution Open Questions, #7 Which artifact carries the outcome | `cli/src/flow-exec.ts:248` |
| J-06 | #8 where set_outcome's reason goes | diverges (decided) | low | Execution Open Questions, #8 Where set_outcome's reason goes | `core/src/flow/engine.ts:134` |
| J-07 | #9 how an 'earlier' step is decided | diverges (decided) | low | Execution Open Questions, #9 How earlier step is decided | `core/src/flow/flow.ts:26` |
| J-08 | #10 task done rule | diverges (decided) | low | Execution Open Questions, #10 Task done (and Task Completion's propos… | `core/src/flow/engine.ts:194` |
| J-09 | #11 task status at a plain approval gate | out of scope | info | Execution Open Questions, #11 Task status at a plain approval gate | `core/src/flow/engine.ts:15` |
| J-10 | #12 instance states after Reject, Fail task and infra failure | diverges (decided) | low | Execution Open Questions, #12; Execution State Machines, step instanc… | `core/src/flow/engine.ts:143` |
| J-11 | #13 queued versus running | missing (in scope) | medium | Execution Open Questions, #13 queued is not a state | `core/src/flow/engine.ts:53` |
| J-12 | #14 escalate or fail at max_attempts | matches | info | Execution Open Questions, #14 Escalate or fail at max_attempts? | `core/src/flow/engine.ts:92` |
| J-13 | #15 Retries field versus max_attempts | matches | info | Execution Open Questions, #15 The Retries field versus max_attempts | `cli/src/flow-config.ts:101` |
| J-14 | #16 after a Retry at an escalation | matches | info | Execution Open Questions, #16 After a Retry | `core/src/flow/engine.ts:167` |
| J-15 | #17 which runs are wasted on rework | diverges (decided) | low | Execution Open Questions, #17 Which runs are wasted on rework | `core/src/flow/engine.ts:72` |
| J-16 | #18 downstream attempts on a loop | matches | info | Execution Open Questions, #18 Downstream attempts | `core/src/flow/engine.ts:79` |
| J-17 | #19 stripping digits versus fewer failing tests | diverges (decided) | low | Execution Open Questions, #19; Stuck Detection And Fingerprints | `core/src/flow/fingerprint.ts:22` |
| J-18 | #20 where the escalation gate sits | matches | info | Execution Open Questions, #20 Where the escalation gate sits | `core/src/flow/engine.ts:91` |
| J-19 | #21 where the reject reason and Retry note go | partial | medium | Execution Open Questions, #21; Run Flow Reference, Gates and their ch… | `cli/src/flow-exec.ts:228` |
| J-20 | #23 Retry as-is for transient failures | out of scope | info | Execution Open Questions, #23 Retry as-is for transient failures | `core/src/flow/engine.ts:166` |
| J-21 | #25 how the runner classifies a failure | out of scope | info | Execution Open Questions, #25 How the runner classifies a failure | `cli/src/flow-exec.ts:245` |
| J-22 | #26 what Retry does after a non-transient failure | diverges (decided) | low | Execution Open Questions, #26 Unblocking after a non-transient failure | `core/src/flow/engine.ts:166` |
| J-23 | #27 a stopped run: cancelled or failed | diverges (decided) | low | Execution Open Questions, #27 A stopped run: cancelled or failed? | `core/src/flow/engine.ts:138` |
| J-24 | #28 what the engine does after a Stop | diverges (decided) | low | Execution Open Questions, #28; Stopping And Cancelling | `core/src/flow/engine.ts:173` |
| J-25 | #29 Pause | diverges (decided) | low | Execution Open Questions, #29 Pause | `cli/src/flow-run.ts:400` |
| J-26 | #30 restart: fail with a hint, or retry | diverges (decided) | low | Execution Open Questions, #30 Restart: fail with a hint, or retry? | `core/src/flow/engine.ts:175` |
| J-27 | #31 re-attaching to a live process | out of scope | info | Execution Open Questions, #31 Re-attaching to a live process | `cli/src/flow-run.ts:182` |
| J-28 | #32 graceful shutdown and re-queue | diverges (decided) | low | Execution Open Questions, #32 Graceful shutdown and re-queue | `cli/src/flow-run.ts:409` |
| J-29 | #36 run cap default and shell slots | diverges (decided) | low | Execution Open Questions, #36 VIBE_MAX_RUNS default | `cli/src/flow-run.ts:396` |
| J-30 | #38 args.json or spec.json | diverges (decided) | low | Execution Open Questions, #38 args.json or spec.json | `cli/src/flow-exec.ts:234` |
| J-31 | #39 where per-run mcp.json and settings.json are written | diverges (decided) | low | Execution Open Questions, #39 | `adapters/src/agent/claude/options.ts:61` |
| J-32 | #40 shell step on the task host or a fresh container | out of scope | info | Execution Open Questions, #40 Shell step: task host or a fresh contai… | `cli/src/flow-exec.ts:73` |
| J-33 | #41 shell steps that cannot start, or are killed | diverges (undecided) | medium | Execution Open Questions, #41 Shell steps that cannot start | `cli/src/flow-exec.ts:116` |
| J-34 | #43 step kinds | partial | low | Execution Open Questions, #43 Step kinds | `cli/src/flow-config.ts:16` |
| J-35 | #44 preamble contents and placeholders | out of scope | info | Execution Open Questions, #44 Preamble and placeholders | `cli/src/flow-exec.ts:226` |
| J-36 | #46 wasted in an append-only journal | diverges (decided) | low | Execution Open Questions, #46 wasted in an append-only journal | `core/src/flow/engine.ts:72` |
| J-37 | #48 shared worktree | matches | info | Execution Open Questions, #48 Shared worktree | `cli/src/flow-config.ts:152` |
| J-38 | #49 one branch blocked, the other running | diverges (decided) | low | Execution Open Questions, #49 One branch blocked, the other running | `core/src/flow/engine.ts:187` |
| J-39 | #50 cancel mid-fan-out | out of scope | info | Execution Open Questions, #50 Cancel mid-fan-out | `core/src/flow/engine.ts:115` |
| J-40 | #52 empty --settings file or a hooks file | diverges (decided) | low | Execution Open Questions, #52 | `adapters/src/agent/claude/options.ts:80` |
| J-41 | #53 bypassPermissions on the host tier | diverges (decided) | low | Execution Open Questions, #53 bypassPermissions on the host tier | `cli/src/config.ts:191` |
| J-42 | #54 does the MCP process open the database | out of scope | info | Execution Open Questions, #54 Does the MCP process open the database? | `ask-user/src/server.ts:130` |
| J-43 | #55 would a stopped run be retried automatically | diverges (decided) | low | Execution Open Questions, #55 Would a Stop be retried automatically? | `cli/src/flow-run.ts:409` |
| J-44 | #57 a failing shell run's run state | diverges (decided) | low | Execution Open Questions, #57 A failing shell run's runs.state | `cli/src/flow-exec.ts:116` |
| J-45 | #58 finding a check's previous failed run | diverges (decided) | low | Execution Open Questions, #58 | `core/src/flow/engine.ts:90` |
| J-46 | #62 event envelope version and live cost | partial | low | Execution Open Questions, #62 The event envelope and live cost | `core/src/ports/events.ts:32` |
| J-47 | #64 approving over an agent's fail | diverges (decided) | low | Execution Open Questions, #64 Approving over an agent's fail | `core/src/flow/engine.ts:163` |
| J-48 | #65 how many entry steps | diverges (decided) | low | Execution Open Questions, #65 How many entry steps | `core/src/flow/flow.ts:36` |
| J-49 | #66 attempts counts the first run | matches | info | Execution Open Questions, #66 When does attempts count the first run? | `core/src/flow/engine.ts:53` |
| J-50 | #67 twice in a row or previous failed run | diverges (decided) | low | Execution Open Questions, #67 | `core/src/flow/engine.ts:93` |
| J-51 | #68 how a limit or timeout kill is classified | diverges (decided) | low | Execution Open Questions, #68 How a physical limit kill is classified | `cli/src/flow-run.ts:389` |
| J-52 | #71 proving the no-outcome gate | diverges (decided) | low | Execution Open Questions, #71 Proving the no-outcome gate on the seed… | `core/src/flow/engine.ts:147` |
| J-53 | #72 test runner | diverges (decided) | low | Execution Open Questions, #72 Test runner: tsx --test or vitest | `core/test/engine.test.ts:1` |
| J-54 | #1, #3, #22, #24, #33, #34, #35, #37, #42, #45, #47, #51, #56, #59, #60, #61, #63, #69, #… | out of scope | info | Execution Open Questions, #1, #3, #22, #24, #33-#35, #37, #42, #45, #… | none |
| J-55 | Plan's definition of the entry step | doc inaccurate | low | Plan, Decisions this plan makes: '(Alex) Where routes live' and 'Flow… | `core/src/flow/flow.ts:36` |
| J-56 | Plan says the adapters expose no pids | doc inaccurate | low | Plan, Decisions 'Two hosts in one folder' and Left out 'stopping agen… | `core/src/ports/agent-provider.ts:186` |
| J-57 | Roadmap v1: M5 the engine | matches | info | Execution Roadmap, v1 scope (PRD), M5 row | `core/src/flow/engine.ts:42` |
| J-58 | Roadmap milestone order | diverges (decided) | low | Execution Roadmap, v1 scope (PRD), M3 row | none |
| J-59 | Roadmap v1: M2, M3, M4, M6, M7, M9, draft mode, sandboxed execution | out of scope | info | Execution Roadmap, v1 scope (PRD), the M2, M3, M4, M6, M7 and M9 rows… | none |
| J-60 | Roadmap beyond PRD: Pause a task | diverges (decided) | low | Execution Roadmap, Designed beyond the PRD, Pause row | `cli/src/flow-run.ts:400` |
| J-61 | Roadmap beyond PRD: Retry as-is, Allow host & retry | partial | low | Execution Roadmap, Designed beyond the PRD, Retry as-is row | `core/src/flow/engine.ts:166` |
| J-62 | Roadmap beyond PRD: queued as a visible step state | missing (in scope) | low | Execution Roadmap, Designed beyond the PRD, queued row | `core/src/flow/engine.ts:53` |
| J-63 | Roadmap beyond PRD: graceful shutdown to cancelled | diverges (decided) | low | Execution Roadmap, Designed beyond the PRD, Graceful shutdown row | `cli/src/flow-run.ts:433` |
| J-64 | Roadmap beyond PRD: run spec snapshot and replay | partial | low | Execution Roadmap, Designed beyond the PRD, Run spec snapshot row | `cli/src/flow-exec.ts:234` |
| J-65 | Roadmap beyond PRD: Start button, demote, worker slots with per-slot Stop, re-attach by p… | out of scope | info | Execution Roadmap, Designed beyond the PRD, remaining rows | none |
| J-66 | Roadmap out of scope: every model call through the claude CLI | diverges (decided) | low | Execution Roadmap, Out of scope | `cli/src/flow-config.ts:124` |
| J-67 | Index: the engine only sees work outcomes; the runner retries crashes | diverges (decided) | medium | Execution Index, 'The one idea to get right first' callout | `core/src/flow/engine.ts:141` |
| J-68 | Index: a missing outcome is never a pass; a spent loop goes to a person | matches | info | Execution Index, 'The one idea to get right first' callout | `core/src/flow/engine.ts:101` |

### K. Flow Design open questions and roadmap, and the analysis

The engine and the run-flow host follow the analysis's §6 design closely. The plan decides every §8 rule the analysis asked to settle, and the code implements each one as decided; the differences from §6 (set_outcome writes a file, the host has its own prompt queue, artifacts have fixed per-type paths, there are no name or agent keys) are all recorded somewhere. The Flow Design notes have not caught up: Open Questions still treats #9, #19, #22, #23, #24 and #37 as open or moot, and #11 and #20 as pending items, although run-flow answers them; the Roadmap's M5 engine items are now built in core, with no API in front. The real gaps: a max_attempts on a step that no rework route targets silently does nothing (the reference's own example does this, against §10's 'loop limits that fail at load time'); a failing shell step without produces keeps its output nowhere; there is no known-types check and no content hash; and there is no explicit entry key, so flows with both a loop and a repair step are rejected. Before the canvas writes these files, someone has to decide whether folder and task stay in a flow file, how flows are named and versioned, and where positions and library metadata go, because the schema is strict. The plan is wrong that the adapters expose no pids, and its entry rule leaves out the rework-only fallback.

| ID | Functionality | Status | Severity | Doc | Code |
|---|---|---|---|---|---|
| K-01 | #9 Whether a step names its provider | diverges (decided) | low | Flow Design Open Questions — Steps, #9 | `cli/src/flow-config.ts:124` |
| K-02 | #10 Step kind and capability on a step | partial | low | Flow Design Open Questions — Steps, #10 | `cli/src/flow-config.ts:115` |
| K-03 | #11 max_attempts, and what happens at the cap | matches | info | Flow Design Open Questions — Steps, #11 | `core/src/flow/engine.ts:85` |
| K-04 | #12 A per-task cost ceiling | out of scope | info | Flow Design Open Questions — Steps, #12 | `cli/src/flow-run.ts:467` |
| K-05 | #13 Sandbox levels and the unattended rule | out of scope | low | Flow Design Open Questions — Steps, #13 | `cli/src/config.ts:188` |
| K-06 | #15 Model ids and effort values | diverges (undecided) | low | Flow Design Open Questions — Steps, #15 | `cli/src/run.ts:55` |
| K-07 | #16 Prompt template placeholders; §10 template variables checked before a run | out of scope | low | Flow Design Open Questions — Steps, #16; Multi-Agent Orchestration An… | `cli/src/flow-config.ts:144` |
| K-08 | #19 Joins behind conditional routes | diverges (decided) | low | Flow Design Open Questions — Routes and topology, #19; Multi-Agent Or… | `core/src/flow/engine.ts:186` |
| K-09 | #20 Downstream attempts on rework | matches | info | Flow Design Open Questions — Routes and topology, #20; Multi-Agent Or… | `core/src/flow/engine.ts:79` |
| K-10 | #22 Whether an on_fail back-edge counts as ancestry | matches | info | Flow Design Open Questions — Validation, #22; Multi-Agent Orchestrati… | `core/src/flow/flow.ts:103` |
| K-11 | #23 One entry step, and one producer per artifact type | diverges (decided) | medium | Flow Design Open Questions — Validation, #23; Multi-Agent Orchestrati… | `core/src/flow/flow.ts:36` |
| K-12 | #24 Artifact type keys or file names | diverges (decided) | low | Flow Design Open Questions — Validation, #24 | `cli/src/flow-exec.ts:35` |
| K-13 | #25 Seeded artifact types and a known-types check | diverges (undecided) | low | Flow Design Open Questions — Validation, #25 (and #24's type registry) | `core/src/flow/flow.ts:93` |
| K-14 | #26 Provider-match severity, now that flows mix providers | out of scope | low | Flow Design Open Questions — Validation, #26 | `adapters/src/agent/opencode/provider.ts:32` |
| K-15 | #31 Edge condition names; §6.1 routes as a top-level edges list | matches | info | Flow Design Open Questions — Naming and seed details, #31; Multi-Agen… | `cli/src/flow-config.ts:45` |
| K-16 | #33 Dependencies the contract cannot see | diverges (undecided) | low | Flow Design Open Questions — Naming and seed details, #33 | `core/src/flow/flow.ts:102` |
| K-17 | #37 Budget and turn cap on every ai step | diverges (decided) | low | Flow Design Open Questions — Added in the second grounding pass, #37 | `cli/src/flow-config.ts:138` |
| K-18 | #39 What a manual step does | diverges (undecided) | low | Flow Design Open Questions — Added in the second grounding pass, #39 | `cli/src/flow-config.ts:115` |
| K-19 | #7, #8 When a flow is pinned, and a pinned flow that no longer validates | out of scope | info | Flow Design Open Questions — Versions and pinning, #7, #8 | `cli/src/flow-run.ts:135` |
| K-20 | #1, #2, #4 Where flows live and what identifies a flow, in the flow file format | diverges (decided) | medium | Flow Design Open Questions — Where flows live and who owns them, #1,… | `cli/src/flow-config.ts:40` |
| K-21 | #3, #5 Library metadata and node positions in the flow file | out of scope | low | Flow Design Open Questions — #3, #5 | `cli/src/flow-config.ts:40` |
| K-22 | Questions about the canvas, library, database, web app or sandbox: #6, #14, #17, #21, #27… | out of scope | info | Flow Design Open Questions — #6, #14, #17, #21, #27, #28, #29, #30, #… | none |
| K-23 | Roadmap: validation with readable errors (ancestor-produced requires, one entry, known ty… | partial | low | Flow Design Roadmap — v1 scope, from M5 and Epic 5 | `core/src/flow/flow.ts:66` |
| K-24 | Roadmap: conditional edges, fan-out, joins, rework, max_attempts escalation (engine side) | matches | info | Flow Design Roadmap — v1 scope, Story 5.2 | `core/src/flow/engine.ts:97` |
| K-25 | Roadmap: shell check steps (PRD §7) | diverges (decided) | medium | Flow Design Roadmap — v1 scope, 'Shell check steps (PRD §7)'; rules q… | `cli/src/flow-exec.ts:108` |
| K-26 | Roadmap: flow tests for a conditional edge that never fires, cancel mid-fan-out, retry af… | partial | info | Flow Design Roadmap — v1 scope, Story 5.3 | `core/test/engine.test.ts:120` |
| K-27 | Roadmap acceptance: a flow that requires an artifact nobody produces is refused | matches | info | Flow Design Roadmap — From elsewhere, acceptance (PRD §16; Story 10.1) | `core/src/flow/flow.ts:105` |
| K-28 | Roadmap: the reachability check; #18 an unwired new step | diverges (decided) | low | Flow Design Roadmap — Designed in the mockup, beyond the PRD; Flow De… | `core/src/flow/flow.ts:78` |
| K-29 | Roadmap: the versioning API, board_order, the Story 8.2 editor, the seed template, the ne… | out of scope | info | Flow Design Roadmap — v1 scope (M5 API items, M8 and Story 8.2, From… | none |
| K-30 | Roadmap: designer features designed in the mockup beyond the PRD | out of scope | info | Flow Design Roadmap — Designed in the mockup, beyond the PRD | `core/src/flow/flow.ts:14` |
| K-31 | §6.1 The flow file's name: and agent: keys | diverges (decided) | low | Multi-Agent Orchestration Analysis §6.1 | `cli/src/flow-config.ts:40` |
| K-32 | §6.2 run-agent keys become step keys | matches | info | Multi-Agent Orchestration Analysis §6.2; §6.1 prompt parts | `cli/src/flow-config.ts:30` |
| K-33 | §6.3 The engine as one pure function | diverges (decided) | info | Multi-Agent Orchestration Analysis §6.3 | `core/src/flow/engine.ts:42` |
| K-34 | §6.4 run-flow checks the flow, then runs it in one process, with a concurrency cap, --che… | matches | info | Multi-Agent Orchestration Analysis §6.4 | `cli/src/flow-run.ts:63` |
| K-35 | §6.4 Questions, gates and escalations through the existing broker | diverges (decided) | low | Multi-Agent Orchestration Analysis §6.4 | `cli/src/flow-run.ts:192` |
| K-36 | §6.4 Run logs, a state file per transition and --resume; §10 two-stage pauses; §9 a termi… | matches | info | Multi-Agent Orchestration Analysis §6.4, §9, §10 | `cli/src/flow-run.ts:341` |
| K-37 | §6.4 Artifacts found by modification time and matched to produces | diverges (decided) | low | Multi-Agent Orchestration Analysis §6.4 | `cli/src/flow-exec.ts:251` |
| K-38 | §6.5 What changes in core, cli and adapters | matches | info | Multi-Agent Orchestration Analysis §6.5 | `core/src/index.ts:7` |
| K-39 | §6.5 set_outcome on the ask-user server's socket protocol | diverges (decided) | low | Multi-Agent Orchestration Analysis §6.5 | `ask-user/src/server.ts:117` |
| K-40 | §8 Whether a rework target with several incoming edges is a join | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #4) | `core/src/flow/engine.ts:193` |
| K-41 | §8 Which source carries the outcome, and which wins | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #7) | `cli/src/flow-exec.ts:248` |
| K-42 | §8 How 'earlier step' is decided for rework | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #9) | `core/src/flow/flow.ts:26` |
| K-43 | §8 Which runs count as wasted | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #17) | `core/src/flow/engine.ts:70` |
| K-44 | §8 Approving over an agent's fail, and gating a silent approval step once | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #64, #71) | `core/src/flow/engine.ts:147` |
| K-45 | §8 Whether attempts count the first run | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #66) | `core/src/flow/engine.ts:92` |
| K-46 | §8 One branch blocked while another runs; cancel mid-fan-out | matches | info | Multi-Agent Orchestration Analysis §8 (Execution #49, #50) | `core/src/flow/engine.ts:115` |
| K-47 | §9 Writes collide in one shared folder | partial | low | Multi-Agent Orchestration Analysis §9 | `cli/src/flow-config.ts:136` |
| K-48 | §9 A flow stalls quietly behind a route that never fires | matches | info | Multi-Agent Orchestration Analysis §9 | `core/src/flow/engine.ts:196` |
| K-49 | §9 Exit 0 does not mean done | matches | info | Multi-Agent Orchestration Analysis §9 | `core/src/flow/engine.ts:144` |
| K-50 | §9 Spend multiplies across fan-out, loops and attempts | partial | low | Multi-Agent Orchestration Analysis §9 | `cli/src/flow-run.ts:396` |
| K-51 | §9 A second orchestrator inside each step | out of scope | info | Multi-Agent Orchestration Analysis §9 | `adapters/src/agent/claude/normalize.ts:108` |
| K-52 | §9 Hand-offs between agents are untrusted | out of scope | info | Multi-Agent Orchestration Analysis §9 | `cli/src/flow-exec.ts:230` |
| K-53 | §10 A linter run before spending money | matches | info | Multi-Agent Orchestration Analysis §10 | `cli/src/flow-run.ts:85` |
| K-54 | §10 A diagram export with an overlay of a run's route | partial | info | Multi-Agent Orchestration Analysis §10 | `cli/src/flow-config.ts:161` |
| K-55 | §10 A content hash over the flow and its prompt files, recorded on each run | missing (in scope) | low | Multi-Agent Orchestration Analysis §10 (and §7.2 option a) | `cli/src/flow-run.ts:135` |
| K-56 | §10 Loop limits that fail at load time when they cannot apply | missing (in scope) | medium | Multi-Agent Orchestration Analysis §10 | `core/src/flow/engine.ts:87` |
| K-57 | §10 A completeness contract for dynamic fan-out | out of scope | info | Multi-Agent Orchestration Analysis §10 | none |
| K-58 | §11 Suggested order of work | matches | info | Multi-Agent Orchestration Analysis §11 | `cli/test/flow-live.test.ts:14` |
| K-59 | Plan: the adapters expose no pids, so orphaned agents cannot be stopped | doc inaccurate | medium | Run-flow plan — Decisions ('Two hosts in one folder') and Left out; d… | `core/src/ports/agent-provider.ts:186` |
| K-60 | Plan: the entry is the step no edge points to | doc inaccurate | low | Run-flow plan — Decisions ('Where routes live'; 'Flow Design #23, Exe… | `core/src/flow/flow.ts:36` |
| K-M01 | A failing step that produces nothing sends its rework target back blind; Run Flow Referen… | undocumented | medium | Run Flow Reference — At a glance, and Loops ('What rework does'); Mul… | `core/src/flow/engine.ts:81` |

## Refuted by the skeptics

None: every finding a skeptic checked held up, in full or as corrected.

## Coverage

| Area | Note | Coverage | Comment |
|---|---|---|---|
| A | [[Flow Design Overview]] | full | Purpose, place in the system, the four cards and every design principle checked (A-27, A-35, A-36); board and cost rollups are out of scope. |
| A | [[Flow Design Glossary]] | partial | Flow-design terms checked against the code's names and rules (A-37 and the per-term findings). Library, versioning and draft-mode terms are out of scope (A-35). Run-time terms (step instance, run, th… |
| A | [[Step Definitions]] | full | Every field in the table, the prompt template and how fields reach the run. Mockup defaults are explicitly not decided values and were not compared. |
| A | [[Step Kinds]] | full |  |
| A | [[Connections And Routes]] | full | Editing routes on a canvas is out of scope. |
| A | [[Artifact Contract]] | full | Inspector marks are UI. Park/resume and the questions artifact belong to other areas. |
| A | [[Flow Validation]] | full |  |
| A | [[Flow Definition Internals]] | full | The backlog 5.3 test scenarios are covered by engine.test.ts except cancel, which was decided away. |
| A | [[Flow Data Model]] | full | The flows table and the mockup's library fields are out of scope (A-35). |
| A | [[Branching Joining And Loops]] | full | Rework-loop engine rules are checked at the design level only; their detailed behaviour is the engine audit's. |
| B | [[Flows And Flow Versions]] | full | B-03, B-06 |
| B | [[Version Pinning]] | full | B-01, B-02, B-04, B-07 |
| B | [[Flow Storage]] | full | B-08, B-09 |
| B | [[Flow Library]] | full | B-10; root metadata keys in B-19 |
| B | [[Adopting And Adapting A Flow]] | full | B-11; walkthrough beats 6-8 replayed with --check |
| B | [[Editing And Saving A Flow]] | full | B-12 |
| B | [[Flow Design Screen]] | full | B-14, B-18, B-19 |
| B | [[Flow Design Controls]] | full | B-15, B-16, B-21, B-22 |
| B | [[Canvas Layout And Board Order]] | full | B-17, B-20, B-21 |
| B | [[Flow Design API And Routes]] | full | B-13 |
| B | [[Seeded Flows]] | full | B-23 to B-25. Section 2's researcher template (out of v1, D31) and section 3's six-step mockup flow both pass --check. Section 4 is sample data; its @growth Launch campaign, which fans out per channe… |
| B | [[Role Starter Flows]] | full | B-26 to B-29; all six written as YAML under scratchpad/audit/B/roles/ |
| C | [[Step Guardrails]] | full | Every guardrail traced: budget, turns, tools, attempts/retries, approval, permission mode. Sandbox, egress, tier mapping and the per-task ceiling are out of scope (C-11, C-12). |
| C | [[Models And Effort]] | full | Canvas chips, cost views and the auto-pick idea are UI/DB items, noted under C-15 and C-20. |
| C | [[Approval Gates]] | full | Engine behaviour checked with a scratch advance() script. Inbox, Slack, monitor band, canvas counts, seeds and ideas are out of scope (C-20). |
| C | [[Check Steps]] | full | execShell checked with scratch runs of its own in the scratch folder; check_command and seeds are out of scope (C-29). |
| C | [[Run Guardrails At Launch]] | full | Permission gate, hooks, tools, plugins, limits and isolation traced through RunSpec and both adapters. Tiers, Docker probe, credential proxy and physical limits are sandbox items (C-11). |
| C | [[Draft Mode And Spec Transforms]] | full | Not built and not on the Left out list (C-15). |
| D | [[Execution Overview]] | full | Principles checked (D-29 to D-32). Routes never spawn and the board is a projection are web-app rules and out of scope. In the What it covers table, Advance 'on answers' and Isolate the workspace hav… |
| D | [[Execution Glossary]] | full | The overloaded words attempt, retry, blocked, job, worker and stop are in D-18, D-22, D-33, D-34 and D-35. Park, cancel and session resume are out of scope. run-flow's --resume is a different sense:… |
| D | [[Execution Entities]] | partial | Entities and how they multiply are in D-21. Pins (tasks.flow_id, capability_pins) belong to Version Pinning and Starting A Task. run-flow pins only the loaded flow, in flow.json; capability pins were… |
| D | [[Run Outcomes]] | full |  |
| D | [[Advancement Rules]] | full | manual steps (#6) have no counterpart, because run-flow has only ai and shell steps. |
| D | [[Fan-Out And Join]] | full | Screens (the split badge, the monitor) and the shared worktree collision are out of scope; run-flow uses one folder per flow (decision 7.5). |
| D | [[Task Completion]] | full | After done (memory write, worktree cleanup) is out of scope: memory is on the Left out list, and run-flow creates no worktree. |
| D | [[Execution State Machines]] | full |  |
| D | [[Life Of One Step]] | full |  |
| D | [[Seeded Flow Execution]] | full | Run as a FlowDef in scratch audit/D/seeded.ts (clean run, both loops, silent review). |
| E | [[Rework Loop]] | full |  |
| E | [[Loop Guard And Escalation]] | full | Inbox, Slack, API, task blocked and Allow host & retry are out of scope (E-19). |
| E | [[Stuck Detection And Fingerprints]] | full |  |
| F | [[Runner Pipeline]] | full |  |
| F | [[Agent Launch Contract]] | partial | The port, RunSpec, capabilities and RunResult were checked against run-flow and the adapters. The Claude command flags and the event envelope (v, OTel names, raw) belong to the unchanged adapters and… |
| F | [[Prompt Assembly]] | full |  |
| F | [[Shell Step Execution]] | full |  |
| F | [[Infra Retries]] | full | The mockups' egress-denial cases depend on the sandbox and are out of scope. |
| G | [[Starting A Task]] | full |  |
| G | [[Stopping And Cancelling]] | full |  |
| G | [[Job Queue]] | full | Mostly out of scope; mapped to the in-memory queue and --max-runs. |
| G | [[Worker Lifecycle]] | full | Process start-up, the DB and the MCP-shim DB question are out of scope; restart, shutdown and orphans are covered. |
| G | [[Execution Storage]] | full |  |
| G | [[Execution Data Model]] | partial | The 'Read: the pinned flow' table (step_defs, agents, skills, plugins, settings) is left to the flow-model and launch areas, and questions to Human In The Loop; the written tables are covered. |
| G | [[Execution Runtime]] | partial | Processes, packages, ports and the ExecHost bypass are covered; the StepExecutor generalisation and the Codex test of the abstraction were not assessed. |
| G | [[Execution API And Routes]] | full | Wholly out of scope; one mapping finding. |
| G | [[Execution Controls]] | partial | 'Shape what runs' (Retries, Approval, Budget) maps to max_attempts, gate: approval and limits, which are left to the flow-design area; every other control is mapped. |
| G | [[Execution Surfaces]] | full | Wholly out of scope; one finding, together with the non-gate controls. |
| G | [[Execution Testing]] | full |  |
| H | [[Run Flow Reference]] | full | Every section checked against the code. The shell parts were run; the agent-only parts were checked by reading the code and running the engine from scratch scripts. |
| H | [[Testing The Run Flow CLI]] | partial | Free scenarios 1-11 were all run: 5 and 6 in a pseudo-terminal through expect, hang and timeout bounded to sleep 1 loops, the git case staged instead of committed. The live test and agent scenarios 1… |
| I | [[Run Flow Deferred Issues]] | full | All 23 rows checked against code at 44dd03d (code unchanged since 20e6f7a); the six review fixes it lists exist as test-backed commits. Rows not given their own finding were confirmed from code: back… |
| I | [[Run Flow Review Loop]] | full | Its YAML and a flow combining all three variations validated with --check; the loop was driven through advance() in a scratch script. |
| I | [[Run Flow Monitor Readiness]] | full | Claims about recorded data were checked against code and a shell-only run's state.json, flow.jsonl and run log. Monitor-side claims were checked against the Monitor notes. 'Order to build it in' is a… |
| J | [[Execution Open Questions]] | full | All 72 classified: 52 have their own finding (J-01 to J-53); the 19 web app, workspace, sandbox, queue and Slack questions share J-54. |
| J | [[Execution Roadmap]] | full | Every v1-scope and designed-beyond-PRD row classified (J-57 to J-66). Ideas section checked: nothing built, though shell steps now make the 'deterministic gates' idea expressible. |
| J | [[Execution Index]] | full | A hub, except for 'The one idea to get right first' callout, which states engine behaviour; checked in J-67 and J-68. |
| J | [[Execution Sources]] | not_applicable | A source list with no behaviour of its own. It follows sources as of 1787d20, so it lists neither the run-flow plan nor the run-flow docs that now answer many open questions. |
| K | [[Flow Design Open Questions]] | full | All 39 questions are placed. Questions that bear on the format, validation, the engine or the host each get their own finding; #6, #14, #17, #21, #27-#30, #32, #34-#36 and #38 are grouped in K-22. |
| K | [[Flow Design Roadmap]] | full | Every v1-scope and designed-beyond-PRD item is covered in K-23 to K-30, with #18 in K-28. The Ideas and Out of scope sections were read and need no finding. |
| K | [[Flow Design Index]] | not_applicable | Hub note. Its one statement of behaviour (a recipe saves only when every need is produced by an earlier step; running tasks keep their version) is covered by K-27 and K-19. |
| K | [[Flow Design Sources]] | not_applicable | Source list; it states no behaviour. |
| K | [[Multi-Agent Orchestration Analysis]] | partial | §6, §8, §9, §10 and §11 are itemised as asked. §1-§5 (yamlgraph and the code before this branch) were read as background. §7's owner questions are covered where the open questions meet them: 7.2 in K… |

## Related

- [[Flow Orchestration Conformance Audit]]
- [[Multi-Agent Orchestration Analysis]]
- [[Run Flow Reference]], [[Run Flow Deferred Issues]]
- [[Execution Index]], [[Flow Design Index]]
