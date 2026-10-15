---
tags: [flowboard, execution, open-questions]
module: Execution
---

# Execution Open Questions

Every place the sources disagree or leave a gap, plus every proposal these notes make. Numbered for reference.

## Starting

### 1. Auto-start or an explicit Start?
Feature map §3 asks; backlog D1 and the drawio default to *"Explicit Start button on card + sheet; promote stays cheap"*. PRD §12 has no start endpoint; the first build added `POST /api/tasks/:id/start`. No mockup draws Start. → [[Starting A Task]]

### 2. What Start does, and what it pins
No source lists Start's steps. **Proposal:** status `running`, one `pending` instance per entry step, one `start_run` each. The sources also split on when the flow is pinned and the worktree made: at **promotion** (PRD §5 *"pinned on promotion"*, PRD §11–§12, backlog 2.1) or at **start** (PRD §4 *"version-pinned at task start"*, drawio *"Start task / pin flow version"* and *"Tasks pin flow_id at start"*, feature map §3). `capability_pins` is *"set when the task starts"* (PRD §5). Once D1 separates promote from Start, these readings differ. → [[Starting A Task]]

### 3. Worktree path and branch
PRD §11: `.vibe-worktrees/task-<id>` on `vibe/task-<id>`. drawio: `.flowboard/worktrees/task-<id>` on `fb/task-<id>`. → [[Execution Storage]]

## Advancement

### 4. Is `implement` a join?
By PRD §8's definition (*"multiple incoming edges"*) it is: it has `on_fail` edges in from `check` and `review`. The literal rule does not block it, because it waits on upstream *instances*, which do not exist until their edges fire, and rework reuses the `implement` instance. But the wording invites a per-edge reading. PRD §15 names only `check` as *"the join"*. Backlog 5.2 states the intent: *"every non‑`on_fail` upstream instance"*. Adopt that wording. → [[Fan-Out And Join]]

### 5. Approval and questions on one step
PRD §8 checks approval before unanswered questions. A step with both parks for approval while questions are still open.

### 6. What a `manual` step does
PRD §5 allows `kind = 'manual'`. No rule says how the engine runs it, what it waits for, or what sets its outcome.

### 7. Which artifact carries the outcome
When a step produces several JSON files, or calls `set_outcome` and also writes a JSON outcome, which wins is not stated. **Proposal:** `set_outcome` first, then the first produced JSON with an `outcome` key. → [[Run Outcomes]]

### 8. Where `set_outcome`'s reason goes
Backlog 1.1 adds `step_instances.reason` for rejection or failure text. Whether `set_outcome({ reason })` writes it is not stated.

### 9. How "earlier step" is decided
Rework is *"an `on_fail` edge pointing at an earlier step"* (PRD §8). Earlier by topological order, `board_order`, or reachability is not stated.

### 10. Task done
PRD has no done rule; `02` §3 gives *"no active instances **and** no reachable pending targets"*. "Reachable" is not defined. **Proposal** in [[Task Completion]].

### 11. Task status at a plain approval gate
`blocked` is stated for infra failures, spent loops and parked runs. Whether an ordinary approval gate sets `blocked` is not. The task-detail mockup says *"blocked on you"*.

### 12. Instance states after Reject, Fail task and infra failure
The task status is given; the instance state is not. **Proposal** marked `*` in [[Execution State Machines]].

### 13. `queued` is not a state
The monitor and task-detail mockups show a **queued** state, *"ready, no free worker"*. PRD §5 has no such step state. **Inferred:** a `pending` instance with a queued `start_run` job.

## Loops

### 14. Escalate or fail at `max_attempts`?
PRD §8, `02` §3, the drawio *Loop guard* card and backlog D3 (decided 2026-10-15): escalate. PRD §16, backlog 10.1, the drawio D3 card, the flow designer guide, the monitor guide and the task-detail guide: fail. Update the stragglers. → [[Loop Guard And Escalation]]

