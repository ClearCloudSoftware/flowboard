---
tags: [flowboard, execution, behaviour, rework, loop]
module: Execution
---

# Rework Loop

What the engine does when an `on_fail` edge sends work back to an earlier step. The cap on how often that may happen is in [[Loop Guard And Escalation]].

## The rule

> *"Rework loops: an `on_fail` edge pointing at an earlier step increments that step instance's `attempts` and creates a new run. The counter lives on the **target** instance, so every loop that sends work back to the same step shares one budget. In the seeded flow, a failed `check` and a failed `review` both spend `implement`'s attempts. The new run's "read these first" list (prompt part 2) also gets the artifacts the failing step produced, so a rework sees the raw `check_output` or `review`, not a summary of it. Mark the superseded runs `wasted = 1` so the cost view can report discarded spend."* (PRD §8)

`02` §3 adds the downstream reset: *"Rework: same instance, `attempts++`, new run, downstream `done` → `skipped` so they re-instantiate, superseded runs `wasted=1`. The new run reads the failing step's artifacts (raw `check_output` / `review`)."* Backlog 5.2 (**PRD**) repeats it with *"downstream runs `wasted=1`"*.

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

## What the new run gets

| Input | Source |
|---|---|
| The failing step's artifacts, raw | PRD §8. Feature map §2, check steps: *"the error output goes to the next attempt word for word"*. drawio harness concept 4: *"the raw output feeds the next attempt"*. |
| Your reason, when a human rejected | *"a rejection carries your reason into the next attempt"* (feature map §4) |
| Your note, after an escalation Retry | *"carries my note into it, like a rejection reason"* (PRD §8) |
| Task-scope memory, when on | *"`task` (why attempt 1 failed → attempt 2 starts warm)"* (PRD §11.2). See [[Task Memory Scope]]. |

## Two loops in the seeded flow

| Loop | Edge | Kind | Bounded by |
|---|---|---|---|
| Mechanical | `check → implement` on `on_fail` | *"the model never gets reviewed on code that doesn't pass"* (PRD §15) | `max_attempts` + fingerprint |
| Review | `review → implement` on `on_fail` | Adversarial review or a human reject | `max_attempts` only: *"Review failures get no fingerprint"* (PRD §8) |

Both draw on `implement`'s budget (PRD §8).

## What it costs

- *"Mark the superseded runs `wasted = 1`"* (PRD §8). `/costs` reports *"**wasted spend**: sum of `cost_usd` where `wasted = 1`, i.e. money burnt by rework loops"* (PRD §13).
- Monitor guide: *"Everything the first build spent is now counted as wasted — the work is gone, the money isn't."*
- Task-detail guide: *"The money moves, it does not come back."*
- The pitch names rework as a source of waste: *"an agent takes a wrong turn, gets re-run from scratch, loops on a review it keeps failing."*

## Gaps

> [!question] Which runs are superseded?
> PRD §8 and `02` §3 say *"superseded runs"*; only backlog 5.2 says *"downstream runs `wasted=1`"*. None says whether the target's own previous run (the build that was sent back) or the failing step's run (the failed check or the rejected review) is wasted. The monitor and task-detail mockups move the **target's** previous spend to wasted. See [[Attempts And Send Back]] for the figures and [[Execution Open Questions]] #17.

> [!question] Downstream attempts
> Backlog 5.2 (**DEC**): *"Downstream steps reset `attempts` on every loop; only the loop target is capped. Decide if downstream should also count."* See [[Execution Open Questions]] #18 and [[Flow Design Open Questions]] #20.

- **An `on_fail` edge to a later step** is not rework. The PRD defines rework only as *"pointing at an earlier step"*, so such an edge is, by inference, an ordinary conditional route. How "earlier" is decided (topological order, `board_order`) is not stated ([[Execution Open Questions]] #9; on `on_fail` back-edges and ancestry, [[Flow Design Open Questions]] #22).

## Related

- [[Execution Index]]
- [[Loop Guard And Escalation]]
- [[Stuck Detection And Fingerprints]]
- [[Attempts And Send Back]]
- [[Branching Joining And Loops]]
- [[Burn Today And Wasted]]
- [[Task Memory Scope]]
