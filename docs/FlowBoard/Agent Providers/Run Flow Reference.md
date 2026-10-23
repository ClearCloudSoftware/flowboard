---
tags: [flowboard, agent-providers, reference, cli]
module: Agent Providers
date: 2026-10-19
---

# Run Flow Reference

Every field of the YAML file that `pnpm run-flow --folder <dir> --task <file> <flow.yaml>` reads, and how a flow runs: routes, loops, joins, gates, the budget, stopping and resuming, and the files it writes. A flow is a graph of steps. An agent step is one `run-agent` run, with any provider; a shell step is one command. A flow file is a reusable recipe: each run gives it the folder to work in and the task. The `run-agent` keys themselves are in [[Run Config Reference]]; why flows work this way is in [[Multi-Agent Orchestration Analysis]].

Code: `code/flowboard/packages/cli/src/flow-config.ts` (the file), `flow-run.ts` (the command), `flow-exec.ts` (one step run); the rules live in the engine, `packages/core/src/flow/`.

## At a glance

```yaml
budget_usd: 5                      # required: the most the whole flow may spend, in dollars; 0 for no ceiling
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  plan: { prompt: prompts/plan.md, produces: [plan], gate: approval }   # prompts/ sits beside this file
  implement: { prompt: prompts/implement.md, requires: [plan], produces: [notes], max_attempts: 2 }
  tests:
    adapter: opencode              # a second provider in the same flow
    model: openrouter/deepseek/deepseek-v4.1-flash
    prompt: prompts/tests.md
    requires: [plan]
    produces: [test_notes]
    write_roots: [tests]           # this step may only edit files under <folder>/tests
  check: { shell: pnpm test, produces: [check_output] }   # exit 0 is pass
  review: { prompt: prompts/review.md, requires: [notes, test_notes, check_output], produces: [review_notes] }
edges:
  - { from: plan, to: implement }                        # plan fans out to implement and tests
  - { from: plan, to: tests }
  - { from: implement, to: check }                       # check waits for both: a join
  - { from: tests, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail }   # rework: spends implement's attempts
  - { from: review, to: implement, condition: on_fail }  # implement reads review_notes next time
```

Saved as `delivery.yaml`, it runs with `pnpm run-flow --folder proj --task task.md delivery.yaml`: the run says where every step works and what the task is, so one flow file serves every run. `--check delivery.yaml` prints `-- flow ok: 5 steps, starting at plan`, with or without `--folder proj --task task.md`. `max_attempts` sits on `implement` because only a step that rework routes lead back to reads it.

## Commands

```
pnpm run-flow --folder <dir> --task <file> [--budget-usd <n>] [--max-runs <n>] [--allow-dirty] <flow.yaml>
pnpm run-flow --check | --mermaid [--folder <dir> --task <file>] <flow.yaml>
pnpm run-flow --resume <run folder> [--budget-usd <n>] [--max-runs <n>]
```

Any other mix of options prints these three lines, the first headed `usage:`, and exits 2: a run without both `--folder` and `--task`, for example, a check with only one of them, or a resume with either.

| Command | What it does |
|---|---|
| `pnpm run-flow --folder proj --task task.md flow.yaml` | Checks the flow, then runs it in this terminal |
| `--folder <dir>` | The existing folder where every step works. One folder per run; parallel steps share it. Pinned in `flow.json`, so `--resume` takes none |
| `--task <file>` | A non-empty file. Its text starts every agent step's prompt |
| `--budget-usd <n>` | The most this run may spend, in dollars, in place of the flow file's `budget_usd`; `0` for no ceiling (see *Stopping and resuming*). Anything else is `--budget-usd: must be a number of dollars, 0 or more; 0 means no ceiling`, exit 2 |
| `--check` | Checks only: prints each warning as `-- warning: …`, then `-- flow ok: <n> steps, starting at <entry>`. With `--folder` and `--task` it checks them too, as a run would. Without them it checks the recipe on its own: `run-agent`'s checks get the flow file's folder as a stand-in folder and the flow file itself as a stand-in task |
| `--mermaid` | Prints the graph as a Mermaid `flowchart LR`. Approval steps read `<step> (approval)`; routes draw as `-->`, `-->\|pass\|` and `-->\|fail\|`; rework routes as dotted `-.->\|fail ↺\|` |
| `--max-runs <n>` | At most `n` runs at once; with `1`, parallel branches take turns. No limit by default. Anything but a whole number above 0 is `--max-runs: must be a whole number above 0`. It is pinned in `flow.json`, so `--resume` keeps it unless `--max-runs` is given again |
| `--allow-dirty` | Runs even with uncommitted changes in the folder (see *Safety*). Not allowed with `--check`, `--mermaid` or `--resume` |
| `--resume <run folder>` | Continues a stopped, paused or crashed flow (see *Stopping and resuming*) |

`--folder` and `--task` resolve against the folder you run the command from.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The flow is done |
| 1 | The flow failed: a person chose *Fail the flow*. An error in `run-flow` itself also ends with 1, after it stops every run and saves the state, so `--resume` can continue |
| 2 | Bad usage, config or flow, uncommitted changes, another `run-flow` in the folder, a run folder it cannot use, or a refused `--resume`, a spent budget included; nothing launched |
| 3 | Paused: at a gate, with no terminal to answer it, or because the flow has spent its budget |
| 130 | Stopped with Ctrl+C |

## Rules for the whole file

