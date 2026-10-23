# Design review: `run-flow` orchestration plan

- **Date:** 2026-10-19
- **Plan:** `docs/superpowers/plans/2026-10-19-run-flow-orchestration.md` (updated with every answer below)
- **Spec:** `docs/FlowBoard/Multi-Agent Orchestration Analysis.md`
- **Status:** reviewed with Alex; ready to build once an execution method is picked.

## Chosen approach: B, the plan as written

The work has two parts:
- a pure engine, `advance(flow, state, event) → { state, commands }`, in `@flowboard/core`;
- a `run-flow` CLI host on top of the existing agent providers.

The alternatives were:
- **A**, steps in sequence only: medium effort, low risk;
- **C**, a background worker first: very large effort, high risk, and a database schema that is hard to change later.

**Why B:** the engine (Tasks 1–3) is the part that carries over to the worker and the web app, and it costs the same in A and B. C is where B goes next, not where to start.

**What holds up:**
- **The rules are in one place.** Every routing, rework and gate rule lives in one tested pure function, so most decisions stay cheap to change.
- **The adapters don't change.**
- **Resume is simple.** `flow.json` pinning makes resume a matter of replaying events. No version tables are needed. *Correction, 2026-10-23:* nothing is replayed. `--resume` loads `state.json` and the pinned `flow.json`, then feeds the engine one `resume` event; `flow.jsonl` is never read back.

**Where the risk is:** the host, in Tasks 9–11:
- one terminal shared by agents running in parallel;
- Ctrl+C while several runs are live;
- resuming a flow.

The plan now has 12 tasks: the old Task 9 is split into the host (9) and the gates with the terminal (10).

## Decided with Alex

| Decision | Call | Why it had to be settled now |
|---|---|---|
| Where routes live | A top-level `edges:` list of `{ from, to, condition }`, as in yamlgraph | Every flow file depends on the format, and the Flow Design canvas will read and write it. This is the one decision that's hard to reverse |
| A `fail` that no edge handles | A `verdict` gate offering Approve, Retry this step and Fail the flow; other branches keep running | D3: only a person fails a flow |
| Uncommitted changes at start | Refused unless `--allow-dirty`; `--resume` never checks | Agents' git commands can destroy uncommitted work, and nothing can undo that |

Calls I made inside the edge format (they share its cost of reversal):
- **The key and its values** come from the `step_edges` table: `condition`, which is `always`, `on_pass` or `on_fail`, defaulting to `always`.
- **One edge per `from` → `to`.** That pair is the edge's stable ID.
- **No `START` or `END`.**
- **yamlgraph habits get an error that says what to write instead.** That covers `to: [a, b]`, a `condition` expression, and `START`.

*2026-10-23:* Alex made three more calls after the build. A flow file is a reusable recipe: it holds no `folder` or `task`, and each run gives them, `pnpm run-flow --folder <dir> --task <file> <flow.yaml>`. A flow has a budget ceiling, the top-level `budget_usd`, 0 for none (see *Performance and scale*). And the next run-flow stops what a host killed with `kill -9` left running (see landmine 1). The details are in `docs/FlowBoard/Agent Providers/Run Flow Reference.md`.

## Landmines, worst first

Each one now has a fix in the plan.

