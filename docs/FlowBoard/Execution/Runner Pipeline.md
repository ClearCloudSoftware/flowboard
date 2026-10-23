---
tags: [flowboard, execution, internals, runner]
module: Execution
---

# Runner Pipeline

What the runner does with one leased `start_run` job. Feature map §7: *"The part that launches an agent for one step, hands it the right instructions, and watches it work."*

## The stages

| # | Stage | Source |
|---|---|---|
| 1 | Resolve the step, task, pinned capabilities | PRD §7 (*"capability_pins"*) |
| 2 | Recall memory, if enabled (host-side) | PRD §11.2, `03` §6 |
| 3 | Build the prompt | [[Prompt Assembly]] |
| 4 | Build the `RunSpec`; apply transforms (draft mode, sandbox profile) | `03` §6, `06` §15, backlog 3.5 |
| 5 | Permission gate; write per-run `mcp.json` and `settings.json` | [[Run Guardrails At Launch]] |
| 6 | Snapshot the args | PRD §7: *"Snapshot the final args to `data/runs/<id>/args.json`."* |
| 7 | Get the `ExecHost` from `workspace.execHost(task)`; `launch()` | `03` §6, `01-ports.md` |
| 8 | Tee events to `run_events` and live cost | PRD §7 |
| 9 | On exit: classify, scan artifacts, read outcome | PRD §7, §6 |
| 10 | Commit memory after a success | PRD §11.2 |
| 11 | Hand to the engine (§8) | PRD §7 |

No source lists these stages as one sequence; the order is assembled from PRD §7 and the drawio *Life of one step* C–I ([[Life Of One Step]]). The drawio orders it differently: it puts recall (D) after building the RunSpec and prompt (C), and [[Memory Runtime]] follows that order. The table puts it first because part 7 goes into the prompt; that order is an inference. PRD §11.2 and `03` §6 say only that recall comes before the run. See [[Memory Open Questions]] #30.

The drawio *Runner* card: *"builds the RunSpec · draft-mode transform · writes per-run mcp.json + settings.json (hooks) · records model, effort, tier"*.