- **Keys** are the ones listed here, at every level; anything else is an error (`flow.yaml: steps.plan.promt: unknown key`).
- **Names.** Step names and artifact types become file names, so they may use only lowercase letters, digits, `-` and `_`, starting with a letter or digit. Lowercase only, because macOS treats `Plan.md` and `plan.md` as one file. Otherwise: `flow.yaml: steps.Plan: name may only use lowercase letters, digits, - and _`. YAML reads an unquoted `007` as the number 7 and `true` as a boolean, so write such a step name in quotes, `"007":`. Unquoted, a step name gets `steps.007: YAML reads this name as a number; quote it: "007"`, and an edge end or `entry` gets `edges.2.to: YAML reads 7 as a number; quote the step name`.
- **The flow's name** is the YAML file's name without its extension; there is no `name` key.
- **Relative paths** in the flow file (`prompt`, `plugins`, `skills`, in a step or in `defaults`) resolve against the flow file's own folder, so a flow file and its prompts move together and run from anywhere. The YAML path, `--folder` and `--task` resolve against the folder you ran the command from, as for `run-agent`. `write_roots` are paths inside the folder, relative to it, and resolve against `--folder`.
- **A recipe holds no run.** A flow file with a `folder` or `task` key gets only these errors: `flow.yaml: folder: not in a flow file: a flow is a reusable recipe, and each run gives its folder with --folder`, and `flow.yaml: task: not in a flow file: a flow is a reusable recipe, and each run gives its task with --task`.
- **Errors** print one per line as `<yaml path>: <field>: <message>`, with exit 2. Shape errors come first: unknown keys, wrong types and missing fields. Only once they are fixed are names checked: bad names, step names YAML reads as numbers, and yamlgraph's `START` and `END`. Nothing else is checked until those are fixed too. Then every other problem is listed at once: the run's folder and task, the graph, each step's prompt, shell steps, write roots, and each step's `run-agent` checks (`steps.tests.model: opencode model must be "providerID/modelID"`). Errors about the run's inputs name the flag: `flow.yaml: --folder: not a directory: <path>`, `flow.yaml: --task: not a file: <path>`, `flow.yaml: --task: file is empty`. Each step's `run-agent` checks run only once the folder and the task are fine. Within the graph, an edge naming an unknown step, a repeated edge or an unknown `entry` hides the other graph errors; a forward loop hides the reachability, producer and `requires` errors; and `max_attempts` is checked only when the graph has no other error.
- **Warnings** don't stop a run. `--check` and a normal start print each as `-- warning: …`: an agent step with no limits in a flow with no ceiling (*Step fields*), a join that may run without one of its branches (*Joins*), a rework from a step that produces nothing (*Loops*), `{{…}}` left in the task or a prompt file, which nothing fills in (`--task: {{…}} is not filled in; the agent reads it as written`, only when `--task` is given, or `steps.plan.prompt: …`), and an agent step that opted in to an unrestricted shell ([[Run Config Reference#Unrestricted shell]]): `steps.build: unrestricted shell: commands can write outside <folder>`, or `outside the folder` when `--check` has no `--folder`.

## Flow fields

| Field | Required | Default | Meaning |
|---|---|---|---|
| `budget_usd` | yes | | The most the whole flow may spend, in dollars; `0` means no ceiling. `--budget-usd` replaces it for a run or a resume (see *Stopping and resuming*). Missing, it is `budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling`; below 0, `budget_usd: must be 0 or more; 0 means no ceiling` |
| `entry` | no | the step no edge points to | The step the flow starts at. A flow where every step has an edge into it, such as one that loops back to its first step, must name it. An unknown step is `entry: unknown step "x"` |
| `defaults` | no | none | Any `run-agent` key except `folder`, applied to every agent step. A step's own key replaces the default whole: a step with `limits: { max_turns: 5 }` drops a default `budget_usd` |
| `steps` | yes | | A mapping of step name to step; at least one |
| `edges` | no | `[]` | The routes between steps, in the order written (see *Edges, loops and joins*) |

## Step fields

A step is an **agent step** unless it has `shell`.

| Field | Default | Checked | Meaning |
|---|---|---|---|
| any `run-agent` key but `folder` | from `defaults` | as `run-agent` checks it | `adapter`, `model`, `effort`, `system_prompt`, `plugins`, `skills`, `skill`, `permissions`, `guards`, `limits`: see [[Run Config Reference]] |
| `prompt` | none | an existing, non-empty file, relative to the flow file | The step's own instructions, after the task text. An agent step needs `prompt`, `skill` or `system_prompt` |
| `requires` | `[]` | each produced by a step before this one | Artifact types this step reads. They are listed in its prompt under *Read these first:* |
| `produces` | `[]` | no two steps produce one type | Artifact types this step must write. They are listed under *Write your output to:*, each at `<folder>/.flowboard/<run folder name>/<type>.md` |
| `gate: approval` | none | | A person approves this step's work before the flow moves on, even when the agent reports an outcome. A shell step may have one too |
| `max_attempts` | `3` | a whole number, 1 or more, on a step a rework edge leads back to | The most attempts rework may give this step (see *Loops*). Every attempt counts: the first run, each rework, and each Retry at a gate other than *run failed*. Only rework is checked against it, so Retries at a verdict gate can make the next rework escalate at once. On any other step it is an error: `steps.review.max_attempts: no rework route leads back to review, so nothing reads it` |
| `shell` | none | | A command, which makes this a shell step |
| `write_roots` | the folder | each a path inside the folder, relative to it; agent steps only | The only folders this agent step may edit files in, under `--folder`. An absolute path, `~` or `..` is `steps.tests.write_roots.0: must be a path inside the folder, relative to it`. Its artifacts folder is always allowed, so `write_roots: []` leaves it only that |
| `timeout_minutes` | shell: `30`; agent: none | above 0 | A run that lasts longer is stopped, and waits at a *run failed* gate: `run failed: timed out after <n> minutes`. The clock stops while one of the run's questions waits for a person. Agent steps have no default, since their `limits` bound them |

