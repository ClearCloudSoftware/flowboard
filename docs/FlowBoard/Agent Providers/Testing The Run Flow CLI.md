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

- **Code:** branch `feature/flow-orchestration`. Today that is the worktree `.claude/worktrees/flow-orchestration/code/flowboard`; after a merge it is `code/flowboard` in the main checkout. Run `pnpm install` there once.
- **Agent steps** need what `run-agent` needs: the `claude` CLI logged in with your subscription, and, for OpenCode steps, the `opencode` CLI with an OpenRouter key. Shell-only flows need neither, and cost nothing.

## 1. Automated suite (free)

From `code/flowboard/`:

```sh
pnpm typecheck:packages
pnpm test:packages
```

Expect no type errors and `fail 0`, with 15 tests skipped (the live ones). Nothing here spends anything. The suite covers:
- the flow validator, and the engine's routes, joins, rework, escalation and resume;
- output fingerprints, and `set_outcome`;
- shell steps, run with the real `sh`;
- agent steps, run with a scripted provider;
- the host: fan-out, joins, gates and the shared terminal, Ctrl+C and `--resume`, the folder lock, and the uncommitted-changes check.

To run only the flow tests:

```sh
node --test packages/core/test/flow.test.ts packages/core/test/engine.test.ts packages/core/test/fingerprint.test.ts packages/cli/test/flow-*.test.ts
```

## 2. Live test (a fraction of a cent)

```sh
FLOWBOARD_LIVE=1 node --test packages/cli/test/flow-live.test.ts
```

One flow runs across both providers:
- Claude Code (haiku) writes a greeting;
- a shell step checks it;
- an OpenCode judge (DeepSeek V4.1 Flash on OpenRouter) reports `pass` through `set_outcome`.

Expect `pass 1` in 15 to 40 seconds. A run costs about $0.002, from Claude quota and OpenRouter credit. `pnpm test:live` runs it together with the other twelve live tests, and `FLOWBOARD_OPENCODE_MODEL=providerID/modelID` picks another judge model.

When a model wanders off and runs out of turns, the flow stops at a gate and the test fails; it never passes by accident. Read the judge's log to see why (see *Reading a run*).

## 3. Hand-run scenarios

### Set up a scratch folder

```sh
mkdir -p ~/fb-flow/proj && cd ~/fb-flow
printf 'Make a tiny greeting.\n' > task.md
alias fbflow='pnpm -s --dir /Users/alex/projects/personal/flowboard/flowboard_v3/.claude/worktrees/flow-orchestration/code/flowboard run-flow'
```

- Paths in a flow file resolve against the folder you run from, and each run gets its own folder in `runs/` there. Shell steps run in `proj/`, so the files they write land there.
- `-s` hides pnpm's own banner. Check the exit code after each run with `echo "exit $?"`.
- The `--resume` hint says `pnpm run-flow --resume …`; with the alias, type `fbflow --resume …`.

Every run prints a header, a line as each step's run starts and ends, and a summary:

```
-- warning: …/fb-flow/proj is not in a git repository; nothing can undo the flow's edits
-- flow shell: 2 steps in …/fb-flow/proj
-- run folder runs/2026-10-19T20-48-29-shell
-- shell steps run without: GITHUB_TOKEN
-- write attempt 1 (shell)
-- write attempt 1: pass, $0.00
-- check attempt 1 (shell)
-- check attempt 1: pass, $0.00
-- flow done: 2 runs, $0.00 spent, $0.00 wasted
```

The first line goes away once `proj` is a git repository. The fourth lists whichever of your shell's variables look like secrets (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`); shell steps run without them.

### Free scenarios: shell steps only

Save the flow files below in `~/fb-flow`. "Exit" is what `echo "exit $?"` prints.

