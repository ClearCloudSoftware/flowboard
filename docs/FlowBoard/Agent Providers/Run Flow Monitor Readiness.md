---
tags: [flowboard, agent-providers, monitor, analysis, cli]
module: Agent Providers
date: 2026-10-20
---

# Run Flow Monitor Readiness

Is the flow orchestration behind `pnpm run-flow` ready for what the [[Monitor Index|Monitor]] describes? This note answers for the code on branch `feature/flow-orchestration`, as of 2026-10-20. No code was changed to write it.

> [!summary] Short answer
> Not yet, though half of it is ready. The engine already follows the rules the Monitor shows, and it runs the Monitor's own flow. What doesn't exist yet is everything the Monitor reads its data from. `run-flow` runs one flow in one terminal and writes files. The Monitor expects many tasks, a database it can read and live updates in a browser. That missing part is the worker and job queue, which [[Run Flow Reference]] leaves for later.

## The Monitor's flow as a run-flow file

The mockup's six steps and models ([[Monitor Sample Data]]), with `review` the only gate and its send-back going to `build`:

```yaml
folder: proj
task: task.md
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  research: { prompt: p.md, model: haiku, produces: [brief] }
  plan: { prompt: p.md, model: opus, requires: [brief], produces: [plan] }
  build: { prompt: p.md, model: opus, requires: [plan], produces: [changes] }
  tests: { prompt: p.md, requires: [plan], produces: [test_report] }
  review: { prompt: p.md, requires: [changes, test_report], produces: [review], gate: approval }
  summarize: { prompt: p.md, model: haiku, requires: [review], produces: [summary] }
edges:
  - { from: research, to: plan }
  - { from: plan, to: build }
  - { from: plan, to: tests }
  - { from: build, to: review }
  - { from: tests, to: review }
  - { from: review, to: summarize, condition: on_pass }
  - { from: review, to: build, condition: on_fail }
```

`--check` prints `-- flow ok: 6 steps` and exits 0. `p.md`, `task.md` and the folder `proj` stand in for real prompts, a task and a project; `--check` only needs them to exist. `--mermaid` draws the send-back as the dotted line:

```mermaid
flowchart LR
  n0["research"]
  n1["plan"]
  n2["build"]
  n3["tests"]
  n4["review (approval)"]
  n5["summarize"]
  n0 --> n1
  n1 --> n2
  n1 --> n3
  n2 --> n4
  n3 --> n4
  n4 -->|pass| n5
  n4 -.->|fail ↺| n2
```

## What already matches

- **The four hand-off rules** of [[Hand-Off Rules]] work as the guide describes them:
  - the next step starts when one finishes;
  - one step can start several, which run in parallel;
  - a step that several feed waits for all of them;
  - a send-back reruns `build` and the steps after it, but not `tests`. The guide says the same: *"Tests are not re-run — they already passed, and that result still stands."*
- **The person's decision wins.** Approve passes the step whatever the agent said, and Reject fails it. The note typed at Reject goes into the prompt of `build`'s next run, as the guide's *Send back* hands over its reason ([[Monitor Actions And Costs]]).
- **No outcome is never a pass.** A step with a conditional edge that reports no outcome stops at a `no outcome reported` gate. An agent that leaves a declared output unwritten stops at `did not write: <types>`.
- **Escalate instead of failing**, as backlog decision D3 says ([[Failures And Retries]]). When a loop runs out of attempts, the flow stops at `build has used 3 of 3 attempts` and offers Retry or Fail the flow. Retry doesn't reset the count. A check that fails the same way twice stops early. Only a person fails a flow.
- **Wasted spend is a flag on each run, and the cost stays on the run.** Spent is the sum of every run's cost, and wasted is the part on flagged runs. So neither mockup bug in [[Monitor Open Questions]] #17 can happen: a rejected review's cost dropping out of *today*, or a stopped run counted twice.
- **Every gate says why it stopped.** It records its kind (`verdict`, `escalation` or `run_failed`), a reason and the files to read. That covers the three reasons PRD §8 gives for a gate, which #33 says each need their own wording: an approval step (`approval needed`), no outcome (`no outcome reported`), and a spent or stuck loop, which lists the failing step's outputs. Every reason is listed under *Gates and their choices* in [[Run Flow Reference]].
- **The board can be computed from saved state.** The engine is a pure function. `state.json` holds its whole state after each transition, and `flow.jsonl` logs each transition with its time. That's the shape [[Board Projection]] and [[Monitor Data Model]] ask for: *"The monitor writes nothing of its own."*
- **Events already have one shape.** Each run's log holds the provider's events as normalized events, with the raw line kept ([[Normalized Event Envelope]]). Both providers also report running token totals mid-run.

## Monitor open questions the engine answers

Numbers are those of [[Monitor Open Questions]] unless marked.

