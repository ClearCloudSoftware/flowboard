---
tags: [flowboard, monitor, decisions]
module: Monitor
---

# Monitor Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Anything another note labels a **proposal** is listed here too. Questions already tracked in [[Flow Design Open Questions]] are linked rather than repeated.

## What the monitor is

### 1. Does the monitor replace the board?

PRD §13 specifies `/p/[slug]` as a Kanban board: *"Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`."* Feature map §5, backlog Story 2.2, the old design handoff (1b, 1c) and the drawio *Board* cards all design columns. The monitor mockup has no columns: one row per task with the flow as a bar. It has no route (brand `flowboard/monitor`). Is the monitor the v1 board, a second screen beside it, or the home page? See [[Board Projection]]. The home-page side is [[Projects Open Questions]] #13.

### 2. One project or every project?

The board is per project (`/p/[slug]`, `GET /api/projects/:id/board`). The monitor shows tasks from six repos (`flowboard/api`, `core`, `docs`, `providers`, `runner`, `web`) on one screen, as the inbox does (*"Every pending question across all projects"*, PRD §10). Is a repo a project here? Can the monitor be narrowed to one project? The mockup never mentions a project: each task carries only an `owner/name` repo label, shown in the row detail header, with no filter on it. The PRD gives a project one local `repo_path` (PRD §5). Same as [[Projects Open Questions]] #1 (one repo or several per project) and #2 (what identifies a repo). Related to [[Flow Design Open Questions]] #1 (per project or one shared library), which cites the same six repos.

### 3. One flow version per screen?

The topbar shows one flow and `v4`. The flow bar, the pipeline graph (hard-coded node positions) and the hand-off rules all assume every task runs the same graph. Tasks pinned to different versions, or projects with different flows, are not designed. [[Version Pinning]] notes the same. How do rows with different flows render, and what does the pipeline show?

### 4. How does the monitor reach the live run viewer and task detail?

The tracker puts the [[Live Run Viewer]] in the Monitor component, but it has no mockup. The monitor's *Open the log* and *Read review.md* open the inline [[Task Row Detail]]. Nothing links to `/runs/[id]` or the task-detail screen. PRD §10 gives each inbox question *"a link to the live session"*. **Proposal:** the row detail's log header links to `/runs/[id]`, and the task id links to task detail. The mapping of the row's log prefixes (`›`, `✓`, `◆`, `⋯`) to `NormalizedEvent` kinds is also inferred.

### 5. Batches and other question shapes in the band

The band renders a question as option buttons keyed `1`–`9`. The inbox handles batches and five shapes (yes/no, pick-one, pick-many, number, text). The same task, `csv-export`, is a single three-option question on the monitor and a five-question batch in the inbox mockup. What does the band show for a batch, a text or a number question: a link to the inbox, or a reduced card?

## Ordering and state

### 6. Oldest first or newest first?

The monitor band and the inbox mockup are oldest first (*"the same rule the monitor's band uses"*). PRD §10 orders the inbox *"newest-blocking-first"*; feature map §12 says *"Everything waiting, most-urgent first"*. *Newest-blocking-first* can also be read as "blocking longest first", which would agree with the mockups. Same as [[Human In The Loop Open Questions]] #2.

### 7. How do PRD states map to the monitor's marks?

Monitor step states: `pending | queued | running | asking | gate | failed | done`. PRD `step_instances.state`: `pending | running | awaiting_answers | awaiting_approval | done | failed | skipped`; `runs.state`: `starting | running | parked | succeeded | failed | cancelled`; `tasks.status`: `backlog | todo | running | blocked | done | failed | cancelled`. There is no PRD `queued` step state, and the monitor has no mark for `skipped`, `todo` or `cancelled`. PRD `blocked` covers both a failed run and an escalation gate. **Proposal** mapping in [[Monitor Data Model]]. The missing `queued` state is also [[Execution Open Questions]] #13.

### 8. Does an asking run free its worker at once?

The monitor guide: asking is *"paused, billing stops"*, and the run *"let go of its worker"*. The inbox guide agrees: *"When an agent asks, it saves its place and lets go of its worker."* PRD §9: the broker *"holds the shim's call open"* for 20 minutes, then the run parks. For those 20 minutes the process is alive, and nothing in the PRD releases its `VIBE_MAX_RUNS` slot. Billing is likely idle (no tokens while blocked), but the slot is not obviously free. Either the monitor counts a blocked process as a busy slot, or the PRD parks sooner. See [[Waiting And Escalation]]. Same as [[Human In The Loop Open Questions]] #5, [[Escalation And Notifications Open Questions]] #21, [[Cost And Control Open Questions]] #9 and [[Task Detail Open Questions]] #17.

