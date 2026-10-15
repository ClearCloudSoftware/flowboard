---
tags: [flowboard, human-in-the-loop, concept, inbox]
module: Human In The Loop
---

# Inbox Card Kinds

Everything waiting on a person is one card in the queue. The inbox guide names four kinds:

| Card | Icon | What it is | What it asks of you | Cost of acting |
|---|---|---|---|---|
| **question** | `?` | *"One question from a step that is parked until it has an answer."* | *"Pick, then send."* | *"Nothing."* |
| **batch** | `?` | *"Five to eight questions posed together by one step."* | *"Work through them, then submit as one."* | *"Nothing."* |
| **gate** | `‖` (pause bars) | *"A step finished and wants approval before anything downstream starts."* | *"Approve, or send it back with a reason."* | *"Approving is free. Sending back moves the last attempt's spend to wasted."* |
| **failure** | `✕` | *"A step ran out of attempts. Nothing is running; nothing is being spent."* | *"Decide whether to retry, and whether to change anything first."* | *"The failed attempts are already spent. Retrying spends again."* |

Questions, batches and gates use the amber *wait* colour. Failure cards use the red *fail* colour: the card body is tinted, and an open failure card has a red left rule (mockup CSS). The old handoff used two colours for *"act now"* (amber for a question with a clock, accent for an approval) where the mockups use one ([[Monitor Open Questions]] #43). The sample gate is a passed review; PRD §8 opens a gate for three different reasons (approval mode, *"no outcome reported"*, a spent or stuck loop), and the mockups give no wording for the other two ([[Monitor Open Questions]] #33).

## What each card offers

| Card | Primary | Others | Detail |
|---|---|---|---|
| question | `↵ Send answer` (disabled until answered) | — | [[Question Shapes]] |
| batch | `↵ Submit all N` | `← Prev`, `Next →`, pips | [[Question Batches]] |
| gate | `a Approve` | `r Send back`, `Open the task` | [[Approving And Sending Back]] |
| failure | `↵ Allow host & retry` | `Retry as-is`, `Open the log` | [[Failures And Escalated Loops]] |

## Where each kind comes from

| Card | Engine state behind it | Source |
|---|---|---|
| question / batch | `questions.state='pending'`; the step instance is `awaiting_answers` once parked | PRD §5, §9 |
| gate | step instance `awaiting_approval` (advance mode, no outcome reported, or a spent or stuck loop) | PRD §8 |
| failure | Not defined. The closest PRD states are the escalated-loop gate (`awaiting_approval`, task `blocked`) and a non-transient run failure (task `blocked`) | PRD §7, §8; see Open Questions #24 |

> [!warning] Questions only, or everything?
> PRD §10 specifies the inbox as *questions*: *"Every pending question across all projects"*. Approve and Reject live on the task detail sheet (§13). The mockup, the drawio harness page (*"questions, approval gates, escalated loops"*) and drawio concept 8 (*"Every stop (gate, question, spent or stuck loop) lands in one inbox"*) put gates and failures in the inbox too. `04` §9 adds *"`a` approves the focused gate"*. See [[Human In The Loop Open Questions]] #1.

## Sample queue (inbox mockup)

| Card | Task · step | Kind | Waited | On | Summary |
|---|---|---|---|---|---|
| 1 | `billing-webhook · build` | failure | 42m | you | *Attempt 3 of 3 failed — egress denied to api.stripe.com* |
| 2 | `csv-export · plan` | batch (5) | 12.5m | you | *5 questions from one step — answer them together* |
| 3 | `provider-codex · research` | question (pick one) | 9.7m | you | *Codex CLI reports no per-call cost — how should we record spend?* |
| 4 | `auth-refactor · review` | gate | 5m | you | *Review passed with 2 notes — approve, or send it back?* |
| 5 | `pdf-import · plan` | question (pick many) | 21m | dana | *Which supplier PDF layouts must it handle on day one?* |

Card 5 is hidden under *Waiting on me*. Under *Everyone* the queue sorts by age, so card 5 (21m) comes second. Nine seconds after load, dana answers it in chat. A toast announces it, even under *Waiting on me* where the card was never shown, and it moves to *recently answered* with a `slack` tag. About 18 s after load card 3 (`provider-codex`, 9.7m) crosses the 10-minute threshold while you watch.

The monitor seeds different questions for the same tasks: `csv-export · plan` is a single pick-one (*Stream from Postgres / Stage to object storage / Decide it yourself*), and `provider-codex · research` has waited 8m with *Estimate from tokens / Record as unknown*.

## Related

- [[Human In The Loop Screen]]
- [[Inbox Order And Filters]]
- [[Decisions Outside The Inbox]]
- [[Needs You Band]]
- [[Escalation Scope]]
