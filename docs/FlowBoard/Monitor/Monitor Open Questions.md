---
tags: [flowboard, monitor, decisions]
module: Monitor
---

# Monitor Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Anything another note labels a **proposal** is listed here too. Questions already tracked in [[Flow Design Open Questions]] are linked rather than repeated.

## What the monitor is

### 1. Does the monitor replace the board?

PRD §13 specifies `/p/[slug]` as a Kanban board: *"Columns come from the project's active flow ordered by `board_order`, prefixed by fixed `Backlog` and `Todo` columns and suffixed by `Done`."* Feature map §5, backlog Story 2.2, the old design handoff (1b, 1c) and the drawio *Board* cards all design columns. The monitor mockup has no columns: one row per task with the flow as a bar. It has no route (brand `flowboard/monitor`). Is the monitor the v1 board, a second screen beside it, or the home page? See [[Board Projection]].

### 2. One project or every project?

The board is per project (`/p/[slug]`, `GET /api/projects/:id/board`). The monitor shows tasks from six repos (`flowboard/api`, `core`, `docs`, `providers`, `runner`, `web`) on one screen, as the inbox does (*"Every pending question across all projects"*, PRD §10). Is a repo a project here? Can the monitor be narrowed to one project?

### 3. One flow version per screen?

The topbar shows one flow and `v4`. The flow bar, the pipeline graph (hard-coded node positions) and the hand-off rules all assume every task runs the same graph. Tasks pinned to different versions, or projects with different flows, are not designed. [[Version Pinning]] notes the same. How do rows with different flows render, and what does the pipeline show?

### 4. How does the monitor reach the live run viewer and task detail?

The tracker puts the [[Live Run Viewer]] in the Monitor component, but it has no mockup. The monitor's *Open the log* and *Read review.md* open the inline [[Task Row Detail]]. Nothing links to `/runs/[id]` or the task-detail screen. PRD §10 gives each inbox question *"a link to the live session"*. **Proposal:** the row detail's log header links to `/runs/[id]`, and the task id links to task detail. The mapping of the row's log prefixes (`›`, `✓`, `◆`, `⋯`) to `NormalizedEvent` kinds is also inferred.

### 5. Batches and other question shapes in the band

The band renders a question as option buttons keyed `1`–`9`. The inbox handles batches and five shapes (yes/no, pick-one, pick-many, number, text). The same task, `csv-export`, is a single three-option question on the monitor and a five-question batch in the inbox mockup. What does the band show for a batch, a text or a number question: a link to the inbox, or a reduced card?

## Ordering and state

### 6. Oldest first or newest first?

The monitor band and the inbox mockup are oldest first (*"the same rule the monitor's band uses"*). PRD §10 orders the inbox *"newest-blocking-first"*.

### 7. How do PRD states map to the monitor's marks?

Monitor step states: `pending | queued | running | asking | gate | failed | done`. PRD `step_instances.state`: `pending | running | awaiting_answers | awaiting_approval | done | failed | skipped`; `runs.state`: `starting | running | parked | succeeded | failed | cancelled`; `tasks.status`: `backlog | todo | running | blocked | done | failed | cancelled`. There is no PRD `queued` step state, and the monitor has no mark for `skipped`, `todo` or `cancelled`. PRD `blocked` covers both a failed run and an escalation gate. **Proposal** mapping in [[Monitor Data Model]].

### 8. Does an asking run free its worker at once?

The monitor guide: asking is *"paused, billing stops"*, and the run *"let go of its worker"*. PRD §9: the broker *"holds the shim's call open"* for 20 minutes, then the run parks. For those 20 minutes the process is alive and holds one of the `VIBE_MAX_RUNS` slots. Billing is likely idle (no tokens while blocked), but the slot is not free. Either the monitor counts a blocked process as a busy slot, or the PRD parks sooner. See [[Waiting And Escalation]].

### 9. Escalate after 10 minutes or 5?

10 in the monitor (`monitor.html:731`) and the inbox mockup (`ESCALATE = 10 * MIN`). 5 in PRD §10 and §16, both drawio pages, and the old handoff (*"default 5 minutes"*). The value is a setting either way (feature map §19, backlog 8.3). Which is the default?