### 9. Escalate after 10 minutes or 5?

10 in the monitor (`monitor.html:731`), the inbox mockup (`ESCALATE = 10 * MIN`, *"escalation after 10m"*), the inbox guide (*"Ten minutes without an answer"*) and the mockups README (*"one card crosses the ten-minute threshold"*). 5 in PRD §10 and §16, every drawio page, backlog 6.1 (`escalation_threshold_ms`, *"default 5 min"*) and the old handoff (*"default 5 minutes"*). Whether it is a setting at all is also disputed. PRD §10 fixes it (*"`run_after = now + 5 minutes`"*), M6 asks for a *"5-minute timer"*, and PRD §13's settings list (draft mode, sandbox, memory) has no threshold. It is a setting in `04` §10 (`settings.escalation_threshold_ms`, *"default 5 min"*), `06` §15 (*"escalation threshold (minutes)"*), backlog 6.1 and 8.3, feature map §19 (**Nudge timing**) and the old handoff (*"Escalation threshold is a setting (default 5 minutes)"*). Is it a setting, and which is the default? Same as [[Escalation And Notifications Open Questions]] #1 (full source list), [[Human In The Loop Open Questions]] #18 and [[Execution Open Questions]] #59. See [[Escalation Threshold]].

### 10. Do gates and failures escalate?

The monitor tags any waiting item as `ESCALATED`, including gates and failures. PRD §10 only escalates questions (`escalate_question`). The drawio harness concept *Human escalation* says *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* Owned jointly with the [[Escalation And Notifications Index|Escalation And Notifications]] component: same as [[Escalation And Notifications Open Questions]] #3 and [[Human In The Loop Open Questions]] #19.

## Failures and actions

### 11. Is an egress denial an attempt?

The monitor shows *"Attempt 3 of 3 failed — egress denied"*. PRD §7: a non-zero agent exit is *"an **infrastructure failure**, never a verdict on the work"*; it does not count toward `max_attempts`, and a non-transient one puts the task in `blocked` with no automatic retry. Attempts only grow through rework loops (§8). What does the failure card say for an infra failure, and what does *of 3* count? In the mockup *of 3* is a fixed string (`monitor.html:750`) and `retry()` has no cap, so one more failed retry would read *Attempt 4 of 3*. Whether a sandbox denial ends the run with a non-zero exit at all, or only fails the tool call, is not stated (inference). Same as [[Execution Open Questions]] #22, [[Sandboxing Open Questions]] #14 and [[Task Detail Open Questions]] #12; see [[Egress Denials]].

### 12. Retry with a note, and Fail task

PRD §8's escalation gate offers **Retry** (*"carries my note into it … does not reset the counter"*) and **Fail task**. The monitor's failure card has *Allow host & retry*, *Retry as-is* and *Open the log*: no note and no way to fail the task. The guide's alternative is to *"leave it and let the spend stop there"*. The *"Retries are capped, then the task fails"* conflict is [[Flow Design Open Questions]] #11. Same as [[Human In The Loop Open Questions]] #24; the missing Fail task endpoint is [[Execution Open Questions]] #47.

### 13. What does Allow host & retry write?

It *"Adds the blocked host to this step's egress allowlist"*. In the mockup it only sets `t.allowed = true`. Which allowlist (global `sandbox_profile`, a per-step override, the flow version) and through which endpoint? The flow-version side is [[Flow Design Open Questions]] #14; [[Capability Tools And Egress]] describes egress as default-deny per step. Same as [[Sandboxing Open Questions]] #11, [[Execution Open Questions]] #24 and [[Human In The Loop Open Questions]] #26.

### 14. Is a stopped run failed or cancelled, and is it wasted?

The monitor records a stop as **failed** (*"stopped by you"*) and moves its spend to wasted. Backlog 3.4: *"finalise as cancelled"*; Story 3.3, on graceful worker shutdown: *"mark runs `cancelled`, not `failed`"*. PRD `runs.wasted` is set only for runs *"superseded by a rework loop or an infra retry"*. What state does the step and task take after a stop? In the mockup the task shows as failed and appears in Needs you, and `stop()` leaves the run's `cost` in place after adding it to `wasted`, so the stopped spend counts twice (#17). Same as [[Execution Open Questions]] #27, [[Task Detail Open Questions]] #31 and [[Cost And Control Open Questions]] #20; see [[Stopping And Cancelling]].

