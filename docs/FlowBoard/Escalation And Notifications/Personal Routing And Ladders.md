---
tags: [flowboard, escalation-and-notifications, idea, teams]
module: Escalation And Notifications
---

# Personal Routing And Ladders

Ideas, not spec. Today every escalated question goes to one place, `SLACK_CHANNEL_ID` (PRD §10).

## The ideas

| Idea | Wording | Source |
|---|---|---|
| **Nudge the right person** | *"escalate a waiting question to the assigned teammate's own DM instead of one shared channel."* | feature map §13 💡 |
| **An escalation ladder** | *"if they don't answer in time, bump it up to their backup or lead (an SLA-style hop, reusing the existing nudge timer)."* | feature map §13 💡 |
| **More channels** | *"Slack today → Discord, email, webhook, desktop tomorrow."* | drawio ideation |

`04-hitl-and-notify.md` opens by describing *"the escalation ladder that chases the human across channels"*, but §10 only specifies one hop to one channel.

## What they need first

Both ideas need to know who a question is for. The sources have pieces of that:

| Piece | Source |
|---|---|
| Inbox mockup: `who: 'you'` or `who: 'dana'` on each item; a *"waiting on dana"* label; a *Waiting on me* / *Everyone* filter (`mine` / `all`) | `inbox.html` |
| *"A "my inbox" filter — each teammate sees only what is waiting on them."* | feature map §12 💡 |
| "Teams & collaboration — … identities for the people involved, light roles and permissions … and a *who* stamped on every human approve/reject/answer in the record." | feature map *Across everything* |
| *"Local-collab first — named people, assignees, and per-person routing need no accounts server"* | feature map *Across everything* 💡 |

And one hard limit: *"No auth, no multi-tenancy, no user table. Do not add them "for later""* (PRD §2), and *"Do not build: authentication, user accounts, roles"* (PRD §17).

A ladder could reuse the job: *"reusing the existing nudge timer"* suggests a second `escalate_question`-style job at a later `run_after`. No source designs it.

> [!question] Open
> Who owns a question, and where is that stored? See [[Escalation And Notifications Open Questions]] #10 and [[Human In The Loop Open Questions]] #4.

## Related

- [[Notification Channels]]
- [[Escalation Timer]]
- [[Escalation And Notifications Roadmap]]
