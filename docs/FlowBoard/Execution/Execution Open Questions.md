---
tags: [flowboard, execution, open-questions]
module: Execution
---

# Execution Open Questions

Every place the sources disagree or leave a gap, plus every proposal these notes make. Numbered for reference.

## Starting

### 1. Auto-start or an explicit Start?
Feature map §3 asks; backlog D1 and the drawio default to *"Explicit Start button on card + sheet; promote stays cheap"*. PRD §12 has no start endpoint; the first build added `POST /api/tasks/:id/start`. No mockup draws Start. → [[Starting A Task]]

### 2. What Start does
No source lists it. **Proposal:** status `running`, one `pending` instance per entry step, one `start_run` each. When `capability_pins` is written (promote or Start) is not stated.

### 3. Worktree path and branch
PRD §11: `.vibe-worktrees/task-<id>` on `vibe/task-<id>`. drawio: `.flowboard/worktrees/task-<id>` on `fb/task-<id>`. → [[Execution Storage]]

## Advancement

### 4. The join rule deadlocks the seed flow
PRD §8: a join waits for *"every upstream step instance"*. `implement` has `on_fail` edges in from `check` and `review`. Backlog 5.2 fixes it: *"every non‑`on_fail` upstream instance"*. Adopt the backlog wording in the PRD. → [[Fan-Out And Join]]

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

### 15. "Fail on the 4th"
The drawio D3 card: *"max_attempts = attempts allowed / Fail on the 4th (default 3)"*. PRD §8: three total runs, first included. The card reads as one more run than the PRD allows.

### 16. After a Retry
Retry *"does not reset the counter"* (PRD §8). **Inferred:** the next failure escalates again at once. Not stated.

### 17. Which runs are wasted on rework
PRD §8 says *"superseded runs"*; `02` §3 and backlog 5.2 say *"downstream runs"*. Whether the target's previous run and the failing step's run are wasted is not stated; the mockups waste the target's. → [[Rework Loop]]

### 18. Downstream attempts
Backlog 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."*

### 19. Stripping digits and "fewer failing tests"
PRD §8 strips digits before hashing, then says fewer failing tests change the fingerprint. A count line like `3 failing` → `2 failing` does not change. → [[Stuck Detection And Fingerprints]]

### 20. Where the escalation gate sits
On the rework target, with the failing step's artifact (PRD §8). The inbox mockup labels the card with the failing step (`build`). Which step the screens name is not settled.

### 21. Where the reject reason and Retry note go in the prompt
*"carries your reason into the next attempt"*; the prompt part is not stated. **Proposal:** the preamble. Where the note is stored is not stated either. → [[Prompt Assembly]]

## Failures and stopping

### 22. Is an egress denial an attempt?
PRD §7: neither a work verdict nor transient → task `blocked`. Task-detail and inbox mockups count it as an attempt. Same as [[Monitor Open Questions]] #11. → [[Infra Retries]]

### 23. Retry as-is for transient failures
Monitor guide offers it for *"a rate limit, a transient error"*; PRD §7 retries those automatically. ([[Monitor Open Questions]] #37)

### 24. Allow host & retry
Writes to *"this step's egress allowlist"*. Flows are immutable versions (PRD §4); which version it edits, and whether the running task sees it, are not stated. Whether the retry counts against `max_attempts` is not stated.

### 25. How the runner classifies a failure
No source lists the exit codes, stderr patterns or events that mean "transient".

### 26. Unblocking after a non-transient failure
No stated control. `POST /api/step-instances/:id/retry` is described only for escalation gates.

### 27. A stopped run: `cancelled` or `failed`?
`03` §8 and backlog 3.4: `cancelled`. Monitor guide: *"recorded as failed, with "stopped by you""*. ([[Monitor Open Questions]] #14)

### 28. What the engine does after a Stop
Not stated. **Proposal:** park the instance at `awaiting_approval` with reason "stopped"; no automatic retry. → [[Stopping And Cancelling]]

### 29. Pause
Task-detail mockup only. No status, column, endpoint or rule. **Proposal:** a flag checked before enqueuing the next `start_run`.

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
PRD §13 and the drawio: `haiku` / `low`. `06` §15: `'fast-cheap'` / `'low'`. Whether it lowers budgets is not stated. → [[Draft Mode And Spec Transforms]]

### 46. `wasted` in an append-only journal
`02` §1 wants `runs` append-only; `wasted` is set later on superseded runs.

## API

### 47. Missing endpoints
Start, demote, pause, Fail task and Stop have no PRD endpoint. **Proposals** in [[Execution API And Routes]] follow [[Task Detail API And Routes]]. [[Human In The Loop API And Routes]] proposes different paths for Fail task and Allow host; pick one.

## Concurrency

### 48. Shared worktree
*"If two concurrent steps both write code they will conflict"* (PRD §11). A known constraint until the container workspace.

### 49. One branch blocked, the other running
When one fan-out branch escalates, the task is `blocked` while its sibling still runs. Not addressed.

### 50. Cancel mid-fan-out
Backlog 5.3 asks for the test; no rule beyond Cancel's general effect.

## Related

- [[Execution Index]]
- [[Execution Sources]]
- [[Monitor Open Questions]]
- [[Task Detail Open Questions]]
- [[Human In The Loop Open Questions]]
- [[Flow Design Open Questions]]