| # | What it checks | Run | Expect |
|---|---|---|---|
| 1 | Check and draw | `fbflow --check rework.yaml`, then `fbflow --mermaid rework.yaml` | `-- flow ok: 2 steps`, then a `flowchart LR` whose rework edge is dotted, `n1 -.->\|fail ↺\| n0`. Exit 0, and no `runs/` folder |
| 2 | A plain flow | `fbflow shell.yaml` | write, then check, both `pass`; `-- flow done: 2 runs, …`; exit 0. `proj/.flowboard/<run folder name>/check_output.md` holds `hello` |
| 3 | Rework | `rm -f proj/tries.txt; fbflow rework.yaml` | check fails once, so fix runs again as attempt 2, then check passes: `-- flow done: 4 runs, …`; exit 0 |
| 4 | A stuck check, with no one to answer | `fbflow stuck.yaml < /dev/null` | The second failure matches the first, though `$RANDOM` gives it different digits: `-- fix needs a decision`, `-- flow paused: 4 runs, …`, `-- waiting for a decision: fix` and the `--resume` hint; exit 3. In the run folder's `state.json`, the gate on `fix` reads `check failed the same way twice` |
| 5 | Answering that gate | `fbflow --resume runs/<…>-stuck`, in a real terminal | The prompt `fix: check failed the same way twice`, with `See: …/check_output.md`, offers *Retry this step* and *Fail the flow*, then asks *Note for the next attempt (optional)*. Fail the flow: `-- flow failed: …`, exit 1. Retry: one more attempt, which fails the same way and asks again |
| 6 | Approval | `fbflow gate.yaml`, in a real terminal | draft prints `draft v1`, then asks `draft: approval needed; the agent says pass` with *Approve (pass)*, *Retry this step* and *Fail the flow*. Reject is missing because draft has no `on_fail` edge. Approve: publish runs, `proj/published.txt` exists, exit 0. With `< /dev/null` it pauses instead, exit 3 |
| 7 | Ctrl+C, then resume | `fbflow hang.yaml`, then press Ctrl+C once | At once: `-- stopping`, `-- flow stopped: 1 runs, …` and the hint; exit 130, and `pgrep -fl "sleep 600"` finds nothing. Then `touch proj/go.flag` and `fbflow --resume runs/<…>-hang`: `-- resuming …`, the check runs again and passes; exit 0. Resuming once more: `runs/<…>-hang: cannot resume: the flow already ended (done)`, exit 2 |
| 8 | A timeout | `fbflow timeout.yaml` | After 6 seconds: `-- wait attempt 1: failed: timed out after 0.1 minutes, $0.00`, then the prompt `wait: run failed: timed out after 0.1 minutes`, offering Retry and Fail. With `< /dev/null`, exit 3 |
| 9 | One run per folder | `fbflow hang.yaml` in one terminal, `fbflow shell.yaml` in a second | The second refuses: `shell.yaml: folder: another run-flow (pid …) is working here on runs/…; if it is not, delete …/proj/.flowboard/lock`; exit 2. Then Ctrl+C the first |
| 10 | Uncommitted changes | `(cd proj && git init -q && echo one > f.txt && git add f.txt && git commit -qm one && echo two > f.txt)`, then `fbflow shell.yaml` | `shell.yaml: folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty`; exit 2, and no new run folder. `fbflow --allow-dirty shell.yaml` runs. A new untracked file alone never blocks a run. Afterwards, `rm -rf proj/.git proj/f.txt` to go back |
| 11 | Mistakes in the file | `fbflow broken.yaml`, then `fbflow yamlgraph.yaml` | One line per mistake, exit 2: `broken.yaml: steps.Plan: name may only use lowercase letters, digits, - and _`; `broken.yaml: edges.0.from: no START or END here; …`; `yamlgraph.yaml: edges.0.to: one step name; write one edge per pair of steps`; `yamlgraph.yaml: edges.1.condition: must be always, on_pass or on_fail` |

How these were checked while writing this guide:
- Scenarios 1–4 and 7–11 were run. Scenario 7 used `kill -INT` in place of the key press, and scenario 8 used `< /dev/null`.
- Scenarios 5 and 6, answering in a real terminal, were tested only with a scripted answerer, so they are the ones worth doing by hand first.

