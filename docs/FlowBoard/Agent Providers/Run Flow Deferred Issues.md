---
tags: [flowboard, agent-providers, deferred-issues, cli]
module: Agent Providers
date: 2026-10-19
---

# Run Flow Deferred Issues

What `pnpm run-flow` leaves for later, as of 2026-10-19:
- findings from the final review that were not fixed;
- limits accepted while building it;
- one fact the plan got wrong.

None of them blocks merging. The command is described in [[Run Flow Reference]], and how to try it is in [[Testing The Run Flow CLI]]. The scope the plan left out (the worker, dynamic fan-out, routing on labels and the rest) is listed at the end of the reference, not here.

Code: `code/flowboard/packages/core/src/flow/` and `code/flowboard/packages/cli/src/flow-*.ts`, on branch `feature/flow-orchestration`. It was built from `docs/superpowers/plans/2026-10-19-run-flow-orchestration.md`. An independent review of the whole branch then found six issues, each fixed test-first before this note was written:
- a step run that could fail to report its end;
- Ctrl+C racing a run's end;
- an untested gate abort;
- a check held open by its own background command;
- `write_roots` ignored on shell steps;
- a step named `constructor` that never ran.

## Needs a decision

| Issue | Effect | Where |
|---|---|---|
| A note typed at Approve, or at Reject when the edge it takes goes forward, is dropped | Every gate asks *Note for the next attempt (optional)*. The plan's rule sends a note only into a rerun of the same step or of a rework target, so these notes reach no one, and nothing says so | `core/src/flow/engine.ts` (`complete`, the settle loop), `cli/src/flow-run.ts` (`askGate`). Either skip the note question when the choice cannot use it, or carry the note to the steps the decision starts |

## Safety and leftovers

| Issue | Effect | Where |
|---|---|---|
| Agents left running after `kill -9`, or after `run-flow` itself crashes, are not stopped | The next `run-flow` in the folder replaces the stale lock and only warns: *check that none of its agents are still running*. Those agents keep working and spending until they finish | `cli/src/flow-run.ts` (`takeLock`). The plan said the adapters expose no process ids, but they do (`AgentRun.pid`). Record live runs' pids in `state.json` and stop them when a stale lock is found |
| A second Ctrl+C can leave a check running | The first press sends the check's process group SIGTERM, and would follow with SIGKILL after 2 s. A second press quits at once, so a check that ignores SIGTERM keeps running until it ends or is killed by hand | `cli/src/flow-run.ts` (`interrupt`): SIGKILL the live checks' groups before exiting |
| An agent's own background commands can outlive a stopped run | Stopping a run ends the agent's CLI. A command the agent started in the background is the adapter's to stop, and this plan left the adapters unchanged | `adapters/src/agent/` |
| Agents' shell commands are not path-guarded | Guards cover file-editing tools only. An agent's `rm`, or a check, can delete `<folder>/.flowboard/` (the artifacts and the lock), or files outside `write_roots` | The sandbox tier ([[Providers And Sandboxing]]) |
| Untracked files don't count as uncommitted changes | The dirty check protects tracked files only, so an agent's or check's `git clean` can delete untracked work. They don't count because the flow's own new files are untracked too | `cli/src/flow-run.ts` (the `git status` check). Count them, outside `runs/` and `.flowboard/`, if untracked work is lost |
| Removing secrets can remove a variable a check needs | Shell steps run without any variable ending in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`. A check that needs `NPM_TOKEN` fails, though the removed names are printed at start | `cli/src/flow-exec.ts` (`shellEnv`). Add an allow list to the flow file if it bites |
| No budget for the whole flow, and hand-offs are not scanned | Spend is bounded per run (`limits`) and per loop (`max_attempts`) only. One agent's artifact can carry instructions that steer the next agent | Flow Design #12; the parking lot's prompt-injection scanning |

## Flow rules

| Issue | Effect | Where |
|---|---|---|
| A flow that loops back to its first step, and also has a repair step reached only by rework, reports two entries | `--check` refuses it with *more than one entry step*. The way out today is a leading step | `core/src/flow/flow.ts` (`entries`). An `entry:` key, like the design's `is_entry` flag, settles it |
| A failing step whose only edges are `always` moves on without a gate | `- { from: check, to: review }` without `condition: on_pass` sends a failed check on to review. That is what `always` means, and the reference says so, but it is an easy edge to write by mistake | `cli/src/flow-config.ts`: `--check` could warn about a shell step with only `always` edges |
| `--resume` runs the pinned `flow.json`, not the edited YAML | A prompt or setting fixed partway through a flow takes a new run | `cli/src/flow-run.ts` (`resume`). Re-read the prompt files on resume if restarting for a prompt fix becomes a habit |
| Step names that are whole numbers move to the front | Steps named `1`, `2` load before every other step, whatever the file says, because JavaScript orders integer keys first. Only order-dependent output changes: the diagram, the order parallel steps start in, and the *waiting for a decision* list | `cli/src/flow-config.ts` (`Object.entries` of the parsed steps). Keep the YAML document's key order instead |

## Rough edges

| Issue | Effect | Where |
|---|---|---|
| On file systems with coarse file times, a fresh output can count as not written | An output counts only if its modification time is at or after the run's start. On FAT, with 2-second times, a file written right away can fall before it, and the step stops at a *did not write* gate; Approve continues | `cli/src/flow-exec.ts` (`writtenSince`). Slack would let a fast rework count the last attempt's file as new, which is worse |
| A corrupt `state.json` or `flow.json` is reported as missing | `cannot resume: no state.json` for a file that is there but is not JSON | `cli/src/flow-run.ts` (`readJson`, `resume`) |
| `--resume` on a `state.json` with no status says *the flow already ended (undefined)* | A confusing message for a hand-edited or foreign file | `cli/src/flow-run.ts` (`resume`): check the state's shape |
| The `--resume` hint is not quoted | For a flow file whose name has a space, the copied command fails | `cli/src/flow-run.ts` (`drive`) |
| `flow.jsonl` can miss the transition during which `run-flow` crashed | `state.json` records that transition, but the log of transitions lacks its line | `cli/src/flow-run.ts` (`feed`) |
| A gate prompt's callbacks are not routed to the crash path if printing itself fails | If the terminal goes away mid-prompt (EPIPE), Node reports an unhandled rejection instead of stopping, saving and printing the `--resume` hint | `cli/src/flow-run.ts` (`askGate`): end the chain with `.catch(crash)` |
| No test pins `--resume` refusing a missing `flow.json` | The refusal works, but a change could break it unnoticed | `cli/test/flow-run.test.ts`, next to the other resume refusals |
| Shell and agent runs shape their log's `result` line differently | An agent run logs `{"kind":"result","result":{…}}`, as `run-agent` does; a shell run puts `exitCode`, `outcome` and `fingerprint` beside `kind`. A script reading the logs needs both shapes | `cli/src/flow-exec.ts` (`execShell`'s `finish`) |
| The plan still says the adapters expose no process ids | A reader of the plan, or of its design review, inherits the wrong fact | The plan's *Left out* list and its *Two hosts in one folder* decision; landmine #1 and the *Deferred* table in `docs/superpowers/plans/2026-10-19-run-flow-orchestration-review.md` |

## Related

- [[Run Flow Reference]]
- [[Testing The Run Flow CLI]]
- [[Run Agent CLI Decisions]]
- [[Agent Providers Index]]
