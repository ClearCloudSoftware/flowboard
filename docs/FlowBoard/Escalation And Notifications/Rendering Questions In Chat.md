---
tags: [flowboard, escalation-and-notifications, behaviour, rendering]
module: Escalation And Notifications
---

# Rendering Questions In Chat

How an escalated question looks in the channel.

## One schema, three renderers

*"the `questions` artifact *is* the schema. One JSON shape — `{ id, prompt, help?, kind, options?, required? }` per question, five `kind`s (`yes_no|single_select|multi_select|text|number`) — drives three renderers with zero divergence: the MCP tool return, the `/inbox` controls, and the Slack/Discord blocks (10). Define it once in `core/hitl`."* (`04` §9)

`question.ts` says the same: *"one shape that drives three renderers: the ask_user MCP tool return, the /inbox controls, and the Notifier's channel blocks (Slack, Discord, …). Defined once so they cannot diverge."* See [[Question Shapes]].

## Kind → Block Kit (Slack)

| `kind` | Inbox control (PRD §10) | Slack Block Kit (PRD §10) |
|---|---|---|
| `yes_no` | two Buttons, Yes / No | *"an `actions` block of buttons, one per option"* |
| `single_select` | RadioGroup, or Buttons if ≤3 short options | *"an `actions` block of buttons, one per option"* |
| `multi_select` | Checkbox list with a Submit button | *"a `multi_static_select`"*; backlog 6.2 adds *"+ submit"* |
| `text` | Textarea, Cmd+Enter to submit | *"a button that opens a modal with a `plain_text_input`"* |
| `number` | Input type=number | *"a button that opens a modal with a `plain_text_input`"* |

Backlog 6.2 summarises: *"Per‑kind blocks (buttons / `multi_static_select` + submit / modal `plain_text_input`)"*.

> [!warning] "The same controls"
> The inbox guide promises more than the PRD delivers: *"posted to your chat tool with the same controls on it"*, and a shape *"looks and behaves the same everywhere you might answer it — here, or in chat."* The monitor guide: *"with the same buttons"*. In Slack, text and number go through a modal, and a number arrives as plain text. Nothing says how a number answer from Slack is validated. See [[Escalation And Notifications Open Questions]] #5.

## What the message carries

| Field | Source |
|---|---|
| Task title | `QuestionContext.taskTitle`; PRD §10 |
| Step name | `QuestionContext.stepName` |
| Question text (`prompt`) | PRD §10 |
| Controls for the kind | PRD §10 (for `inline_answer` channels) |
| Deep link to the live session or inbox row | `QuestionContext.sessionUrl?`; *"a deep link to `/inbox`"* for `link_only` |

Not stated: whether `help` text, the project, the wait so far, or the asking agent are included.

What it must not carry is in [[Notification Content Limits]].

## After an answer

The repainted message shows *"it is resolved and by whom"* (PRD §10). The inbox guide's wording: *"the chat message updates to **handled by you · just now**"*. See [[Resolve Everywhere]].

## Batches

> [!question] One message per question, or one per batch?
> `escalate_question` is enqueued *"When a question is inserted"* (PRD §10), so a five-question batch posts five messages. The mockup escalates the batch card as one (`csv-export`, *"5 questions from one step"*, `escalated · waited 12m`). The inbox guide explains why a batch is one card: *"Answering one at a time would mean the agent wakes, finds it still can't proceed, and parks again"*. The same argument applies in chat. See [[Escalation And Notifications Open Questions]] #4 and [[Question Batches]].

## Related

- [[Slack Adapter]]
- [[Notification Content Limits]]
- [[Question Shapes]]
- [[Notifier Port]]
