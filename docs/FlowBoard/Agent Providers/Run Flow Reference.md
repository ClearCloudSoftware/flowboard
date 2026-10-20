---
tags: [flowboard, agent-providers, reference, cli]
module: Agent Providers
date: 2026-10-19
---

# Run Flow Reference

Every field of the YAML file that `pnpm run-flow <flow.yaml>` reads, and how a flow runs: routes, loops, joins, gates, stopping and resuming, and the files it writes. A flow is a graph of steps. An agent step is one `run-agent` run, with any provider; a shell step is one command. The `run-agent` keys themselves are in [[Run Config Reference]]; why flows work this way is in [[Multi-Agent Orchestration Analysis]].

Code: `code/flowboard/packages/cli/src/flow-config.ts` (the file), `flow-run.ts` (the command), `flow-exec.ts` (one step run); the rules live in the engine, `packages/core/src/flow/`.

## At a glance

```yaml
folder: proj                       # required: where every step works
task: task.md                      # required: every step's prompt starts with this file
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  plan: { prompt: prompts/plan.md, produces: [plan], gate: approval }
  implement: { prompt: prompts/implement.md, requires: [plan], produces: [notes] }
  tests:
    adapter: opencode              # a second provider in the same flow
    model: openrouter/deepseek/deepseek-v4.1-flash
    prompt: prompts/tests.md
    requires: [plan]
    produces: [test_notes]
    write_roots: [tests]           # this step may only edit files under proj/tests
  check: { shell: pnpm test, produces: [check_output] }   # exit 0 is pass
  review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], max_attempts: 2 }
edges:
  - { from: plan, to: implement }                        # plan fans out to implement and tests
  - { from: plan, to: tests }
  - { from: implement, to: check }                       # check waits for both: a join
  - { from: tests, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail }   # rework: spends implement's attempts
  - { from: review, to: implement, condition: on_fail }
```

## Commands

```
pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>
pnpm run-flow --resume <run folder> [--max-runs <n>]
```

| Command | What it does |
|---|---|
| `pnpm run-flow flow.yaml` | Checks the flow, then runs it in this terminal |
| `--check` | Checks only: prints each warning as `-- warning: …`, then `-- flow ok: <n> steps` |
| `--mermaid` | Prints the graph as a Mermaid `flowchart LR`. Approval steps read `<step> (approval)`; routes draw as `-->`, `-->\|pass\|` and `-->\|fail\|`; rework routes as dotted `-.->\|fail ↺\|` |
| `--max-runs <n>` | At most `n` runs at once; with `1`, parallel branches take turns. No limit by default. Anything but a whole number above 0 is `--max-runs: must be a whole number above 0` |
| `--allow-dirty` | Runs even with uncommitted changes in `folder` (see *Safety*). Not allowed with `--check`, `--mermaid` or `--resume` |
| `--resume <run folder>` | Continues a stopped, paused or crashed flow (see *Stopping and resuming*) |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The flow is done |
| 1 | The flow failed: a person chose *Fail the flow*. An error in `run-flow` itself also ends with 1, after it stops every run and saves the state, so `--resume` can continue |
| 2 | Bad usage, config or flow, uncommitted changes, or another `run-flow` in the folder; nothing launched |
| 3 | Paused at a gate, with no terminal to answer it |
| 130 | Stopped with Ctrl+C |

## Rules for the whole file

- **Keys** are the ones listed here, at every level; anything else is an error (`flow.yaml: steps.plan.promt: unknown key`).
- **Names.** Step names and artifact types become file names, so they may use only lowercase letters, digits, `-` and `_`, starting with a letter or digit. Lowercase only, because macOS treats `Plan.md` and `plan.md` as one file. Otherwise: `flow.yaml: steps.Plan: name may only use lowercase letters, digits, - and _`.
- **The flow's name** is the YAML file's name without its extension; there is no `name` key.
- **Relative paths** (the YAML path, `folder`, `task`, `prompt`, `plugins`, `skills`) resolve against the folder you ran the command from, as for `run-agent`. `write_roots` resolve against `folder`.
- **Errors** print one per line as `<yaml path>: <field>: <message>`, with exit 2. Shape errors come first: unknown keys, wrong types, bad names, and yamlgraph's `START` and `END`. Nothing else is checked until they are fixed. Then every other problem is listed at once: the `folder` and `task` files, the graph, each step's prompt, shell steps, write roots, and each step's `run-agent` checks (`steps.tests.model: opencode model must be "providerID/modelID"`). Each step's `run-agent` checks run only once `folder` and `task` are fine.

