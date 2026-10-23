---
tags: [flowboard, task-detail, decisions]
module: Task Detail
---

# Task Detail Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Anything another note labels a **proposal** is listed here too.

## The screen

### 1. Sheet or page?

PRD §13, backlog Story 2.3 and the design brief (*"### 3. Task detail (a sheet, opened from a card)"*) describe a **sheet** over the board. The drawio *Harness architecture* page has a route, `Task detail /t/[id]`. The mockup is a full page with a `‹ Board` back link. A page has a shareable URL and room for four tabs. A sheet keeps the board in view. See [[Task Detail API And Routes]].

### 2. Plan vs built: against the summary, or against the working tree?

PRD §13, §16, backlog Story 2.3, the brief, and the drawio cards (*"plan.md vs summary.md diff"*) compare **two documents**, `plan.md` and `summary.md`. The mockup compares `plan.md`'s items with **the working tree**, and says outright *"the agent's own account of what it did is not the evidence"*. A summary is the agent's own account. The PRD version only works after Summarize. The mockup's version works at the review gate, where the decision is made. The guide's walkthrough names the other side differently again: *"**plan.md** and **changes.patch** are both real files"*, though `changes.patch` is itself written by the Build agent. See [[Plan Versus Built]].

### 3. Who produces the verdicts? (proposal)

No source says how *as planned / deviated / not built / unplanned* are computed. The guide calls it mechanical, but judging whether *"the acceptance criterion is met"* is not mechanical. **Proposal** (in [[Plan Versus Built]]): the Plan step writes numbered items with criteria; the Review step writes a structured per-item verdict as a new artifact type (e.g. `plan_check`); FlowBoard derives files and the unplanned set from the branch diff. Needs: a `plan.md` format contract, a new artifact type, and a change to the seeded `/code-review` skill.

### 4. Branches on the spine