| # | Failure | Fix | Task | What's left |
|---|---|---|---|---|
| 1 | The host crashes or is killed and leaves agents running and spending; `--resume` then starts a second agent in the same folder | `stopAll()` on any host error; a folder lock, so one host per folder | 9, 11 | Agents orphaned by `kill -9` can't be stopped, because the adapters expose no process IDs (pids); the lock only warns. *Correction, 2026-10-23:* the adapters do expose pids (`AgentRun.pid`); `run-flow` did not record them. Each run log now has a `pid` line, for agents and checks alike, with the process's start time. The orphans are now stopped (Alex's call): a run-flow that replaces a dead host's lock, and `--resume` in its own run folder, signal the process, or a check's whole process group, of each run whose log has a `pid` line and no `result` line, while its start time still matches the log (Claude's call, open to Alex's review). Still left: run-flow signals only an agent's own CLI process, not the processes that CLI started |
| 2 | Your uncommitted work is destroyed by an agent's `git checkout .` or a check's `git clean` | Refuse a tree with uncommitted changes (Alex) | 9 | Untracked files aren't counted |
| 3 | Ctrl+C on a check like `test -f x \|\| sleep 30` waits for the orphaned `sleep`, because SIGTERM reached only `sh`. The plan's own hanging-check test would have failed | Shell steps run in their own process group, and stopping kills the group | 7 | They no longer go through `ExecHost`, the hook a future sandbox would use; a `ponytail:` comment marks the way back |
| 4 | Rejecting an approval step whose only edge is `always` (`plan → implement`) sent the rejected plan on to `implement` | A gate offers Reject only when the step has an `on_fail` edge | 2 | — |
| 5 | With `folder: .`, agents can overwrite `state.json`, and `git clean -fdx` deletes the run folder and crashes the next state write | ai steps' `guards.denyPaths` cover the run folder, and the host re-creates the folder before writing | 9 | Bash commands and shell steps aren't path-guarded |
| 6 | A hung check in an unattended run hangs forever | `timeout_minutes`: shell steps default to 30, and a timeout opens a `run_failed` gate | 5, 9 | ai steps rely on `limits` (a warning if absent) |
| 7 | Approving a "did not write" gate runs the next step without its input, silently | The host prints the missing input, and the prompt names it | 8 | — |
| 8 | A quiet check (`grep -q`, `test -f`) prints nothing, so any two failures look identical and escalate as "stuck" | No fingerprint for blank output | 7 | — |
| 9 | Checks run agent-written tests with your API keys in their environment | Names ending in `_KEY`, `_TOKEN`, `_SECRET` or `_PASSWORD` are removed from shell steps, and the removed names are printed | 7 | Agents keep their environment; the sandbox is the real fix |
| 10 | Nothing records why the engine did what it did | `flow.jsonl`: one line per event and the engine's commands | 9 | — |

Smaller fixes:
- **Names are lowercase only**, because macOS treats `Plan.md` and `plan.md` as one file.
- **`flow.json` carries `version: 1`**, and resume refuses any other version.

## Security and trust surface

| Exposure | Likelihood × impact | Status |
|---|---|---|
| Prompt injection through hand-offs: one agent's artifact steers the next agent | Medium × high | Deferred: hand-off scanning is in *Left out*. The guards and a later sandbox limit the damage |
| Keys stolen by agent-written code that a check runs | Low–medium × high | Partly fixed (#9) |
| An agent forging another step's outcome file | Low × medium | Outcome files are written by the ask-user server, not by agents; `denyPaths` covers the run folder (#5) |
| Reading or editing other users' data | n/a | A single-user CLI with no tenancy |

## Performance and scale

These assumptions hold for a single-user CLI:
- **Engine:** flows have a handful of steps, so the engine and validator recompute the graph on every call. That's fine into the hundreds of steps.
- **State file:** `state.json` is rewritten on every transition, which costs O(runs) bytes and is fine for hundreds of runs.
- **Shell output:** capped at 20,000 characters. Agent logs grow with each run.
- **What's actually slow** is the agent runs themselves: minutes and dollars per step.
  - `--max-runs` bounds how many run at once.
  - `max_attempts` multiplied by each step's limits bounds a loop.
  - There is no budget ceiling for a whole flow (deferred: Flow Design #12). *2026-10-23:* built, Alex's call: the top-level `budget_usd`, 0 for none, which `--budget-usd` overrides. Each agent run may spend only what is left, and a flow that has spent it pauses (exit 3) until `pnpm run-flow --resume <run folder> --budget-usd <more>` (Claude's calls, open to Alex's review). Runs launched together may each spend all that is left.

## Two-way doors I decided

Override any of these at any time:
- **Where run state lives:** `runs/` beside where the command runs, as for `run-agent`.
- **`--resume` uses the pinned `flow.json`.** Fixing a prompt partway through means starting the flow again.
- **A step with no budget and no turn limit** gets a warning, not an error. *2026-10-23:* only when the flow has no ceiling (`budget_usd: 0`); with one, each agent run is capped by what is left.
- **Artifact names:** type keys saved as `<type>.md`. Names have no dots today, so file names like `result.json` can be added later without breaking any flow.

## Deferred, with what would trigger each

| Item | Trigger |
|---|---|
| Process IDs on `AgentRun`, to stop orphaned agents. *Correction, 2026-10-23:* `AgentRun.pid` already existed, and each run log now records its run's pid and the process's start time. Stopping the orphans is built since (Alex's call; see landmine 1) | The worker, which re-attaches to runs by process ID |
| A budget ceiling for a whole flow. *Built 2026-10-23* (Alex's call): `budget_usd`; see *Performance and scale* | Unattended runs that get long or expensive |
| Counting untracked files in the uncommitted-changes check | Untracked work lost to a check |
| Re-reading prompts on `--resume` | Restarting a flow just to fix a prompt becomes a habit |
| Scanning hand-offs for prompt injection | Flows that read untrusted inputs |

## Still open

- What the "but …" in the original request meant. The plan assumes it changes nothing.
- How to build it: subagent-driven or native.
