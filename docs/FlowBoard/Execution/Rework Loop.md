---
tags: [flowboard, execution, behaviour, rework, loop]
module: Execution
---

# Rework Loop

What the engine does when an `on_fail` edge sends work back to an earlier step. The cap on how often that may happen is in [[Loop Guard And Escalation]].

## The rule

> *"Rework loops: an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run. The counter lives on the **target** instance, so every loop that sends work back to the same step shares one budget. In the seeded flow, a failed `check` and a failed `review` both spend `implement`'s attempts. The new run's "read these first" list (prompt part 2) also gets the artifacts the failing step produced, so a rework sees the raw `check_output` or `review`, not a summary of it. Mark the superseded runs `wasted = 1` so the cost view can report discarded spend."* (PRD §8)

`02` §3 adds the downstream reset: *"Rework: same instance, `attempts++`, new run, downstream `done` → `skipped` so they re-instantiate, superseded runs `wasted=1`. The new run reads the failing step's artifacts (raw `check_output` / `review`)."* Backlog 5.2 (**PRD**) repeats it with *"downstream runs `wasted=1`"*.

As built in run-flow (2026-10-23), a rework route is an `on_fail` route to the step itself or to an ancestor along `always` and `on_pass` routes, and it must be its step's only `on_fail` route. The target reruns as its next attempt, with its own `requires` plus what the failing run hands on. Every run so far of the target and of the steps below it is wasted, the failing run included. A run still going below the target is stopped (`error: 'superseded'`); one the host had not launched yet is recorded `not launched` and is not wasted.