The spine is one row. Build and Tests run in parallel in the monitor mockup and in the PRD seed (`implement ∥ tests`). No source says how task detail shows a fan-out or join, or how it handles two open gates at once (the mockup's `gateStep()` takes the first). See [[Task Detail Marks]].

### 5. Missing pills and states

The pill has *running*, *waiting on you*, *done* and a code-only *in progress*. There is no pill or design for **failed**, **cancelled**, **blocked** by infra failure, **backlog**, **todo**, a **paused** task, an **escalation gate** (spent or stuck loop, with Retry / Fail task), or a **no-outcome gate**. No loading, error, not-found or cleaned-up state either. See [[Task Detail Screen]].

### 6. Story rows: per step or per run?

The guide says the Story tab shows *"every run"*. The mockup shows one row per step, with earlier attempts reduced to a red band. Does each run get its own row, log and link to `/runs/[id]`? No source gives task detail a link to the live viewer. See [[Step Instances And Runs]].

### 7. Task-level acceptance criteria and non-goals are not shown

The feature map says every step sees them and *"the review checks against them"*, but the screen shows only per-plan-item criteria. Where do the task's own `acceptance_criteria` and `non_goals` appear? See [[Task Record]].

## Lifecycle and actions

### 8. Pause

The mockup and guide offer **Pause** (*"Stops after the current run rather than mid-flight"*). The PRD has no paused status, no endpoint, and no rule for resuming. The feature map heads a bullet *"Pause, send back, or cancel"* but never describes pausing. See [[Task Actions]].

### 9. Send to backlog from a running task

The guide allows it *"from anywhere"*. The PRD allows only a Backlog ↔ Todo drag (§13); the backlog adds **demote** (todo → backlog, Story 2.1, **NEW**). Open: what happens to a live run (cancel? finish?), to the pinned `flow_id` (*"null while in backlog"*) and `capability_pins`, and on re-promotion (re-pin, or keep?). Same as [[Workspaces Open Questions]] #9 and #10 and [[Intake And Import Open Questions]] #16; see [[Demote And Re-Promote]].

### 10. Promote vs Start, and the missing `todo`

The guide's lifecycle goes backlog → running on *"you promote it"*, with no `todo`. The PRD has `todo` and promote-creates-worktree (§11, §12). Backlog D1 recommends a separate Start (*"promote stays cheap"*), still undecided. The feature map creates the workspace *"when the task starts"* (§14), and starting *"locks in the recipe it will follow"* (§3). The guide labels backlog *"no workspace yet"*. The monitor guide also draws promote as the start: its beat *"You promote it"* queues the first step (*"The first step is now in line"*). The pin splits the same way: at promotion (PRD §5, §12, backlog 2.1) or at start (PRD §4, the architecture README, the drawio *"Tasks pin flow_id at start"* and *Start task* · *"pin flow version"*). It hangs on the same backlog D1 decision as [[Flow Design Open Questions]] #7, which asks when the flow version is pinned. Same as [[Workspaces Open Questions]] #1, [[Intake And Import Open Questions]] #14, [[Execution Open Questions]] #2 and [[Monitor Open Questions]] #24.

### 11. Does the engine auto-fail a task?

The task-detail guide (*"After the limit the engine gives up and fails the task"*), the monitor guide, the flow-designer guide (*Retries*: *"How many attempts before the step gives up and fails the task."*), the drawio D3 card (*"Fail on the 4th"*), PRD §16 (*"three failed attempts fail the task"*) and backlog Story 10.1 (*"Reject → attempt 2; three failures fail the task."*) say yes. PRD §4 (*"hands the task to me with the last error"*), PRD §8, backlog D3 (*"escalate to a gate, never auto-fail"*, decided 2026-10-15), feature map §4 and `02` §3 say no. Backlog D3 is the latest decision. **The guide, monitor guide, flow-designer guide, drawio D3 card, PRD §16 and backlog Story 10.1 need updating.** The drawio also disagrees with itself: its *Loop guard* node already says *"gate: Retry + note / Fail task"*. See [[Task Lifecycle]].

### 12. Was the egress failure an attempt?

The sample counts Build's egress-denied run as attempt 1 (`↺2`, *retries 1*). PRD §7 says a non-zero agent exit is an infra failure, *"never a verdict on the work"*. It is either retried uncounted (transient) or blocks the task (anything else). Which class is an egress denial? Who adds the host to the allowlist mid-task, and how does that reach a task pinned to its flow version? Backlog Story 3.2 blocks the task on any failed run (*"non‑zero or `is_error` → failed, stderr tail in `runs.error`, task blocked"*); the drawio *Infra-retry classifier* blocks it on anything not transient. The inbox mockup treats it as a counted attempt that escalates (*"Attempt 3 of 3 failed — egress denied to api.stripe.com"*, with **Allow host & retry**), which suggests an answer but contradicts PRD §7. The guides answer the allowlist half. Inbox guide: **Allow host & retry** *"adds the blocked host to that step's allowlist, then re-queues the run."* Monitor guide: *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt."* So the retry is counted too. That is a step-definition edit reaching a running task that is pinned to its flow version. No source says whether a denial ends the run at all, or only fails one tool call. Same as [[Execution Open Questions]] #22 and #24, [[Monitor Open Questions]] #11 and [[Sandboxing Open Questions]] #14. See [[Egress Denials]], [[Attempts And Send Back]] and [[Memory Carried Into A Task]].

### 13. When can the workspace be cleaned up?

`done`/`cancelled` (PRD §11), *"finished or cancelled"* (feature map §14, guide), or `done`/`cancelled`/`failed` (backlog Story 2.1, `05` §11, `workspace.ts`)? The mockup shows the button only when every step is done. Does cleanup delete the branch (guide: *"Removes the branch and the folder"*, and elsewhere *"clean up the workspace when you no longer need the branch"*) or only the worktree (`git worktree remove`, `07`)? Same as [[Workspaces Open Questions]] #11 and #12 and [[Execution Open Questions]] #60. See [[Task Workspace]] and [[Cleaning Up A Workspace]].

### 14. What does task detail show after cleanup?

Artifacts live inside the worktree. After cleanup, `artifacts.path` points at nothing, and plan vs built and the artifact viewer have no files. Keep a copy, read from the branch, or show *"cleaned up"*? Same as [[Workspaces Open Questions]] #14. See [[Task Storage On Disk]].

## Money

### 15. Send back: three different sets of figures

| | kept | wasted | bill |
|---|---|---|---|
| Guide | $1.01 | $1.60 | $2.61 |
| Mockup `sendBack()` | $0.85 | $1.60 | **$2.45** |
| Backlog Story 5.2 rule | $0.85 | $1.76 | $2.61 |

The mockup zeroes Review's $0.16 instead of moving it, so the bill shrinks, against *"It never goes down"*. That is a mockup bug. Where Review's $0.16 belongs is open, because the sources disagree and nothing ranks them. The guide keeps it as **kept**, though Review was *"discarded"*. Backlog Story 5.2 marks *"downstream runs `wasted=1`"*, and Review is downstream of Build, so that rule makes it wasted. The monitor guide counts *"a review you sent back"* as wasted. PRD §8 and `02` §3 say only *"superseded runs"*, which leaves Review's run unclassified. Is the rejected review's spend kept or wasted? Same as [[Cost And Control Open Questions]] #1, [[Monitor Open Questions]] #17 and [[Execution Open Questions]] #17. The monitor mockup has the same class of bug ([[Cost And Control Open Questions]] #19). See [[Attempts And Send Back]].

### 16. Are tests re-run after a send back?

Guide and monitor guide: no, *"that result still stands"*. But the tests ran against the build that was sent back. In the PRD seed a `check` step joins both branches and would re-run. Is skipping a re-test what the engine does, or a mockup simplification?

### 17. Does a waiting question really stop billing?

*"paused, billing stopped"* and *"$0/min"* hold once a run is **parked** (after 20 minutes, PRD §9). Before that, the CLI process is alive with a blocked tool call. Billing for that is a provider question no source checks. Same as [[Cost And Control Open Questions]] #9. See [[Task Cost And Wasted Spend]].

### 18. What is the recipe average?

*"$2.14 across 182 tasks on v4"*: bill or kept? PRD §13 (*"cost per completed task"*) and feature map §18 (*"Cost per finished task"*) count finished tasks only, but do failed or cancelled tasks count? The guide's *"Roughly on par with the recipe's average, plus a toll the sandbox charged once"* reads as kept. And the count: the flow-designer library shows the same flow at `~$2.14/task` over `182 runs`, where the Cost tab says *"182 tasks"*. Same as [[Cost And Control Open Questions]] #10 and #22. See [[Task Cost And Wasted Spend]].

### 19. What counts as agent time?

The mockup sums one duration per step (the kept run). Do wasted runs count? Do infra retries? The guide defines it as *"The sum of run durations"*.

## Data and storage

### 20. Three worktree schemes, three artifact layouts

| Source | Worktree | Branch | Artifacts |
|---|---|---|---|
| PRD, backlog, `07` | `<repo>/.vibe-worktrees/task-<id>` | `vibe/task-<id>` | `.vibe/task-<id>/NN-<type>.md` |
| Drawio *Harness* | `<repo>/.flowboard/worktrees/task-<id>` | `fb/task-<id>` | `.vibe/task-<id>/*.md \| *.json` |
| Mockup | `~/.flowboard/ws/auth-refactor` | `flowboard/auth-refactor` | `.flowboard/auth-refactor/brief.md` |

Also `07`'s disk adapter: scan expects `NN-<type>.<ext>` but `resolve` returns `${type}.md`. And the mockup's `changes.patch` matches no artifact type. Same as [[Workspaces Open Questions]] #6, [[Intake And Import Open Questions]] #15, [[Execution Open Questions]] #3 and [[Monitor Open Questions]] #26. See [[Task Workspace]], [[Workspace Naming]] and [[Task Artifacts]].

### 21. Who commits, and when?

The mockup and guide say files are *"committed on its own branch"*. The drawio says *"committed alongside the code"*. The agent may not push or check out the base branch, and *"the host does all git work"*. No source names the commit step. Same as [[Workspaces Open Questions]] #20; see [[Git Inside A Workspace]].

### 22. Fields the screen shows that the schema lacks (proposal)

`owner` (blocked by *"no user table"*, PRD §2), `started_at`, a gate-opened timestamp for *waiting on you*, and a paused status. **Proposal** in [[Task Data Model]]: derive `started` from the first run, use `step_instances.updated_at` for the gate timer, and leave owner as the single local operator until identities exist.

### 23. The port definitions disagree

`ArtifactStore.scan` takes two arguments in `01-ports.md` and three in the reference `.ts`. `05` §11 names a `put` method that no interface has. `Workspace.id` is a closed union without `gvisor` in `01` and `string` in the reference. `destroy`'s options are required in `01` and optional in the reference. See [[Task Detail Runtime]].

### 24. No task read model or task endpoint (proposal)

There is no `GET /api/tasks/:id` in PRD §12 (backlog Story 2.1 adds it, with no shape). There is no task SSE stream in PRD §12; the drawio's *SSE endpoints* node mentions *"task state"*, with no shape. `POST /api/tasks/:id/start` appears only in the backlog intro, as something the first build added. There are no endpoints for demote, pause, fail, cleanup, artifact viewing or the diff. **Proposal** in [[Task Detail API And Routes]], which agrees with [[Workspaces API And Routes]] on the cleanup and demote paths.

## Smaller

### 25. Questions: one or two?

Plan's log says *"asked you 2 questions"*. The row and aside show one. See [[Questions Within A Task]].

### 26. Memory per task or per run?

Recall is per run, but the aside shows one list per task. There is no `agent` scope line. One line (*"Attempt 1 died…"*) was written mid-task, so it was not *carried in*, and memory commits only after a run succeeds (PRD §7, §11.2), so a failed attempt should leave no memory at all. The tag `you` is not a scope name; the PRD calls that scope `user`. Hidden when memory is off? Same as [[Memory Open Questions]] #9 and #13. See [[Memory Carried Into A Task]].

### 27. Capability pins are invisible

The aside shows the pinned flow version and a newer-version notice, but not `capability_pins`, so a task running an older `code-review` commit is not visible. See [[Pinned Flow On A Task]].

### 28. The two mockups disagree on the sample

Monitor guide: bill $1.96, no waste, send back → attempt 2. Task detail: bill $2.61, $0.48 waste, send back → attempt 3. Mockup flow (6 steps) vs PRD seed (9 steps, Capability Library D26). See [[Sample Task Auth Refactor]].

### 29. Gate banner text source

The banner states the reviewer's findings in prose. Is that `set_outcome`'s `reason`, an excerpt of `review.md`, or a new field? See [[Deciding At A Gate]].

### 30. Stop a run from the story row

The guide's pill table says you can *"stop the run from the story row if it is clearly lost"*. The mockup has no such control. The PRD puts Stop on `/runs/[id]` with no listed endpoint. See [[Task Actions]].

### 31. What a deliberate stop becomes

Cancel and Stop end a run with SIGTERM (backlog Story 2.1; `03` §8), and Stop finalises the run as `cancelled` (`03` §8, backlog Story 3.4); `03` §7 does the same for a graceful worker shutdown. The monitor guide records its stop *"as failed, with "stopped by you" as the reason"*, and `monitor.html`'s `stop()` sets `state = 'failed'`. And PRD §7 classes *"process killed by a signal"* as **transient**, retried automatically up to 3 times. Unless the runner records that the kill was intentional before the process exits, a cancelled task's run comes back by itself. What a stopped run costs is [[Cost And Control Open Questions]] #20. See [[Task Actions]].

As built (2026-10-18), only a stop through the port marks itself: `AgentRun.stop()` settles the run as `{ exitCode: 130, error: 'stopped' }` and keeps the usage so far. A SIGTERM by pid from outside fails the run with exit 1, like a crash. Whether 130 counts as transient is [[Agent Providers Open Questions]] #22.

### 32. The mockup's reason box can't be edited

A 1 s timer redraws the gate banner while a gate is open, and the reason box with it. Typed text and focus are lost within a second, so a send back nearly always sends the prefilled reason, and `Esc` only works after a redraw takes focus away. A mockup bug, but it hides whether the design wants the reason prefilled at all. See [[Task Detail Controls]].

### 33. Decision numbers collide across documents

The backlog decisions (D1–D9: D1 Start, D3 attempt cap, D5 hook isolation), the drawio decision cards (D1–D6 on the same topics, though drawio D3 *"Fail on the 4th"* contradicts backlog D3 *"never auto-fail"*, see #11; and D10 memory hosting, which has no backlog row) and [[Capability Library Decisions]] (D1 Claude-only, D3 no bundle packs, D5 skills store, D10 tasks pin capabilities) share one numbering. An unqualified "D3" or "D10" is ambiguous. These notes prefix every id with its source. Renumbering one set, e.g. `CL-D10`, would remove the clash. Same as [[Memory Open Questions]] #27. See [[Task Detail Sources]].

Capability Library D1 (Claude-only) has since been overtaken by the build: OpenCode was built on 2026-10-18 as a second provider, and whether it is in v1 is [[Agent Providers Open Questions]] #38.

### 34. Task status at an ordinary approval gate

The PRD sets the task `blocked` for a spent or stuck loop (§8), a non-transient infra failure (§7), and backlog Story 4.2 adds a parked question. It never says what a plain approval gate or a no-outcome gate does to `tasks.status`. The mockup's status bar reads *"blocked on you"* at Review's ordinary gate; the pill reads *"waiting on you"*. Is a gated task `running` or `blocked`? Same as [[Execution Open Questions]] #11. See [[Task Lifecycle]].

### 35. What *you retry* means on a failed task

The guide draws *you retry* from **failed** back to **running**. The PRD's **Retry** exists only at an escalation gate, on a step instance (`POST /api/step-instances/:id/retry`), and under backlog D3 the engine never fails a task by itself. Backlog Story 2.3 lists *"Retry"* among the sheet's actions and Story 3.3 fails a dead run *"with a Retry hint"*. Does a failed task reopen, which attempt does the retry use, and does it count? Same as [[Execution Open Questions]] #26. See [[Task Actions]].

### 36. Do downstream steps keep their attempt count after a send back?

Backlog Story 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."* After a send back the mockup leaves Review at `attempts: 1`. If the count resets on every loop, Review's row never shows `↺`, however often its gate re-opens, and the header's **retries** under-counts the struggle. See [[Attempts And Send Back]].

## Related

- [[Task Detail Index]]
- [[Task Detail Roadmap]]
- [[Task Detail Sources]]
- [[Flow Design Open Questions]]