> [!warning] The shipped code differs
> Stages 5 and 6 write no file. The adapters take the tool servers, `permissionMode` and `guards` from the `RunSpec` and set up the provider in memory: Agent SDK options on Claude, `OPENCODE_CONFIG_CONTENT` on OpenCode ([[Agent Providers Open Questions]] #4). The SDK builds the CLI's arguments itself, so there is no final command line to snapshot; `run-agent` logs the launched `RunSpec` as its `start` line ([[Agent Providers Storage]]). As of 2026-10-18.

As built in run-flow (2026-10-23), the run-flow host runs this pipeline for each agent run, with no memory, no draft mode or sandbox transforms and no permission gate:

- **Stage 1** takes the step from the pinned flow, the run folder's `flow.json`, which holds the flow, the run's folder, the task text and each step's prompt text. Skills and plugins are not pinned: `skills:` folders are copied afresh at every launch and `plugins:` folders mounted as they stand, `--resume` included (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).
- **Stage 4** changes one thing when the flow has a budget: the run's `limits.maxBudgetUsd` becomes what is left of it, or the step's own `limits.budget_usd` if that is lower (Claude's call, 2026-10-23, open to Alex's review).
- **Stages 5 and 7** write no file, as above, and leave `exec` unset, so both adapters spawn on the host `ExecHost`.
- **Stage 6** is the run's log, `runs/<stamp>-<flow>/<NNN>-<step>.jsonl`: a `start` line holding the launched `RunSpec`, a `pid` line with the process's start time, the events, and a `result` line.

## The illustrative code

`07-ports-in-practice.md` sketches the runner touching three ports and no adapter (abridged: the three `import type` lines, the parameter types, three comments and the `register` fields dropped):

```ts
export async function runStep(deps, step, task, produces) {
  const startedAt = Date.now();
  const run = deps.provider.launch({                       // AgentProvider port
    prompt: buildPrompt(step, task, deps.store),
    model: step.model, effort: step.effort,
    cwd: deps.workspace.cwd(task),                         // Workspace port
    resume: step.resume,
  });
  for await (const ev of run.events) {
    persistEvent(run, ev);                                 //   → run_events + SSE
    if (ev.type === 'result') updateLiveCost(task, ev.usage);
  }
  const result = await run.result;
  const files = await deps.store.scan(task, startedAt, produces); // ArtifactStore port
  for (const f of files) await deps.store.register({ … });
  return { result, files };                                // → engine applies §8 advancement
}
```

*"Swapping Claude for Codex means constructing a different `provider` in the composition root and nothing here changes."* (`07`) The sketch is illustrative: it passes no `exec`, `limits` or `toolPolicy`, has no memory bracket, and updates live cost only on the `result` event, which PRD §7's running cost needs earlier ([[Execution Open Questions]] #62). The shipped port's `usage` events carry those running totals ([[Agent Providers Open Questions]] #9).

## Events and cost while it runs

- *"Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`"* and *"produce a one-line `summary` for the viewer (e.g. `Read src/auth/session.ts`, `Bash: pnpm test`)"* (PRD §7).
- *"Take the final result event's total cost as authoritative for `runs.cost_usd`. Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* (PRD §7)
- Parsing and normalisation are the adapter's ([[Stream Parsing And Normalization]]).
- Backlog 3.2 (**PRD/BUG**): *"persist `num_turns` per assistant turn so the viewer/board show live numbers."* `02` §4: *"progress hairline needs `runs.num_turns` written **incrementally** (backlog bug: today only on the final event → always 0%)."*

> [!warning] The shipped code differs
> Nothing reads stdout lines: the Claude adapter iterates the Agent SDK's typed messages, and OpenCode reads its server's SSE events. The adapters keep the running totals and emit them as `usage` events, which count the main agent's turns; Claude's carry no cost until the result. They build `summary` for `tool_use` only. `run_events` and `seq` wait for the runner; `run-agent` appends every event to `runs/<stamp>-<adapter>.jsonl`. See [[Normalized Event Envelope]].

As built in run-flow (2026-10-23), a run's cost is its result's. A run cut off before its result, by a stop, a timeout or a stream that dies, keeps the totals of its last `usage` event: OpenCode's carry dollars, Claude's only tokens. A run with tokens but no dollar figure is recorded with an unknown cost, `costUsd: null` rather than $0, and the terminal says so: `-- <step> attempt <n>: failed: stopped, cost unknown`, and the flow's summary ends `, cost unknown for 1 run`. Only the terminal and the run's log show a run as it goes; the live running number waits for the Monitor ([[Run Flow Monitor Readiness]]).

## On exit

*"On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8. On non-zero exit, set `failed` and record stderr in `runs.error`."* (PRD §7) Non-zero → [[Infra Retries]].

Backlog 3.2 (**PRD/BUG**) adds two things: a run also fails on the result event's error flag (*"non‑zero or `is_error` → failed"*), and *"**cancel that step's pending questions** (today they keep escalating)"*. `04` §9: *"On any run failure, **cancel that step's pending questions** so they stop escalating."*

**Artifact scan.** *"After a run completes, the runner scans `<worktree>/.vibe/task-<id>/` for files created or modified during the run and registers any that match the step's declared `produces` types. The agent may also register one explicitly via the `declare_artifact` MCP tool. Do both — scanning catches the case where the agent forgets to call the tool."* (PRD §6) *"Artifact scan = mtime ≥ run start, matched to `produces`"* (`03` §6). See [[Task Artifacts]].

**The race.** *"an answer that arrives while the process is still exiting must not be lost — completion re-checks "answers arrived after last poll" and resumes instead of marking the step done."* (`04` §9; backlog 4.2 **BUG**)

As built in run-flow (2026-10-23), nothing retries a run. An agent error, a nonzero exit, a limit hit or a timeout becomes the run's `error`, any outcome the agent reported is dropped, and the engine opens a *run failed* gate, where Retry keeps the attempt (the run-flow plan). Otherwise, on a step whose routes or gate read the verdict, the outcome is the agent's `set_outcome` verdict, else the provider's own, else none; any other step is not offered `set_outcome` and keeps no outcome (Claude's call, 2026-10-23, open to Alex's review). There is no scan and no `declare_artifact`: each `produces` path, `<folder>/.flowboard/<run folder name>/<type>.md`, counts only if this run wrote it, and an output it did not write sends the step to a gate, `did not write: <types>`. When the run ends, its broker withdraws any question still open.

## Memory around launch

*"the runner brackets `launch()` with the MemoryStore port when it is enabled. **Before:** `recall(…)` … **After a success:** `write()` the run's salient output, distilled from declared artifacts/answers only"*; *"With the `none` adapter this is a no-op and nothing else changes"* (`03` §6). The memory side is in [[Memory Recall]] and [[Memory Commit]].

## Shell steps

Same pipeline, no provider: *"runs `command` (or the project's `check_command`) through the same `ExecHost`"* (`03` §6). See [[Shell Step Execution]].

As built in run-flow (2026-10-23), shell steps bypass `ExecHost`: the host spawns `sh -c` directly, in its own process group, because `ExecHost` cannot kill a process group. A `ponytail:` comment in `cli/src/flow-exec.ts` marks the way back, and the sandbox work must route checks through `ExecHost` again, with a group kill (the run-flow plan's design review, landmine 3).

## Gaps

- **`args.json` or `spec.json`.** PRD §7 snapshots *"the final args to `data/runs/<id>/args.json`"*; `03` §6's idea is *"snapshot the resolved `RunSpec` to `data/runs/<id>/spec.json`"*; the drawio *Run records* card: *"data/runs/<id>/spec.json + raw stream, replayable at $0"* ([[Execution Open Questions]] #38). As built in run-flow (2026-10-23), neither: the run's log holds the launched `RunSpec` (a shell run's, its command) and the raw events, and `flow.json` pins the flow.
- **Where answers live on resume.** PRD §9 puts them in the resume prompt; which prompt part is not stated.
- **Order of commit and advancement.** Memory `write()` and §8 advancement both follow a success; their order is not stated ([[Memory Open Questions]] #15).

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Prompt Assembly]]
- [[Run Guardrails At Launch]]
- [[Life Of One Step]]
- [[Event Stream And SSE]]