### Free flow files

```yaml
# shell.yaml
folder: proj
task: task.md
steps:
  write: { shell: 'echo hello > greeting.txt' }
  check: { shell: 'grep hello greeting.txt', produces: [check_output] }
edges:
  - { from: write, to: check }
```

```yaml
# rework.yaml: the check fails until fix has run twice
folder: proj
task: task.md
steps:
  fix: { shell: 'echo try >> tries.txt' }
  check: { shell: 'test $(wc -l < tries.txt) -ge 2 || { echo "FAIL: only one try"; exit 1; }', produces: [check_output] }
edges:
  - { from: fix, to: check }
  - { from: check, to: fix, condition: on_fail }
```

```yaml
# stuck.yaml: the check always fails the same way; only its digits change
folder: proj
task: task.md
steps:
  fix: { shell: 'true', max_attempts: 5 }
  check: { shell: 'echo "FAIL: test_login ($RANDOM ms)"; exit 1', produces: [check_output] }
edges:
  - { from: fix, to: check }
  - { from: check, to: fix, condition: on_fail }
```

```yaml
# gate.yaml: a person approves the draft before it is published
folder: proj
task: task.md
steps:
  draft: { shell: 'echo "draft v1" | tee draft.txt', produces: [draft], gate: approval }
  publish: { shell: 'cp draft.txt published.txt' }
edges:
  - { from: draft, to: publish, condition: on_pass }
```

```yaml
# hang.yaml: waits until proj/go.flag exists
folder: proj
task: task.md
steps:
  wait: { shell: 'test -f go.flag || sleep 600' }
```

```yaml
# timeout.yaml
folder: proj
task: task.md
steps:
  wait: { shell: 'sleep 600', timeout_minutes: 0.1 }
```

```yaml
# broken.yaml: a capital letter, and yamlgraph's START
folder: proj
task: task.md
steps:
  Plan: { shell: 'true' }
  build: { shell: 'true' }
edges:
  - { from: START, to: Plan }
```

```yaml
# yamlgraph.yaml: yamlgraph's fan-out list and condition expression
folder: proj
task: task.md
steps:
  plan: { shell: 'true' }
  a: { shell: 'true' }
  b: { shell: 'true' }
edges:
  - { from: plan, to: [a, b] }
  - { from: a, to: b, condition: score < 0.8 }
```

### Agent scenarios (cost a little)

These run Claude Code with haiku, and OpenCode with DeepSeek V4.1 Flash. Each flow caps its agent steps at a few turns and a small budget, so a scenario costs a cent or less.

| # | What it checks | Run | Expect |
|---|---|---|---|
| 12 | One agent step | `fbflow agent.yaml` | `-- write attempt 1 (claude-code haiku)`, the agent's event lines, then `-- write attempt 1: no outcome, $0.00`. *No outcome* is fine for a step with no conditional edge. `proj/.flowboard/<run folder name>/greeting.md` holds `hello`; exit 0 |
| 13 | Two providers, and `set_outcome` | `fbflow judge.yaml` | The live test's flow: write on Claude Code, then check, then judge on OpenCode, which reports `pass`. `runs/<run>/003-judge.outcome.json` holds `{"outcome":"pass",…}`; exit 0 |
| 14 | Reject, with a note | `fbflow review.yaml`; at the plan gate, choose *Reject (fail)* and type a note | plan runs again as attempt 2, and that run's prompt ends with *A person's note for this attempt: <your note>* (see *Reading a run*). Approve the second time; build prints the plan; exit 0 |
| 15 | An output that was not written | `fbflow missing.yaml` | The prompt tells the agent not to write. `-- plan needs a decision`, then the prompt `plan: did not write: plan`. Retry runs attempt 2; Fail the flow ends it with exit 1 |
| 16 | Two agents asking at once | `fbflow ask.yaml` | a and b both ask for a colour. The questions come one at a time, each headed `-- a asks:` or `-- b asks:`, and the other agent's lines wait until you answer. Exit 0, with each answer in its step's artifact |

