---
tags: [flowboard, escalation-and-notifications, defaults, seed]
module: Escalation And Notifications
---

# Escalation Defaults And Sample Content

Escalation ships no seed data. PRD §15 seeds a project, a flow, agents and skills; none of them configures a channel. These are the defaults and the sample figures the mockups use.

## Defaults

| Setting | Default | Source |
|---|---|---|
| Threshold | 5 minutes (mockups: 10) | PRD §10, `04` §10, backlog 6.1; see [[Escalation Threshold]] |
| Channel | Slack if `SLACK_BOT_TOKEN` is set, otherwise log only | PRD §10 |
| Target | `SLACK_CHANNEL_ID`, one channel | PRD §10 |
| Replay window | 300 s | backlog 6.2 |
| Recently-answered window on the SSE snapshot | 2 minutes | backlog 4.3 |
| Undo window | 10 s in the first build; keep or drop undecided. D2's default: *"Drop from the MCP path; keep web‑side undo only while no agent is waiting"* | backlog 4.4, D2 |
| Park after | 20 minutes (`VIBE_ASK_TIMEOUT_MS` overrides for tests) | PRD §9, backlog 4.1 |

## Mockup sample content

From `inbox.html` and `inbox-guide.html`:

| Item | Sample |
|---|---|
| Threshold shown | `escalation after 10m` |
| Escalated at load | `billing-webhook · build` (failure, waited 42m), `csv-export · plan` (batch, waited 12.5m), `pdf-import · plan` (question for dana, waited 21m) |
| Escalates during the demo | `provider-codex · research` (waited 9.7m at load) |
| Not escalated | `auth-refactor · review` (gate, waited 5m) |
| Answered from chat | `pdf-import · plan` by dana, 9 s after load: *"Northwind, Acme, anything with a table"* |
| Toast | *"dana answered **pdf-import · plan** in chat — it's closed here too"* |
| Recently answered | `inbox-keyboard · review` *"Approve the keyboard map?"* → *Approved*, `slack`, 38m ago; two `web` answers |
| Answered today | 11, median reply 3m 20s, from chat 3 of 11 |
| Guide walkthrough | `4 waiting · 2 escalated`; *"handled by you · just now"*; *"answered today 12 · from chat 4 of 12"* |

The monitor mockup uses the same 10-minute cut (`monitor.html:731`).

## Old design handoff

| Item | Sample |
|---|---|
| Threshold | 5 minutes; *"the prototype exposes it as a tweak"* (1–30 min) |
| Countdown | `→ Slack in 0m 48s` |
| Footer | `answered today: 34 · median response 41s · escalation threshold 5m` |
| Answered from Slack | *"Yes — answered in Slack"*, then `Slack · 12s` |

## Related

- [[Escalation Threshold]]
- [[Escalation In The UI]]
- [[Seeded Questions And Gates]]