The closing line of an agent step's prompt is `run-agent`'s. When the step's verdict is read, because an `on_pass` or `on_fail` edge leaves it or it has `gate: approval`, the step is offered the `set_outcome` tool, and its closing gains: *"Before you stop, report your verdict with the set_outcome tool: "pass" if the work meets the task, "fail" if it does not, with a one-line reason."* Any other agent step has no such tool, and an outcome its provider reports is ignored, so a last step that sums up the work can never hold a finished flow at a gate.

When the run has no ceiling (`--budget-usd 0`, or `budget_usd: 0` without `--budget-usd`), `--check` and a normal start warn, without failing, about an agent step with neither `limits.max_turns` nor `limits.budget_usd`: `steps.<name>: no limits.max_turns or limits.budget_usd, and the flow has no budget; nothing stops a looping agent`. With a ceiling, each run is capped by what is left of it.

### Shell steps

- `sh -c <command>` runs in the folder. Exit 0 is `pass`, anything else is `fail`, except a shell that could not run its command or died by a signal. Those are setup failures, which wait at a *run failed* gate: `exit code 127: command not found`, `exit code 126: the command cannot run`, `killed by <signal>`.
- It ignores `defaults`, and a `run-agent` key or `write_roots` on the step itself is an error: `steps.check.model: not used by a shell step`.
- Its output, stdout and stderr in order of arrival, is not shown as it comes. The last 20,000 characters of it go into the run log's `result` line (`output`), and into the step's one artifact when it declares one (`produces: [check_output]`). The last non-empty line is printed, cut at 300 characters: `-- check: last output: 3 failing`. A check that is stopped or times out keeps the output it had.
- `$FLOWBOARD_ARTIFACTS` holds the artifacts folder, so a check can read what earlier steps wrote. `$FLOWBOARD_NOTE` holds a person's note for this run, when a gate decision gave one.
- Its environment has no variable whose name ends in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD`, in any case. The removed names are printed at start: `-- shell steps run without: …`.
- Its input is empty, so a command that waits for input sees end-of-file.
- It runs in its own process group, so stopping it also stops the commands it started. It ends when its shell exits, and whatever it left running in the background is stopped then (SIGTERM, then SIGKILL 2 s later), so `pnpm start > server.log 2>&1 & pnpm e2e` ends with the tests. The run log's `pid` line names the group and when it started, so the next `run-flow` can stop it should this one be killed with `kill -9` (see *Safety*).

## Edges, loops and joins

An edge is `{ from, to, condition }`. `condition` is `always` (the default), `on_pass` or `on_fail`. At most one edge goes from one step to another. yamlgraph's habits get an error that says what to write instead:

| Written | Error |
|---|---|
| `to: [a, b]` | `edges.0.to: one step name; write one edge per pair of steps` |
| `condition: score < 0.8` | `edges.4.condition: must be always, on_pass or on_fail` |
| `from: START` or `to: END` | `edges.7.from: no START or END here; a flow starts at the step no edge points to (or the one entry: names) and ends when nothing is left to run` |

- **The entry** is the step `entry:` names, or else the step no edge points to. A flow that loops back to its first step has no such step, so it must name it: `build → check` plus an `on_fail` edge `check → build` needs `entry: build`. Without it: `steps: no entry step: every step has a route into it; name the first one with entry:`. Rework edges are not used to guess, because they can point at the wrong step: in the loop `draft → judge`, `judge → critique` (`on_fail`), `critique → draft`, the step only a rework edge points to is `critique`, but the flow starts at `draft`. A flow has exactly one entry; when several steps have no edge into them, each gets an error: `steps.a: no route leads here, nor to "b"; a flow starts at one step, so route the others in`. `--check` names the step a flow starts at.
- **A step finishes, then its routes fire**: every `always` edge, plus the edge matching its outcome. A rework edge fires last, after the others fired with it, so the order edges are written in changes nothing. Each target starts as soon as nothing live can still feed it (see *Joins*), so fired routes run in parallel (up to `--max-runs`).
- **A fail that no edge handles** (no `always` or `on_fail` edge) waits at a gate. **A pass that fires no route** ends its branch.
- **Joins.** A step with several edges into it waits for each of those steps while it is waiting to start, running or waiting for a decision, or while a step in one of those states can still reach it. A join behind a conditional edge that never fires runs once nothing can still feed it; `--check` warns: `steps.d: waits for "a", whose route here is conditional; if it does not fire, d runs without it`. A conditional edge further up, without which one branch never runs while the join still can, gets `steps.d: waits for "c", which runs only if the conditional route a → b fires; if it does not, d runs without it`. A condition above the fork, which cuts off every branch at once, gets no warning.
- **The flow is done** when no step is waiting to start, running, or waiting for a decision.

### Loops

- **Rework.** An `on_fail` edge back to the step itself, or to a step before it along `always` and `on_pass` edges, is a rework edge. Every other edge is forward, and forward edges may not loop: `steps: routes loop without an on_fail route back: a, b`.
- **A rework edge is its step's only `on_fail` edge.** A rework resets the steps after its target, so another `on_fail` route fired by the same failure would act on steps being reset: `steps.check: on a failure it would rework "impl" and also take the on_fail route to "notify"; a rework route must be its step's only on_fail route`. Forward `on_fail` edges on their own are fine.
- **What rework does.** It reruns the target with the failing step's artifacts added to its inputs, less any the failing run did not write this time, so a stale copy from an earlier round is not passed on. Every run so far of the target and of the steps after it counts as wasted, a run of those steps still going is stopped, and those steps start again from attempt 1. A step after the target that a route from outside the reset had already fed, a join, waits again with that input, and runs once nothing can still feed it.
- **Only artifacts carry the failure.** The reason an agent gave with `set_outcome` stays in its run record, its outcome file and its log; it does not reach the rework run. A step that sends work back should produce something, or the target runs again without seeing why; `--check` warns: `steps.check: reworks "impl" on a failure but produces nothing, so impl runs again without seeing why`. A person's note at a Reject does reach it (see *Gates and their choices*).
- **The attempt budget belongs to the target.** Every loop into it shares it, so a failed check and a failed review draw on the same `max_attempts`.
- **When it is spent**, the target waits at an escalation gate (`impl has used 3 of 3 attempts`), and nothing runs it. The escalation also stops and discards what runs after the target, the failing step included, since Retry and Fail the flow would both discard it; nothing after the target can fail into the gate meanwhile.
- **Stuck checks.** A shell step that fails with the same output as its previous failure escalates at once (`check failed the same way twice`), whatever is left of the budget, and stops what runs after the target as above. "The same" compares the last 20 non-empty lines, with absolute paths cut to their file name, then UUIDs, hex ids of 7 or more characters that contain a digit, durations with their unit (`980ms`, `1.02s`, `2 min`), day and month names, and digits removed, so timings, dates, ids and paths don't count. A failing check that prints nothing is never stuck.

