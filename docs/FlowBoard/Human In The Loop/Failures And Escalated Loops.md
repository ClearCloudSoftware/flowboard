---
tags: [flowboard, human-in-the-loop, behaviour, failures]
module: Human In The Loop
---

# Failures And Escalated Loops

> **Retry loops with a safety limit** — When work loops back to be redone, the engine counts the attempts. After a set number, it stops and hands the task to you with the last error, instead of looping forever. You either give it one more try with a note, or fail the task. — feature map §4

The engine stops for you in some cases nobody designed as a gate. The sources describe them in two ways that don't fully match.

## In the PRD: an escalated-loop gate

*"**Loops are guarded.** Any step instance that reaches `max_attempts` (default 3) stops looping and hands the task to me with the last error, rather than retrying again or failing silently (§8)."* (PRD §4)

*"Escalate, don't fail, when a loop is spent or stuck."* (PRD §8; backlog decision D3, *"Decided 2026-10-15"*). Backlog Story 5.2: *"escalate at the cap or on a repeated shell-check fingerprint; infra retries uncounted"*. Engine detail: [[Loop Guard And Escalation]] and [[Stuck Detection And Fingerprints]].

| Case | Trigger |
|---|---|
| **Spent** | *"when a rework edge would start a run past `max_attempts`"*. `max_attempts` *"counts total runs of the step, first try included"*, default 3. |
| **Stuck** | *"when a shell step fails with the **same fingerprint** as its previous failed run, because the redo changed nothing."* Review failures get no fingerprint. |

Then: *"start nothing. Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate. I choose: **Retry** grants one more attempt and carries my note into it, like a rejection reason. It does not reset the counter. **Fail task** ends it."*

API: `POST /api/step-instances/:id/retry` (PRD §12). Failing the task has no named endpoint. See [[Human In The Loop API And Routes]].

The feature map: *"Stops early when stuck — If the tests fail with exactly the same error twice in a row, it doesn't spend a third try. It asks you right away."*

## In the mockups: a failure card

`billing-webhook · build`, *"Attempt 3 of 3 failed — egress denied to api.stripe.com"*:

> *"The sandbox refused the call: **api.stripe.com** was not on this step's allowlist. Three attempts, $1.44 spent and thrown away."*

| Action | What it does | Source |
|---|---|---|
| `↵ Allow host & retry` | *"On a failure: adds the blocked host to that step's allowlist, then re-queues the run."* | inbox guide actions |
| `Retry as-is` | *"Re-queues the run unchanged. For failures that aren't about the network — a flaky test, a rate limit, a transient error."* | monitor guide actions |
| `Open the log` | *"Jumps to the row detail, where the last output and the error line are shown together."* | monitor guide actions |

Hint: *"Allowing the host adds **api.stripe.com** to this step's egress allowlist, then re-queues the run. The failed attempt's spend stays wasted either way."* The walkthrough adds: *"the host is allowlisted now, so the next task down this flow will not pay the same toll."* Beat 2: *"Nothing is running on this task and nothing is being spent — it has simply stopped. The fix is a one-line change to the step's allowlist, and the card offers it directly."* The sandbox side of the denial is in [[Egress Denials]].

The mockups count these as attempts. The monitor guide's *Allow host & retry* *"re-queues the run as the next attempt"*, and its money column says *"The failed attempt's spend moves to wasted"*. The monitor mockup's `retry()` increments the attempt with no cap check, so retrying *Attempt 3 of 3* makes attempt 4 (as PRD §8's Retry, which *"does not reset the counter"*). Task detail shows an earlier denial (*"egress denied: registry.npmjs.org was not in the step allowlist"*) as build attempt 1 (`attempts:2`, `wasted:0.480`), so the step ran again and the failed attempt's spend is counted as wasted.

The monitor guide's *Failed* status: *"A step errored, hit its retry limit, or you stopped it. The task is parked and spending nothing."*

> [!warning] Where they disagree — [[Human In The Loop Open Questions]] #24–#26
> - The PRD gate offers **Retry** (with a note) and **Fail task**. The failure card offers **Allow host & retry**, **Retry as-is** and **Open the log**. It has no Fail task and no note.
> - An egress denial is not obviously a counted attempt. Under PRD §7 a non-zero agent exit is an *infrastructure failure*, *"never a verdict on the work"*. A transient one retries automatically and uncounted. Anything else puts the task straight into `blocked`, outside the rework loop that `max_attempts` guards. The card reads *Attempt 3 of 3*. Same as [[Sandboxing Open Questions]] #14.
> - *Retry as-is* is offered for *"a rate limit, a transient error"*, which PRD §7 already retries automatically (30 s, 2 min, 8 min).
> - *Allow host & retry* changes a step definition from outside the designer. Same as [[Flow Design Open Questions]] #14.
> - Some sources still fail the task at the cap instead of escalating: PRD §16 (*"three failed attempts fail the task"*), backlog Story 10.1, the drawio card *D3 · max_attempts = attempts allowed* (*"Fail on the 4th"*), and the monitor and task-detail guides (*"Retries are capped, then the task fails."*; *"After the limit the engine gives up and fails the task rather than looping on your money forever."*). See [[Flow Design Open Questions]] #11.

## Infra failures never reach you as attempts

*"Hiccups don't count — A rate limit, network blip or crash is retried automatically after a short wait. It doesn't use up a try, but it still shows up in wasted spend."* (feature map §4). PRD §7: transient failures retry *"up to 3 times, with backoff of 30 s, 2 min and 8 min"*. *"Anything else, or a 4th transient failure … put the task into `blocked`."*

> [!note] Questions die with the run
> *"On any run failure, **cancel that step's pending questions** so they stop escalating."* (`04` §9; backlog Story 3.2 marks it **BUG**: *"today they keep escalating"*.)

## Related

- [[Approving And Sending Back]]
- [[Inbox Card Kinds]]
- [[Step Guardrails]]
- [[Branching Joining And Loops]]
- [[Loop Guard And Escalation]]
- [[Infra Retries]]
- [[Egress Denials]]
- [[Failures And Retries]]