## Flow fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `folder` | yes | | An existing folder where every step works. One folder per flow; parallel steps share it |
| `task` | yes | | A non-empty file. Its text starts every agent step's prompt |
| `defaults` | no | none | Any `run-agent` key except `folder`, applied to every agent step. A step's own key replaces the default whole: a step with `limits: { max_turns: 5 }` drops a default `budget_usd` |
| `steps` | yes | | A mapping of step name to step; at least one |
| `edges` | no | `[]` | The routes between steps, in the order written (see *Edges, loops and joins*) |

## Step fields

A step is an **agent step** unless it has `shell`.

| Field | Default | Checked | Meaning |
|---|---|---|---|
| any `run-agent` key but `folder` | from `defaults` | as `run-agent` checks it | `adapter`, `model`, `effort`, `system_prompt`, `plugins`, `skills`, `skill`, `permissions`, `guards`, `limits`: see [[Run Config Reference]] |
| `prompt` | none | an existing, non-empty file | The step's own instructions, after the task text. An agent step needs `prompt`, `skill` or `system_prompt` |
| `requires` | `[]` | each produced by a step before this one | Artifact types this step reads. They are listed in its prompt under *Read these first:* |
| `produces` | `[]` | no two steps produce one type | Artifact types this step must write. They are listed under *Write your output to:*, each at `<folder>/.flowboard/<run folder name>/<type>.md` |
| `gate: approval` | none | | A person approves this step's work before the flow moves on, even when the agent reports an outcome |
| `max_attempts` | `3` | a whole number, 1 or more | How many times rework may run this step, counting the first run (see *Loops*) |
| `shell` | none | | A command, which makes this a shell step |
| `write_roots` | `folder` | each inside `folder`; agent steps only | The only folders this agent step may edit files in. Its artifacts folder is always allowed |
| `timeout_minutes` | shell: `30`; agent: none | above 0 | A run that lasts longer is stopped, and waits at a *run failed* gate. Agent steps are bounded by their `limits` instead |

The closing line of an agent step's prompt is `run-agent`'s. When an `on_pass` or `on_fail` edge leaves the step, it gains: *"Before you stop, report your verdict with the set_outcome tool: "pass" if the work meets the task, "fail" if it does not, with a one-line reason."*

`--check` warns, without failing, about an agent step with neither `limits.max_turns` nor `limits.budget_usd`: `steps.<name>: no limits.max_turns or limits.budget_usd; nothing stops a looping agent`.

### Shell steps

