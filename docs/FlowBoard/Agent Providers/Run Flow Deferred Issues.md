---
tags: [flowboard, agent-providers, deferred-issues, cli]
module: Agent Providers
date: 2026-10-19
---

# Run Flow Deferred Issues

What `pnpm run-flow` leaves for later, as of 2026-10-23:
- findings from the final review that were not fixed;
- limits accepted while building it;
- what running the testing guide's scenarios turned up;
- what the fixes that followed the conformance audit left open.

None of them blocks merging. The command is described in [[Run Flow Reference]], and how to try it is in [[Testing The Run Flow CLI]]. The scope the plan left out (the worker, dynamic fan-out, routing on labels and the rest) is the plan's *Left out* list, not here; the end of the reference names the main items.

The fixes of 2026-10-23, after the [[Flow Orchestration Conformance Audit]], closed the rest of what this note listed; the rules they settled are Claude's calls, open to Alex's review ([[Run Flow Reference#Rules this command settles]]). Alex's calls of the same day closed the rows on a budget for the whole flow and on what a host killed with `kill -9` leaves running; a third made a flow file a reusable recipe.

Code: `code/flowboard/packages/core/src/flow/` and `code/flowboard/packages/cli/src/flow-*.ts`, on branch `feature/flow-orchestration`. It was built from `docs/superpowers/plans/2026-10-19-run-flow-orchestration.md`. An independent review of the whole branch then found six issues, each fixed test-first before this note was written:
- a step run that could fail to report its end;
- Ctrl+C racing a run's end;
- an untested gate abort;
- a check held open by its own background command;
- `write_roots` ignored on shell steps;
- a step named `constructor` that never ran.

## Safety and leftovers

| Issue | Effect | Where |
|---|---|---|
| An agent's own background commands can outlive its run | Stopping a run ends the agent's CLI. A command the agent started in the background is the adapter's to stop, and this plan left the adapters unchanged. The hard stops reach no further: the `run-flow` that finds a dead host's runs still going, and a second Ctrl+C, signal only each agent's CLI process, by its pid. What the CLI started is not signalled, because an agent CLI runs in its host's process group, not in one of its own | `adapters/src/agent/`; `cli/src/flow-run.ts` (`stopLeftovers`, `interrupt`), a known ceiling marked `ponytail:` in the code. Start each agent CLI in a process group of its own and signal the group, as for checks |
| Runs going at once may each spend all that is left of the budget | An agent run may spend only what is left of the flow's `budget_usd`: its `limits.maxBudgetUsd` is capped there when it launches (Claude's call, 2026-10-23, open to Alex's review). What is left counts only the runs that have ended, so runs going at the same time, such as parallel branches, may each spend all of it and together pass the ceiling. The ceiling is checked as each run ends, and only then does the flow stop the rest and pause. A run whose cost is unknown, or one on an OpenCode model with no price, adds nothing to what is spent | `cli/src/flow-run.ts` (`launch`), a known ceiling marked `ponytail:` in the code. Share what is left among the runs going at once, if parallel runs overshoot |
| Agents' shell commands are not path-guarded | Path guards (`write_roots`, `deny_paths`) cover file-editing tools only. Every shell command meets `deny_commands` and the recursive-`rm` check, which keeps a recursive `rm` inside `write_roots`, and nothing else checks its paths. So an agent's shell command, or a check, can delete `<folder>/.flowboard/` (the artifacts and the lock) or change files outside `write_roots`. The host takes a deleted lock back at its next save; deleted artifacts are lost | The sandbox tier ([[Providers And Sandboxing]]) |
| Untracked files don't count as uncommitted changes | The dirty check protects tracked files only, so a check's `git clean`, or an agent's `rm`, can delete untracked work (agent steps may not run `git clean`). They don't count because the flow's own new files are untracked too | `cli/src/flow-run.ts` (the `git status` check). Count them, outside `runs/` and `.flowboard/`, if untracked work is lost |
| An agent's `git checkout <path>` can still discard edits | Agent steps may not run the git commands that throw away uncommitted edits, which in a flow are the earlier steps' work (Claude's call, 2026-10-23): `git checkout` with `--`, `.`, `-f` or `--force`, `git switch` with `--discard-changes`, `-f` or `--force`, `git restore` other than a staged-only `--staged`, `git clean` other than a dry run, and `git stash` other than `list` and `show`. `git checkout <path>` without `--` looks like a branch switch and gets through, the rules match anywhere in a command (a commit message quoting one is refused), and checks are not guarded at all | `cli/src/flow-run.ts` (`DISCARD_COMMANDS`); a pattern can't tell a path from a branch name |
| Three hosts starting together on a stale lock can let two in | A host that finds a stale lock moves it aside, checks it, and puts it back if it was a fresh lock another host had just taken. A third host that takes the folder between that move and the put-back gets in too, and two hosts then work in one folder | `cli/src/flow-run.ts` (`takeLock`), a known ceiling marked `ponytail:` in the code |
| Removing secrets can remove a variable a check needs | Shell steps run without any variable ending in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`. A check that needs `NPM_TOKEN` fails, though the removed names are printed at start | `cli/src/flow-exec.ts` (`shellEnv`). Add an allow list to the flow file if it bites |
| Hand-offs are not scanned | One agent's artifact can carry instructions that steer the next agent | The parking lot's prompt-injection scanning |

## Flow rules

| Issue | Effect | Where |
|---|---|---|
| A failing step whose only edges are `always` moves on without a gate | `- { from: check, to: review }` without `condition: on_pass` sends a failed check on to review. That is what `always` means, and the reference says so, but it is an easy edge to write by mistake | `cli/src/flow-config.ts`: `--check` could warn about a shell step with only `always` edges |
| `--resume` runs the pinned `flow.json`, not the edited YAML | A prompt or setting fixed partway through a flow takes a new run; only `--budget-usd` and `--max-runs` can be given again | `cli/src/flow-run.ts` (`resume`). Re-read the prompt files on resume if restarting for a prompt fix becomes a habit |
| Skills and plugins are not pinned | `flow.json` pins the flow with its task and prompt text, but each launch reads a step's `skills:` and `plugins:` folders afresh, `--resume` included, so an edit to one partway through a flow reaches the runs after it (Claude's call, 2026-10-23) | `cli/src/run.ts` (`withAsking`). Pinning comes with the capability library's pins |
| No hash names the recipe a run ran | `flow.json` pins each run's copy of the flow, but no version names it, so runs of one recipe can be matched only by comparing their copies. Now that a flow file is a reusable recipe, a hash of it would name its version; none is recorded until something reads it, the flow library or the Monitor (Claude's call, 2026-10-23, open to Alex's review) | `cli/src/flow-run.ts` (the `flow.json` pin). Add the hash when the flow library or the Monitor needs it |
| Step names that are whole numbers move to the front | Steps named `"1"`, `"2"` load before every other step, whatever the file says, because JavaScript orders integer keys first (unquoted, YAML reads them as numbers, and `--check` refuses them). Only order-dependent output changes: the diagram, the order parallel steps start in, and the *waiting for a decision* list | `cli/src/flow-config.ts` (`Object.entries` of the parsed steps). Keep the YAML document's key order instead |

## Rough edges

| Issue | Effect | Where |
|---|---|---|
| On file systems with coarse file times, a fresh output can count as not written | An output counts only if its modification time is at or after the run's start. On FAT, with 2-second times, a file written right away can fall before it, and the step stops at a *did not write* gate; Approve continues | `cli/src/flow-exec.ts` (`writtenSince`). Slack would let a fast rework count the last attempt's file as new, which is worse |
| A corrupt `state.json` or `flow.json` is reported as missing | `cannot resume: no state.json` for a file that is there but is not JSON | `cli/src/flow-run.ts` (`parseJson`, `resume`) |
| `--resume` on a `state.json` with no status says *the flow already ended (undefined)* | A confusing message for a hand-edited or foreign file | `cli/src/flow-run.ts` (`resume`): check the state's shape |
| The `--resume` hint is not quoted | A new run's folder name has no spaces (the flow's name keeps only letters, digits, `_`, `.` and `-`), but after `--resume` the hint repeats the run folder as you typed it: a path with a space fails when copied | `cli/src/flow-run.ts` (`drive`) |
| `flow.jsonl` can miss the transition during which `run-flow` crashed | `state.json` records that transition, but the log of transitions lacks its line | `cli/src/flow-run.ts` (`feed`) |
| A gate prompt's callbacks are not routed to the crash path if printing itself fails | If the terminal goes away mid-prompt (EPIPE), Node reports an unhandled rejection instead of stopping, saving and printing the `--resume` hint | `cli/src/flow-run.ts` (`askGate`): end the chain with `.catch(crash)` |
| No test pins `--resume` refusing a missing `flow.json` | The refusal works, but a change could break it unnoticed | `cli/test/flow-run.test.ts`, next to the other resume refusals |
| Costs print to the cent | A haiku run costs about $0.002 and prints as `$0.00`. In the review-loop scenario, two wasted runs worth $0.005 printed as `$0.00 wasted`. `state.json` has the exact amounts | `cli/src/flow-run.ts` (`toFixed(2)` in the run-end line and the summary): print amounts under a cent with more digits |
| Shell and agent runs shape their log's `result` line differently | An agent run logs `{"kind":"result","result":{…}}`, as `run-agent` does; a shell run puts `exitCode`, `costUsd`, `outcome` or `error`, `fingerprint` and `output` beside `kind`. A script reading the logs needs both shapes | `cli/src/flow-exec.ts` (`execShell`'s `finish`) |
| A check's output has no live log | A shell run's log gets its output only when the shell exits, as the `result` line's `output` (the last 20,000 characters), and the terminal shows only the last line, `-- <step>: last output: …`. While a long check runs, neither shows what it prints | `cli/src/flow-exec.ts` (`execShell`): append the output to the run log as it arrives |
| No flow-level status is stored | `state.json`'s `status` is `running`, `done` or `failed`. A paused flow (a step at a gate, nothing live) and a stopped one (a step running with no live run) both read `running`, and only the summary line names them (Claude's call, 2026-10-23). A flow paused because its budget is spent reads as one or the other; only its spend reaching `flow.json`'s `config.budgetUsd` tells it apart | `core/src/flow/engine.ts` (`FlowState`). A reader works them out from the steps and runs in `state.json` |

## Related

- [[Run Flow Reference]]
- [[Testing The Run Flow CLI]]
- [[Run Agent CLI Decisions]]
- [[Agent Providers Index]]