A worked example, a reviewer agent that sends the work back to its implementer, is in [[Run Flow Review Loop]].

## How a step's outcome is decided

- **Agent steps.** The verdict the agent reported with `set_outcome`; else the provider's own result; else none. A missing outcome is never a pass. A step whose edges and gate don't read the verdict keeps none (see *Step fields*).
- **Did the agent write its outputs?** An output counts as written only if this run wrote it: a copy left by an earlier attempt doesn't count. A missing one sends the step to a gate (`did not write: plan`).
- **A failed run** (a provider error, a limit hit, a crash, an agent CLI's nonzero exit, a timeout, or a shell step that could not run its command or died by a signal) sends the step to a *run failed* gate. It is never retried by itself, and it never uses up an attempt.
- **No outcome.** A step with `on_pass` or `on_fail` edges and no outcome waits at a gate (`no outcome reported`). A step with only `always` edges needs none.
- **A missing input** doesn't stop a step: it runs, and `-- plan: missing input notes; it runs without it` is printed, for agent and shell steps alike. An agent step's preamble, the task text, ends with *"Missing inputs (an earlier step did not write them): notes"*, after any note and before the files to read, the outputs and the step's own prompt.

## Gates and their choices

A gate stops one step until a person decides; other branches keep running. In a terminal, `run-flow` prints `-- <step> needs a decision`, then asks:

- **The decision**, headed `<step>: <reason>`, with `See: <paths>` naming the evidence files that exist; at a *run failed* gate, the run's log too, `<run folder>/<NNN>-<step>.jsonl`;
- **A note**, *Note for the next run (optional)*. It goes to the runs the decision starts: Approve's to the steps its `on_pass` and `always` routes start, Reject's to the steps its `on_fail` and `always` routes start (a rework target included), and Retry's to the run it starts. With no note typed, a Retry at a *run failed* or verdict gate passes on the note the attempt started with, and a Retry at an escalation the note of the Reject that led to it. An agent run gets the note at the end of its preamble, the task text: *"A person's note for this attempt: <note>"*; a shell run gets it as `$FLOWBOARD_NOTE`. After *Fail the flow* nothing runs, and the note is kept only in `flow.jsonl`.

| Reason | When | Choices |
|---|---|---|
| `approval needed`, plus `; it reported <outcome>` and `: <reason>` when set | an approval step finished | Approve, Reject, Retry, Fail |
| `no outcome reported` | a conditional step reported no outcome | Approve, Reject, Retry, Fail |
| `failed, and no edge handles a failure`, with `(<reason>)` after *failed* when set | a fail that no edge handles | Approve, Retry, Fail |
| `did not write: <types>` | an agent run left an output unwritten | Approve, Reject, Retry, Fail |
| `<target> has used <n> of <max> attempts`, or `<target> has used <n> attempts, past its max_attempts of <max>` when Retries already took it past | a loop's budget is spent | Retry, Fail |
| `<step> failed the same way twice` | a stuck check | Retry, Fail |
| `run failed: <error>` | the run itself failed or timed out | Retry, Fail |

Reject is offered only when the step has an `on_fail` edge.

| Choice | Label | Effect |
|---|---|---|
| `approve` | Approve (pass) | The step passes, over the agent's own verdict |
| `reject` | Reject (fail) | The step fails, and its routes fire as for any fail: its `on_fail` route, and its `always` routes too. Use `on_pass` for a route a Reject must not take |
| `retry` | Retry this step | At a *run failed* gate, the same attempt again. At a spent loop, one attempt past the budget, so the next failure escalates at once. At a stuck check with attempts left, the next attempt, within the budget: it escalates again only if the check fails the same way or the budget runs out. At an escalation the target reruns with its `requires` plus the failing step's outputs the gate showed. At any other gate, the next attempt; the run it replaces counts as wasted. A Retry is never refused at `max_attempts`, but its attempt counts toward it |
| `fail` | Fail the flow | Stops every running step and ends the flow as failed. Only a person fails a flow |

- **Questions take turns.** Gates and agents' questions (`-- <step> asks:` heads an agent's batch) are asked one at a time, first come first served. Lines printed meanwhile wait until the prompt closes.
- **Without a terminal** (input piped in), a gate waits unanswered. When nothing else can run, the flow pauses with exit 3, printing `-- waiting for a decision: <steps>` and `-- continue with: pnpm run-flow --resume <run folder>`. Agents' questions are answered *"No one can answer questions in this run."*, as in `run-agent`.

