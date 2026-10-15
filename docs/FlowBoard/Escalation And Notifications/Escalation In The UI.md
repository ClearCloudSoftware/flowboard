---
tags: [flowboard, escalation-and-notifications, ui]
module: Escalation And Notifications
---

# Escalation In The UI

There is no mockup for escalation itself, and no mockup of the chat message. This note collects every place another screen shows escalation. It stands in for a Screen and Controls note.

> [!note] No controls
> The monitor guide: *"**Escalated** — automatic — Not a button. After a set wait the question is also posted to your chat tool with the same buttons; whoever answers first wins, and the other side updates itself."* Money: *"Nothing."* The only setting is the threshold ([[Escalation Threshold]]). The old design handoff adds two controls the mockups dropped: `expand ⏎` on a collapsed escalated batch, and an `undo` link on a card answered from Slack (see below).

## Inbox (`inbox.html`, `inbox-guide.html`)

| Where | What it shows | Rule in the mockup |
|---|---|---|
| Card meta, before the last 3 minutes | `waited 5m 00s` (`auth-refactor` at load) | no chip |
| Card meta, last 3 minutes | `escalates in 2m 14s` (*"still only here"*) in the guide's legend; the mockup shows `escalates in 18s · waited 9m 42s` on `provider-codex` at load | `soon = !escd && w > ESCALATE - 3 * MIN` |
| Card meta, past the threshold | `escalated · waited 12m 30s` (`csv-export` at load, *"also in chat now"*) | `isEscalated = waited(it) >= ESCALATE` |
| Topbar count | `4 waiting · 2 escalated` at load, `3 escalated` once `provider-codex` crosses | counts escalated cards in the current filter |
| Status bar | `escalation after 10m · answers sync both ways with chat` | guide: *"The escalation window, and the reminder that answers sync both ways with chat."* |
| Toast | `slack` tag + *"dana answered **pdf-import · plan** in chat — it's closed here too"*, gone after 5.2 s | fired 9 s after load; `pdf-import` waits on dana, so its card is not in the default *Waiting on me* view |
| Context panel, *answered today* | `questions 11`, `median reply 3m 20s`, `from chat 3 of 11` at load | from chat = slack answers in the list + 2 |
| Context panel, *recently answered* | each answer with a `web` or `slack` tag | — |
| Empty state | *"Nothing is waiting on you … you'll be nudged in chat if you're not here."* | — |

> [!note] The mockups README tells it in a different order
> *"one card crosses the ten-minute threshold while you watch; a few seconds later a teammate answers one in chat"* (`docs/mockups/README.md`). In the script the chat answer comes first (9 s) and the crossing second (18 s).

The `slack` tag uses the run colour (`.via.slack{border-color:var(--run);color:var(--run)…}`). The `escalated` chip uses the wait colour (`.esc{color:var(--wait);border:1px solid var(--wait)…}`); the countdown chip is grey (`.esc.soon{color:var(--ink-3);border-color:var(--line-2)}`). Both rules are in `inbox.html`; `monitor.html` repeats the first.

### The guide's walkthrough

*"Clearing it, start to empty"* branches at the end on *"Answer here"* or *"…in chat"*:

| Branch | Beat | What happens |
|---|---|---|
| Here | *You answer the escalated one here* | *"the chat message updates to **handled by you · just now**"*. *"Answering here does not leave a stale prompt sitting in chat — the message rewrites itself to show it is done."* |
| Chat | *A teammate answers it in chat* | toast *"dana answered **provider-codex · research** in chat — it's closed here too"*; the card vanishes; *"your cursor did not move"* |
| Chat | *The record says where it came from* | *recently answered* shows `provider-codex` with a `slack` tag; *"answered today 12 · from chat 4 of 12"* |

*"Every answer keeps its channel. The context panel counts how many came from chat, which is the honest measure of whether escalation is doing real work or just making noise."*

## Monitor (`monitor.html`, `monitor-guide.html`)

The needs-you band puts an `ESCALATED` tag before `waited …` when an item has waited more than 10 minutes (`monitor.html:731`), for gates and failures too. See [[Needs You Band]] and [[Waiting And Escalation]].

## Task detail (`task-detail-guide.html`)

The *waiting on you* number: *"How long the current gate or question has been open, ticking."* Watch for: *"Anything past your escalation window should already have reached you in chat."*

## The old design handoff (`docs/old/design/`)

| Element | Handoff | Mockup today |
|---|---|---|
| Countdown | `→ Slack in 0m 48s` in the open batch's header; the collapsed escalated batch has none | only in the last 3 minutes |
| Colour | *"`#8b8b93` under 2 minutes, amber `#fbbf24` from 2 minutes, and past the threshold (default 5 minutes) the batch border goes amber-dark and the escalated chip appears"* | chip only |
| Escalated chip | `escalated to Slack` | `escalated` |
| Escalated batches | *"Batches past the escalation threshold collapse by default."* (*"asserted, not user-tested — worth a flag"*), with `expand ⏎` | stay in the queue, oldest first; *"One card is open at a time"*, escalated or not |
| Footer | `answered today: 34 · median response 41s · escalation threshold 5m` | status bar and context panel |
| Answered from Slack | controls swap for *"Yes — answered in Slack"* + `undo`; *"No colour flash, no toast, no motion beyond the opacity change"*; after 10 s one line with a `Slack · 12s` stamp | a toast, and the card leaves |
| `answeredVia` | `'ui' \| 'slack'` | `web` / `slack` |

> [!warning] Toast or no toast
> The handoff rules out a toast for a card answered from Slack. The mockup shows one. See [[Escalation And Notifications Open Questions]] #15.

## Related

- [[Resolve Everywhere]]
- [[Escalation Lifecycle]]
- [[Human In The Loop Screen]]
- [[Monitor Screen]]
- [[Escalation Defaults And Sample Content]]