## Money

### 15. Where do burn and live cost come from?

The mockup prices runs by the minute per model (`RATE`). The real cost comes from tokens while streaming and from the result event at the end (PRD §7, `06` §12). No source defines **burn**. **Proposal:** Σ over running runs of (cost added in the last *N* minutes) × 60 / *N*. Carried into [[Cost And Control Open Questions]] #3.

### 16. What is "today"?

Local midnight or a rolling 24 h? All projects, or the filtered one? Does it include runs that started yesterday? The mockup sums every seeded task, including those finished hours ago. **Proposal:** runs whose cost accrued since local midnight, across every project the monitor shows. Same as [[Cost And Control Open Questions]] #4.

### 17. What counts as wasted?

| Source | Wasted |
|---|---|
| PRD §5 | Runs *"superseded by a rework loop or an infra retry"* |
| PRD §13, drawio *Wasted spend* card (ideation) | *"money burnt by rework loops"* |
| Drawio *Cost ledger* card (harness) | *"wasted = rework + infra retries"* |
| Brief §5 | *"money burnt on work later discarded by a review sending the task back"* |
| Feature map §18 | *"money burned on work that got redone or thrown away"* |
| Feature map §4 | Infra hiccups: *"it still shows up in wasted spend"* |
| Monitor guide | *"a failed build, a run you stopped, a review you sent back"* |

The mockup's `reject()` adds the build's cost to wasted but **deletes the review run**, so the review's own cost disappears from *today*. It's the same kind of bug the README describes (*"sending a step back made the topbar's **today** total shrink"*). Is the rejected review's spend wasted, kept or dropped? Are stopped and failed runs wasted? A second mockup bug: `stop()` adds the run's cost to `wasted` without clearing `cost` (`monitor.html:698`), so a stopped run counts twice in *today*, and retrying it adds the same cost to wasted again. Same as [[Cost And Control Open Questions]] #1 and #19; see [[Wasted Spend]].

### 18. Is "under a tenth" a rule?

The guide: *"A healthy board keeps it under roughly a tenth of the bill."* Guidance only, or a threshold that colours the number or alerts? Same as [[Cost And Control Open Questions]] #18.

### 19. Progress on a running step

The old handoff's card has a progress hairline (*"turns vs. that step's median"*), backlog 2.2 asks for it (with a BUG that it is always 0 %), and `02` §4 notes it needs incremental `num_turns`. The PRD card has none. The monitor has only a sweep animation and the elapsed time. Does the monitor show progress?

## Workers and views

### 20. The worker cap

The mockup uses `CAP = 4`. The real cap is `VIBE_MAX_RUNS`; no source says whether it is an environment variable or a setting, or gives a default. The guide says *"raise the worker cap"*, but nothing says where: env, settings, or the monitor. Do shell check runs take a slot? The default is also [[Execution Open Questions]] #36.

### 21. Do Timeline and Pipeline ship in v1?

Neither is in the PRD, the backlog or the feature map. The PRD's timeline is per task, in the detail sheet.

### 22. When did a gate start waiting?

The timeline and the band's *waited* need the moment a step entered `awaiting_approval`. The PRD stores `questions.created_at` for questions but has no column for gates. **Proposal:** `step_instances.updated_at`, or a new `awaiting_since` column.

### 23. Pipeline counters

*"sent back ×N today"* sums `attempts − 1` over every run, so failed retries count as sends back, and there is no date filter. *"finished today"* counts every finished task. Should these be the review → build loop only, and today only?

### 24. Where are promote and Start?

The guide's walkthrough begins with *"You promote it"*, and says the backlog *"is the only place on the board you can drag a card into"*. The monitor has no backlog column, no drag and no promote or Start control. Backlog decision **D1** recommends *"Explicit Start button on card + sheet"* (a default, not decided). The pin-at-promote-or-Start side is [[Flow Design Open Questions]] #7. Where do these live if the monitor replaces the board? Also [[Execution Open Questions]] #1, [[Intake And Import Open Questions]] #14, [[Task Detail Open Questions]] #10 and [[Workspaces Open Questions]] #1.