### 10. Do gates and failures escalate?

The monitor tags any waiting item as `ESCALATED`, including gates and failures. PRD §10 only escalates questions (`escalate_question`). The drawio harness concept *Human escalation* says *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* Owned jointly with the Escalation And Notifications component.

## Failures and actions

### 11. Is an egress denial an attempt?

The monitor shows *"Attempt 3 of 3 failed — egress denied"*. PRD §7: a non-zero agent exit is *"an **infrastructure failure**, never a verdict on the work"*; it does not count toward `max_attempts`, and a non-transient one puts the task in `blocked` with no automatic retry. Attempts only grow through rework loops (§8). What does the failure card say for an infra failure, and what does *of 3* count?

### 12. Retry with a note, and Fail task

PRD §8's escalation gate offers **Retry** (*"carries my note into it … does not reset the counter"*) and **Fail task**. The monitor's failure card has *Allow host & retry*, *Retry as-is* and *Open the log*: no note and no way to fail the task. The guide's alternative is to *"leave it and let the spend stop there"*. The *"Retries are capped, then the task fails"* conflict is [[Flow Design Open Questions]] #11.

### 13. What does Allow host & retry write?

It *"Adds the blocked host to this step's egress allowlist"*. In the mockup it only sets `t.allowed = true`. Which allowlist (global `sandbox_profile`, a per-step override, the flow version) and through which endpoint? The flow-version side is [[Flow Design Open Questions]] #14.

### 14. Is a stopped run failed or cancelled, and is it wasted?

The monitor records a stop as **failed** (*"stopped by you"*) and moves its spend to wasted. Backlog 3.4: *"finalise as cancelled"*; Story 3.3: *"mark runs `cancelled`, not `failed`"*. PRD `runs.wasted` is set only for runs *"superseded by a rework loop or an infra retry"*. What state does the step and task take after a stop? In the mockup the task shows as failed and appears in Needs you.

## Money

### 15. Where do burn and live cost come from?

The mockup prices runs by the minute per model (`RATE`). The real cost comes from tokens while streaming and from the result event at the end (PRD §7, `06` §12). No source defines **burn**. **Proposal:** Σ over running runs of (cost added in the last *N* minutes) × 60 / *N*.

### 16. What is "today"?

Local midnight or a rolling 24 h? All projects, or the filtered one? Does it include runs that started yesterday? The mockup sums every seeded task, including those finished hours ago. **Proposal:** runs whose cost accrued since local midnight, across every project the monitor shows.

### 17. What counts as wasted?

| Source | Wasted |
|---|---|
| PRD §5 | Runs *"superseded by a rework loop or an infra retry"* |
| PRD §13, drawio | *"money burnt by rework loops"* |
| Feature map §4 | Infra hiccups *"still show up in wasted spend"* |
| Monitor guide | *"a failed build, a run you stopped, a review you sent back"* |

The mockup's `reject()` adds the build's cost to wasted but **deletes the review run**, so the review's own cost disappears from *today*. It's the same kind of bug the README describes (*"sending a step back made the topbar's **today** total shrink"*). Is the rejected review's spend wasted, kept or dropped? Are stopped and failed runs wasted?

### 18. Is "under a tenth" a rule?

The guide: *"A healthy board keeps it under roughly a tenth of the bill."* Guidance only, or a threshold that colours the number or alerts?

### 19. Progress on a running step

The PRD board card and the old handoff have a progress hairline (*"turns vs. that step's median"*); backlog 2.2 has a BUG that it is always 0 %. The monitor has only a sweep animation and the elapsed time. Does the monitor show progress?

## Workers and views

### 20. The worker cap

The mockup uses `CAP = 4`. The real cap is `VIBE_MAX_RUNS`, an environment variable with no stated default. The guide says *"raise the worker cap"*, but nothing says where: env, settings, or the monitor. Do shell check runs take a slot?

### 21. Do Timeline and Pipeline ship in v1?

Neither is in the PRD, the backlog or the feature map. The PRD's timeline is per task, in the detail sheet.

