---
tags: [flowboard, execution, behaviour, retry, infra]
module: Execution
---

# Infra Retries

What the runner does when an agent process exits non-zero. The engine never sees these: *"Infra failures never reach the engine as attempts (runner retries them)."* (`02` §3)

## The classification

> *"A non-zero exit from an agent run is an **infrastructure failure**, never a verdict on the work, because work verdicts arrive as outcomes. Classify it:*
> - ***Transient** (rate limited, overloaded, network error, process killed by a signal or lost on restart): retry the same attempt automatically, up to 3 times, with backoff of 30 s, 2 min and 8 min. It is a new run with the same `attempt` number. The failed run is marked `wasted = 1` and does **not** count toward `max_attempts`.*
> - ***Anything else**, or a 4th transient failure (budget or turn cap hit, auth error, bad config, unknown): put the task into `blocked`, as before. Retrying these would only burn the same money again."* (PRD §7)

| Class | Examples (PRD §7) | Action | Counts? | Wasted? |
|---|---|---|---|---|
| Transient | rate limited, overloaded, network error, killed by a signal, lost on restart | same attempt again after 30 s / 2 min / 8 min | no | yes |
| Transient, 4th time | — | task `blocked` | — | not stated |
| Anything else | budget or turn cap hit, auth error, bad config, unknown | task `blocked` | — | not stated |

`03` §6 says the same and names the owner: *"**Infra retries are the runner's, not the engine's.** … The engine only ever sees work outcomes, so `max_attempts` counts work, not weather."*

The drawio *Infra-retry classifier* card: *"non-zero agent exit: transient → same attempt again after 30 s / 2 m / 8 m, wasted = 1, not counted · anything else → task blocked"*. Its *Loop layer* concept: *"infra retries stay out of the count"*; its *Cost ledger* card: *"wasted = rework + infra retries"*. Feature map §4: *"**Hiccups don't count** — A rate limit, network blip or crash is retried automatically after a short wait. It doesn't use up a try, but it still shows up in wasted spend."*

## The timeline

```mermaid
sequenceDiagram
  participant R as Runner
  participant Q as Job queue
  R->>R: run 1 (attempt n) exits non-zero, transient
  R->>Q: start_run, run_after = now + 30 s
  R->>R: run 2 (attempt n) exits non-zero, transient
  R->>Q: start_run, run_after = now + 2 min
  R->>R: run 3 (attempt n) exits non-zero, transient
  R->>Q: start_run, run_after = now + 8 min
  R->>R: run 4 (attempt n) exits non-zero → task blocked
```

The `run_after` mechanism is a *proposal*: the PRD gives the backoff but not how it is scheduled. `jobs.run_after` (PRD §5) is the obvious carrier, and PRD §10 already uses it for a delayed job.

## On completion

Backlog 3.2 (**PRD/BUG**): *"Completion: exit 0 → succeeded → §8; non‑zero or `is_error` → failed, stderr tail in `runs.error`, task blocked; **cancel that step's pending questions** (today they keep escalating)."* `04` §9: *"On any run failure, **cancel that step's pending questions** so they stop escalating."*

Backlog 3.2's *"non‑zero … task blocked"* ignores PRD §7's transient class: under PRD §7 a transient non-zero exit is retried, and only *"Anything else, or a 4th transient failure"* blocks the task.

> [!question] Restart: transient or failed?
> PRD §7 lists *"lost on restart"* as transient, so it is retried automatically. `03` §7 and backlog 3.3 say a dead pid on restart → *"fail with a Retry hint"*. See [[Execution Open Questions]] #30 and [[Worker Lifecycle]].

## Where the mockups disagree

> [!warning] Failures the mockups count as attempts
> - **Egress denials.** Task-detail guide: Build attempt 1 *"died on an egress denial"* and counts (`↺2`, *"retries 1"*). Inbox (`inbox.html`): *"Attempt 3 of 3 failed — egress denied to api.stripe.com"*. *Inference:* under PRD §7 an egress denial is not a work verdict, so it is never an attempt. Whether it is transient is a judgement call. The list includes *"network error"*, which a refused connection could count as, and then it is retried automatically. Otherwise it is "anything else" and blocks the task. Whether a denial ends the run at all, or only fails one tool call, is not stated either ([[Egress Denials]], [[Sandboxing Open Questions]] #14).
> - **Retry as-is for transients.** The monitor guide's **Retry as-is** is *"For failures that aren't about the network — a flaky test, a rate limit, a transient error."* By PRD §7 a rate limit is retried automatically and never reaches you.
>
> See [[Execution Open Questions]] #22, #23, [[Failures And Retries]] and [[Monitor Open Questions]] #11, #37.

## Gaps

- **How the runner tells transient from not.** No source lists the exit codes, stderr patterns or stream events it reads ([[Execution Open Questions]] #25).
- **A failure on exit 0.** Backlog 3.2 fails a run on *"non‑zero or `is_error`"*. The classification above is written for a non-zero exit; whether an `is_error` result on exit 0 is classified the same way is not stated ([[Agent Providers Open Questions]] #33).
- **Physical limits.** Backlog 3.5: *"a limit/timeout hit marks the run failed with reason."* PRD §7's lists name *"budget or turn cap hit"* (non-transient) but not a memory, CPU, pid or wall-clock kill. *Inference:* a wall-clock or out-of-memory kill is also a *"process killed by a signal"*, which would make it transient and retried. See [[Execution Open Questions]] #68, [[Resource Limits]] and [[Sandboxing Open Questions]] #15.
- **Stops.** A Stop or a graceful shutdown is a SIGTERM, so it too reads as *"killed by a signal"* ([[Execution Open Questions]] #55, [[Stopping And Cancelling]]).
- **Unblocking.** Partly answered. Backlog 3.3 fails a dead run *"with a Retry hint"*, backlog 2.3 puts *"Retry"* in the task sheet, and backlog 5.3 asks for a *"retry after failure"* test. What Retry does on a blocked task (same attempt or the next, counted or not) is not stated. `POST /api/step-instances/:id/retry` (PRD §12) is described only for escalation gates (PRD §8). See [[Execution Open Questions]] #26.
- **Shell steps.** The rule is for *"an agent run"*. A shell step's non-zero exit is an outcome. A shell step whose container fails to start is not addressed ([[Execution Open Questions]] #41).

## Related

- [[Execution Index]]
- [[Runner Pipeline]]
- [[Loop Guard And Escalation]]
- [[Worker Lifecycle]]
- [[Failures And Retries]]
- [[Egress Denials]]
- [[Resource Limits]]