The steps below the target are deleted, not marked `skipped`, and start again at attempt 1 when a route reaches them. A step that a route from outside the reset already fed, a join, waits again as `pending`. A branch not below the target keeps its result. A flow whose rework target is its first step must name that step with `entry:`, since every step then has a route into it. The one-`on_fail`-route rule, the waiting join and `entry:` are Claude's calls (2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]); the rest is the run-flow plan's (Execution #9, #17, #18).

## Step by step

```mermaid
sequenceDiagram
  participant Fail as Failing step (check / review)
  participant E as Engine
  participant Tgt as Target instance (implement)
  participant Dn as Downstream instances
  Fail->>E: outcome = fail
  E->>E: on_fail edge → earlier step
  E->>E: past max_attempts, or same shell fingerprint? → escalate instead
  E->>Tgt: attempts++
  E->>Dn: done → skipped; their runs wasted = 1
  E->>Tgt: new run; read-first += failing step's artifacts; + human reason
  Tgt-->>E: lands; downstream re-instantiate and run again
```

Assembled from PRD §8 and `02` §3. The escalation check is [[Loop Guard And Escalation]].

As built in run-flow (2026-10-23), the failure's other routes fire before the rework, and the rework's reset removes their targets below the rework target, so the order the edges are written in changes nothing (Claude's call, 2026-10-23, open to Alex's review).

## What the new run gets

| Input | Source |
|---|---|
| The failing step's artifacts, raw | PRD §8. Feature map §2, check steps: *"the error output goes to the next attempt word for word"*. drawio harness concept 4: *"the raw output feeds the next attempt"*. |
| Your reason, when a human rejected | *"a rejection carries your reason into the next attempt"* (feature map §4) |
| Your note, after an escalation Retry | *"carries my note into it, like a rejection reason"* (PRD §8) |
| Task-scope memory, when on | *"`task` (why attempt 1 failed → attempt 2 starts warm)"* (PRD §11.2). See [[Task Memory Scope]]. |

As built in run-flow (2026-10-23):

- **The failing step's artifacts** are its declared `produces`, less any its failing run did not write this time, so a file left from an earlier round is not passed on as this failure's. A step that produces nothing hands on nothing, and `--check` warns: `steps.check: reworks "impl" on a failure but produces nothing, so impl runs again without seeing why`. A shell step's output still reaches its run log's `result` line, and its last line is printed: `-- check: last output: <line>`. An agent's `set_outcome` reason stays on its run record, outcome file and log; it does not reach the rework run.
- **A person's note** goes to the runs the decision starts (Claude's call, 2026-10-23, open to Alex's review). A Reject's goes to the rework target. At an escalation, Retry passes the note typed there, else the Reject's note, which the gate keeps. At a *run failed* or verdict gate, Retry passes the note typed there, else the note the attempt started with. An agent run gets the note as the preamble line `A person's note for this attempt: <note>`; a shell step gets it as the environment variable `FLOWBOARD_NOTE`.
- **Task-scope memory** is on the run-flow plan's Left out list.

## Two loops in the seeded flow

| Loop | Edge | Kind | Bounded by |
|---|---|---|---|
| Mechanical | `check → implement` on `on_fail` | *"the model never gets reviewed on code that doesn't pass"* (PRD §15) | `max_attempts` + fingerprint |
| Review | `review → implement` on `on_fail` | Adversarial review or a human reject | `max_attempts` only: *"Review failures get no fingerprint"* (PRD §8) |

Both draw on `implement`'s budget (PRD §8). As built in run-flow (2026-10-23), the seeded `review` is an approval step, so its loop starts only on a person's Reject; see [[Seeded Flow Execution]].

## What it costs

- *"Mark the superseded runs `wasted = 1`"* (PRD §8). `/costs` reports *"**wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops"* (PRD §13).
- Monitor guide: *"Everything the first build spent is now counted as wasted — the work is gone, the money isn't."*
- Task-detail guide: *"The money moves, it does not come back."*
- The pitch names rework as a source of waste: *"an agent takes a wrong turn, gets re-run from scratch, loops on a review it keeps failing."*

As built in run-flow (2026-10-23), each run record in `state.json` carries `wasted` and `costUsd`, and the run-flow host ends with `-- flow <status>: <n> runs, $<spent> spent, $<wasted> wasted`, or `$<spent> of $<budget> spent` when the flow has a budget. A run whose provider reported no price, such as a Claude run stopped before its result, has `costUsd: null`; the totals count it as nothing and add `, cost unknown for 1 run`.

## Gaps

> [!question] Which runs are superseded?
> PRD §8 and `02` §3 say *"superseded runs"*; only backlog 5.2 says *"downstream runs `wasted=1`"*. None says whether the target's own previous run (the build that was sent back) or the failing step's run (the failed check or the rejected review) is wasted. The monitor and task-detail mockups move the **target's** previous spend to wasted. See [[Attempts And Send Back]] for the figures and [[Execution Open Questions]] #17.

> [!check] Answered by run-flow, 2026-10-23
> Both: every run so far of the target and of every step below it, the failing run included. Runs cut off by Ctrl+C, a crash or a spent budget, runs that ended with an error, and a run a Retry at a verdict gate replaced are wasted too (the run-flow plan, Execution #17). A run stopped by *Fail the flow*, or cut off before the host launched it, is not. See [[Run Flow Reference]].

> [!question] Downstream attempts
> Backlog 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."* See [[Execution Open Questions]] #18 and [[Flow Design Open Questions]] #20.

> [!check] Answered by run-flow, 2026-10-23
> They reset: the steps below the target are recreated and start again at attempt 1, and only the target's count carries (the run-flow plan, Execution #18, Flow Design #20). See [[Run Flow Reference]].

- **An `on_fail` edge to a later step** is not rework. The PRD defines rework only as *"pointing at an earlier step"*, so such an edge is, by inference, an ordinary conditional route. How "earlier" is decided (topological order, `board_order`) is not stated ([[Execution Open Questions]] #9; on `on_fail` back-edges and ancestry, [[Flow Design Open Questions]] #22). As built in run-flow (2026-10-23), "earlier" means the step itself or an ancestor along `always` and `on_pass` routes; any other `on_fail` route is a forward route (the run-flow plan, Execution #9).

## Related

- [[Execution Index]]
- [[Loop Guard And Escalation]]
- [[Stuck Detection And Fingerprints]]
- [[Attempts And Send Back]]
- [[Branching Joining And Loops]]
- [[Burn Today And Wasted]]
- [[Task Memory Scope]]
