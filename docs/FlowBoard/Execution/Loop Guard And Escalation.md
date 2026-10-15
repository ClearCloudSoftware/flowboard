---
tags: [flowboard, execution, behaviour, loop-guard, escalation, max-attempts]
module: Execution
---

# Loop Guard And Escalation

The cap on rework, and what happens when a loop is spent or stuck. PRD §4: *"**Loops are guarded.** Any step instance that reaches `max_attempts` (default 3) stops looping and hands the task to me with the last error, rather than retrying again or failing silently (§8)."*

## What counts

> *"**`max_attempts` counts total runs of the step, first try included** (infra retries excluded). The default of 3 means one try and two automatic redos."* (PRD §8)

| Rule | Source |
|---|---|
| Default 3 | `step_defs.max_attempts INTEGER NOT NULL DEFAULT 3` (PRD §5) |
| First try counts | *"The first attempt plus two redos."* (feature map §4) |
| One shared budget | *"Every loop that sends work back to the same step draws from the same three, whether the tests failed or the review did."* (feature map §4) |
| Counter on the target | *"counter on the rework *target*, shared by all loops into it"* (`02` §3) |
| Infra retries excluded | *"It doesn't use up a try, but it still shows up in wasted spend."* (feature map §4) |

Backlog decision D3: *"`max_attempts` = total runs incl. the first (default 3); escalate to a gate, never auto-fail"*, with the recommendation column reading *"Decided 2026-10-15; see PRD §8"*.

## When it escalates

> *"**Escalate, don't fail, when a loop is spent or stuck.** Escalate in either of two cases. First, when a rework edge would start a run past `max_attempts`. Second, when a shell step fails with the **same fingerprint** as its previous failed run, because the redo changed nothing. Either way, start nothing. Set the target step instance to `awaiting_approval` and the task to `blocked`, and show the failing step's last artifact (the error log or review) on the gate. I choose: **Retry** grants one more attempt and carries my note into it, like a rejection reason. It does not reset the counter. **Fail task** ends it."* (PRD §8)

```mermaid
flowchart TD
  F[Step fails, on_fail → target] --> C1{target attempts + 1 > max_attempts?}
  C1 -->|yes| ESC
  C1 -->|no| C2{shell step, same fingerprint as its last failure?}
  C2 -->|yes| ESC
  C2 -->|no| RW[Rework: new run]
  ESC[Escalate: start nothing · target → awaiting_approval · task → blocked · show failing artifact] --> H{You choose}
  H -->|Retry + note| ONE[One more attempt, counter not reset]
  H -->|Fail task| END[Task failed]
```

The drawio *Loop guard* card: *"attempts counted on the rework target, shared by every loop into it · max_attempts 3 = total runs · same check fingerprint twice → escalate · gate: Retry + note / Fail task"*.

Feature map §4: *"After a set number, it stops and hands the task to you with the last error, instead of looping forever. You either give it one more try with a note, or fail the task."*

## Where the escalation lands

- **In the inbox.** The drawio harness concept 8: *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* The inbox mockup draws it as a **failure** card. See [[Failures And Escalated Loops]].
- **On the task.** The target instance holds the gate; the evidence is the failing step's last artifact.
- **API.** Retry is `POST /api/step-instances/:id/retry` (PRD §12). Fail task has no endpoint in the PRD. See [[Execution API And Routes]].

## Escalate or fail: the sources disagree

> [!warning] Many sources still say the task fails
> PRD §8, `02` §3, the drawio *Loop guard* card and backlog D3 (decided 2026-10-15) all say **escalate**. These still say **fail**:
>
> | Source | Wording |
> |---|---|
> | PRD §16 acceptance | *"Rejecting a review sends the task back to `implement` as attempt 2, and three failed attempts fail the task"* |
> | Backlog 10.1 | *"Reject → attempt 2; three failures fail the task."* |
> | drawio *FlowBoard ideation* | *"D3 · max_attempts = attempts allowed / Fail on the 4th (default 3). Loops are guarded."* |
> | Flow designer guide | *Retries*: *"How many attempts before the step gives up and fails the task."* |
> | Monitor guide | *"Retries are capped, then the task fails."* |
> | Task-detail guide | *"After the limit the engine gives up and fails the task rather than looping on your money forever."* |
>
> On the count, the drawio card agrees with PRD §8: *"max_attempts = attempts allowed / Fail on the 4th (default 3)"* allows three runs and refuses a fourth, as PRD §8 escalates *"when a rework edge would start a run past `max_attempts`"*. The conflict is only fail versus escalate. See [[Execution Open Questions]] #14.
>
> The flow designer's *Retries* field is not `max_attempts` one-to-one: the mockup defaults it to 2 against the PRD's 3. See [[Execution Open Questions]] #15.

## Retry semantics

- Retry *"does not reset the counter"* (PRD §8). So after a Retry the target is at `max_attempts + 1`; its next failure escalates again at once. *Inferred* from the rule; not stated.
- The monitor and inbox mockups add **Retry as-is** and **Allow host & retry** on a failure card. Allow host & retry *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt"* (monitor guide). Neither is in the PRD.

## Related

- [[Execution Index]]
- [[Rework Loop]]
- [[Stuck Detection And Fingerprints]]
- [[Failures And Escalated Loops]]
- [[Failures And Retries]]
- [[Attempts And Send Back]]
