---
tags: [flowboard, escalation-and-notifications, rule, idempotency]
module: Escalation And Notifications
---

# First Write Wins

Once a question is in two places, two people (or one person twice) can answer it. Only the first answer counts.

## The rule

| Wording | Source |
|---|---|
| *"**Idempotent answers.** First write wins. If the question is already `answered`, the second submitter gets "already answered by <channel>"."* | PRD §10 |
| *"First write wins via conditional UPDATE; loser sees "already answered by <channel>" (PRD wording)."* | backlog Story 6.2 |
| *"**Idempotent reconciliation:** first write wins via a conditional UPDATE; the loser sees "already answered by `<channel>`"."* | `04` §10 |
| *"Answer from anywhere — Answer in chat and the web updates; answer on the web and the chat message updates to show it's handled — and whoever answers first wins."* | feature map §13 |
| *"first answer wins, web or Slack"* | drawio *Harness architecture* |
| *"Whoever answers first wins. The loser is not an error; the second place simply closes."* | inbox guide |

## How

A conditional UPDATE: the write only takes effect if the question is still `pending`. Written out, that is roughly

```sql
-- illustrative; the sources name the technique, not the statement
UPDATE questions
   SET state = 'answered', answer = ?, answered_at = ?, answered_via = ?
 WHERE id = ? AND state = 'pending';
```

Zero rows changed means someone else won. Because both sides call "the *same* idempotent path" (`04` §10), there is one place where the race is decided.

## What the loser sees

> [!warning] A message, or nothing?
> PRD §10, `04` §10 and backlog 6.2 give the loser a message: *"already answered by <channel>"*. The inbox guide says *"The loser is not an error; the second place simply closes."* Both can hold if the message is quiet, but the sources don't say where it shows (an ephemeral Slack reply, an inbox toast) or what `<channel>` holds (`slack`, a channel name, a person). See [[Escalation And Notifications Open Questions]] #12.

## Interaction with other rules

| Rule | Effect |
|---|---|
| Undo window (backlog 4.4, D2) | An undo reopens a won question. *"`POST /api/questions/:id/unanswer` + `chat.update` on undo."* (**NEW**). See [[Answering Rules]]. |
| Cancellation | A cancelled question is no longer `pending`, so a late Slack answer loses. Nothing tells the Slack user why. |
| Park/resume race | *"answer arrives while the process is still exiting → … completion marks the step done without the agent ever seeing the answers"* (backlog 4.2, **BUG**). First-write-wins decides who answered; it doesn't fix this race. |
| Batches | The rule is per question. A batch can end up answered half on the web and half in Slack. |

## Related

- [[Resolve Everywhere]]
- [[Signed Inbound Interactions]]
- [[Answering Rules]]
- [[Escalation Lifecycle]]