- `sh -c <command>` runs in `folder`. Exit 0 is `pass`, anything else is `fail`.
- It ignores `defaults`, and a `run-agent` key or `write_roots` on the step itself is an error: `steps.check.model: not used by a shell step`.
- It writes at most one artifact (`produces: [check_output]`): the last 20,000 characters of its output, stdout and stderr in order of arrival.
- `$FLOWBOARD_ARTIFACTS` holds the artifacts folder, so a check can read what earlier steps wrote.
- Its environment has no variable whose name ends in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`, in any case. The removed names are printed at start: `-- shell steps run without: …`.
- Its input is empty, so a command that waits for input sees end-of-file.
- It runs in its own process group, so stopping it also stops the commands it started. It ends when its shell exits: a background command it left running is stopped then, so `pnpm start & pnpm e2e` ends with the tests.

## Edges, loops and joins

An edge is `{ from, to, condition }`. `condition` is `always` (the default), `on_pass` or `on_fail`. At most one edge goes from one step to another. yamlgraph's habits get an error that says what to write instead:

| Written | Error |
|---|---|
| `to: [a, b]` | `edges.0.to: one step name; write one edge per pair of steps` |
| `condition: score < 0.8` | `edges.4.condition: must be always, on_pass or on_fail` |
| `from: START` or `to: END` | `edges.7.from: no START or END here; a flow starts at the step no edge points to and ends when nothing is left to run` |

- **The entry** is the step no edge points to. When every step has an edge into it, the entry is the step that only rework edges point to, so a flow may loop back to its first step. A flow has exactly one entry.
- **A step finishes, then its routes fire**: every `always` edge, plus the edge matching its outcome. Each target starts as soon as nothing still running can feed it, so fired routes run in parallel (up to `--max-runs`).
- **A fail that no edge handles** (no `always` or `on_fail` edge) waits at a gate. **A pass that fires no route** ends its branch.
- **Joins.** A step with several edges into it waits for each of those steps while it is running, or while something running can still reach it. A join behind a conditional edge that never fires runs once nothing can still feed it; `--check` warns: `steps.d: waits for "a", whose route here is conditional; if it does not fire, d runs without it`.
- **The flow is done** when no step is waiting to start, running, or waiting for a decision.

### Loops

- **Rework.** An `on_fail` edge back to the step itself, or to a step before it along `always` and `on_pass` edges, is a rework edge. Every other edge is forward, and forward edges may not loop: `steps: routes loop without an on_fail route back: a, b`.
- **What rework does.** It reruns the target with the failing step's artifacts added to its inputs. Every run so far of the target and of the steps after it counts as wasted, a run of those steps still going is stopped, and those steps start again from attempt 1.
- **The attempt budget belongs to the target.** Every loop into it shares it, so a failed check and a failed review draw on the same `max_attempts`.
- **When it is spent**, the target waits at an escalation gate (`impl has used 3 of 3 attempts`), and nothing runs it.
- **Stuck checks.** A shell step that fails with the same output as its previous failure escalates at once (`check failed the same way twice`), whatever is left of the budget. "The same" compares the last 20 non-empty lines, with absolute paths cut to their file name, hex ids of 7 or more characters and digits removed, so timings and paths don't count. A failing check that prints nothing is never stuck.

A worked example, a reviewer agent that sends the work back to its implementer, is in [[Run Flow Review Loop]].

## How a step's outcome is decided

- **Agent steps.** The verdict the agent reported with `set_outcome`; else the provider's own result; else none. A missing outcome is never a pass.
- **Did the agent write its outputs?** An output counts as written only if this run wrote it: a copy left by an earlier attempt doesn't count. A missing one sends the step to a gate (`did not write: plan`).
- **A failed run** (a provider error, a limit hit, a crash, a nonzero exit, a timeout) sends the step to a *run failed* gate. It is never retried by itself, and it never uses up an attempt.
- **No outcome.** A step with `on_pass` or `on_fail` edges and no outcome waits at a gate (`no outcome reported`). A step with only `always` edges needs none.
- **A missing input** doesn't stop a step: it runs, `-- plan: missing input notes; it runs without it` is printed, and its prompt ends with *"Missing inputs (an earlier step did not write them): notes"*.

## Gates and their choices

A gate stops one step until a person decides; other branches keep running. In a terminal, `run-flow` prints `-- <step> needs a decision`, then asks:

- **The decision**, headed `<step>: <reason>`, with `See: <paths>` naming the evidence files that exist;
- **A note**, *Note for the next attempt (optional)*. A note goes into the prompt of the next run it starts: *"A person's note for this attempt: <note>"*.

| Reason | When | Choices |
|---|---|---|
| `approval needed`, plus `; the agent says <outcome>` and `: <reason>` when set | an approval step finished | Approve, Reject, Retry, Fail |
| `no outcome reported` | a conditional step reported no outcome | Approve, Reject, Retry, Fail |
| `failed, and no edge handles a failure`, with `(<reason>)` after *failed* when set | a fail that no edge handles | Approve, Retry, Fail |
| `did not write: <types>` | an agent run left an output unwritten | Approve, Reject, Retry, Fail |
| `<target> has used <n> of <max> attempts` | a loop's budget is spent | Retry, Fail |
| `<step> failed the same way twice` | a stuck check | Retry, Fail |
| `run failed: <error>` | the run itself failed or timed out | Retry, Fail |

Reject is offered only when the step has an `on_fail` edge.

| Choice | Label | Effect |
|---|---|---|
| `approve` | Approve (pass) | The step passes, over the agent's own verdict |
| `reject` | Reject (fail) | The step fails and its `on_fail` route fires; a rework run it starts gets the note |
| `retry` | Retry this step | At a *run failed* gate, the same attempt again. At an escalation, one more attempt beyond the budget, so the next failure escalates at once. Otherwise the next attempt; the run it replaces counts as wasted |
| `fail` | Fail the flow | Stops every running step and ends the flow as failed. Only a person fails a flow |

- **Questions take turns.** Gates and agents' questions (`-- <step> asks:` heads an agent's batch) are asked one at a time, first come first served. Lines printed meanwhile wait until the prompt closes.
- **Without a terminal** (input piped in), a gate waits unanswered. When nothing else can run, the flow pauses with exit 3, printing `-- waiting for a decision: <steps>` and `-- continue with: pnpm run-flow --resume <run folder>`. Agents' questions are answered *"No one can answer questions in this run."*, as in `run-agent`.

## Stopping and resuming

- **Ctrl+C** (or SIGTERM, or closing the terminal) prints `-- stopping`, takes down any open prompt, stops every run, and exits 130 with the `--resume` hint. Ctrl+C at a prompt counts the same. A second press more than 300 ms later quits at once and leaves the lock behind, so the next `run-flow` warns that agents may still be running.
- **`--resume <run folder>`** continues from the folder's `flow.json` and `state.json`. The YAML is not read again, so a fixed prompt takes a new run. Uncommitted changes are not checked, because the tree now holds the flow's own edits. A run that was cut off counts as wasted, and its step runs again at the same attempt; open gates are asked again.
- **It refuses**, with exit 2, as `<run folder>: cannot resume: …`:
  - `no state.json`;
  - `no flow.json`;
  - `made by a different version of run-flow`;
  - `the flow already ended (done)`, or `(failed)`;
  - the lock line, when another `run-flow` holds the folder.

## Safety

- **Uncommitted changes.** Agents and checks can run `git checkout .` or `git clean`, so a run refuses to start when tracked files in `folder` have changes: `flow.yaml: folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty`. Untracked files don't count, because the flow's own new files usually are untracked. Outside a git repository it warns instead: `-- warning: <folder> is not in a git repository; nothing can undo the flow's edits`.
- **One `run-flow` per folder.** `<folder>/.flowboard/lock` holds the running host's process id. Another `run-flow` refuses with `flow.yaml: folder: another run-flow (pid 4242) is working here on runs/…; if it is not, delete <lock path>`. A lock whose process is gone is replaced, with `-- warning: a run-flow (pid 4242) ended without cleaning up; check that none of its agents are still running`.
- **The run folder is off limits.** When `runs/` sits inside `folder`, agent steps' file tools may not write to the run folder. If a check deletes it, it is made again before the next save.
- **Guards** are `run-agent`'s, per step, plus `write_roots`. Like `run-agent`'s, they don't cover what shell commands write.

