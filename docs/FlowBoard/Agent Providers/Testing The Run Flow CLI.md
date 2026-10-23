---
tags: [flowboard, agent-providers, testing, cli, how-to]
module: Agent Providers
date: 2026-10-19
---

# Testing The Run Flow CLI

How to check `pnpm run-flow`, the command that runs several agent and shell steps as one flow. There are three levels, cheapest first:
- the automated suite (free);
- the live test (a fraction of a cent);
- hand-run scenarios with your own flow files. Most use shell steps only, and cost nothing.

Every field is described in [[Run Flow Reference]], and what is left for later is in [[Run Flow Deferred Issues]]. Single agent runs are tested as in [[Testing The Run Agent CLI]].

## Before you start

- **Code:** branch `fix/flow-orchestration-audit`, which adds the conformance audit's fixes to `feature/flow-orchestration`. Today that is the worktree `.claude/worktrees/flow-orchestration-audit/code/flowboard`; after a merge it is `code/flowboard` in the main checkout. Run `pnpm install` there once. The flow files below are recipes: they use `entry:` and `budget_usd:`, and leave the folder and the task to `--folder` and `--task`. Older code refuses them.
- **Agent steps** need what `run-agent` needs: the `claude` CLI logged in with your subscription, and, for OpenCode steps, the `opencode` CLI with an OpenRouter key. Shell-only flows need neither, and cost nothing.

## 1. Automated suite (free)

From `code/flowboard/`:

```sh
pnpm typecheck:packages
pnpm test:packages
```