So far only scenario 13 has run for real, as the live test.

The prompt files for these:

```sh
printf 'Write the single word hello, in lowercase, into your output file. Nothing else.\n' > write.md
printf 'Read the greeting file, and write nothing. Report pass if it contains the word hello, otherwise fail.\n' > judge.md
printf 'Write a three-line plan for the greeting into your output file.\n' > plan.md
printf 'Reply with the single word done. Do not create or change any file.\n' > lazy.md
printf 'Ask the user for their favourite colour with the ask_user tool, then write the answer into your output file.\n' > ask.md
```

The task file is every step's opening text, so keep it a goal ("Make a tiny greeting."), and leave step instructions to each step's own prompt. In one live run the task said *write it into your output file*, and the judge, which has no output file, spent its turns looking for one.

```yaml
# agent.yaml
folder: proj
task: task.md
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 4, budget_usd: 0.2 } }
steps:
  write: { prompt: write.md, produces: [greeting] }
```

```yaml
# judge.yaml: Claude Code writes, a shell step checks, OpenCode judges
folder: proj
task: task.md
defaults: { limits: { max_turns: 6, budget_usd: 0.3 } }
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
folder: proj
task: task.md
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 4, budget_usd: 0.2 } }
steps:
  plan: { prompt: plan.md, produces: [plan], gate: approval }
  build: { shell: 'cat "$FLOWBOARD_ARTIFACTS/plan.md"', requires: [plan] }
edges:
  - { from: plan, to: build }
  - { from: plan, to: plan, condition: on_fail }   # makes Reject an option: rework plan
```

```yaml
# missing.yaml
folder: proj
task: task.md
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 3, budget_usd: 0.2 } }
steps:
  plan: { prompt: lazy.md, produces: [plan] }
```

```yaml
# ask.yaml: two agents in parallel, each asking a question
folder: proj
task: task.md
defaults: { adapter: claude-code, model: haiku, limits: { max_turns: 6, budget_usd: 0.2 } }
steps:
  start: { shell: 'true' }
  a: { prompt: ask.md, produces: [colour_a] }
  b: { prompt: ask.md, produces: [colour_b] }
edges:
  - { from: start, to: a }
  - { from: start, to: b }
```

## Reading a run

Each run folder, `runs/<YYYY-MM-DDTHH-MM-SS>-<flow name>/`, holds:
- `flow.json`, the pinned flow;
- `state.json`, the engine's state;
- `flow.jsonl`, one line per transition;
- one log per run, `<NNN>-<step>.jsonl`;
- `<NNN>-<step>.outcome.json` for each verdict reported with `set_outcome`.

The artifacts are in `proj/.flowboard/<run folder name>/`. With `jq`:

```sh
run=$(ls -td runs/*/ | head -1)
jq '{status, runs: [.runs[] | {id, step, attempt, outcome, error, wasted, costUsd}]}' "$run/state.json"
jq -c '[.event.type, ([.commands[].type] | join(","))]' "$run/flow.jsonl"   # each event and what the engine did
jq '.steps | map_values(.gate // empty)' "$run/state.json"                  # open gates and their reasons
jq -r 'select(.kind=="start") | .config.prompt.preamble' "$run"/002-plan.jsonl   # what a run was told, note included
jq -c 'select(.kind=="result") | .result' "$run"/*-judge.jsonl              # how an agent run ended
jq -c 'select(.kind=="result")' "$run"/*-check.jsonl                        # a shell run's exit code and outcome
cat "$run"/*.outcome.json                                                  # verdicts reported with set_outcome
ls "proj/.flowboard/$(basename "$run")"                                    # the artifacts
```

A run that crashed or was stopped still has every line up to that point, and `--resume` continues from `state.json`.

## Related

- [[Run Flow Reference]]
- [[Run Flow Deferred Issues]]
- [[Testing The Run Agent CLI]]
- [[Agent Providers Index]]