## Stopping and resuming

- **Ctrl+C** (or SIGTERM, or closing the terminal) prints `-- stopping`, takes down any open prompt, stops every run, and exits 130 with the `--resume` hint. The runs it cuts off print no end line. Ctrl+C at a prompt counts the same. A second press more than 300 ms later quits at once: it kills (SIGKILL) every run still going, each check's process group and each agent's CLI process, removes the live agent runs' `/tmp/fb-*` folders, and leaves the lock behind, so the next `run-flow` in the folder warns that this one ended without cleaning up (see *Safety*).
- **The budget.** `budget_usd`, or `--budget-usd` when given, is the most the whole flow may spend: the sum of its runs' recorded costs (`costUsd`), resumes included. A run whose cost is unknown adds nothing, and an OpenCode model with no price adds $0. Each agent run may spend only what is left: its `limits.budget_usd` becomes the lower of its own and the ceiling less what is spent, and its provider stops the run there, which fails it (a *run failed* gate). Runs launched together may each spend all that is left, and a provider stops a run only once it has reached its cap, so a flow can end a little past its ceiling. The ceiling is checked again as each run ends. When a run ends and the flow has spent its ceiling, and the flow has not ended, `run-flow` stops the live runs, which count as wasted, records runs still waiting for a `--max-runs` slot as `not launched`, and takes down any open gate prompt. The flow then pauses, with exit 3:
  ```
  -- flow paused: 2 runs, $0.20 of $0.15 spent, $0.00 wasted
  -- the budget is spent: $0.20 of $0.15
  -- continue with: pnpm run-flow --resume <run folder> --budget-usd <more>
  ```
  When a step waits at a gate, `-- waiting for a decision: <steps>` comes before the budget line. `flow.json` pins the ceiling as `config.budgetUsd`. A `--budget-usd` given to `--resume` replaces it there, larger, smaller or `0` for none, so the next resume keeps it too. With room left under the ceiling, `--resume` reruns the runs the ceiling cut off, asks again any gate left open, and carries on.
- **`--resume <run folder>`** continues from the folder's `flow.json` and `state.json`, printing `-- resuming <run folder>` in place of the start lines. It takes no `--folder` or `--task`: `flow.json` pins the run's folder (`config.folder`). The YAML is not read again, so a fixed prompt takes a new run; skill and plugin folders are read at every launch, so they are not pinned. It keeps the `--max-runs` the flow started with, unless `--max-runs` is given again, and the ceiling, unless `--budget-usd` is given. Before it goes on, it stops what the last host left running in this run folder, as a stale lock does (see *Safety*), in case that lock was deleted by hand: `-- stopped 1 run the last run-flow left running`. Uncommitted changes are not checked, because the tree now holds the flow's own edits. A run that was cut off counts as wasted, and its step runs again at the same attempt. A run still waiting for a `--max-runs` slot was never launched: it is recorded as `not launched`, not wasted, has no log, and starts on resume. Open gates are asked again.
- **It refuses**, with exit 2, as `<run folder>: cannot resume: …`:
  - `no state.json`;
  - `no flow.json`;
  - `made by a different version of run-flow`;
  - `the flow already ended (done)`, or `(failed)`;
  - `folder not found: <path>`, when the run's folder has been moved or deleted (it is never made again);
  - `the budget is spent, $0.20 of $0.15; give a larger one, or 0 for none, with --budget-usd`, while what the runs have spent reaches the ceiling it would use, the pinned one or the `--budget-usd` given;
  - the lock line, when another `run-flow` holds the folder.

## Safety

- **Uncommitted changes.** Checks can run `git checkout .` or `git clean`, so a run refuses to start when tracked files in the folder have changes: `flow.yaml: --folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty`. Untracked files don't count, because the flow's own new files usually are untracked, and `.flowboard/` never counts. Outside a git repository it warns instead: `-- warning: <folder> is not in a git repository; nothing can undo the flow's edits`.
- **One `run-flow` per folder.** `<folder>/.flowboard/lock` holds the running host's process id and the run folder's absolute path, `{ pid, runDir }`, written whole through a temp file, so it is never read half-written. It is taken before the uncommitted-changes check, so a second `run-flow` is told that another one is working, not to stash the first one's edits: `flow.yaml: --folder: another run-flow (pid 4242) is working here on /…/runs/<stamp>-flow; if it is not, delete <lock path>`. Taking it makes only `.flowboard/`, never the folder itself.
  - A lock whose process is gone is moved aside, checked and replaced, and what that host left running is stopped: the process of each run in its run folder whose log has a `pid` line and no `result` line. A process is signalled only while its start time still matches the `pid` line's `started`, since its pid may belong to another process by now; a check's process group is signalled even when its shell has gone, so a server it started in the background stops too. Each gets SIGTERM, then SIGKILL if it outlasts 2 s. The warning counts the runs, a check's whole group as one: `-- warning: a run-flow (pid 4242) ended without cleaning up; stopped 1 run it left running`, or `… stopped 2 runs …`, or just `-- warning: a run-flow (pid 4242) ended without cleaning up` when nothing was left. With no run folder to look in (a lock taken before the run folder was made, or a run folder that has gone), it ends `; check that none of its agents or checks are still running`. A process whose start time does not match is left alone: `-- warning: pid 4243 (<run log>) is running but may not be the process its run started; check it yourself`.
  - An agent run is stopped by its CLI's pid: what that CLI started and left behind is not reached, since the adapters give it no process group of its own.
  - A lock that cannot be read refuses: `flow.yaml: --folder: cannot read <lock path>; if no run-flow is working here, delete it`.
  - On exit a host removes the lock only while it is its own.
  - If a check deletes the lock (`git clean -fdx`), the next state save takes it again. If another `run-flow` took the folder meanwhile, both go on working, with `-- warning: a check deleted this folder's lock, and another run-flow (pid 4242) took it; both are working here now`.
  - One race is left: three hosts starting together on a stale lock can let two of them in.
  - On a disk without hard links (FAT, some network mounts) the lock is created in place instead; a host that catches it half-written refuses, as for any lock it cannot read.