Expect no type errors, and 356 tests: 341 pass, `fail 0`, and 15 skipped (the live ones), as on 2026-10-23. Nothing here spends anything: `test:packages` empties `FLOWBOARD_LIVE`, so the live tests skip even when your shell sets it. The suite covers:
- the flow file, a recipe: its keys, `budget_usd`, paths relative to the flow file, and the `--folder` and `--task` a run gives it;
- the flow validator (the entry and `entry:`, rework routes, joins behind conditional routes) and the engine's routes, joins, rework, escalation, notes, queued runs and resume;
- output fingerprints, and `set_outcome`, offered only where the verdict is read;
- shell steps, run with the real `sh`: their output, setup failures, background commands, timeouts, `FLOWBOARD_NOTE` and the `pid` line;
- agent steps, run with a scripted provider;
- the host: fan-out, joins, gates and the shared terminal, the timeout clock, Ctrl+C (a second one kills) and `--resume`, the budget (each run's cap, the pause, the resume), the folder lock and what a host killed with `kill -9` left running, the run folder, and the uncommitted-changes check.

To run only the flow tests:

```sh
FLOWBOARD_LIVE= node --test packages/core/test/flow.test.ts packages/core/test/engine.test.ts packages/core/test/fingerprint.test.ts packages/cli/test/flow-*.test.ts packages/ask-user/test/shim.test.ts
```

Expect 141 tests and `fail 0`, with one skipped: the live flow test. `shim.test.ts` holds the `set_outcome` tests.

## 2. Live test (a fraction of a cent)

```sh
FLOWBOARD_LIVE=1 node --test packages/cli/test/flow-live.test.ts
```

One flow runs across both providers, under a $1 ceiling:
- Claude Code (haiku) writes a greeting;
- a shell step checks it;
- an OpenCode judge (DeepSeek V4.1 Flash on OpenRouter) reports `pass` through `set_outcome`.

Expect `pass 1` in 15 to 40 seconds. A run costs about $0.002, from Claude quota and OpenRouter credit. `pnpm test:live` runs it together with nine other live tests, or twelve with `FLOWBOARD_OPENCODE_MODEL=providerID/modelID` set: that variable picks another judge model, and also turns on the OpenCode adapter's three live tests. Two more, which keep a question waiting six minutes, also need `FLOWBOARD_LIVE_SLOW=1`.

When a model wanders off and runs out of turns, the flow stops at a gate and the test fails; it never passes by accident. Read the judge's log to see why (see *Reading a run*).

## 3. Hand-run scenarios

### Set up a scratch folder

```sh
mkdir -p ~/fb-flow/proj && cd ~/fb-flow
printf 'Make a tiny greeting.\n' > task.md
alias fbflow='pnpm -s --dir /Users/alex/projects/personal/flowboard/flowboard_v3/.claude/worktrees/flow-orchestration-audit/code/flowboard run-flow'
```

- A flow file is a recipe: every run below gives it `--folder proj --task task.md` (a `--resume` takes neither), which resolve against the folder you run from, and each run gets its own folder in `runs/` there. Shell steps run in `proj/`, so the files they write land there. Paths inside a flow file, such as its prompts, resolve against the flow file's own folder, here `~/fb-flow` too.
- `-s` hides pnpm's own banner. Check the exit code after each run with `echo "exit $?"`.
- The `--resume` hint says `pnpm run-flow --resume …`; with the alias, type `fbflow --resume …`.

Every run prints a header, a line as each step's run starts and ends, the last line each shell step printed, and a summary:

```
-- warning: …/fb-flow/proj is not in a git repository; nothing can undo the flow's edits
-- flow shell: 2 steps in …/fb-flow/proj, no budget ceiling
-- run folder runs/2026-10-23T19-44-39-shell
-- shell steps run without: GITHUB_TOKEN
-- write attempt 1 (shell)
-- write attempt 1: pass, $0.00
-- check attempt 1 (shell)
-- check: last output: hello
-- check attempt 1: pass, $0.00
-- flow done: 2 runs, $0.00 spent, $0.00 wasted
```

The first line goes away once `proj` is a git repository. The second names the flow's ceiling, here none, since the flow file says `budget_usd: 0`. The fourth lists whichever of your shell's variables look like secrets (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`); shell steps run without them. A shell step's output is not shown as it comes: `-- check: last output: hello` is its last line, and the whole output is in the run log's `result` line and, when the step declares `produces`, in its artifact (see *Reading a run*). `write` prints nothing, so it gets no such line.

### Free scenarios: shell steps only

Save the flow files below in `~/fb-flow`. "Exit" is what `echo "exit $?"` prints.

| # | What it checks | Run | Expect |
|---|---|---|---|
| 1 | Check and draw | `fbflow --check rework.yaml`, then `fbflow --mermaid rework.yaml` | `-- flow ok: 2 steps, starting at fix`, then a `flowchart LR` whose rework edge is dotted, `n1 -.->\|fail ↺\| n0`. Exit 0, and no `runs/` folder. Both check the recipe on its own; with `--folder proj --task task.md` they check those too. Without its `entry: fix` line, rework.yaml is refused: `rework.yaml: steps: no entry step: every step has a route into it; name the first one with entry:`, exit 2 |
| 2 | A plain flow | `fbflow --folder proj --task task.md shell.yaml` | write, then check, both `pass`; `-- flow done: 2 runs, $0.00 spent, $0.00 wasted`; exit 0. `proj/.flowboard/<run folder name>/check_output.md` holds `hello`. Without `--folder` or `--task`, run-flow prints its usage, exit 2 |
| 3 | Rework | `rm -f proj/tries.txt; fbflow --folder proj --task task.md rework.yaml` | check fails once, printing `-- check: last output: FAIL: only one try`, so fix runs again as attempt 2, then check passes: `-- flow done: 4 runs, …`; exit 0 |
| 4 | A stuck check, with no one to answer | `fbflow --folder proj --task task.md stuck.yaml < /dev/null` | The two `-- check: last output: FAIL: test_login (… ms)` lines differ only in the digits `$RANDOM` picks, so the second failure matches the first: `-- fix needs a decision`, `-- flow paused: 4 runs, …`, `-- waiting for a decision: fix` and the `--resume` hint; exit 3. In the run folder's `state.json`, the gate on `fix` reads `check failed the same way twice` |
| 5 | Answering that gate, with a note | `fbflow --resume runs/<…>-stuck`, in a real terminal | `-- resuming …`, then the prompt `fix: check failed the same way twice`, with `See: …/check_output.md`, offers *Retry this step* and *Fail the flow*, then asks *Note for the next run (optional)*. Retry, and type a note: fix runs as attempt 3 with the note in `$FLOWBOARD_NOTE`, so it prints `-- fix: last output: fix, note: <your note>`; check fails the same way, and the prompt comes back. Then Fail the flow: `-- flow failed: 6 runs, …`, exit 1 |
| 6 | Approval, with a note | `fbflow --folder proj --task task.md gate.yaml`, in a real terminal | draft writes `draft v1` to `proj/draft.txt` and to its artifact, `draft.md`, and prints `-- draft: last output: draft v1`. Then it asks `draft: approval needed; it reported pass`, with `See: …/draft.md`, offering *Approve (pass)*, *Retry this step* and *Fail the flow*. Reject is missing because draft has no `on_fail` edge. Approve, and type a note: publish runs with the note in `$FLOWBOARD_NOTE` and prints `-- publish: last output: published, note: <your note>`; `proj/published.txt` exists; exit 0. With `< /dev/null` it pauses instead, exit 3 |
| 7 | Ctrl+C, then resume | `fbflow --folder proj --task task.md hang.yaml`, then press Ctrl+C once | At once: `-- stopping`, `-- flow stopped: 1 run, …` and the hint; exit 130, and `pgrep -fl "sleep 600"` finds nothing. Then `touch proj/go.flag` and `fbflow --resume runs/<…>-hang`: `-- resuming …`, the check runs again and passes; exit 0. Resuming once more: `runs/<…>-hang: cannot resume: the flow already ended (done)`, exit 2 |
| 8 | A timeout | `fbflow --folder proj --task task.md timeout.yaml` | After 6 seconds: `-- wait attempt 1: failed: timed out after 0.1 minutes, $0.00`, then the prompt `wait: run failed: timed out after 0.1 minutes`, with `See: …/001-wait.jsonl`, the run's log, offering Retry and Fail. With `< /dev/null`, exit 3 |
| 9 | One run per folder | `fbflow --folder proj --task task.md hang.yaml` in one terminal, `fbflow --folder proj --task task.md shell.yaml` in a second | The second refuses, naming the first one's run folder in full: `shell.yaml: --folder: another run-flow (pid …) is working here on …/fb-flow/runs/<…>-hang; if it is not, delete …/fb-flow/proj/.flowboard/lock`; exit 2. Then Ctrl+C the first |
| 10 | Uncommitted changes | `(cd proj && git init -q && echo one > f.txt && git add f.txt && git commit -qm one && echo two > f.txt)`, then `fbflow --folder proj --task task.md shell.yaml` | `shell.yaml: --folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty`; exit 2, and no new run folder. `fbflow --allow-dirty --folder proj --task task.md shell.yaml` runs, and adds `.flowboard/` to `proj/.git/info/exclude`, so `git status` never lists it. A new untracked file alone never blocks a run. Afterwards, `rm -rf proj/.git proj/f.txt` to go back |
| 11 | Mistakes in the file | `fbflow --folder proj --task task.md broken.yaml`, then the same with `yamlgraph.yaml` | One line per mistake, exit 2: `broken.yaml: steps.Plan: name may only use lowercase letters, digits, - and _`; `broken.yaml: edges.0.from: no START or END here; …`; `yamlgraph.yaml: edges.0.to: one step name; write one edge per pair of steps`; `yamlgraph.yaml: edges.1.condition: must be always, on_pass or on_fail`. A flow file written before flows were recipes, with `folder:` and `task:`, gets only `folder: not in a flow file: a flow is a reusable recipe, and each run gives its folder with --folder` and the same for `task:` |
| 18 | A budget | `fbflow --budget-usd 0.5 --folder proj --task task.md shell.yaml`, then `fbflow --budget-usd five --folder proj --task task.md shell.yaml` | The start line names the ceiling, `-- flow shell: 2 steps in …/fb-flow/proj, a budget of $0.50`, and the summary what was spent of it, `-- flow done: 2 runs, $0.00 of $0.50 spent, $0.00 wasted`; exit 0. `jq .config.budgetUsd runs/<…>-shell/flow.json` prints `0.5`, the ceiling a `--resume` would keep. Shell steps cost nothing, so only agent steps can reach it (scenario 20). The second: `--budget-usd: must be a number of dollars, 0 or more; 0 means no ceiling`, exit 2. And `grep -v budget_usd shell.yaml > nobudget.yaml; fbflow --check nobudget.yaml`: `nobudget.yaml: budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling`, exit 2 |
| 19 | A host killed with `kill -9` | `fbflow --folder proj --task task.md hang.yaml`; in a second terminal, `kill -9 $(jq .pid proj/.flowboard/lock)`, then `fbflow --folder proj --task task.md shell.yaml` | The first run-flow dies at once, leaving its lock and its check: `pgrep -fl "sleep 600"` still finds it. The second run finds the lock, stops the check its run log names, and then runs: `-- warning: a run-flow (pid …) ended without cleaning up; stopped 1 run it left running`; exit 0, and `pgrep` finds nothing. The log's `pid` line is what it read: `{"kind":"pid","at":"…","pid":72915,"group":true,"started":"Fri Oct 23 19:46:37 2026"}`. To try `--resume`'s own check, kill a hang.yaml run the same way, `rm proj/.flowboard/lock` and `touch proj/go.flag`, then `fbflow --resume runs/<…>-hang`: `-- stopped 1 run the last run-flow left running`, `-- resuming …`, and the check runs again and passes; exit 0 |

How these were checked:
- All thirteen were run on 2026-10-23, against the code this note describes. Scenarios 5–8 ran in a pseudo-terminal made by `expect`, fed the keys a person would press: the choices and notes, and Ctrl+C for scenario 7. Scenarios 9 and 19 ran their two terminals from one script; scenario 9 stopped the first run with `kill -INT`.
- No one has yet answered scenarios 5 and 6 at a real keyboard, so they are still the ones worth doing by hand first.

### Free flow files

```yaml
# shell.yaml
budget_usd: 0
steps:
  write: { shell: 'echo hello > greeting.txt' }
  check: { shell: 'grep hello greeting.txt', produces: [check_output] }
edges:
  - { from: write, to: check }
```

```yaml
# rework.yaml: the check fails until fix has run twice
budget_usd: 0
entry: fix                         # check routes back to fix, so the routes cannot say which step is first
steps:
  fix: { shell: 'echo try >> tries.txt' }
  check: { shell: 'test $(wc -l < tries.txt) -ge 2 || { echo "FAIL: only one try"; exit 1; }', produces: [check_output] }
edges:
  - { from: fix, to: check }
  - { from: check, to: fix, condition: on_fail }
```

```yaml
# stuck.yaml: the check always fails the same way; only its digits change. fix prints any note it is given
budget_usd: 0
entry: fix
steps:
  fix: { shell: 'echo "fix, note: ${FLOWBOARD_NOTE:-none}"', max_attempts: 5 }
  check: { shell: 'echo "FAIL: test_login ($RANDOM ms)"; exit 1', produces: [check_output] }
edges:
  - { from: fix, to: check }
  - { from: check, to: fix, condition: on_fail }
```

```yaml
# gate.yaml: a person approves the draft before it is published
budget_usd: 0
steps:
  draft: { shell: 'echo "draft v1" | tee draft.txt', produces: [draft], gate: approval }
  publish: { shell: 'cp draft.txt published.txt && echo "published, note: ${FLOWBOARD_NOTE:-none}"' }
edges:
  - { from: draft, to: publish, condition: on_pass }
```

```yaml
# hang.yaml: waits until proj/go.flag exists
budget_usd: 0
steps:
  wait: { shell: 'test -f go.flag || sleep 600' }
```

```yaml
# timeout.yaml
budget_usd: 0
steps:
  wait: { shell: 'sleep 600', timeout_minutes: 0.1 }
```

```yaml
# broken.yaml: a capital letter, and yamlgraph's START
budget_usd: 0
steps:
  Plan: { shell: 'true' }
  build: { shell: 'true' }
edges:
  - { from: START, to: Plan }
```

```yaml
# yamlgraph.yaml: yamlgraph's fan-out list and condition expression
budget_usd: 0
steps:
  plan: { shell: 'true' }
  a: { shell: 'true' }
  b: { shell: 'true' }
edges:
  - { from: plan, to: [a, b] }
  - { from: a, to: b, condition: score < 0.8 }
```

### Agent scenarios (cost a little)

These run Claude Code with haiku, and OpenCode with DeepSeek V4.1 Flash. Each flow caps its agent steps at a few turns and a small budget, so a scenario costs about a cent or less.

| # | What it checks | Run | Expect |
|---|---|---|---|
| 12 | One agent step | `fbflow --folder proj --task task.md agent.yaml` | `-- write attempt 1 (claude-code haiku)`, the agent's event lines and `-- last message: …`, then `-- write attempt 1: no outcome, $0.00`. *No outcome* is right for a step whose verdict nothing reads: it is not offered `set_outcome`. `proj/.flowboard/<run folder name>/greeting.md` holds `hello`; exit 0 |
| 13 | Two providers, and `set_outcome` | `fbflow --folder proj --task task.md judge.yaml` | The live test's flow, less its $1 ceiling: write on Claude Code, then check, then judge on OpenCode, which reports `pass`. It starts with `-- warning: steps.judge: reworks "write" on a failure but produces nothing, so write runs again without seeing why`, since judge writes nothing. `runs/<run>/003-judge.outcome.json` holds `{"outcome":"pass",…}`; exit 0 |
| 14 | Reject, with a note | `fbflow --folder proj --task task.md review.yaml`; at the plan gate, choose *Reject (fail)* and type a note | plan runs again as attempt 2, and that run's preamble, the task text, ends with *A person's note for this attempt: <your note>*; the files to read, the output, the step's own prompt and the closing come after it (see *Reading a run*). Approve the second time: build prints `-- build: last output: <the plan's last line>`, and the whole plan is in `proj/.flowboard/<run folder name>/build_output.md`; exit 0 |
| 15 | An output that was not written | `fbflow --folder proj --task task.md missing.yaml` | The prompt tells the agent not to write. `-- plan needs a decision`, then the prompt `plan: did not write: plan`. Retry runs attempt 2; Fail the flow ends it with exit 1 |
| 16 | Two agents asking at once | `fbflow --folder proj --task task.md ask.yaml` | a and b both ask for a colour. The questions come one at a time, each headed `-- a asks:` or `-- b asks:`, and the other agent's lines wait until you answer. Exit 0, with each answer in its step's artifact |
| 17 | A reviewer sends the work back | `fbflow --folder proj --task task.md loop.yaml` | implement writes `hello`. review reports `fail`, so implement runs again as attempt 2 and writes `hello world`; review runs again, as attempt 1, and passes. `-- flow done: 4 runs, $0.01 spent, $0.00 wasted` (the two wasted runs cost $0.005; costs print to the cent); exit 0. Run 3's only input is `review_notes`, and `proj/.flowboard/<run folder name>/review_notes.md` ends as `No issues.` See [[Run Flow Review Loop]] |
| 20 | The budget runs out | `fbflow --budget-usd 0.01 --folder proj --task task.md loop.yaml < /dev/null` | Scenario 17's flow, with a ceiling of about what it spent there. Each run may spend only what is left of the $0.01: its log's `start` line has that as `config.limits.maxBudgetUsd` (see *Reading a run*), and a run its provider stops there fails. Once the runs have spent $0.01, run-flow stops what is still running, and the flow pauses: `-- flow paused: …, $<spent> of $0.01 spent, …`, `-- the budget is spent: $<spent> of $0.01` and `-- continue with: pnpm run-flow --resume runs/<…>-loop --budget-usd <more>`; exit 3. `fbflow --resume runs/<…>-loop` then refuses: `runs/<…>-loop: cannot resume: the budget is spent, $<spent> of $0.01; give a larger one, or 0 for none, with --budget-usd`; exit 2. `fbflow --resume runs/<…>-loop --budget-usd 0.1`, in a real terminal, asks any gate left open and carries on. If the runs come in under $0.01, the flow ends `done` instead |

So far scenarios 13 (as the live test) and 17 have run for real, both before the audit fixes of 2026-10-23; scenario 20 has not run yet. Every agent flow file below passes `--check` on the current code, alone and with `--folder proj --task task.md`. In scenario 17's run, the second review printed `-- 2 tool calls failed`: the agent first looked for a file where it wasn't, then was refused a search outside the folder. Neither changed the outcome.

The prompt files for these:

```sh
printf 'Write the single word hello, in lowercase, into your output file. Nothing else.\n' > write.md
printf 'Read the greeting file, and write nothing. Report pass if it contains the word hello, otherwise fail.\n' > judge.md
printf 'Write a three-line plan for the greeting into your output file.\n' > plan.md
printf 'Reply with the single word done. Do not create or change any file.\n' > lazy.md
printf 'Ask the user for their favourite colour with the ask_user tool, then write the answer into your output file.\n' > ask.md
printf 'Write the word hello into greeting.txt. If a review is among your inputs, change greeting.txt as it says. Then write one line saying what you did into your output file.\n' > implement.md
printf 'Read greeting.txt, and do not change it. It must hold exactly the two words hello world. Write what is wrong with it into your output file, or No issues. if nothing is; always write the file. Report fail unless it holds exactly hello world.\n' > critique.md
```

The task file is every step's opening text, so keep it a goal ("Make a tiny greeting."), and leave step instructions to each step's own prompt. In one live run the task said *write it into your output file*, and the judge, which has no output file, spent its turns looking for one.

```yaml
# agent.yaml
budget_usd: 0
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 4, budget_usd: 0.2 } }
steps:
  write: { prompt: write.md, produces: [greeting] }
```

```yaml
# judge.yaml: Claude Code writes, a shell step checks, OpenCode judges
budget_usd: 0
defaults: { limits: { max_turns: 6, budget_usd: 0.3 } }
entry: write                       # check and judge both route back to write
steps:
  write: { adapter: claude-code, model: haiku, prompt: write.md, produces: [greeting] }
  check: { shell: 'grep -qi hello "$FLOWBOARD_ARTIFACTS/greeting.md"', produces: [check_output] }
  judge:
    adapter: opencode
    model: openrouter/deepseek/deepseek-v4.1-flash
    prompt: judge.md
    requires: [greeting]
edges:
  - { from: write, to: check }
  - { from: check, to: judge, condition: on_pass }
  - { from: check, to: write, condition: on_fail }
  - { from: judge, to: write, condition: on_fail }
```

```yaml
# review.yaml: an approval gate where Reject reruns the plan
budget_usd: 0
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 4, budget_usd: 0.2 } }
entry: plan                        # plan's rework edge points back at it
steps:
  plan: { prompt: plan.md, produces: [plan], gate: approval }
  build: { shell: 'cat "$FLOWBOARD_ARTIFACTS/plan.md"', requires: [plan], produces: [build_output] }
edges:
  - { from: plan, to: build }
  - { from: plan, to: plan, condition: on_fail }   # makes Reject an option: rework plan
```

```yaml
# missing.yaml
budget_usd: 0
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 3, budget_usd: 0.2 } }
steps:
  plan: { prompt: lazy.md, produces: [plan] }
```

```yaml
# ask.yaml: two agents in parallel, each asking a question
budget_usd: 0
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 6, budget_usd: 0.2 } }
steps:
  start: { shell: 'true' }
  a: { prompt: ask.md, produces: [colour_a] }
  b: { prompt: ask.md, produces: [colour_b] }
edges:
  - { from: start, to: a }
  - { from: start, to: b }
```

```yaml
# loop.yaml: a reviewer agent sends the work back to the implementer once. implement.md asks
# for hello and critique.md for hello world, so the first review fails and the second passes.
budget_usd: 0
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 6, budget_usd: 0.2 } }
entry: implement
steps:
  implement: { prompt: implement.md, produces: [notes] }
  review: { prompt: critique.md, requires: [notes], produces: [review_notes], guards: { deny_paths: [greeting.txt] } }
edges:
  - { from: implement, to: review }
  - { from: review, to: implement, condition: on_fail }
```

## Reading a run

Each run folder, `runs/<YYYY-MM-DDTHH-MM-SS>-<flow name>/`, holds:
- `flow.json`, the pinned flow, with the run's folder and ceiling (`config.folder`, `config.budgetUsd`);
- `state.json`, the engine's state;
- `flow.jsonl`, one line per transition;
- one log per launched run, `<NNN>-<step>.jsonl`;
- `<NNN>-<step>.outcome.json` for each verdict reported with `set_outcome`.

The artifacts are in `proj/.flowboard/<run folder name>/`. With `jq`:

```sh
run=$(ls -td runs/*/ | head -1)
jq '{status, runs: [.runs[] | {id, step, attempt, outcome, error, wasted, costUsd}]}' "$run/state.json"
jq -c '[.event.type, ([.commands[].type] | join(","))]' "$run/flow.jsonl"   # each event and what the engine did
jq '.steps | map_values(.gate // empty)' "$run/state.json"                  # open gates and their reasons
jq -r 'select(.kind=="start") | .config.prompt.preamble' "$run"/002-plan.jsonl   # what a run was told, note included
jq -c 'select(.kind=="start") | .config.prompt.inputs' "$run"/003-implement.jsonl  # the files a run was told to read first
jq -c 'select(.kind=="start" and .config) | {step, limits: .config.limits}' "$run"/*.jsonl  # each agent run's caps; maxBudgetUsd is at most what the ceiling had left
jq -c 'select(.kind=="result") | .result' "$run"/*-judge.jsonl              # how an agent run ended
jq -c 'select(.kind=="result") | del(.output)' "$run"/*-check.jsonl         # a shell run's exit code, outcome or error
jq -r 'select(.kind=="result") | .output' "$run"/002-check.jsonl           # what a shell run printed, its last 20,000 characters
jq -c 'select(.kind=="pid")' "$run"/*.jsonl                                # each run's process and its start time: an agent's CLI, a check's group
cat "$run"/*.outcome.json                                                  # verdicts reported with set_outcome
ls "proj/.flowboard/$(basename "$run")"                                    # the artifacts
```

A run that crashed or was stopped still has every line up to that point, and `--resume` continues from `state.json`.

## Related

- [[Run Flow Reference]]
- [[Run Flow Review Loop]]
- [[Run Flow Deferred Issues]]
- [[Testing The Run Agent CLI]]
- [[Agent Providers Index]]
