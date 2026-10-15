---
tags: [flowboard, escalation-and-notifications, api]
module: Escalation And Notifications
---

# Escalation API And Routes

*"REST route handlers under `apps/web/app/api/`. All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12)

## In the sources

| Route | Role here | Source |
|---|---|---|
| `POST /api/slack/interactions` | Inbound Slack answers. Verify the signing secret: *"v0 HMAC on the raw body, 300 s replay window, `timingSafeEqual`"* | PRD §10, §12; backlog 6.2 |
| `POST /api/questions/:id/answer` | Web answers. Shares the idempotent path with Slack; triggers `chat.update` if escalated | PRD §12, `04` §10 |
| `GET /api/questions?state=pending` | The inbox feed | PRD §12 |
| `POST /api/questions/:id/unanswer` | Undo; *"+ `chat.update` on undo"* (**NEW**) | backlog 4.4 |
| SSE snapshot stream | *"pending + answered in last 2 min"*, *"so Slack answers repaint"*; path not named | backlog 4.3, `04` §9 |

## Outbound calls (Slack Web API)

| Call | When | Source |
|---|---|---|
| `chat.postMessage` | The escalation job posts a still-pending question | PRD §10 |
| `chat.update` | Web answer, Slack answer, undo | PRD §10, backlog 6.2 |
| A modal with `plain_text_input` | A `text` or `number` question's button is pressed | PRD §10 |

The PRD names only `chat.postMessage` and `chat.update`. Opening a modal needs one more Slack call, which no source names.

## Proposed

> [!warning] Proposal — not in any source
> Each is listed in [[Escalation And Notifications Open Questions]].

| Endpoint | Why | OQ |
|---|---|---|
| `GET /api/settings`, `PATCH /api/settings` with the threshold | Nudge timing is a setting (feature map §19, backlog 8.3) but PRD §12 has no settings route. Same endpoint [[Cost API And Routes]] proposes for draft mode. Field name and unit wait on #2 (`escalation_threshold_ms` in `04` §10 and backlog 6.1; minutes in backlog 8.3 and `06` §15). | #17, #2 |
| No new route for Socket Mode | If Slack moves to Socket Mode, `POST /api/slack/interactions` goes away and the worker holds the socket | #6 |

## Related

- [[Signed Inbound Interactions]]
- [[Resolve Everywhere]]
- [[Human In The Loop API And Routes]]
- [[Escalation Runtime]]
