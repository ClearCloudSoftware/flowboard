---
tags: [flowboard, escalation-and-notifications, behaviour, scope]
module: Escalation And Notifications
---

# Escalation Scope

What gets posted to chat. The sources disagree.

## Questions only (PRD)

Every written spec escalates **questions**, one at a time:

- The job is `escalate_question` (PRD §5, §10; `04` §10; backlog 6.1).
- The columns are on `questions`: `escalated_at`, `slack_channel`, `slack_ts` (PRD §5).
- The role: *"5-min timer → post the question to a channel"* (`04` §10).
- Feature map §13: *"If a question isn't answered within a set time…"*
- Drawio *Functional components*: *Human in the loop → Escalation*, *"unanswered too long"*.

## Every stop (drawio and mockups)

| Source | What it escalates |
|---|---|
| Drawio *Harness architecture*, concept 8 | *"Human escalation / Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack. Your call overrides the agent's."* |
| `inbox.html` | `isEscalated` applies to every card. `billing-webhook`, a **failure** card, shows `escalated · waited 42m 00s` at load. |
| `monitor.html:731` | The needs-you band tags any item past 10 minutes, including gates and failures. |
| `task-detail-guide.html` | *waiting on you*: *"How long the current gate or question has been open … Anything past your escalation window should already have reached you in chat."* |
| `monitor-guide.html` | Lists *Escalated* only under *a question*: *"After a set wait the question is also posted to your chat tool with the same buttons"*. |

The schema has nowhere to record an escalated gate or failure. The Human In The Loop set proposes `step_instances.escalated_at`, `notify_channel`, `notify_ref` ([[Human In The Loop Data Model]]).

> [!question] Open
> [[Escalation And Notifications Open Questions]] #3. Also [[Human In The Loop Open Questions]] #19 and [[Monitor Open Questions]] #10.

## What is never a notification

No source sends a notification for a run starting, finishing or failing, or for a task finishing. A failure card escalates (above) because it is a stop waiting on you, not a *run failed* ping. The one non-question alert in the sources is a feature-map idea, *"A team budget — give a team a monthly cap and alert its lead as it fills."* (§18), which belongs to Cost And Control. The parking-lot idea *"A trends dashboard — throughput over time, how fast questions get answered"* is a dashboard, not a notification.

> [!note] Not this component
> - In the capability library mockup, a sample agent's *used by* list includes a step named `notify` in a flow called *Release and rollback* (`capability-library.html`). That is a step in someone's flow, not FlowBoard notifying anyone.
> - *"Kick off work from outside — start a task straight from a GitHub issue, a Slack message, or on a schedule."* (feature map parking lot) is inbound task intake, the [[Component Documentation Tracker|Intake And Import]] component's territory.

## Related

- [[Escalation Timer]]
- [[Rendering Questions In Chat]]
- [[Failures And Escalated Loops]]
- [[Inbox Card Kinds]]
- [[Waiting And Escalation]]
