---
tags: [flowboard, human-in-the-loop, behaviour, rules]
module: Human In The Loop
---

# Answering Rules

The rules that decide whether an answer counts, which answer wins, and what happens around it.

## First write wins

> [!quote] PRD §10
> *"**Idempotent answers.** First write wins. If the question is already `answered`, the second submitter gets 'already answered by <channel>'."*

- *"First write wins via a conditional UPDATE; loser sees 'already answered by <channel>' (PRD wording)."* (backlog Story 6.2)
- Web and chat write through one path: *"writes answers back through the **same** idempotent path as the web inbox, so web and channel can't diverge."* (`04` §10)
- The guide's version: *"Whoever answers first wins. The loser is not an error; the second place simply closes."* And: *"The same question is never open in two places once it's been answered in one."*

## Required and optional

| Source | Rule |
|---|---|
| PRD §5 | `required INTEGER NOT NULL DEFAULT 1`, per question |
| `question.ts` | *"Defaults to true; a run parks only while a required question is unanswered."* |
| Backlog Story 4.1 | *"Return only once every required answer is present; ignore `answers.value` null."* |
| Inbox guide | *"Free text counts as answered even when empty, because 'nothing to add' is a real answer. Every other shape has to be given a value before Submit lights up."* Submit is *"Greyed until every non-optional question has a value."* |
| Inbox mockup | `answered()`: `text` is always answered; `many` needs one pick or more; the rest need a value |

The mockup ties optional to the free-text kind; the PRD ties it to a per-question flag. See [[Human In The Loop Open Questions]] #11.

## Your cursor is yours

> [!important] inbox guide
> *"An answer from someone else does not move your cursor. If a teammate closes a card while you are mid-batch, that card disappears and you carry on where you were — the queue re-orders around you rather than under you."*

The mockup's `resolve()` keeps focus where it is unless the closed card was the focused one. The old handoff: *"resolution never moves the row the developer is currently on, and never re-sorts the batch"*. It also kept `draftAnswers` *"local until submit, so a partly-typed textarea survives a push update to another row."*

## Answers stay local until you submit

In the mockup, picks live in a client-side `answers` map until **Send answer** or **Submit all**. Moving away with `j`/`k` keeps them (*"Your answers are kept."*). The old handoff's `draftAnswers` is the same idea.

## Every answer keeps its channel

`answered_via` records `'web' | 'slack'` (PRD §5). The guide: *"Every answer keeps its channel. The context panel counts how many came from chat, which is the honest measure of whether escalation is doing real work or just making noise."* And: *"If from chat is most of the total, you are not really using this screen — the escalation window is too short, or you are not here when agents ask."*

## Undo

> [!warning] Undecided
> - Feature map §11: *"❓ Keep a short 'undo' window after you answer, or make answers final."*
> - Backlog Story 4.4: *"**Decide:** keep the 10 s undo (costs 10 s per batch for the agent and delays resumes) or drop it and make Slack/web answers final. If kept: hold only in the web path, not inside the MCP tool."* Plus `POST /api/questions/:id/unanswer` and `chat.update` on undo.
> - Backlog decision D2, a default recommendation: *"Drop from the MCP path; keep web-side undo only while no agent is waiting."* The drawio card *D2 · Keep the 10 s undo window?* gives the same default.
> - The old handoff has an `undo` link on answered rows, matching *"the 10s collapse"*. `04` §10 repaints *"on web answer, channel answer, and undo"*, and `01-ports.md` says *"repaint on answer/undo"*.
> - The inbox mockup has no undo.
>
> See [[Human In The Loop Open Questions]] #16.

## Answers feed memory

With memory on, *"When you answer a question in the inbox, or reject a step with a reason, FlowBoard remembers it."* (feature map §21). See [[Answers And Memory]].

## Related

- [[Question Lifecycle]]
- [[Escalation To Chat]]
- [[Question Shapes]]
- [[Answers And Memory]]
