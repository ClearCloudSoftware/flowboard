---
tags: [flowboard, monitor, glossary]
module: Monitor
---

# Monitor Glossary

| Term | Meaning |
|---|---|
| **Monitor** | The screen `flowboard/monitor`: needs-you band, worker strip, and three views over the live tasks. The mockups' name for what the PRD calls **the board**. |
| **Board** | PRD §13 `/p/[slug]`: a Kanban read model whose columns are Backlog, Todo, one column per flow step, and Done. See [[Board Projection]]. |
| **Projection / read model** | A view derived from the task and step-instance rows, never written to. *"Board = projection of `step_instances` → CQRS; read model derived from write model."* (architecture README) |
| **Column** | One board column per step definition, ordered by `board_order`. On the monitor the columns survive only as the cells of the [[Flow Bar And Step States\|flow bar]]. |
| **Card** | A task on the PRD board. The monitor calls it a **row**. |
| **Row** | One task in the [[Pulse View]]: icon, id and title, flow bar, where, timing, cost. |
| **Flow bar** | The row's strip of cells, one per column of the flow. A split column holds one half-height cell per parallel step. |
| **Cell** | One step's state on the flow bar. See [[Flow Bar And Step States]]. |
| **Task status** | The row icon: *Failed*, *Waiting on you* (gate or question), *Running*, *Idle*, *Done*. See [[Task Status Icons]]. |
| **Step state** | A cell's state: `pending`, `queued`, `running`, `waiting on you` (gate or asking), `failed`, `done`. |
| **Needs you** | The band of things blocked on a human, oldest first. See [[Needs You Band]]. |
| **Gate** | A step that finished and is waiting for your approval (`awaiting_approval` in the PRD). Shown with pause bars. See [[Approval Gates]]. |
| **Asking** | A run paused mid-job because it asked you a question (`awaiting_answers`). |
| **Escalated** | A needs-you item that waited past the escalation threshold and was also posted to chat. The mockup threshold is 10 minutes. The PRD's is 5. |
| **Split badge / ⑂2** | The mark that a task is running two parallel branches. PRD: *"a split badge listing the active branches"*; mockup: `⑂2` after the task id. |
| **Fan out / join / loop back / advance** | The four [[Hand-Off Rules]] that move work between steps. |
| **Send back** | Rejecting a gate with a reason. The earlier step re-queues as its next attempt. PRD: **Reject**. |
| **Allow host & retry** | On a failure: add the blocked host to the step's egress allowlist, then re-queue. |
| **Retry as-is** | On a failure: re-queue the run unchanged. |
| **Stop** | End a running run now. See [[Failures And Retries]]. |
| **Worker / slot** | One concurrent agent run. The cap is `CAP = 4` in the mockup and `VIBE_MAX_RUNS` in the drawio and backlog. See [[Worker Slots]]. |
| **Queue** | Runs that are ready, with no free slot. |
| **Burn** | The per-hour rate of everything running now. See [[Burn Today And Wasted]]. |
| **Today** | *"The real bill: work you kept, plus attempts that were thrown away."* |
| **Wasted** | *"Only the thrown-away part"*. PRD: `runs.wasted = 1`. |
| **Pulse / Timeline / Pipeline** | The three views. See [[Pulse View]], [[Timeline View]], [[Pipeline View]]. |
| **Live run viewer** | PRD §13 `/runs/[id]`: one run's event stream with a sticky footer and Stop. See [[Live Run Viewer]]. |
| **NormalizedEvent** | One of seven provider-neutral event kinds the viewer reads. See [[Event Stream And SSE]]. |
| **`run_events`** | The table the runner writes events to and the SSE endpoint tails by `seq`. |
| **`seq`** | The per-run event sequence number; the `Last-Event-ID` for catch-up. |
| **Summary** | *"short human-readable line for the session viewer"* (`run_events.summary`), e.g. `Read src/auth/session.ts`. |
| **Sticky footer** | The viewer's pinned bar: elapsed time, turn count, running cost, Stop. |

> [!warning] Overloaded words
> - **"Waiting"** — on the monitor, *waiting on you* means a gate or a question. A task waiting for a worker is **queued**, and its row icon is **Idle**. The monitor guide says *"queued is not the same as pending"*.
> - **"Blocked"** — the PRD's `tasks.status = 'blocked'` covers a parked question, a spent or stuck loop, and a non-transient infra failure (§7, §8). The monitor's **blocked** filter shows only *Waiting on you* (gate and question) and leaves failures out. The guide's *Status* table also calls a failure *"parked"*.
> - **"Failed"** — on the monitor a failed run is recoverable: you retry it, and the task carries on. In the PRD, `failed` on a task is terminal, and an exhausted loop escalates to a gate instead (decision D3). See [[Monitor Open Questions]] #11 and #12.
> - **"Retry"** — the monitor's **Retry as-is** re-queues a failed run. The PRD's gate **Retry** *"grants one more attempt"* after escalation. *Infra retries* are automatic re-runs that *"do not count toward `max_attempts`"*. The pipeline label *"sent back ×N today"* counts every extra attempt, failures included.
> - **"Stop" / "cancel"** — **Stop** ends one run. **Cancel** ends the whole task: *"stops any running agents and tidies up"* (feature map §3). The PRD finalises a stopped run as `cancelled`; the monitor mockup records it as `failed`.
> - **"Pause"** — the inbox and the mockup use *paused* for an asking run. Task detail's **Pause** *"stops after the current run rather than mid-flight"*. Neither the PRD nor the backlog has a paused status.
> - **"Timeline"** — the monitor's [[Timeline View]] is a Gantt of every task's runs. The task detail screen's *step timeline* lists one task's steps.
> - **"Board"** — the PRD board (Kanban) and the monitor (pulse list) are two designs of one component. The task-detail mockup's back button still says **Board**.

## Related

- [[Monitor Index]]
- [[Monitor Overview]]
- [[Flow Design Glossary]]