### 22. When did a gate start waiting?

The timeline and the band's *waited* need the moment a step entered `awaiting_approval`. The PRD stores `questions.created_at` for questions but has no column for gates. **Proposal:** `step_instances.updated_at`, or a new `awaiting_since` column.

### 23. Pipeline counters

*"sent back ×N today"* sums `attempts − 1` over every run, so failed retries count as sends back, and there is no date filter. *"finished today"* counts every finished task. Should these be the review → build loop only, and today only?

### 24. Where are promote and Start?

The guide's walkthrough begins with *"You promote it"*, and says the backlog *"is the only place on the board you can drag a card into"*. The monitor has no backlog column, no drag and no promote or Start control. Decision **D1** recommends *"Explicit Start button on card + sheet"*. Where do these live if the monitor replaces the board?

### 25. Sandbox posture in the status bar

The status bar says *"sandbox container, egress default-deny"* for everything. PRD §11.1 makes the tier *"overridable per step"*. What does it show when steps differ, and is draft mode shown?

### 26. Artifact paths

Monitor: `.flowboard/<task-id>/brief.md` (row detail) and `.flowboard/artifacts/brief.md` (sample log). PRD §6: `<worktree>/.vibe/task-<id>/01-research_brief.md`. Drawio: `.vibe/task-<id>/*.md | *.json` in `<repo>/.flowboard/worktrees/task-<id>`. Task-detail mockup: `~/.flowboard/ws/auth-refactor`. Filenames versus type keys is [[Flow Design Open Questions]] #24.

### 27. Light or dark

The monitor is light only. PRD §13 says *"Dark-first"*. Tracked as [[Flow Design Open Questions]] #34.

### 28. The monitor's flow and seed

The monitor draws the six-step flow without a check step or the `explain` gate. Decision **D26** makes the seed the PRD's nine steps. A nine-step flow bar with two gates and a check step, and a nine-node pipeline, are not designed. Between mockups, `pdf-import` is a queued research run on the monitor but a plan question waiting on *dana* in the inbox; `csv-export` differs too (#5).

### 29. Owners on the monitor

The inbox mockup has a `who` per item (*dana*). The monitor has no owner. Feature map §5 idea: *"waiting on Alice" vs "waiting on you"*. Out of v1 under PRD §17 (no user accounts), but the band's *Needs you* assumes every item is yours.

## Plumbing

### 30. How does the monitor stay live?

PRD: SSE for runs and the inbox. Backlog 2.2: a polling hook. `02` §4: a materialized view refreshed on job completion. Drawio: SSE endpoints for *"questions and task state"*. Old handoff: *"One websocket for run events"*. No source picks a transport for the board-wide view. **Proposal** in [[Monitor API And Routes]]: one SSE stream with a snapshot then deltas.

### 31. Loading, error and lost-connection states

The monitor mockup has empty states only. The old handoff designed inbox loading and *"Lost the orchestrator"* states (stale data kept at `opacity .45`, controls disabled). Backlog 3.4 asks for *"Loading, 404 and stream‑lost states"* in the viewer, and 9.4 for *"`aria-live` on the lost‑connection banner"*.

### 32. Live viewer details not designed

There is no mockup for `/runs/[id]`. Open: how thinking is shown (brief: *"Distinguish thinking from output from tool activity without four different colours"*), auto-scroll opt-out (backlog 3.4), what `system` and `result` events look like, and whether the viewer offers approve or answer when its run is waiting.

### 33. Gate card wording

The band's gate card always reads *"Review passed. Approve the change so the task can move to summarize?"*. PRD §8 parks a step at `awaiting_approval` for three reasons: approval mode, *"no outcome reported"*, and a spent or stuck loop (showing *"the failing step's last artifact"*). Each needs its own wording and actions.

### 34. Monitor endpoints

No source defines endpoints for the monitor's snapshot, live stream, stop, or retry with a note or host. **Proposal** in [[Monitor API And Routes]].

## Related

- [[Monitor Index]]
- [[Monitor Sources]]
- [[Flow Design Open Questions]]
