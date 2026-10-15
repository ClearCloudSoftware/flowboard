---
tags: [flowboard, escalation-and-notifications, rule, security]
module: Escalation And Notifications
---

# Notification Content Limits

A chat message leaves the machine. FlowBoard is local-first (*"Single user, runs on my machine"*, PRD §1), but task content already goes to the model provider on every run (the sandbox egress allowlist holds *"the model endpoint"*, PRD §11.1). The chat message is a second third party, and the only one a human reads.

## The rule

| Wording | Source |
|---|---|
| *"Include the task title and question text in the Slack message, but not artifact bodies or file contents."* | PRD §10 |
| *"Never include artifact bodies or file contents in a notification — only task title + question text (PRD §10)."* | `04` §10 |
| *"Context the channel shows alongside the question (PRD §10: title + question text only, never artifact bodies)."* | `notifier.ts` (`QuestionContext` doc comment) |

## Allowed and not allowed

| Named by the rule | Outside the rule, but the interface carries it | Not allowed |
|---|---|---|
| Task title | Options of a select question (needed to render the buttons) | Artifact bodies (`plan.md`, `review.md`, `research_brief`…) |
| Question text | Step name (`QuestionContext.stepName`) | File contents from the worktree |
| — | A deep link (`QuestionContext.sessionUrl`) | — |

> [!warning] The rule and its own interface disagree
> All three wordings allow *"title + question text only"*. The `QuestionContext` that carries that comment also has `stepName` and `sessionUrl`, and `07`'s `ConsoleNotifier` prints the step name. No source says whether these count as within the rule. Options have to go out for the buttons to work, but no source says so either. See [[Escalation And Notifications Open Questions]] #14.

> [!note] The question text is written by the agent
> An agent writes the `prompt`. Nothing stops it from pasting code or file content into a question, which would then go to chat. No source sets a length limit or a redaction pass. See [[Escalation And Notifications Open Questions]] #14.

## Related

- [[Rendering Questions In Chat]]
- [[Signed Inbound Interactions]]
- [[Slack Adapter]]
- [[Escalation And Notifications Overview]]
