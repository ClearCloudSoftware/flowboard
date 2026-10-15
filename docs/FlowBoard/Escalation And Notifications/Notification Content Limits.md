---
tags: [flowboard, escalation-and-notifications, rule, security]
module: Escalation And Notifications
---

# Notification Content Limits

A chat message leaves the machine. FlowBoard is local-first (*"Single user, runs on my machine"*, PRD §1), so the message is the one place task content goes to a third party on purpose.

## The rule

| Wording | Source |
|---|---|
| *"Include the task title and question text in the Slack message, but not artifact bodies or file contents."* | PRD §10 |
| *"Never include artifact bodies or file contents in a notification — only task title + question text (PRD §10)."* | `04` §10 |
| *"Context the channel shows alongside the question (PRD §10: title + question text only, never artifact bodies)."* | `notifier.ts` (`QuestionContext` doc comment) |

## Allowed and not allowed

| Allowed | Not allowed |
|---|---|
| Task title | Artifact bodies (`plan.md`, `review.md`, `research_brief`…) |
| Question text | File contents from the worktree |
| Options of a select question (needed to render the buttons) | — |
| Step name (`QuestionContext.stepName`) | — |
| A deep link (`sessionUrl`) | — |

The rule names only title and question text. `QuestionContext` also carries the step name and a link, which the sources treat as within the rule.

> [!note] The question text is written by the agent
> An agent writes the `prompt`. Nothing stops it from pasting code or file content into a question, which would then go to chat. No source sets a length limit or a redaction pass. See [[Escalation And Notifications Open Questions]] #14.

## Related

- [[Rendering Questions In Chat]]
- [[Signed Inbound Interactions]]
- [[Slack Adapter]]
- [[Escalation And Notifications Overview]]