- **The run folder is off limits.** When `runs/` sits inside the folder, agent steps' file tools may not write to the run folder: their guards deny `<run folder>/**`. The guard reads that path as a glob, so a run whose path from the folder to the run folder holds any character but letters, digits, `_`, `.`, `-`, `/` and space is refused: `flow.yaml: runs: the run folder sub[1]/runs/… is inside --folder, and its path has characters the guard cannot match exactly; start run-flow from another folder`. If a check deletes the run folder, the next save makes it again and writes `flow.json` and `state.json` again, so the flow can still be resumed; the earlier run logs and `flow.jsonl` lines are lost.
- **Guards** are `run-agent`'s, per step, plus `write_roots`, plus `DISCARD_COMMANDS` (in `flow-run.ts`): agent steps may not run git commands that throw away uncommitted edits, which in a flow are the earlier steps' work. They are `git checkout` with `--`, `.` or `-f`/`--force`; `git switch` with `--discard-changes` or `-f`/`--force`; `git restore`, except a staged-only `--staged`; `git clean`, except a dry run (`-n`, `--dry-run`); and `git stash`, except `git stash list` and `git stash show`. Like `run-agent`'s rules they match anywhere in a command, so a commit message that quotes one is refused too. `git checkout <path>` without `--` gets through, since it looks like a branch switch. Like `run-agent`'s, the guards don't cover what an agent's shell commands write, and shell steps are not guarded at all.

## Files written

| Path | What |
|---|---|
| `runs/<YYYY-MM-DDTHH-MM-SS>-<flow name>/` | The run folder, in the folder you ran the command from. It is claimed by making it, so a name taken, even this second by another host, gets `-2`, `-3`, … In the flow name, any character but letters, digits, `_`, `.` and `-` becomes `_`: `a[1].yaml` runs in `<stamp>-a_1_` |
| `…/flow.json` | `{ version: 1, config, artifactsDir, maxRuns }`: the loaded flow, pinned for `--resume`. `config` holds the run's folder and ceiling too (`config.folder`, `config.budgetUsd`), and `maxRuns` is `null` for no `--max-runs` |
| `…/state.json` | The engine's state after the last transition. Written whole or not at all, through `state.json.<pid>.tmp`. A run is `queued: true` until the host launches it; `costUsd` is `null` when the provider reported no price |
| `…/flow.jsonl` | One line per transition: `{ at, event, commands }`, which says why the engine did what it did. Each launch is a `launched` event |
| `…/<NNN>-<step>.jsonl` | One log per launched run, `NNN` being the run id: `start`, `pid` (an agent CLI's process id, or a check's process group with `"group":true`, and `started`, when that process started, as `ps -o lstart=` prints it), each event, questions and answers (with a `batch` number), and the `result`. A shell run's `result` holds `exitCode`, `outcome` or `error`, `fingerprint` and `output`, its last 20,000 characters. An agent run's holds the provider's `result`, plus `error` when the host stopped the run: `stopped`, or `timed out after <n> minutes` |
| `…/<NNN>-<step>.outcome.json` | The verdict the agent reported with `set_outcome` |
| `<folder>/.flowboard/<run folder name>/<type>.md` | The artifacts |
| `<folder>/.flowboard/lock` | Present while a `run-flow` works in the folder: `{ pid, runDir }`, the run folder's absolute path |

`run-flow` never touches `.gitignore`. At start it adds `.flowboard/` to the repository's local exclude file (`.git/info/exclude`, found with `git rev-parse --git-path info/exclude`), as the design does for `.flowboard/skills/` ([[Execution Storage]]), so `git add -A` leaves the artifacts and the lock alone.

