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

*"Swapping Claude for Codex means constructing a different `provider` in the composition root and nothing here changes."* (`07`) The sketch is illustrative: it passes no `exec`, `limits` or `toolPolicy`, has no memory bracket, and updates live cost only on the `result` event, which PRD §7's running cost needs earlier ([[Execution Open Questions]] #62).

## Events and cost while it runs

- *"Stream stdout line by line, parse each as JSON, write to `run_events` with an incrementing `seq`"* and *"produce a one-line `summary` for the viewer (e.g. `Read src/auth/session.ts`, `Bash: pnpm test`)"* (PRD §7).
- *"Take the final result event's total cost as authoritative for `runs.cost_usd`. Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* (PRD §7)
- Parsing and normalisation are the adapter's ([[Stream Parsing And Normalization]]).
- Backlog 3.2 (**PRD/BUG**): *"persist `num_turns` per assistant turn so the viewer/board show live numbers."* `02` §4: *"progress hairline needs `runs.num_turns` written **incrementally** (backlog bug: today only on the final event → always 0%)."*

## On exit

*"On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8. On non-zero exit, set `failed` and record stderr in `runs.error`."* (PRD §7) Non-zero → [[Infra Retries]].

Backlog 3.2 (**PRD/BUG**) adds two things: a run also fails on the result event's error flag (*"non‑zero or `is_error` → failed"*), and *"**cancel that step's pending questions** (today they keep escalating)"*. `04` §9: *"On any run failure, **cancel that step's pending questions** so they stop escalating."*

**Artifact scan.** *"After a run completes, the runner scans `<worktree>/.vibe/task-<id>/` for files created or modified during the run and registers any that match the step's declared `produces` types. The agent may also register one explicitly via the `declare_artifact` MCP tool. Do both — scanning catches the case where the agent forgets to call the tool."* (PRD §6) *"Artifact scan = mtime ≥ run start, matched to `produces`"* (`03` §6). See [[Task Artifacts]].

**The race.** *"an answer that arrives while the process is still exiting must not be lost — completion re-checks "answers arrived after last poll" and resumes instead of marking the step done."* (`04` §9; backlog 4.2 **BUG**)

## Memory around launch

*"the runner brackets `launch()` with the MemoryStore port when it is enabled. **Before:** `recall(…)` … **After a success:** `write()` the run's salient output, distilled from declared artifacts/answers only"*; *"With the `none` adapter this is a no-op and nothing else changes"* (`03` §6). The memory side is in [[Memory Recall]] and [[Memory Commit]].

## Shell steps

Same pipeline, no provider: *"runs `command` (or the project's `check_command`) through the same `ExecHost`"* (`03` §6). See [[Shell Step Execution]].

## Gaps

- **`args.json` or `spec.json`.** PRD §7 snapshots *"the final args to `data/runs/<id>/args.json`"*; `03` §6's idea is *"snapshot the resolved `RunSpec` to `data/runs/<id>/spec.json`"*; the drawio *Run records* card: *"data/runs/<id>/spec.json + raw stream, replayable at $0"* ([[Execution Open Questions]] #38).
- **Where answers live on resume.** PRD §9 puts them in the resume prompt; which prompt part is not stated.
- **Order of commit and advancement.** Memory `write()` and §8 advancement both follow a success; their order is not stated ([[Memory Open Questions]] #15).

## Related

- [[Execution Index]]
- [[Agent Launch Contract]]
- [[Prompt Assembly]]
- [[Run Guardrails At Launch]]
- [[Life Of One Step]]
- [[Event Stream And SSE]]