### 25. Sandbox posture in the status bar

The status bar always says *"sandbox **container**, egress **default-deny**"*: it is a fixed string (`monitor.html:1064`), and so is the row detail's *"container · default-deny egress"* (`monitor.html:867`). PRD §11.1 makes the tier *"overridable per step"*. What does it show when steps differ, and is draft mode shown ([[Cost And Control Open Questions]] #5)? Without Docker PRD §11.1 falls back to the host tier, so *host* is a legitimate status (see #45), and there the egress allowlist does not apply: the egress proxy belongs to the container's security profile (PRD §11.1). Whether the default is a container at all is open too: PRD §11.1 calls sandboxing *"optional"*, the drawio *Tiers* card says *"container (default when autonomous)"*, and the pitch promises *"Zero autonomous runs happen unsandboxed"* ([[Sandboxing Open Questions]] #3). Same as [[Sandboxing Open Questions]] #35 and [[Settings And Plumbing Open Questions]] #8; see [[Sandboxing In The UI]]. Tier values are [[Flow Design Open Questions]] #13.

### 26. Artifact paths

Monitor: `.flowboard/<task-id>/brief.md` (row detail) and `.flowboard/artifacts/brief.md` (sample log). PRD §6: `<worktree>/.vibe/task-<id>/01-research_brief.md`. Drawio: `.vibe/task-<id>/*.md | *.json` in `<repo>/.flowboard/worktrees/task-<id>`. Task-detail mockup: `~/.flowboard/ws/auth-refactor`. Filenames versus type keys is [[Flow Design Open Questions]] #24. The two mockups agree with each other: task detail also writes `.flowboard/auth-refactor/brief.md`. Worktrees conflict too: PRD §11 `<repo>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`; drawio `<repo>/.flowboard/worktrees/task-<id>` on `fb/task-<id>`; task-detail mockup `~/.flowboard/ws/auth-refactor` on `flowboard/auth-refactor`. Same as [[Workspaces Open Questions]] #6, [[Task Detail Open Questions]] #20, [[Execution Open Questions]] #3 and [[Projects Open Questions]] #17; see [[Workspace Naming]].

### 27. Light or dark

The monitor is light only. PRD §13 says *"Dark-first"*. Tracked as [[Flow Design Open Questions]] #34; also [[Settings And Plumbing Open Questions]] #7 and [[Human In The Loop Open Questions]] #34.

### 28. The monitor's flow and seed

> [!check] **Seed resolved — [[Capability Library Decisions|D26]].** The seed is the PRD's nine steps. Same conflict as [[Flow Design Open Questions]] #29. Still open: the monitor's design for it.

The monitor draws the six-step flow without a check step or the `explain` gate. Under D27 a step names an agent, a skill or both, and `check` is a shell step with no model, which breaks the tooltip's `Label · model`, the worker row's model column and the per-model burn rate. A nine-step flow bar with two gates and a check step, and a nine-node pipeline, are not designed. Between mockups, `pdf-import` is a queued research run on the monitor but a plan question waiting on *dana* in the inbox; `csv-export` differs too (#5). Within the monitor, `billing-webhook` has no `tests` run although `plan` fans out to both (an apparent seed slip, inference).

Whether the real seed has any sample tasks is a separate conflict: only the drawio seeds them, while PRD §15 and backlog Story 1.2 seed none and M2 says *"Create tasks manually."* That is [[Intake And Import Open Questions]] #19 (also [[Projects Open Questions]] #19). See [[Monitor Sample Data]].

### 29. Owners on the monitor

The inbox mockup has a `who` per item (*dana*). The monitor has no owner. Feature map §5 idea: *"waiting on Alice" vs "waiting on you"*. Out of v1 under PRD §17 (no user accounts), but the band's *Needs you* assumes every item is yours.

## Plumbing

### 30. How does the monitor stay live?

PRD: SSE for runs and the inbox. Backlog 2.2: a polling hook. `02` §4: a materialized view refreshed on job completion. Drawio: SSE endpoints for *"questions and task state"*. Old handoff: *"One websocket for run events"*. The drawio does pick SSE for the board: life-of-a-step beat G ends *"→ SSE → run viewer and board"*, the front-end card says *"EventSource for live updates"*, and feature map §20 keeps *"the board, the viewer, and the inbox current"*. That conflicts with backlog 2.2's polling, `02` §4's refreshed view and the old handoff's websocket, and no source names an endpoint. **Proposal** in [[Monitor API And Routes]]: one SSE stream with a snapshot then deltas. Same as [[Settings And Plumbing Open Questions]] #16; see [[Live Updates]].

### 31. Loading, error and lost-connection states

The monitor mockup has empty states only. The old handoff designed inbox loading and *"Lost the orchestrator"* states (stale data kept at `opacity .45`, controls disabled). Backlog 3.4 asks for *"Loading, 404 and stream‑lost states"* in the viewer, and 9.4 for *"`aria-live` on the lost‑connection banner"*. The inbox side is [[Human In The Loop Open Questions]] #33.

### 32. Live viewer details not designed

There is no mockup for `/runs/[id]`. Open: how thinking is shown (brief: *"Distinguish thinking from output from tool activity without four different colours"*), auto-scroll opt-out (backlog 3.4), what `system` and `result` events look like, and whether the viewer offers approve or answer when its run is waiting.

### 33. Gate card wording

The band's gate card always reads *"Review passed. Approve the change so the task can move to summarize?"*. PRD §8 parks a step at `awaiting_approval` for three reasons: approval mode, *"no outcome reported"*, and a spent or stuck loop (showing *"the failing step's last artifact"*). Each needs its own wording and actions.

### 34. Monitor endpoints

No source defines endpoints for the monitor's snapshot, live stream, stop, or retry with a note or host. **Proposal** in [[Monitor API And Routes]]. The sibling sets' proposals for the same gaps are collected in [[Execution Open Questions]] #47.

## Added on grounding review

Found when these notes were checked against the sources a second time.

### 35. Does a stopped run get retried automatically?

PRD §7 classes *"process killed by a signal"* as a **transient** failure: *"retry the same attempt automatically, up to 3 times, with backoff of 30 s, 2 min and 8 min"*, marked `wasted = 1`. Backlog 3.4's Stop is *"SIGTERM by pid"*. Nothing marks a run as stopped by the user before the signal, so the runner would re-run what you just stopped. The replay adapter's `stop()` settles with `exitCode: 130, error: 'stopped'`, a non-zero exit, so it is classified the same way. **Proposal:** record the stop on the run first and exclude it from the transient class. Linked to #14. Same as [[Execution Open Questions]] #55 and [[Agent Providers Open Questions]] #22.

### 36. Where does Stop run?

Backlog 3.4 and `03` §8: *"Stop = SIGTERM by pid from the route (same machine)"*. PRD §2: *"Next.js route handlers must never spawn a long-lived child process; they enqueue jobs and the worker picks them up"*. The ports already have a stop: `AgentRun.stop()` (*"SIGTERM the child"*, `agent-provider.ts`) and `ChildHandle.kill()` (`exec-host.ts`). On the container tier the host pid belongs to the docker client, not the agent. Should Stop be a job the worker handles through the port? Who finalises the stopped run is [[Execution Open Questions]] #56.

### 37. Retry as-is for rate limits

The guide offers **Retry as-is** for *"a flaky test, a rate limit, a transient error"*. PRD §7 retries rate limits and transient errors itself and only blocks the task after a 4th failure. Which failures should ever reach the band, and does a manual retry after four automatic ones make sense? Same as [[Execution Open Questions]] #23 and [[Human In The Loop Open Questions]] #25.

### 38. Live cost has no source path

PRD §7: *"Accumulate per-message token usage as you stream so the live view shows a running number before the run ends."* Backlog 3.4: *"estimate from tokens until result lands"*. But `events.ts` carries `Usage` only on `result`; `07-ports-in-practice.md` updates live cost only `if (ev.type === 'result')`; and `06` §12 makes Claude's price table *"a **passthrough**"*, so there are no rates to turn mid-run tokens into dollars. `agent-provider.ts` names the capability (*"partial_stream emits incremental deltas (live token counts) mid-turn"*) but no event carries them. Needed for the row cost, burn and the viewer footer. Same as [[Cost And Control Open Questions]] #2, [[Agent Providers Open Questions]] #9 and [[Execution Open Questions]] #62.

### 39. The event envelope

PRD §7: *"each event carries `v`, starting at 1"*; `01-ports.md`: *"every event also carries `v: 1`"*. The `NormalizedEvent` type in `events.ts` has no `v` (it is only the `run_events.v` column). `summary` exists only on `tool_use`, yet `run_events.summary` is a *"short human-readable line for the session viewer"* on every row. Who writes the summary for the other six kinds? Same as [[Agent Providers Open Questions]] #6 and #8 and [[Execution Open Questions]] #62; see [[Normalized Event Envelope]].

### 40. The stale "deviation" label

PRD §7 now says the SSE endpoint *"tails `run_events` by `seq`"*. Backlog 3.4 still tags this *"PRD (deviation, keep)"*, `03` §8 calls it a *"deviation from PRD's in-memory emitter"*, and `03` §6 (*"tee events to `run_events` + the SSE emitter"*), `agent-provider.ts` (*"tees this to run_events + SSE"*) and `07` (*"→ run_events + SSE"*) still describe an emitter. The architecture docs need to catch up with the PRD. Same as [[Settings And Plumbing Open Questions]] #17.

### 41. Furthest-advanced after a rework

PRD §4: *"A card's column is derived from its furthest-advanced step instance."* Backlog 5.2: on rework *"downstream `done` → `skipped` so they re‑instantiate"*. Does a skipped instance still count as furthest? The old handoff's looped-back card (`Vibe Kanban.dc.html`) is labelled with the step that failed (`Review · attempt 2 of 3`, *"Sent back to Implementation"*) while the work runs upstream. The monitor's *where* column names the running step instead.

### 42. Is waiting free?

The mockups say waiting costs nothing (*"Costs nothing while it waits"*, *"a parked run is not billing you"*). The old handoff's inbox batch says *"Answer all six to unblock the run. Blocked 4m 12s · burning idle."* (`docs/old/design/README.md`). This follows #8: if the asking run holds its process for 20 minutes, "burning idle" may be closer to true. Same as [[Cost And Control Open Questions]] #9 and [[Task Detail Open Questions]] #17.

### 43. One colour for gates and questions?

The old handoff: *"only two of those ever mean "act now" (amber = a question with a clock, accent = an approval decision)"*. The mockups use one ochre for both (*"ochre `#A35A00` wants you"*), and petrol for running.

### 44. The keyboard on first load

*"Number keys act on the top item in Needs you — the oldest one — so you can clear the band without ever choosing what to look at next."* On the seeded screen the oldest item is the `billing-webhook` failure, which has no key. `a`, `r` and `1`–`9` do nothing until it is cleared with the mouse. Should failures get keys, or should each key act on the oldest item of its own kind?

### 45. A step that will not run

Decision **D15**: without Docker, *"a step whose plugins (skill or extras) came from a git URL does not run."* Is that a failure card, a blocked task, or a mark on the queued cell? No source says.

### 46. `Esc` in the reason box

The guide's key list gives `Esc` as *"Close the detail, cancel a reason box"*. In the mockup the reason input takes focus when it opens (`monitor.html:1100`) and the key handler returns early for any input (`monitor.html:1126`), so `Esc` never reaches it. Fix the mockup or the guide.

### 47. Read review.md shows no review

The guide: **Read review.md** *"Jumps to the task's row and opens it, with the review in the artifact list"*. The mockup lists artifacts only for `done` runs (`monitor.html:844`), and a review held at the gate is in state `gate`, so the list has no `review.md`. Should a gated step's artifact be listed?

### 48. Failures counted as waiting on you

The status bar's and the pipeline readout's *waiting on you* use `needsList().length`, which includes failed runs, while the status bar also counts `N failed`. A failed task is counted twice. Should *waiting on you* mean gates and questions only, as the **blocked** filter does?

### 49. Amber when nothing waits

The guide: *"When nothing is blocked … every trace of amber leaves the screen."* The topbar's *wasted* figure is always ochre (`.stat.warn`). Keep it as the one permanent warning, or colour it only above a threshold (#18)? The row's `$X wasted` uses brick instead; the colour of wasted spend across screens is [[Cost And Control Open Questions]] #21.

### 50. Step state for screen readers

The flow bar and the row icons are `aria-hidden`, so a screen reader hears neither the task status nor any step state; hatching only helps sighted users in greyscale. The tabs use `aria-selected` without `role="tab"`. Backlog 9.4 sets an accessibility baseline. What text alternative should the bar carry? The inbox side is [[Human In The Loop Open Questions]] #35.

## Related

- [[Monitor Index]]
- [[Monitor Sources]]
- [[Flow Design Open Questions]]
