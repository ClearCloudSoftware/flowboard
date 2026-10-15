---
tags: [flowboard, monitor, hitl, escalation]
module: Monitor
---

# Waiting And Escalation

What a task costs while it waits on you, and when the wait is pushed to another channel.

## Waiting costs time, not money

The monitor guide says a waiting task is free:

- Asking: *"paused, billing stops"* (state diagram).
- *"It saved its place and let go of its worker — from this moment it costs nothing to leave it waiting."* (beat 6)
- Gate: *"Until you do, the task occupies no worker and costs nothing."*
- *"leaving a question unanswered costs nothing but time."*

The inbox guide agrees: *"**a parked run is not billing you.** When an agent asks, it saves its place and lets go of its worker. Leaving the inbox full costs calendar time and a worker slot's worth of throughput — not money."* The lost throughput is the stalled task's: the slot itself is free.

The old design handoff disagrees: its inbox batch sub-line reads *"Blocked 4m 12s · burning idle."* ([[Monitor Open Questions]] #42).

The [[Timeline View]] shows this cost in time: *"Flat, hatched stretches are the hours nobody paid for — the board waiting on a human."*

> [!warning] The PRD keeps the run alive first
> PRD §9: the broker *"holds the shim's call open. After 20 minutes with no answer, return a sentinel"*. Only then does *"the runner see the process exit, set the run to `parked`"*. For those first 20 minutes the agent process is alive and blocked on the call, and nothing in the PRD releases its worker slot while it waits. The monitor and the inbox guide both show the slot freed at once. See [[Monitor Open Questions]] #8.

## Escalation

A needs-you card shows an **ESCALATED** tag once its wait passes the threshold.

| Source | Threshold | What escalates |
|---|---|---|
| `monitor.html:731` | `> 10 * MIN` | Any blocking item: gate, question or failure |
| `inbox.html` | `ESCALATE = 10 * MIN` | Questions, gates, failures (cards in the inbox) |
| Monitor guide | *"After a set wait"* | *"the question is also posted to your chat tool with the same buttons; whoever answers first wins, and the other side updates itself."* |
| PRD §10 | `run_after = now + 5 minutes` | `escalate_question`: questions only |
| PRD §16 | *"Leaving a question for 5 minutes posts it to Slack"* | Questions |
| Drawio | *Escalate after 5 min* (*Functional components*); *escalate_question after 5 min* (*Harness architecture*) | Questions. The harness concept *Human escalation*: *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* |
| Feature map §13, §19 | *"If a question isn't answered within a set time"*; **Nudge timing** is a setting | Questions |
| Backlog 8.3, `06` §15 | *"escalation threshold in minutes"* setting | — |
| Old handoff | *"past the threshold (default 5 minutes)"* | — |

Two open points: 10 minutes or 5 ([[Monitor Open Questions]] #9), and whether gates and failures escalate too (#10).

## After escalation

Answering anywhere resolves it everywhere. PRD §10: *"**Idempotent answers.** First write wins."* and *"Answering in Slack must update the open web page (the inbox subscribes to an SSE stream)."* The monitor's band needs the same live update. The full escalation design belongs to the Escalation And Notifications component.

## Related

- [[Needs You Band]]
- [[Timeline View]]
- [[Event Stream And SSE]]
- [[Monitor Open Questions]]