| # | Question | `run-flow`'s answer |
|---|---|---|
| 7, 41 | Do later steps become `skipped` after a send-back, and does a skipped one still count as furthest? | There is no `skipped`. A send-back removes the records of the steps after the target, and they get new ones when the work reaches them again. So the furthest step is the one running again |
| 8, 42 | Does an asking run free its worker, and is waiting free? | Not in `run-flow`. An asking agent stays alive and counts toward `--max-runs`, but spends no tokens while it waits |
| 11 | Is an infra failure an attempt? | Never. It stops at a `run failed: <error>` gate, and Retry keeps the attempt number. `run-flow` has no sandbox, so no egress denials yet |
| 12 | Retry with a note, and Fail task | Retry carries the gate's note into the next run, and *Fail the flow* stops every run |
| 17 | What counts as wasted? | Failed runs, runs cut off by Ctrl+C, runs replaced by Retry, and on a send-back every run so far of `build` and the steps after it, the rejected review included. That's the guide's broad definition, not PRD §5's narrower one |
| 35 | Does a stopped run get retried automatically? | No. Nothing retries by itself. A run cut off by Ctrl+C runs again only when you `--resume`, at the same attempt |
| 38 | Live cost has no source path | Partly answered. A `usage` event now carries running totals mid-run. OpenCode's include dollars, but Claude's are tokens only, and no price table turns them into dollars. `run-flow` itself records cost only when a run ends |
| 47 | Read review.md shows no review | An approval gate lists the step's own outputs as files to read, so a gated review shows its `review.md` |
| Flow Design #11 | Do capped retries fail the task? | No. They escalate to a gate (D3) |

## What's missing

### Data the engine doesn't keep yet

Each is small: the host stamps the event, and the engine stores it.

- **Times.** When a run started and ended, and when a gate opened. The Monitor needs them for *waited 12m* and oldest-first order in the [[Needs You Band]], the ESCALATED tag ([[Waiting And Escalation]]), the [[Timeline View]] and the *longest running* sort ([[Pulse View]]). Today they exist only as the `at` of lines in `flow.jsonl` and the run logs, not in `state.json`. A gate's start time is #22.
- **Queued versus running.** The engine marks a step running as soon as it asks for the run. The `--max-runs` queue lives only in the running process's memory, so `state.json` can't show the Monitor's `queued` (#7).
- **Asking.** There's no asking state. A question exists only in the terminal and the run log.
- **The model, tokens and turns of each run.** The run record keeps only the cost. The model is in the run log's `start` line, and the tokens in its `result`.
- **Live cost.** As #38 above: no price table for Claude, and `run-flow` records cost only at a run's end. So there's nothing yet for a row's live cost or for burn ([[Burn Today And Wasted]], #15).

### Controls from outside the terminal

- **Approve, Send back, Retry, Fail and answering** work only in the terminal running the flow. With no terminal attached, gates pause the flow and questions are refused. The engine already takes these decisions as `decide` events. What's missing is a way for a web page to deliver them to the running flow ([[Monitor Controls]]).
- **Stopping one run.** Today only Ctrl+C exists, and it stops the whole flow. The engine already handles a run that ends with an error the way the guide wants a stop handled (*"recorded as failed, with "stopped by you" as the reason"*): a `run failed: stopped by you` gate, with the run marked wasted. So this is work in `run-flow`'s run loop only, not in the engine (#14, #36).
- **Allow host & retry.** `run-flow` has no sandbox, so there's no egress allowlist to edit (#13).

### The runtime the Monitor assumes

- **Many tasks at once.** `run-flow` runs one flow per process, with one lock per folder. There are no task records, no backlog and nothing to promote or start (#24), and no pool of worker slots shared across tasks ([[Worker Slots]], #20).
- **The tables the Monitor reads** ([[Monitor Data Model]]): `tasks`, `step_instances`, `runs`, `run_events`, `questions`, `artifacts`, `jobs` and `settings`. `state.json` maps closely onto `step_instances` and `runs`, and the run logs onto `run_events`. But the log lines have no `seq`, so a client that reconnects can't resume where it left off ([[Event Stream And SSE]]).
- **A live feed.** No API and no SSE ([[Monitor API And Routes]], #30). Nothing outside the terminal can watch a run except by reading its files.
- **Pushing a long wait to another channel.** No escalation timers, and no gate times to base them on ([[Waiting And Escalation]]).
- **Automatic retries of passing failures**, such as rate limits (PRD §7). `run-flow` has none, so every rate limit would land in Needs You (#37).
- **Safe to leave running.** Agents aren't stopped after a crash ([[Run Flow Deferred Issues]]), resuming takes a manual `--resume`, and every run works in the one folder, with no workspace per task.
- **Flow versions.** Each run pins its own copy of the flow in `flow.json`, but there's no version number for the topbar's `v4` (#3).

### Where `run-flow` breaks the Monitor's design

- The Monitor assumes every step has a model. `run-flow` allows shell steps with none, which the tooltip's `Label · model`, the slot's model column and the per-model burn don't fit (#28).
- The Monitor assumes every row runs the same flow. Every `run-flow` run can use a different one (#3).

## Order to build it in

1. **The data additions:** times, queued versus running, asking, and the model and tokens of each run. Still pure engine code, and small.
2. **Stopping one run, and a price table for Claude**, so live dollars and burn exist. Small.
3. **A read-only Monitor over the run folders**, watching `state.json`, `flow.jsonl` and the run logs for changes. It would show the task rows, flow bars, wasted spend, the Needs You band and each run's live log, with decisions still made in the terminal. Medium, and it doesn't need the worker.
4. **The worker:**
   - many flows sharing one pool of slots, with a saved queue;
   - decisions and answers through the database, and cleanup after a crash;
   - then the tables, the API and the live feed.

   This is what the full Monitor needs. Large.

## Related

- [[Run Flow Reference]]
- [[Run Flow Deferred Issues]]
- [[Monitor Index]]
- [[Monitor Open Questions]]
- [[Agent Providers Index]]