The terminal shows, in order:
- at start, any `-- warning: …` lines (the flow file's warnings, a stale lock and what was stopped, a folder outside git), then `-- flow <name>: <n> steps in <folder>, a budget of $<ceiling>`, or `…, no budget ceiling`, `-- run folder <run folder>`, and `-- shell steps run without: …` when the flow has a shell step and there are secrets to remove; `--resume` prints instead any stale-lock warning, `-- stopped <k> runs the last run-flow left running` when there were some, and `-- resuming <run folder>`;
- as each run starts, `-- <step> attempt <n> (<adapter> <model>)` or `(shell)`, then `-- <step>: missing input <type>; it runs without it` for each input not written;
- while an agent step runs, its event lines and its questions, each batch headed `-- <step> asks:`; a question it withdraws prints `-- question withdrawn: the agent stopped waiting`, or `-- question withdrawn before it was shown: the agent stopped waiting`;
- as an agent run ends, `-- <n> tool calls failed` and `-- last message: …` when there is something to say, and, for an OpenCode model with no price, `-- <step>: no price for <model>: its cost shows as $0, and limits.budget_usd cannot stop it`; as a shell run ends, `-- <step>: last output: <line>`;
- then `-- <step> attempt <n>: <pass | fail | no outcome | failed: <error>>, $<cost>`, or `…, cost unknown` when the provider reported no price; a run cut off by Ctrl+C or a spent budget gets no end line;
- `-- <step> needs a decision` at each gate;
- at the end, `-- flow <done | failed | paused | stopped>: <n> runs, $<spent> spent, $<wasted> wasted` (`1 run` for one), with `$<spent> of $<ceiling> spent` when the flow has a ceiling, plus `, cost unknown for <k> runs` (`1 run`) when some runs reported no price. `<n>` counts launched runs only. A paused flow adds `-- waiting for a decision: <steps>` when a step waits at a gate, and `-- the budget is spent: $<spent> of $<ceiling>` when the ceiling paused it. A paused or stopped one ends with `-- continue with: pnpm run-flow --resume <run folder>`, plus ` --budget-usd <more>` after a spent budget.

## Rules this command settles

The open questions in the Execution and Flow Design notes that `run-flow` answers. Numbers are those notes' open-question numbers; § numbers are the [[Multi-Agent Orchestration Analysis]]'s. Unmarked rules are the run-flow plan's (`docs/superpowers/plans/2026-10-19-run-flow-orchestration.md`), and *(Alex, …)* marks Alex's. Rules marked *(Claude's call, 2026-10-23, open to Alex's review)* were taken by Claude when Alex asked for every finding of the [[Flow Orchestration Conformance Audit]] to be fixed, or when building his three answers of the same day.

| Question | Rule |
|---|---|
| §7.2 Where flows live | Decided later. The engine takes a plain flow; `run-flow` reads YAML and pins its copy per run |
| §7.3 CLI or worker first | The CLI. The worker, queue and web app come later, on the same engine |
| §7.4 Provider per step | Yes: `adapter` per step, with `defaults` |
| §7.5 Parallel steps, one folder | One folder; `write_roots` narrows a step's edits, and `--max-runs 1` runs branches one at a time |
| §7.6 Routing beyond pass and fail | No |
| §7.7 How a step reports its outcome | The `set_outcome` tool; the provider's own result is read too |
| Where routes live | A top-level `edges:` list of `step_edges` rows; no `START` or `END` (Alex, 2026-10-19) |
| Flow Design #23, Execution #65: entries and producers | One entry step: the step no edge points to (Alex, 2026-10-19). When every step has an edge into it, the flow names its first step with `entry:`; the step only rework edges point to is no longer taken, since it can be the wrong one *(Claude's call, 2026-10-23, open to Alex's review)*. One producer per artifact type |
| Flow Design #24: type keys or file names | Type keys, each saved as `<type>.md` |
| Execution #4: is a rework target a join? | No. Only forward edges make a join |
| Execution #7: which outcome source wins | `set_outcome`, then the provider's result, then none |
| Execution #9: what "earlier" means | An `on_fail` edge to the step itself, or to an ancestor along `always`/`on_pass` edges, is rework |
| Execution #17: which runs are wasted | On rework, every run so far of the target and the steps after it, including the failing run. Also cut-off runs that had launched, failed runs, and a run replaced by Retry |
| Execution #18, Flow Design #20: downstream attempts | Reset; only the target's count carries |
| Execution #64: approve over the agent's `fail` | The person wins: Approve sets pass, Reject sets fail |
| Execution #71: a silent approval step | Gated once; the decision is the outcome |
| Execution #66: does `attempts` count the first run? | Yes. It escalates when `attempts + 1 > max_attempts` |
| Execution #14, #16: a spent loop | It escalates and never fails by itself. Retry doesn't reset the count, so the next failure escalates at once |
| Execution #58, #67: stuck detection | A failing shell run whose output matches that step's previous failure escalates, across rework rounds |
| Execution #19: stripping digits | The PRD's rule, except an absolute path shrinks to its file name. UUIDs, hex ids, durations with their unit, and day and month names are removed too, before digits *(Claude's call, 2026-10-23, open to Alex's review)* |
| Execution #21: where a note goes | Into the next run's preamble |
| Execution #49, #50: a blocked branch; cancel | A gate on one branch doesn't stop the others. There is no cancel: Ctrl+C stops the flow and `--resume` continues it, and *Fail the flow* stops every run. A flow is *paused* only when it waits at a gate nobody can answer, or has spent its budget (exit 3) |
| Flow Design #19: a join behind a conditional route | It runs once nothing can still feed it; `--check` warns, also when the conditional route is further up |
| Flow Design #22: back-edges as ancestry | No; rework inputs are added by the engine |
| Flow Design #37: budget and turn caps | Optional on a step; in a flow with no ceiling, `--check` warns about an agent step with neither |
| A fail that fires no route | A gate offering Approve, Retry and Fail the flow (Alex, 2026-10-19) |
| Uncommitted changes at start | Refused unless `--allow-dirty`; `--resume` never checks (Alex, 2026-10-19) |
| Flow Design #1, #2, #4: what a flow file is | A reusable recipe: it holds no folder or task, and each run gives them with `--folder` and `--task` (Alex, 2026-10-23). `flow.json` pins a run's folder, so `--resume` needs neither |
| Flow Design #12: a budget for the whole flow | A ceiling for the whole flow, `0` for none (Alex, 2026-10-23). It is the required key `budget_usd`, which `--budget-usd` replaces for a run or a resume; each agent run may spend only what is left; and once the ceiling is spent, the flow stops its runs and pauses until `--resume --budget-usd` gives it room *(Claude's call, 2026-10-23, open to Alex's review)* |
| What a host killed with `kill -9` left running | Stopped (Alex, 2026-10-23): by the next `run-flow` in the folder, which finds the dead host's lock, and by `--resume` in its own run folder. Each run log's `pid` line keeps the process's start time, and a process is signalled only while it still matches, since its pid may have been reused *(Claude's call, 2026-10-23, open to Alex's review)* |
| Exit 0 without a declared output | A gate, never a silent pass |
| Infra failures | Never retried by themselves; a gate where Retry keeps the attempt |
| Several `on_fail` routes from one step | A rework route must be its step's only `on_fail` route; `--check` refuses the rest. A rework fires after the `always` routes fired with it *(Claude's call, 2026-10-23, open to Alex's review)* |
| Notes typed at a gate | Every gate asks for one, and it goes to the runs the decision starts (see *Gates and their choices*); a shell run gets it as `FLOWBOARD_NOTE` *(Claude's call, 2026-10-23, open to Alex's review)* |
| An escalation at a fork, and a second failure into a target already at an escalation gate | The escalation stops and discards the work after its target, so nothing there can fail into the gate afterwards *(Claude's call, 2026-10-23, open to Alex's review)* |
| A join reset by a rework | It keeps the routes that steps outside the reset already fired, and waits again *(Claude's call, 2026-10-23, open to Alex's review)* |
| Reject and `always` routes | Reject is a fail, and `always` fires on any outcome, so a Reject takes `always` routes too. Use `on_pass` for a route a Reject must not take *(Claude's call, 2026-10-23, open to Alex's review)* |
| Execution #41: shell steps that cannot start | Exit 126 or 127, or a death by a signal, is a setup failure: a *run failed* gate, not a fail *(Claude's call, 2026-10-23, open to Alex's review)* |
| Git commands that discard work | Denied to agent steps (`DISCARD_COMMANDS`). The base-branch `git checkout` rule waits for the worker, which has a base branch *(Claude's call, 2026-10-23, open to Alex's review)* |
| Flow Design #25: which artifact types | An open set: any lowercase name, with no known-types check. A typo in `requires` already fails as *no step before it produces that* *(Claude's call, 2026-10-23, open to Alex's review)* |
| Where the step rules live | In the CLI loader, `flow-config.ts`, until a second reader (the canvas or the worker) exists; moving them means adding a `kind` to `StepDef` *(Claude's call, 2026-10-23, open to Alex's review)* |
| Execution #6, Flow Design #39: manual steps | Left out, blocked on Flow Design #39. The stand-in is a shell step running `true` with `gate: approval` *(Claude's call, 2026-10-23, open to Alex's review)* |
| Canvas fields: positions, display names, an agent reference, sandbox fields | Not in the flow file for now: the schema stays strict, a step's key is its name, and a canvas keeps positions in its own file. Decided with the canvas; an `agent:` key and sandbox fields stay left out *(Claude's call, 2026-10-23, open to Alex's review)* |
| A version identity for what a run ran | `flow.json` is the record. Now that a flow file is a recipe, a hash of it would identify a flow version; none is made yet, because nothing reads one (the flow library or the Monitor) *(Claude's call, 2026-10-23, open to Alex's review)* |
| Pinning skills and plugins | Not pinned: they are read at every launch, `--resume` included. Pinning comes with the capability library's pins *(Claude's call, 2026-10-23, open to Alex's review)* |
| Execution #13: queued versus running | A run is `queued: true` in `state.json` until the host reports its launch. One cut off before that is `not launched`, not wasted, and the summary does not count it *(Claude's call, 2026-10-23, open to Alex's review)* |
| A flow-level status | None stored. Paused (a step at a gate, nothing live) and stopped (a step running with no live run) can be read from `state.json`; a flow its budget paused is told apart by its runs' costs, which have reached `flow.json`'s `config.budgetUsd` *(Claude's call, 2026-10-23, open to Alex's review)* |
| Run records | `state.json` keeps the engine's fields; each run's log keeps the pid and when its process started, session id, model, adapter, times and usage *(Claude's call, 2026-10-23, open to Alex's review)* |
| Flow Design #15: model ids across adapters | Native per adapter: a Claude alias or id, OpenCode's `provider/model`. Logical ids wait for a models table *(Claude's call, 2026-10-23, open to Alex's review)* |
| Flow Design #33: dependencies the contract cannot see | Validation ignores them; only `requires` is checked *(Claude's call, 2026-10-23, open to Alex's review)* |
| Which agent steps get `set_outcome` | Those whose routes or approval gate read the verdict *(Claude's call, 2026-10-23, open to Alex's review)* |
| Does a question's wait count toward `timeout_minutes`? | No: the clock stops while a person is being asked *(Claude's call, 2026-10-23, open to Alex's review)* |
| Relative paths in a flow file | Following Alex's recipe call, a recipe's own paths (`prompt`, `plugins`, `skills`) resolve against the flow file's folder, so a recipe and its prompts move together; `--folder` and `--task` resolve against the folder `run-flow` starts in; `write_roots` are paths inside the folder, relative to it. A canvas that writes flow files must write them that way *(Claude's call, 2026-10-23, open to Alex's review)* |

Execution #5, approval and questions on one step, cannot arise in `run-flow`: questions are answered live, and one still open when a run ends is withdrawn before the step's approval gate opens. It stays open for the worker, which parks questions.

Left for later, as the run-flow plan's *Left out* list has it: the worker, queue and web app; parking and the 20-minute hold (the terminal answers live); automatic infra retry backoff; dynamic fan-out and worktrees; routing on labels; `declare_artifact`; a JSON outcome fallback; prompt `{{placeholders}}` (a placeholder left in the task or a prompt gets a warning); memory; capability-gap warnings; a Mermaid overlay of a run's route; cancel; an `agent:` file key (use `system_prompt`); scanning hand-offs between steps for prompt injection; and counting untracked files as uncommitted changes. Manual steps are left out too, blocked on Flow Design #39.

## Related

- [[Testing The Run Flow CLI]]
- [[Run Flow Review Loop]]
- [[Run Flow Deferred Issues]]
- [[Run Flow Monitor Readiness]]
- [[Run Config Reference]]
- [[Multi-Agent Orchestration Analysis]]
- [[Run Agent CLI Decisions]]
- [[Agent Providers Index]]
