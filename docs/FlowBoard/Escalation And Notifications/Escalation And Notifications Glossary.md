---
tags: [flowboard, escalation-and-notifications, glossary]
module: Escalation And Notifications
---

# Escalation And Notifications Glossary

| Term | Meaning | Source |
|---|---|---|
| **Escalation** | Posting a still-pending question to a chat channel after the threshold passes. The question stays `pending` and stays in the inbox. | PRD §10, `04` §10 |
| **Escalated** | A waiting item past the threshold, now *"also in chat"*. Shown as an `escalated` chip. | inbox guide |
| **Escalation threshold** | How long a question waits before escalating. `settings.escalation_threshold_ms`, default 5 minutes (10 in the mockups; see [[Escalation Threshold]], Open Questions #1). Also called the *escalation window*. | `04` §10, backlog 6.1, task-detail guide |
| **Nudge timing** | The feature map's name for the threshold setting: *"How long a question waits before it escalates to chat."* | feature map §19 |
| **`escalate_question`** | The job kind that runs the timer. Enqueued on question insert with `run_after = now + threshold` (PRD §10 fixes it at *"now + 5 minutes"*). | PRD §5, §10; `04` §10, backlog 6.1 |
| **Notifier** | The port that hides the chat tool. Two methods: `postQuestion` and `updateResolved`. | `notifier.ts`, `01-ports.md` |
| **Channel** | One Notifier adapter: Slack, Discord, email, webhook, desktop, console. | `01-ports.md`, architecture README, `07` |
| **`inline_answer`** | A channel capability: *"renders native controls"* such as Slack blocks or Discord components. | `notifier.ts`, `01-ports.md` |
| **`link_only`** | A channel capability: *"sends a deep link to /inbox"*. | `notifier.ts`, `04` §10 |
| **`QuestionContext`** | What the channel shows next to the question: `taskTitle`, `stepName`, `sessionUrl?`. | `notifier.ts` |
| **`PostedRef`** | `{ channel, ref }`, the handle on a posted message. `ref` is *"Slack's `ts`, a Discord message id, an email thread id"*. | `notifier.ts` |
| **Block Kit** | Slack's message layout format. The Slack adapter renders each question kind as Block Kit. | PRD §10 |
| **`chat.postMessage` / `chat.update`** | The Slack API calls that post and repaint the message. `updateResolved` is the port's *"chat.update equiv"*. | PRD §10, `01-ports.md` |
| **Interaction** | A button press or modal submit coming back from Slack to `POST /api/slack/interactions`. | PRD §10, §12 |
| **Signing secret** | `SLACK_SIGNING_SECRET`, used to verify that an interaction came from Slack. | PRD §10 |
| **Replay window** | The 300 s limit on an interaction's timestamp. | backlog 6.2 |
| **First write wins** | Idempotent answers: the first answer is kept, the second is refused. | PRD §10, backlog 6.2 |
| **Reconciliation** | Repainting the other side after an answer: SSE to the web, `chat.update` to Slack. | PRD §10 |
| **Resolve everywhere** | *"answered once, closed in both places"*. | drawio *Functional components* |
| **`answered_via`** | Which side answered: `'web' \| 'slack'`. | PRD §5 |
| **From chat** | The inbox counter of answers that came from chat: *"the honest measure of whether escalation is doing real work or just making noise."* | inbox guide |
| **Socket Mode** | A Slack connection over an outbound WebSocket, so FlowBoard needs no public URL. Only in the drawio. | drawio *Harness architecture* |

## Overloaded words

> [!warning] "Escalate" means three different things
> 1. **Chat escalation** (this component): a pending question is also posted to chat. Nothing stops, nothing changes state.
> 2. **Loop escalation** (engine): *"Escalate, don't fail, when a loop is spent or stuck."* (PRD §8). The step goes to `awaiting_approval` and the task to `blocked`. This is a gate, not a message. See [[Failures And Escalated Loops]] and [[Attempts And Send Back]].
> 3. **Privilege escalation** (sandbox): *"No privilege escalation: `--security-opt no-new-privileges`"* (`08-sandboxing.md`). Unrelated.
>
> The drawio joins the first two: *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* Whether an escalated loop is also chat-escalated is [[Escalation And Notifications Open Questions]] #3.

> [!warning] "Channel" means three things
> - A **Notifier adapter** (Slack, Discord, email…).
> - A **Slack channel**: `SLACK_CHANNEL_ID`, `questions.slack_channel`, `PostedRef.channel`.
> - The **answering side** in the loser's message: *"already answered by <channel>"* (PRD §10), which reads like `answered_via` (`web` or `slack`).

> [!warning] "Chat", "Slack", "your chat tool"
> The PRD and backlog say *Slack*. The feature map and the mockups say *chat* or *your chat tool*. They mean the same thing today, because Slack is the only adapter.

> [!note] "Notification" is narrower than it sounds
> In the PRD and the architecture notes, a notification is only an escalated question. The drawio and the mockups widen it to every stop waiting on you: gates, failures and spent or stuck loops (see above). Nothing notifies on run finished or task done. See [[Escalation Scope]].

## Related

- [[Escalation And Notifications Index]]
- [[Escalation And Notifications Overview]]
- [[Human In The Loop Glossary]]
- [[Monitor Glossary]]