## Files written

| Path | What |
|---|---|
| `runs/<YYYY-MM-DDTHH-MM-SS>-<flow name>/` | The run folder, in the folder you ran the command from. A taken name gets `-2`, `-3`, … |
| `…/flow.json` | `{ version: 1, config, artifactsDir }`: the loaded flow, pinned for `--resume` |
| `…/state.json` | The engine's state after the last transition. Written whole or not at all, through `state.json.tmp` |
| `…/flow.jsonl` | One line per transition: `{ at, event, commands }`, which says why the engine did what it did |
| `…/<NNN>-<step>.jsonl` | One log per run, `NNN` being the run id: `start`, each event, questions, and the `result` |
| `…/<NNN>-<step>.outcome.json` | The verdict the agent reported with `set_outcome` |
| `<folder>/.flowboard/<run folder name>/<type>.md` | The artifacts |
| `<folder>/.flowboard/lock` | Present while a `run-flow` works in the folder |

`run-flow` never touches `.gitignore`.

The terminal shows `-- flow <name>: <n> steps in <folder>` and `-- run folder <run folder>` at start, `-- <step> attempt <n> (<adapter> <model>)` or `(shell)` as each run starts, `-- <step> attempt <n>: <pass | fail | no outcome | failed: <error>>, $<cost>` as each ends, and `-- flow <done | failed | paused | stopped>: <runs> runs, $<spent> spent, $<wasted> wasted` at the end.

