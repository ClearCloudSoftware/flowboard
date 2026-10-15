---
tags: [flowboard, escalation-and-notifications, concept, slack]
module: Escalation And Notifications
---

# Slack Adapter

The only v1 [[Notification Channels|channel]]. PRD §10 specifies it; backlog Epic 6 breaks it into stories.

## What it does

| Step | Slack API | Source |
|---|---|---|
| Post a pending question | `chat.postMessage` using Block Kit | PRD §10 |
| Remember the message | Store `slack_channel` and `slack_ts` (and `escalated_at`) | PRD §10, backlog 6.2 |
| Receive an answer | `POST /api/slack/interactions` | PRD §10, §12 |
| Verify the sender | v0 HMAC on the raw body, 300 s replay window, `timingSafeEqual` | backlog 6.2 |
| Repaint after an answer | `chat.update` *"to show it is resolved and by whom"* | PRD §10 |
| Repaint on undo | `chat.update` | backlog 4.4, 6.2 |

The drawio *Logical components* adapter card reads *"Slack / Block Kit + signature check"*.

## Configuration

*"Slack config (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID`) lives in `.env.local`. If the token is absent, log the escalation and carry on — Slack is optional."* (PRD §10)

| Variable | Used for |
|---|---|
| `SLACK_BOT_TOKEN` | Calling `chat.postMessage` and `chat.update`. Its absence switches escalation to log-only. |
| `SLACK_SIGNING_SECRET` | Verifying interactions. See [[Signed Inbound Interactions]]. |
| `SLACK_CHANNEL_ID` | The one channel every escalated question is posted to. |

## Rendering

See [[Rendering Questions In Chat]] for the kind-to-block table and the content rule.

## Connection mode

> [!warning] HTTP endpoint or Socket Mode?
> PRD §10 and §12 use an inbound HTTP endpoint, `POST /api/slack/interactions`, verified with the signing secret. The drawio *Harness architecture* page instead has *"Escalation + Notifier / escalate_question after 5 min · Slack Socket Mode + Block Kit, so no public URL"* and an external box *"Slack / Socket Mode WebSocket, outbound only"*. FlowBoard is *"Single user, runs on my machine"* (PRD §1), so Slack has no public URL to call unless one is tunnelled. The drawio's other pages keep the HTTP-style check (*"Signature check on Slack interactions"*). See [[Escalation And Notifications Open Questions]] #6.

## Status

Backlog Story 6.3: *"Unit tests (signature, shapes, idempotency, modal) exist; **run once against a real workspace** — never done."* (**GAP**). The backlog preamble: *"keyboard nav, drag, React Flow canvas interactions and Slack were never exercised live."* Acceptance checklist (PRD §16): *"Leaving a question for 5 minutes posts it to Slack; answering in Slack updates the web UI live, and vice versa"*.

## Related

- [[Notifier Port]]
- [[Rendering Questions In Chat]]
- [[Signed Inbound Interactions]]
- [[Escalation Storage]]
- [[Escalation And Notifications Index]]
