---
tags: [lamproom, deferred-work, known-issues]
---

# Deferred Work

The one list of work left for later in the parts of Lamproom that are built: review findings not fixed, limits accepted while building, known problems, and questions left for Alex. Handoff notes link here instead of keeping their own lists.

- **Add** a new leftover under its area here, not in a handoff note. Start a new section for a new area.
- **Remove** an item when it is fixed or decided, and say so in the commit.
- **Not here:** features designed but never built. Those stay in each area's Roadmap and Open Questions.

Items were moved from their notes word for word on 2026-11-17 and not checked again against the code. Line numbers are at the commit each source note names.

## Contents

- [[#Run flow engine]]
- [[#Projects and the wizard]]
- [[#Isolation enforcement]]
- [[#Analysis agent]]
- [[#Knowledge assets]]
- [[#Project budget]]
- [[#Project memory]]
- [[#Slack escalation]]
- [[#Machine doctor]]
- [[#Desktop app on Windows]]

## Run flow engine

What `pnpm lr-run-flow` left for later, as of 2026-10-23: findings from its final review that were not fixed, limits accepted while building it, what the testing guide's scenarios turned up, and what the fixes after the [[Flow Orchestration Conformance Audit]] left open. The command is described in [[Run Flow Reference]], and how to try it is in [[Testing The Run Flow CLI]]. The scope the plan left out (the worker, dynamic fan-out, routing on labels and the rest) is the plan's *Left out* list, not here.

Code: `code/lamproom/packages/core/src/flow/` and `code/lamproom/packages/cli/src/flow-*.ts`. Paths in the tables are under `code/lamproom/packages/`.

### Run flow safety and leftovers

| Issue | Effect | Where |
|---|---|---|
| An agent's own background commands can outlive its run | Stopping a run ends the agent's CLI. A command the agent started in the background is the adapter's to stop, and this plan left the adapters unchanged. The hard stops reach no further: the `lr-run-flow` that finds a dead host's runs still going, and a second Ctrl+C, signal only each agent's CLI process, by its pid. What the CLI started is not signalled, because an agent CLI runs in its host's process group, not in one of its own | `adapters/src/agent/`; `cli/src/flow-run.ts` (`stopLeftovers`, `interrupt`), a known ceiling marked `ponytail:` in the code. Start each agent CLI in a process group of its own and signal the group, as for checks |
| Runs going at once may each spend all that is left of the budget | An agent run may spend only what is left of the flow's `budget_usd`: its `limits.maxBudgetUsd` is capped there when it launches (Claude's call, 2026-10-23, open to Alex's review). What is left counts only the runs that have ended, so runs going at the same time, such as parallel branches, may each spend all of it and together pass the ceiling. The ceiling is checked as each run ends, and only then does the flow stop the rest and pause. A run whose cost is unknown, or one on an OpenCode model with no price, adds nothing to what is spent | `cli/src/flow-run.ts` (`launch`), a known ceiling marked `ponytail:` in the code. Share what is left among the runs going at once, if parallel runs overshoot |
| Agents' shell commands are not path-guarded | Path guards (`write_roots`, `deny_paths`) cover file-editing tools only. Every shell command meets `deny_commands` and the recursive-`rm` check, which keeps a recursive `rm` inside `write_roots`, and nothing else checks its paths. So an agent's shell command, or a check, can delete `<folder>/.lamproom/` (the artifacts and the lock) or change files outside `write_roots`. The host takes a deleted lock back at its next save; deleted artifacts are lost | The sandbox tier ([[Providers And Sandboxing]]) |
| Untracked files don't count as uncommitted changes | The dirty check protects tracked files only, so a check's `git clean`, or an agent's `rm`, can delete untracked work (agent steps may not run `git clean`). They don't count because the flow's own new files are untracked too | `cli/src/flow-run.ts` (the `git status` check). Count them, outside `runs/` and `.lamproom/`, if untracked work is lost |
| An agent's `git checkout <path>` can still discard edits | Agent steps may not run the git commands that throw away uncommitted edits, which in a flow are the earlier steps' work (Claude's call, 2026-10-23): `git checkout` with `--`, `.`, `-f` or `--force`, `git switch` with `--discard-changes`, `-f` or `--force`, `git restore` other than a staged-only `--staged`, `git clean` other than a dry run, and `git stash` other than `list` and `show`. `git checkout <path>` without `--` looks like a branch switch and gets through, the rules match anywhere in a command (a commit message quoting one is refused), and checks are not guarded at all | `cli/src/flow-run.ts` (`DISCARD_COMMANDS`); a pattern can't tell a path from a branch name |
| Three hosts starting together on a stale lock can let two in | A host that finds a stale lock moves it aside, checks it, and puts it back if it was a fresh lock another host had just taken. A third host that takes the folder between that move and the put-back gets in too, and two hosts then work in one folder | `cli/src/flow-run.ts` (`takeLock`), a known ceiling marked `ponytail:` in the code |
| Removing secrets can remove a variable a check needs | Shell steps run without any variable ending in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`. A check that needs `NPM_TOKEN` fails, though the removed names are printed at start | `cli/src/flow-exec.ts` (`shellEnv`). Add an allow list to the flow file if it bites |
| Hand-offs are not scanned | One agent's artifact can carry instructions that steer the next agent | The parking lot's prompt-injection scanning |

### Run flow rules

| Issue | Effect | Where |
|---|---|---|
| A failing step whose only edges are `always` moves on without a gate | `- { from: check, to: review }` without `condition: on_pass` sends a failed check on to review. That is what `always` means, and the reference says so, but it is an easy edge to write by mistake | `cli/src/flow-config.ts`: `--check` could warn about a shell step with only `always` edges |
| `--resume` runs the pinned `flow.json`, not the edited YAML | A prompt or setting fixed partway through a flow takes a new run; only `--budget-usd` and `--max-runs` can be given again | `cli/src/flow-run.ts` (`resume`). Re-read the prompt files on resume if restarting for a prompt fix becomes a habit |
| Skills and plugins are not pinned | `flow.json` pins the flow with its task and prompt text, but each launch reads a step's `skills:` and `plugins:` folders afresh, `--resume` included, so an edit to one partway through a flow reaches the runs after it (Claude's call, 2026-10-23) | `cli/src/run.ts` (`withAsking`). Pinning comes with the capability library's pins |
| No hash names the recipe a run ran | `flow.json` pins each run's copy of the flow, but no version names it, so runs of one recipe can be matched only by comparing their copies. Now that a flow file is a reusable recipe, a hash of it would name its version; none is recorded until something reads it, the flow library or the Monitor (Claude's call, 2026-10-23, open to Alex's review) | `cli/src/flow-run.ts` (the `flow.json` pin). Add the hash when the flow library or the Monitor needs it |
| Step names that are whole numbers move to the front | Steps named `"1"`, `"2"` load before every other step, whatever the file says, because JavaScript orders integer keys first (unquoted, YAML reads them as numbers, and `--check` refuses them). Only order-dependent output changes: the diagram, the order parallel steps start in, and the *waiting for a decision* list | `cli/src/flow-config.ts` (`Object.entries` of the parsed steps). Keep the YAML document's key order instead |

### Run flow rough edges

| Issue | Effect | Where |
|---|---|---|
| On file systems with coarse file times, a fresh output can count as not written | An output counts only if its modification time is at or after the run's start. On FAT, with 2-second times, a file written right away can fall before it, and the step stops at a *did not write* gate; Approve continues | `cli/src/flow-exec.ts` (`writtenSince`). Slack would let a fast rework count the last attempt's file as new, which is worse |
| A corrupt `state.json` or `flow.json` is reported as missing | `cannot resume: no state.json` for a file that is there but is not JSON | `cli/src/flow-run.ts` (`parseJson`, `resume`) |
| `--resume` on a `state.json` with no status says *the flow already ended (undefined)* | A confusing message for a hand-edited or foreign file | `cli/src/flow-run.ts` (`resume`): check the state's shape |
| The `--resume` hint is not quoted | A new run's folder name has no spaces (the flow's name keeps only letters, digits, `_`, `.` and `-`), but after `--resume` the hint repeats the run folder as you typed it: a path with a space fails when copied | `cli/src/flow-run.ts` (`drive`) |
| `flow.jsonl` can miss the transition during which `lr-run-flow` crashed | `state.json` records that transition, but the log of transitions lacks its line | `cli/src/flow-run.ts` (`feed`) |
| A gate prompt's callbacks are not routed to the crash path if printing itself fails | If the terminal goes away mid-prompt (EPIPE), Node reports an unhandled rejection instead of stopping, saving and printing the `--resume` hint | `cli/src/flow-run.ts` (`askGate`): end the chain with `.catch(crash)` |
| No test pins `--resume` refusing a missing `flow.json` | The refusal works, but a change could break it unnoticed | `cli/test/flow-run.test.ts`, next to the other resume refusals |
| Costs print to the cent | A haiku run costs about $0.002 and prints as `$0.00`. In the review-loop scenario, two wasted runs worth $0.005 printed as `$0.00 wasted`. `state.json` has the exact amounts | `cli/src/flow-run.ts` (`toFixed(2)` in the run-end line and the summary): print amounts under a cent with more digits |
| Shell and agent runs shape their log's `result` line differently | An agent run logs `{"kind":"result","result":{…}}`, as `lr-run-agent` does; a shell run puts `exitCode`, `costUsd`, `outcome` or `error`, `fingerprint` and `output` beside `kind`. A script reading the logs needs both shapes | `cli/src/flow-exec.ts` (`execShell`'s `finish`) |
| A check's output has no live log | A shell run's log gets its output only when the shell exits, as the `result` line's `output` (the last 20,000 characters), and the terminal shows only the last line, `-- <step>: last output: …`. While a long check runs, neither shows what it prints | `cli/src/flow-exec.ts` (`execShell`): append the output to the run log as it arrives |
| No flow-level status is stored | `state.json`'s `status` is `running`, `done` or `failed`. A paused flow (a step at a gate, nothing live) and a stopped one (a step running with no live run) both read `running`, and only the summary line names them (Claude's call, 2026-10-23). A flow paused because its budget is spent reads as one or the other; only its spend reaching `flow.json`'s `config.budgetUsd` tells it apart | `core/src/flow/engine.ts` (`FlowState`). A reader works them out from the steps and runs in `state.json` |

## Projects and the wizard

Minor problems the final review of the new project wizard found (branch `feature/projects-impl`, 2026-11-12) and left unfixed. None loses data or opens a hole; each is small. Paths are under `code/lamproom/`.

### Wizard input checks

- **`.` and `..` pass as repo names.** `REPO` in `packages/cli/src/clone.ts` and the `name` check in `app/api/projects/clone/route.ts` accept them. GitHub refuses those names, so no real repo has one.
- **`Infinity` passes the page's budget and CPU check.** `Number()` in `app/projects/settings-model.ts` (`toSettings`, `toLimits`) turns `Infinity` into a number the page accepts; the server refuses it, with its own message.

### GitHub calls (`packages/cli/src/github.ts`)

- **The restricted-organization check reads only the last line of `gh`'s error.** `ghRepos` tests `why(r)`, which keeps the last non-empty line; if `gh` puts *OAuth App access restrictions* earlier, the owner shows as a plain error instead of *no access* with *Request access*.
- **`gh` runs synchronously.** Every call is `spawnSync`, about 0.65 s each, and blocks the server while it runs: `/api/settings`, `/api/github`, `/api/github/repos`. Fix: `execFile` with a promise.

### Wizard screens

- **The repo step hides two errors.** A failed organizations list (`ghOwners`) and a failed account switch show nothing (`app/projects/wizard/repo-step.tsx`).
- **After an account switch the wizard keeps the old account's owner and repo selected.** Clear both on switch.
- **The done screen says *".lamproom.yaml is new in the repo"* whenever limits were set,** even when the repo already had one (`app/projects/wizard/finish.tsx`). The clone job knows whether the file existed; it should say so.

### Projects server

- **Finished clone jobs are never dropped.** `globalThis.__fbClones` in `clone.ts` keeps every job until the server restarts. Drop done or failed jobs after some minutes.
- **A malformed `data/settings.json` gives a 500** on `/api/settings` and every page that reads it (`readAppSettings` in `packages/cli/src/app-settings.ts`). Fall back to the defaults and say the file was ignored.
- **A project record with an unknown `type` crashes `GET /api/projects`.** `PROJECT_TYPES[record.type]` is undefined for a hand-edited record. Skip or mark that record instead.

### Projects code

- **`/settings` resolves the app's values through the `research` type** (`app/settings/settings.tsx`, two places). It works only because Research sets nothing; once it gets defaults, `/settings` shows them as the app's. Resolve with no type.
- **A doc comment in `packages/cli/src/project.ts` sits above the wrong function.** The `setLimits` comment is directly above `limitsError`, not `setLimits`.

## Isolation enforcement

From [[Isolation Enforcement Handoff]] (merged into dev 6b3d3a6).

- **No scan for a planted `.git` after a run.** A `.git` a box planted or rewrote stays on disk, and git you run in that folder uses it and runs its config (a shell prompt that runs `git status`, an IDE's git extension, a `git commit` you type). Lamproom refuses such a folder, but it does not remove the `.git` or warn after a run. Build a scan after each run that warns about such entries.

The review's deferred findings, lower priority. Its full list is in the ledger.

- **Plugin tools.** On Claude, a plugin's tool that writes files passes without asking. Only the listed edit and shell tools ask.
- **"Every file edit" plus a saved script prefix.** Together, rules like "every file edit" and `pnpm test` let an agent run anything: it edits `package.json`, then runs the script.
- **Resume of a gone OpenSandbox box** from the page still fails silently.
- **`projects.json` locking.** Both the app and lr-run-flow write it with no lock, so a rare simultaneous write could be lost.
- **Containerised lr-run-flow.** lr-run-flow started from the Docker image now needs `LAMPROOM_DATA_DIR`.
- **Letter case in `--folder`.** On macOS, a `--folder` typed in a different case than on disk finds no project and is refused. The app always passes exact paths.
- **Cloning into a registered repo.** The wizard clones first and only then refuses a parent folder inside a registered project's repo, leaving the clone on disk.

## Analysis agent

From [[Analysis Agent Handoff]]. Decision numbers refer to its *Decisions open to your review*.

### Set aside by the analysis review

The final review declined to judge these. I left each as it is.

1. **A sandboxed agent could call Lamproom's API with a faked `Host` header.** This predates this branch and affects every write route, not only Accept. It belongs with the isolation work ([[Isolation Enforcement Handoff]]).
2. **Whether the analyst's skill files can be reached inside a box.** The skill folder lives in the app, outside the repo. Checking it needs a real, paid run in each sandbox tier.
3. **The cost of an automatic analysis after every clone.** Up to $0.50 each by default, set at `/settings/internal`. That is the mockup's design; see decision 2.

### Analysis agent problems

Minor problems the review found and that were left unfixed.

- **Accepted hosts can't be seen or removed in the UI.** They aren't listed anywhere, and past 20 hosts **Accept** fails with a 400 until some are removed through the API.
- **Accept replaces an existing check command silently.** On the project page, the card doesn't show the current command before replacing it.
- **The first run after accepting the check command in the wizard is refused.** Accept leaves `.lamproom.yaml` uncommitted, and runs refuse a dirty repo. The *"commit it"* hint only shows for sandbox limits.
- **The projects list reads each analysed project's run twice per poll**: `listRuns` reads every run, then `analysisView` reads the analyst's run again.
- **A start that times out can leave an unrecorded run.** If `startRun` takes longer than 20 s, the route gives up, but the run may still start without its name reaching the project record.
- **Repeated entries cause a console warning.** A stack entry or host the agent lists twice gives duplicate React keys on the card.

## Knowledge assets

From [[Knowledge Assets Handoff]]. Decision numbers refer to its *Decisions open to your review*; m-numbers to its *Review*.

- **Agents in a task worktree get neither map** (decision 6). Most real work runs in a worktree, so this limits the value of the feature most.
- **The wizard can wait minutes** on a large repo's Serena index (decision 4). The build's shell step stops at 20 minutes.
- **The image is 4 GB**, about 0.9 GB more than before, and building it from scratch took over 40 minutes on this network, most of it the existing `pnpm install` layer.
- **The analysis card offers *Analyse*** while a clone is still building its maps, though the analyst will start on its own; clicking it is refused by the folder lock.
- **A repo with no code reads as *build failed*:** graphify says *"No code files found"* (seen cloning `octocat/Hello-World`).
- **The seeded *Scratch* project gets built on its own.** It is a Trusted Software project, so the scheduler's first pass builds its maps on this machine, which downloads graphify, Serena and its language servers through `uvx` once. Free, but it uses the network.
- **A committed symlink at `.lamproom/knowledge`, `stamp.json` or a `.log` could steer a Trusted build's writes** (review m1), a scheduled one included, to a file such as `~/.zshrc`. Deleting the folder first covers a symlink at `.lamproom/knowledge` itself and anything inside it. Left: a symlink at `.lamproom` (the build writes through it) and any file a run makes appear between the delete and the write. Runs also refuse the maps when git tracks anything under `.lamproom/`, but the build itself doesn't check.
- **The repo's `uv.toml` or `pyproject.toml` `[tool.uv]` steers a Trusted build's `uvx`** (m2), since it runs in the repo's folder. Fix: `--no-config`, run from the data folder.
- **A flow with its own Docker image gets `/usr/local/bin/lr-serena`**, which that image doesn't have (m3); its agents then lack Serena's tools.
- **The scheduler retries refused starts every 10 minutes forever** (m4): an Untrusted project on macOS, or a spent budget.
- **A committed `project.yml` naming other languages** (m5) is covered: the build deletes the folder and writes its own, and runs refuse the maps while git tracks anything under `.lamproom/`.
- **A Serena index outlives turning Serena off.** The files stay in `.lamproom/knowledge/` until removed by hand; runs stop getting Serena at once.

## Project budget

From [[Project Budget Handoff]]. Decision numbers refer to its *Decisions open to your review*. Its fourth open question, whether the analysis agent's cost counts, is answered: it does, since the analyst runs as an ordinary flow ([[Analysis Agent Handoff]]).

### Budget open questions

The final review set these aside as yours to decide.

1. **Which month does a resumed run spend against?** Today, its start month (decision 1). A run that paused on Oct 31 and resumes in November is refused against October's cap until that cap is raised. The alternative is to check a resume against the current month, counting the run's earlier spend in October and its new spend in November.
2. **Should *Start anyway* lift the cap for the rest of that run?** Today it does: after *anyway*, only the flow's own budget limits that run until it next pauses. The alternative is to let it through and then pause again at the next agent call.
3. **Should runs outside the app's `runs/` folder count?** A run started from the command line in another folder, without `LAMPROOM_RUNS_DIR`, writes its run folder elsewhere, and the cap never sees it. The runs folder layout predates this branch.

### Budget deferred findings

Minor problems the review found and that were left unfixed.

- **The overshoot bound in the docs is too small.** Parallel steps inside one run each get all that is left, so the cap can be passed by one agent call per call running at once, not one per run.
- **Every check reads every run folder.** `listRuns` also checks each run's status (a second `state.json` read, `host.json`, a process probe), plus a `realpath` per run, on every pass of `drive`'s loop. Fine at hundreds of runs; a lighter reader, or a cache by modification time, past that.
- **Both budgets spent at once.** The end line then names only the flow's budget and suggests `--budget-usd`, and the resume is refused by the project's cap.
- **The *anyway* check is a text match.** lr-run-flow's usage error now contains the flag too; the page can't trigger one today. A separate exit code would be sturdier.
- **The Projects Index overstates the card.** It says the card shows the month's spend; the card shows the week's, plus the problem line past the alert.
- **Week and month figures count nested repos differently.** The week's spend and the run counts use `owns`, so an outer project includes a nested project's runs; the month's spend uses `ownerOf`, so it doesn't.

## Project memory

From [[Project Memory Handoff]]. m-numbers refer to its *Review*.

- **Two commits ending in the same instant can lose one's notes.** The store is read, changed and written with no lock. Two runs of one project that end within milliseconds can lose one side's notes, and a **Forget** racing a commit brings the forgotten notes back (m6).
- **A corrupt store hides Forget all** (m1, `app/projects/memory.tsx`): the card shows the read error and no list, so the button isn't there; delete `<data>/memory/<id>.json` by hand.
- **An edited pin on resume can move a nested run's memory to the outer project** (m2, `flow-run.ts` resume): resume checks only that the project still `owns()` the folder, and takes the project id from the pin.
- **Keyword stuffing wins recall** (m3): ranking is a raw count of shared words, so a hostile note listing many common words outranks real ones.
- **Forged answers** (m5): a Trusted agent's shell can write its step logs, so a forged question and choice is saved as *your answer*.
- **With memory off, an unreadable `projects.json` or app settings file prints a `-- memory: not read` line** (m7), where before this branch nothing was said.
- **The page shows the artifact through `readArtifact` in `flow-logs.ts`, which follows links.** That's from before this branch, not memory's path: the commit opens artifacts without following links.
- **Keyword recall is crude.** No stemming (`test` and `tests` are different words), no synonyms, and a long preamble matches broadly. Fine for 500 short notes; Mem0 or FTS5 is the upgrade.
- **There's no measure of whether memory pays** (Measuring Memory Payoff): no inbox-repeats meter, and part 7's tokens are billed inside the run.
- **Never run with a real agent.** The commit and recall paths ran with scripted agents only.

## Slack escalation

From [[Slack Escalation Handoff]].

- **Never run against a real Slack workspace.** Everything was checked against a fake that follows Slack's documented shapes. The first real setup may find a Block Kit field Slack refuses; the post's error then shows as a problem on the Connections page.
- **The two tokens are not checked to belong to the same app.** If the app-level token is another app's, the socket connects and **Answer** clicks on the bot's messages never arrive.
- **Two Lamproom servers on one data folder both post.** The `globalThis` guard is per process.
- **A question asked before the server started** is posted on the first check after it, however long it waited.
- **Answers from Slack need the server's socket.** While it reconnects, a click or a submission is delivered again by Slack on the next connection, or lost after Slack's retries.
- **Agents' questions in runs started without `--page`** (a terminal-only `pnpm lr-run-flow`) have no asks file and never escalate.

- **Minors from the review, not fixed:**
  - **m1:** a paused run with a leftover ask file can still open the modal before the repaint: `closedText` treats `closed.by === null` as open, so the answer is written to a dead run. Fix: `if (closed) return by ? … : 'No longer waiting.'`.
  - **m2:** an answer that arrives while `chat.postMessage` is awaiting is credited to the terminal, because the post's update overwrites `closed` (against ruling 6).
  - **m3:** `void noteAnswered(...)` in `onInteraction` has no `.catch`, so a full disk (ENOSPC) can surface as an unhandled rejection.
  - **m4:** an ask with more than 99 questions dead-ends in the modal when a question past the 99th is required.
  - **m5:** a select with no options makes Slack refuse `views.open`, which is only logged.
  - **m6:** a bad bot token (`invalid_auth`, `token_revoked`) is filed as a channel problem and retried each minute per ask, not shown as a connection problem.
  - **m7:** the page's 409 says only *already answered*, not by whom; PRD §10 wants *"already answered by <channel>"*.

## Machine doctor

From [[Machine Doctor Handoff]] (`pnpm lr-doctor`, merged into dev 1988916). Paths are under `code/lamproom/`; bare file names such as `doctor.ts` are in `packages/cli/src/`.

### Doctor next steps

1. **The UI page.**
   - Add `app/api/doctor/route.ts`, behind `refused(request)` like the other routes, returning
     `Response.json(await runDoctor({ runner: 'app' }))`.
   - Add a status page, or a block on Settings → General, keyed on the check ids.
   - The Docker, gVisor and `gh` probes still block while they run; make them async before they run inside the
     Next server.
2. **The token gap above**, so the app and the terminal agree.
3. **Packaging the Electron app** (option 2 in the design), which drops `node` and `pnpm` from the list.
4. **The doctor's minor issues below**, in any order.

### Doctor minor issues

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

### Found outside the doctor

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

## Desktop app on Windows

What stops Lamproom working on Windows, found while making the Electron app (`feature/electron-app`, 2026-11-15). Nothing here has been fixed. Nothing has been run on a Windows machine either: every item comes from reading the code, so each fix needs a run on Windows to confirm it.

The app's own shell, `code/lamproom/electron/`, is written for Windows. The rest of Lamproom assumes macOS or Linux. Paths below are relative to `code/lamproom/`.

### What already handles Windows

- `electron/path.js` reads the current machine and user PATH from the registry (an app opened from Explorer gets Explorer's PATH, which misses tools installed since login), then adds the usual install folders that exist: Program Files `nodejs`, `Git\cmd`, `GitHub CLI` and `Docker\Docker\resources\bin`; `%USERPROFILE%\.local\bin` (Claude Code's installer); `%APPDATA%\npm`; Scoop's shims; Chocolatey's `bin`. Only the folder list is tested (`electron/path.test.js`). The registry read has never run.
- The page's Stop writes a `stop` file in the run folder (`stopRun`, `packages/cli/src/flow-logs.ts:265`), not a signal, so asking a run to stop works. What the run then does to its processes does not; see [[#Process control on Windows|process control]].
- Secrets live in `secrets.json` in the data folder, not the macOS keychain, as `CLAUDE.md` asks.

### Windows order to fix

1. [[#Agent steps fail at setup|Agent steps]]: without these, no run gets past its first agent step.
2. [[#Shell steps on Windows|Shell steps]]: `check` steps and shell gates.
3. [[#Process control on Windows|Process control]]: stopping, timeouts and clean-up.
4. [[#Sandboxes on Windows|Sandboxes]]: the `container` tier and OpenSandbox.
5. [[#Smaller Windows gaps|Smaller gaps]].

### Agent steps fail at setup

#### Temp folders are made under `/tmp`

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:287` | `realpathSync(mkdtempSync('/tmp/lr-'))` for each agent step |
| `packages/cli/src/flow-exec.ts:294` | `mkdtempSync('/tmp/lr-h-')` for OpenSandbox runs |
| `packages/cli/src/run.ts:204` | the same, for `lr-run-agent` |

On Windows `/tmp/lr-` is `\tmp\lr-` on the current drive, so `mkdtempSync` fails with `ENOENT` unless `C:\tmp` happens to exist. The path is fixed on purpose: a Unix socket path is limited to about 104 characters, and macOS's `os.tmpdir()` is long.

**Fix:** keep `/tmp` on macOS and Linux and use `os.tmpdir()` on Windows. The socket below must move to a named pipe as well, so the length limit no longer applies there.

#### The ask broker listens on a Unix socket

| Where | Code |
|---|---|
| `packages/cli/src/ask/broker.ts:124` | `server.listen(listen)` with `<tmp>/ask.sock` |
| `packages/cli/src/flow-exec.ts:295`, `:309`, `:317` | the socket path handed to the broker and the `ask_user` shim |
| `packages/ask-user/src/broker-client.ts:11` | `createConnection(address)` from the shim |

On Windows, Node listens on a path only when it is a named pipe (`\\.\pipe\<name>`). Any other path fails, so an agent step fails while it is being set up, before the agent starts.

**Fix:** either:

- on Windows, pass `\\.\pipe\lr-<random>` instead of `<tmp>/ask.sock`, which `server.listen` and `createConnection` both accept unchanged; or
- use the TCP mode with a token that containers already use (`startBroker({ token })`, `LAMPROOM_ASK_TOKEN`).

The pipe is the smaller change.

#### npm-installed CLIs are `.cmd` files

| Where | Code |
|---|---|
| `packages/adapters/src/agent/claude/provider.ts:46` | `opts.claudePath ?? 'claude'` |
| `packages/adapters/src/agent/opencode/provider.ts:67` | `opts.opencodePath ?? 'opencode'` |
| `packages/adapters/src/agent/opencode/server.ts:33` | `exec.spawn(opts.opencodePath, ['serve', …])` |
| `packages/adapters/src/exec/host.ts:7` | `spawn(command, args, { cwd, env, stdio: 'pipe' })`, with no shell |

`spawn` without a shell runs only `.exe` and `.com` files. npm installs `claude` and `opencode` on Windows as `claude.cmd` and `opencode.cmd`, so `spawn('claude')` fails with `ENOENT`. Passing the full path doesn't help: since Node's 2024 security fix (CVE-2024-27980), spawning a `.cmd` without a shell fails with `EINVAL`. Claude Code's own installer gives `claude.exe` in `%USERPROFILE%\.local\bin`, which works. `git`, `gh`, `docker` and `node` are `.exe` files and work.

**Fix:** in the host `ExecHost`, on Windows, look the command up on PATH with `PATHEXT`. If it is a `.cmd` or `.bat`, run it as `cmd.exe /d /s /c "<file>" <args>` with each argument quoted. Don't set `shell: true` on the whole spawn: it gets the quoting of agent prompts wrong.

### Shell steps on Windows

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:136` | `exec.spawn('sh', ['-c', command], …)` inside a sandbox |
| `packages/cli/src/flow-exec.ts:137` | `spawn('sh', ['-c', command], { detached: true, … })` on the host |

Windows has no `sh`. Recipes' commands are written for `sh` (`pnpm test`, `&&`, `$VAR`, pipes), so switching to `cmd.exe` would change what they mean.

**Fix:** on Windows, run Git for Windows' `sh.exe` (`C:\Program Files\Git\bin\sh.exe` or `usr\bin\sh.exe`), and refuse the step with a clear message when Git for Windows is missing. Add `Git\bin` to the fallback folders in `electron/path.js` too: it lists only `Git\cmd`, which holds `git.exe` but not `sh.exe`. Commands inside a container are unaffected: they run Linux's `sh`.

### Process control on Windows

#### Process groups

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:137`, `:206` | shell step in its own group (`detached: true`); stopped with `process.kill(-child.pid, sig)` |
| `packages/cli/src/flow-run.ts:505` | `stopLeftovers` on `--resume`: `process.kill(t.group ? -t.pid : t.pid, sig)` |
| `packages/cli/src/clone.ts:71`, `:80` | `gh repo clone` in its own group; a silent clone killed with `process.kill(-child.pid, 'SIGKILL')` |
| `packages/cli/src/flow-start.ts:71` | lr-run-flow started `detached: true` from the app |

Windows has no process groups, and a negative pid makes `process.kill` throw. Each of these calls catches that and treats it as "already gone":

- Stopping a shell step, or a step that times out, leaves the shell and everything it started still running. The run then waits on them.
- A clone that goes quiet is reported as stopped but is not.
- `--resume` cannot stop what an earlier host left behind.

`detached: true` has a second effect on Windows: the child gets its own console window. A window would open for every run started from the app and every shell step.

**Fix:** on Windows, stop a tree with `taskkill /pid <pid> /T` (add `/F` for the hard stop), and pass `windowsHide: true` wherever `detached: true` is set. A small `killTree(pid, hard)` beside `packages/adapters/src/exec/terminate.ts` would serve all four places.

#### Signals

| Where | Code |
|---|---|
| `packages/adapters/src/exec/terminate.ts:9`, `:11` | `SIGTERM`, then `SIGKILL` after a grace period |
| `packages/cli/src/flow-exec.ts:217`, `:221` | the same for shell steps |
| `packages/cli/src/flow-run.ts:1032` | lr-run-flow stops cleanly on `SIGINT`, `SIGTERM` or `SIGHUP` |
| `packages/cli/src/run.ts:192` | the same for lr-run-agent |
| `electron/main.js:75` | `server.kill()` when the app quits |

On Windows, `child.kill('SIGTERM')` ends the process at once, as `SIGKILL` does. Nothing gets a grace period: agent CLIs can't save their state, and `opencode serve` can't shut down its own children. Windows never delivers `SIGTERM` to lr-run-flow, so only Ctrl+C or closing its console makes it stop cleanly. Run from the app, it has no console, so a run can only end, or stop through its `stop` file.

`server.kill()` ends `next` but not the processes `next` started. When the app quits, a `next dev` worker or a run started from the app may be left running.

**Fix:** use the `stop` file, or another message, wherever a graceful stop matters, and `taskkill /T` for the hard stop. In `electron/main.js`, stop the server's tree on quit.

#### `ps` tells processes apart

| Where | Code |
|---|---|
| `packages/cli/src/flow-exec.ts:76` | `processStart(pid)`: `ps -o lstart= -p <pid>` |
| `packages/cli/src/flow-exec.ts:142`, `:359` | the start time logged with each pid |
| `packages/cli/src/flow-run.ts:496` | `stopLeftovers` compares it, so a reused pid is never killed |

Windows has no `ps`, so `processStart` always returns `undefined`. `stopLeftovers` then reads every logged process as gone. It skips them, or, for a group, tries the negative-pid kill above.

**Fix:** on Windows, read the start time with `powershell -NoProfile -Command "(Get-Process -Id <pid>).StartTime.ToString('o')"`. The logged value and the later reading must use the same format.

### Sandboxes on Windows

#### `container` tier: Docker mounts

| Where | Code |
|---|---|
| `packages/adapters/src/exec/docker.ts:29` | `-v ${cwd}:${cwd}`, `-w ${cwd}`: the folder is mounted at the same path |
| `packages/adapters/src/exec/docker.ts:30`, `:46` | extra mounts and `tmpDir` the same way |

The design mounts each folder at the same path, so paths mean the same thing inside and out. A Windows path such as `C:\Users\a\repo` can't be a path in a Linux container, and the `:` after the drive letter breaks `-v`'s `source:target` syntax.

**Fix:** mount Windows folders at a translated path (`C:\Users\a\repo` → `/c/Users/a/repo`). Then translate every path that crosses the boundary: the step's `cwd`, the artifact and verdict paths, and the `tmpDir` the providers write into. This is a design change, not a one-line fix. Settle it before promising sandboxes on Windows.

#### OpenSandbox

| Where | Code |
|---|---|
| `packages/adapters/src/exec/opensandbox/box.ts:101`, `:142` | `tar --no-mac-metadata -czf - -C <dir> .` to push files into the box |
| `packages/adapters/src/exec/opensandbox/box.ts:197` | `tar -xzf - -C <scratch> --no-same-owner` to pull them back |

Windows 10 and later ship bsdtar as `tar.exe`, which accepts these options. The push at `:142` uses `-C /` with paths relative to the root, which assumes POSIX absolute paths. Unverified; expect the push of extra files to fail.

### Smaller Windows gaps

| Gap | Where | Effect | Fix |
|---|---|---|---|
| Failure fingerprints see only POSIX paths | `packages/core/src/flow/fingerprint.ts:4` (`ABSOLUTE_PATH`) | `C:\…` paths are not cut to their last segment, so the same failure in two checkouts gets two fingerprints, and repeat failures go unnoticed | Also match `[A-Za-z]:\\[^\s'"…]+` and cut at `\` as well as `/` |
| File modes are ignored | `packages/cli/src/openrouter.ts:44` (`secrets.json`, `0o600`), `packages/cli/src/flow-run.ts:304` (`sandbox.json`) | The files take the folder's permissions. The user's profile is private by default, so this is acceptable unless the data folder is moved somewhere shared | Note it in the settings docs; no code change unless the data folder can live outside the profile |
| Env assignments in `package.json` scripts | `package.json` `test:packages`, `test:live` (`LAMPROOM_LIVE= node …`) | pnpm runs scripts with `cmd.exe` on Windows, which can't read `NAME=value command` | Read the switch from an argument, or set pnpm's `script-shell` to Git Bash |
| The keychain message names macOS only | `packages/cli/src/flow-run.ts:377` | Only the wording: Claude Code on Windows keeps its login in `%USERPROFILE%\.claude\.credentials.json`, which a container can't read either | Reword it so it holds on every platform |
| `nvm` is not a fallback folder | `electron/path.js` (both platforms) | If the shell or registry read fails, a `node` from nvm or nvm-windows is not found | Bundle Node with the packaged app, which also removes the need for `node` on PATH |

### How to check a Windows fix

There is no Windows machine in the loop yet. For each fix:

1. Add a unit test that passes `'win32'` as the platform, as `electron/path.test.js` does, for anything that builds a command line or a path.
2. Run the app on Windows: `pnpm install`, `pnpm build`, `pnpm electron`. Then start `flows/review-loop.yaml` from the New run sheet, stop it from the run page, and confirm no `node`, `sh` or agent process is left (`tasklist | findstr /i "node sh claude opencode"`).