## Rules this command settles

The open questions in the Execution and Flow Design notes that `run-flow` answers. Numbers are those notes' open-question numbers; § numbers are the [[Multi-Agent Orchestration Analysis]]'s.

| Question | Rule |
|---|---|
| §7.2 Where flows live | Decided later. The engine takes a plain flow; `run-flow` reads YAML and pins its copy per run |
| §7.3 CLI or worker first | The CLI. The worker, queue and web app come later, on the same engine |
| §7.4 Provider per step | Yes: `adapter` per step, with `defaults` |
| §7.5 Parallel steps, one folder | One folder; `write_roots` narrows a step's edits, and `--max-runs 1` runs branches one at a time |
| §7.6 Routing beyond pass and fail | No |
| §7.7 How a step reports its outcome | The `set_outcome` tool; the provider's own result is read too |
| Where routes live | A top-level `edges:` list of `step_edges` rows; no `START` or `END` (Alex, 2026-10-19) |
| Flow Design #23, Execution #65: entries and producers | One entry step: the step no edge points to, or, when every step has one, the step only rework edges point to. One producer per artifact type |
| Flow Design #24, #25: type keys or file names | Type keys, each saved as `<type>.md` |
| Execution #4: is a rework target a join? | No. Only forward edges make a join |
| Execution #7: which outcome source wins | `set_outcome`, then the provider's result, then none |
| Execution #9: what "earlier" means | An `on_fail` edge to the step itself, or to an ancestor along `always`/`on_pass` edges, is rework |
| Execution #17: which runs are wasted | On rework, every run so far of the target and the steps after it, including the failing run. Also cut-off runs, failed runs, and a run replaced by Retry |
| Execution #18, Flow Design #20: downstream attempts | Reset; only the target's count carries |
| Execution #64: approve over the agent's `fail` | The person wins: Approve sets pass, Reject sets fail |
| Execution #5, #71: a silent approval step | Gated once; the decision is the outcome |
| Execution #66: does `attempts` count the first run? | Yes. It escalates when `attempts + 1 > max_attempts` |
| Execution #14, #16: a spent loop | It escalates and never fails by itself. Retry doesn't reset the count, so the next failure escalates at once |
| Execution #58, #67: stuck detection | A failing shell run whose output matches that step's previous failure escalates, across rework rounds |
| Execution #19: stripping digits | The PRD's rule, except an absolute path shrinks to its file name |
| Execution #21: where a note goes | Into the prompt of the next run it starts |
| Execution #49, #50: a blocked branch; cancel | A gate on one branch doesn't stop the others. There is no cancel: Ctrl+C pauses, and *Fail the flow* stops every run |
| Flow Design #19: a join behind a conditional route | It runs once nothing can still feed it; `--check` warns |
| Flow Design #22: back-edges as ancestry | No; rework inputs are added by the engine |
| Flow Design #37: budget and turn caps | Optional; `--check` warns about an agent step with neither |
| A fail that fires no route | A gate offering Approve, Retry and Fail the flow (Alex, 2026-10-19) |
| Uncommitted changes at start | Refused unless `--allow-dirty`; `--resume` never checks (Alex, 2026-10-19) |
| Exit 0 without a declared output | A gate, never a silent pass |
| Infra failures | Never retried by themselves; a gate where Retry keeps the attempt |

Left for later: the worker and queue, dynamic fan-out and worktrees, routing on labels, a budget for the whole flow (Flow Design #12), prompt placeholders, scanning hand-offs for prompt injection, and stopping agents left running after a crash. The adapters report each run's process id, so that last one needs only to record them.

## Related

- [[Testing The Run Flow CLI]]
- [[Run Flow Review Loop]]
- [[Run Flow Deferred Issues]]
- [[Run Config Reference]]
- [[Multi-Agent Orchestration Analysis]]
- [[Run Agent CLI Decisions]]
- [[Agent Providers Index]]