### 15. The Retries field versus `max_attempts`
The flow designer's *Retries* field defaults to 2 (`flow-designer.html`); PRD §5's `max_attempts` defaults to 3. [[Flow Data Model]] maps Retries as `max_attempts − 1`, a proposal ([[Flow Design Open Questions]] #11). (The drawio's *"Fail on the 4th (default 3)"* agrees with PRD §8 on the count; only fail versus escalate differs, which is #14.)

### 16. After a Retry
Retry *"does not reset the counter"* (PRD §8). **Inferred:** the next failure escalates again at once. Not stated.

### 17. Which runs are wasted on rework
PRD §8 and `02` §3 say *"superseded runs"*; only backlog 5.2 says *"downstream runs `wasted=1`"*. Whether the target's previous run and the failing step's run are wasted is not stated; the mockups waste the target's. → [[Rework Loop]]

### 18. Downstream attempts
Backlog 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."*

### 19. Stripping digits and "fewer failing tests"
PRD §8 strips digits before hashing, then says fewer failing tests change the fingerprint. A count line like `3 failing` → `2 failing` does not change. → [[Stuck Detection And Fingerprints]]

### 20. Where the escalation gate sits
On the rework target, with the failing step's artifact (PRD §8). No mockup draws an escalated-loop gate where the two differ: the inbox's `billing-webhook` failure card is an egress failure on `build` itself. Which step the screens should name is not settled.

### 21. Where the reject reason and Retry note go in the prompt
*"a rejection carries your reason into the next attempt"* (feature map §4); Retry *"carries my note into it"* (PRD §8). The prompt part is not stated. **Proposal:** the preamble. Where the note is stored is not stated either. → [[Prompt Assembly]]

## Failures and stopping

### 22. Is an egress denial an attempt?
Under PRD §7 it is not a work verdict, so it is not an attempt. Whether it is transient is unclear: the list includes *"network error"*. If not transient, it blocks the task. Task-detail and inbox mockups count it as an attempt. Same as [[Monitor Open Questions]] #11. → [[Infra Retries]]

### 23. Retry as-is for transient failures
Monitor guide offers it for *"a rate limit, a transient error"*; PRD §7 retries those automatically. ([[Monitor Open Questions]] #37)

### 24. Allow host & retry
Writes to *"this step's egress allowlist"*. Flows are immutable versions (PRD §4); which version it edits, and whether the running task sees it, are not stated. Whether the retry counts against `max_attempts` is not stated.

### 25. How the runner classifies a failure
No source lists the exit codes, stderr patterns or events that mean "transient".

### 26. Unblocking after a non-transient failure
Partly answered: backlog 3.3 fails a dead run *"with a Retry hint"*, backlog 2.3 puts *"Retry"* in the sheet, and backlog 5.3 tests *"retry after failure"*. What that Retry does (same attempt or the next, counted or not) is not stated. `POST /api/step-instances/:id/retry` is described only for escalation gates.

### 27. A stopped run: `cancelled` or `failed`?
`03` §8 and backlog 3.4: `cancelled`. Monitor guide: *"recorded as failed, with "stopped by you""*. ([[Monitor Open Questions]] #14)

### 28. What the engine does after a Stop
Not stated. **Proposal:** park the instance at `awaiting_approval` with reason "stopped"; no automatic retry. → [[Stopping And Cancelling]]

### 29. Pause
Feature map §3 names it (*"**Pause, send back, or cancel**"*); the task-detail guide gives the rule: *"Stops after the current run rather than mid-flight. The workspace stays."* No status, column, endpoint or engine rule backs it. **Proposal:** a flag checked before enqueuing the next `start_run`.

### 30. Restart: fail with a hint, or retry?
`03` §7 and backlog 3.3: dead pid → *"fail with a Retry hint"*. PRD §7: *"lost on restart"* is transient → automatic retry. → [[Worker Lifecycle]]

### 31. Re-attaching to a live process
After a worker restart the stdout pipe is gone. How the worker keeps tailing a still-alive run is not stated. *Inferred gap.*

### 32. Graceful shutdown and re-queue
Shutdown marks runs `cancelled`. Whether they are re-queued when the worker returns is not stated.

## Queue and runner

### 33. The 10-minute stale-lease reclaim and long runs
If a `start_run` stays leased for its run, a run over 10 minutes is reclaimed. The *"must not complete before the child spawns"* bug implies the job completes at spawn. Not stated outright. → [[Job Queue]]

### 34. Job payloads
No source specifies `payload`. **Proposal** in [[Job Queue]].

### 35. When a job is `failed`
`attempts` and `last_error` exist; no limit or rule.

### 36. `VIBE_MAX_RUNS` default
Not given. The monitor mockup uses 4. Whether shell runs take a slot is not stated. ([[Monitor Open Questions]] #20)

### 37. `resume_step` job kind
Backlog 1.1 (**DEC**). PRD §9 resumes with a `start_run`.

### 38. `args.json` or `spec.json`
PRD §7: `data/runs/<id>/args.json`. `03` §6 and the drawio: `spec.json` (+ raw stream). → [[Runner Pipeline]]

### 39. Where per-run `mcp.json` and `settings.json` are written
Not stated. **Proposal:** `data/runs/<id>/`.

### 40. Shell step: task host or a fresh container?
PRD §7: *"through the same execution host"*. drawio: *"in a fresh sandbox"*, *"Check container"*. → [[Shell Step Execution]]

### 41. Shell steps that cannot start
A shell step's non-zero exit is an outcome. A missing command, an out-of-memory kill, or a container that never starts would loop as `fail` rather than block.

## Contracts

### 42. Three versions of `RunSpec` and `Capability`
`01-ports.md` has `tool_hooks`; `agent-provider.ts` does not. `01-ports.md`'s sketch lacks `exec`. Neither carries permission mode, agent system prompt, hook settings or tier. → [[Agent Launch Contract]]

### 43. Step kinds
PRD §5: `ai | shell | manual`. `02` §3: `skill | agent | shell | manual`. `agent-provider.ts`: *"kind='skill'"*.

### 44. Preamble and placeholders
`agent-provider.ts`: preamble is *"task title + body"*. PRD §7 adds acceptance criteria and non-goals. Backlog 3.2's placeholder list omits `{{acceptance_criteria}}` and `{{non_goals}}`.

### 45. Draft mode: `haiku` or a logical id
PRD §13 and the drawio: `haiku` / `low`. `06` §15: `'fast-cheap'` / `'low'`. PRD §5 treats Claude aliases as the logical ids, so `haiku` is logical under the PRD's reading. Budgets: answered, no; `06` §15's transform changes only model and effort. → [[Draft Mode And Spec Transforms]]

### 46. `wasted` in an append-only journal
`02` §1 wants `runs` append-only; `wasted` is set later on superseded runs.

## API

### 47. Missing endpoints
Start, demote, pause, Fail task and Stop have no PRD endpoint. Three sibling sets propose different shapes: Fail task as `POST /api/tasks/:id/fail` ([[Task Detail API And Routes]]) or `POST /api/step-instances/:id/fail-task` ([[Human In The Loop API And Routes]]); Allow host & retry as `retry` with `{ note?, allowHost? }` ([[Monitor API And Routes]]) or `POST /api/step-instances/:id/allow-host` (Human In The Loop). Pick one. → [[Execution API And Routes]]

## Concurrency

### 48. Shared worktree
*"If two concurrent steps both write code they will conflict"* (PRD §11). A known constraint until the container workspace.

### 49. One branch blocked, the other running
When one fan-out branch escalates, the task is `blocked` while its sibling still runs. Not addressed.

### 50. Cancel mid-fan-out
Backlog 5.3 asks for the test; no rule beyond Cancel's general effect.

## Added on grounding review

### 51. Where recalled memory goes
Before the closing instruction (PRD §7; `09-memory.md`) or appended as the final part (PRD §11.2; `03` §6; the drawio's *"+7"*). `PromptParts` (`agent-provider.ts`) has six fields and no slot for it. → [[Prompt Assembly]]

### 52. An empty `--settings` file, or the hooks file?
Backlog D5 and the drawio D5 card: *"Empty `--settings` file per run"*. PRD §7 and the drawio *Runner* card: a per-run `settings.json` *"with PreToolUse hooks"*. → [[Run Guardrails At Launch]]

### 53. `bypassPermissions` on the host tier
Refuse (PRD §7, `01-ports.md`), refuse or downgrade (PRD §11.1), downgrade (`03` §6, drawio), or downgrade or fail the step (`08`, backlog 3.5 tagged **DEC**). → [[Run Guardrails At Launch]]

### 54. Does the MCP process open the database?
Yes per `02` §1 and backlog 1.1 (*"so worker and MCP … hit the same file"*); never per PRD §3, §9 and the drawio *SQLite* card. → [[Worker Lifecycle]]

### 55. Would a Stop be retried automatically?
PRD §7 lists *"process killed by a signal"* as transient. Stop and graceful shutdown are SIGTERMs; the replay adapter's `stop()` settles with `exitCode: 130`. Same as [[Monitor Open Questions]] #35. → [[Stopping And Cancelling]]

### 56. Who finalises a stopped run?
`03` §7: the worker is *"the only writer of run lifecycle state"*. `03` §8 and backlog 3.4: the route SIGTERMs by pid and should *"finalise as cancelled"*. Same as [[Monitor Open Questions]] #36.

### 57. A failing shell run's `runs.state`
PRD §7's completion rule: non-zero → `failed`. Its shell paragraph: *"a result, not a run failure"*. Which run state a failing check records is not stated. → [[Shell Step Execution]]

### 58. Finding a check's "previous failed run"
Downstream steps are re-instantiated on rework (`02` §3), so the previous failed `check` run sits on an earlier instance. How the fingerprint lookup crosses instances is not stated. → [[Stuck Detection And Fingerprints]]

### 59. Escalation delay: 5 or 10 minutes
PRD §10, the drawio and backlog 6.1 (`settings.escalation_threshold_ms`, default 5 min): 5 minutes. The inbox mockup: *"escalation after 10m"*. → [[Job Queue]]

### 60. Cleanup after failure
PRD §11 offers cleanup once `done` or `cancelled`; backlog 2.1 adds `failed`; the task-detail guide says *"finished or cancelled"*. → [[Execution Storage]]

### 61. Container per task, or per run
PRD §7 *Sandboxed runs*: *"inside the task's container"*. PRD §11.1: *"one per run, destroyed on completion"*; `08`: *"One container per run/attempt"*; the drawio: *"in a fresh sandbox"* for checks. → [[Shell Step Execution]]

### 62. The event envelope and live cost
`events.ts` has no `v`, which `01-ports.md` and PRD §7 require. `Usage` arrives only on `result`, yet PRD §7 wants a running cost from per-message tokens. Same as [[Monitor Open Questions]] #38, #39. → [[Agent Launch Contract]]

### 63. `06` §15's file layout
`06` §15 places routes in `src/app/api/` calling `src/lib/`; PRD §3 and §12 use `apps/web/app/api/` calling `packages/core`. → [[Execution API And Routes]]

### 64. Approving over an agent's `fail`
PRD §8 says *"approve means pass"* only for the no-outcome gate. `02` §3 and backlog 5.2 add *"Approve overrides the agent's `fail` outcome"*; backlog 10.2 lists *"approve overrides outcome"* as a README deviation. → [[Advancement Rules]]

### 65. How many entry steps
Backlog 5.1's validation says *"exactly one entry"*; `02` §2 states the same rule as *"exactly one producer"*, so "entry" there most likely means each `requires` entry. Whether a flow may have several entry steps is not stated. → [[Starting A Task]]

## Related

- [[Execution Index]]
- [[Execution Sources]]
- [[Monitor Open Questions]]
- [[Task Detail Open Questions]]
- [[Human In The Loop Open Questions]]
- [[Flow Design Open Questions]]
