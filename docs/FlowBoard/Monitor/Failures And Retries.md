---
tags: [flowboard, monitor, failures, retries]
module: Monitor
---

# Failures And Retries

How a failure shows on the monitor, and what the sources say happens next.

## On the screen

- The task's icon is a brick ✕, and it sorts to the very top (*needs you first* ranks failed above waiting).
- The failed cell in the [[Flow Bar And Step States|flow bar]] carries the attempt digit: *"3 means two earlier attempts were already thrown away."*
- The [[Needs You Band]] shows a brick-tinted card: *"Attempt 3 of 3 failed — egress denied — api.stripe.com not in the step allowlist. $1.44 spent on the attempts so far."*
- The [[Task Row Detail]] log ends with `✕ <error>`.
- The status bar counts `N failed`.

*"The task is parked and spending nothing."*

The *of 3* is a fixed string (`monitor.html:750`) and `retry()` has no cap, so one more failed retry would read *Attempt 4 of 3* ([[Monitor Open Questions]] #11).

## The three ways out (mockup)

| Action | For | Source wording |
|---|---|---|
| **Allow host & retry** | An egress denial | *"the sandbox correctly refused a call the step genuinely needs"* |
| **Retry as-is** | Anything else | *"a flaky test, a rate limit, a transient error"*. PRD §7 retries rate limits and transient errors automatically, so they should rarely reach you ([[Monitor Open Questions]] #37) |
| Leave it | — | *"or leave it and let the spend stop there"* |

Each retry moves the failed attempt's spend to wasted and re-queues the run as the next attempt.

The inbox guide (`inbox-guide.html:477`) adds why the allowlist edit is worth it: *"The $1.44 is already gone. Retrying spends again — but the host is allowlisted now, so the next task down this flow will not pay the same toll."* That is an edit to a step definition from outside the designer: [[Flow Design Open Questions]] #14.

## What the engine spec says

The PRD separates three kinds of failure. The monitor shows one.

| Kind | PRD rule | Counts as an attempt? | Ends in |
|---|---|---|---|
| **Work verdict** (`outcome = fail`) | Follows the step's `on_fail` edge: a rework loop (§8) | Yes, on the rework *target* | Next attempt, or the escalation gate at `max_attempts` |
| **Transient infra failure** | *"rate limited, overloaded, network error, process killed by a signal or lost on restart"*: retried *"up to 3 times, with backoff of 30 s, 2 min and 8 min"*, marked `wasted = 1` (§7) | No | Automatic retry |
| **Other run failure** | *"budget or turn cap hit, auth error, bad config, unknown"*, or a 4th transient: *"put the task into `blocked`"* (§7) | No | Task blocked |

At the cap, PRD §8 escalates rather than fails: *"Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate. I choose: **Retry** grants one more attempt and carries my note into it, like a rejection reason. It does not reset the counter. **Fail task** ends it."* A shell check failing with the same fingerprint twice escalates early (PRD §8). The escalate-don't-fail rule is backlog decision **D3**, decided 2026-10-15.

> [!warning] Conflicts
> - The monitor's *"Attempt 3 of 3"* counts a sandbox denial as an attempt. Under PRD §7 a non-zero agent exit is an infrastructure failure, *"never a verdict on the work"*, and does not count. That assumes a denial ends the run with a non-zero exit; no source says whether it does or only fails the tool call (inference). [[Monitor Open Questions]] #11.
> - The monitor's failure card has no **Fail task** and its retry takes no note. [[Monitor Open Questions]] #12.
> - The guide's walkthrough: *"Retries are capped, then the task fails."* (`monitor-guide.html:691`). That contradicts backlog D3, though PRD §16's checklist agrees with the guide (*"three failed attempts fail the task"*); already tracked as [[Flow Design Open Questions]] #11.

## Stop

A run you stop is *"recorded as failed, with "stopped by you" as the reason"*, and its spend moves to wasted. Backlog Story 3.4 finalises a stopped run as `cancelled`, and Story 3.3 says graceful shutdown should mark runs *"`cancelled`, not `failed`"*. [[Monitor Open Questions]] #14.

Two more conflicts sit under Stop. PRD §7 counts *"process killed by a signal"* as a transient failure and retries it, so a SIGTERM Stop needs its own path or the run comes back (#35). And backlog 3.4 kills *"by pid from the route"*, which skips the ports' `stop()` and `kill()` and crosses the web/worker boundary (#36).

## Steps that never start

Decision **D15**: without Docker, *"a step whose plugins (skill or extras) came from a git URL does not run."* No source says how the monitor shows that step ([[Monitor Open Questions]] #45).

## Related

- [[Monitor Actions And Costs]]
- [[Step Guardrails]]
- [[Branching Joining And Loops]]
- [[Burn Today And Wasted]]
