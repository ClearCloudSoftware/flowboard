---
tags: [flowboard, escalation-and-notifications, roadmap]
module: Escalation And Notifications
---

# Escalation And Notifications Roadmap

## v1 scope (PRD)

**M6 — Slack escalation.** *"5-minute timer, Block Kit rendering, interaction handler, idempotency and reconciliation both directions."* (PRD §14). It comes after M4 (the question loop) and M5 (the flow engine).

| In v1 | Source |
|---|---|
| `escalate_question` job at a threshold, skip if answered or posted | PRD §10, backlog 6.1 |
| Log-and-continue without a token | PRD §10, backlog 6.1 |
| Block Kit per kind, modal for text and number | PRD §10, backlog 6.2 |
| `POST /api/slack/interactions` with signature verification | PRD §10, backlog 6.2 |
| First write wins; loser told *"already answered by <channel>"* | PRD §10, backlog 6.2 |
| `chat.update` on web answer, Slack answer, undo | PRD §10, backlog 6.2 |
| SSE snapshot so Slack answers repaint the inbox | PRD §10, backlog 4.3 |
| Escalation threshold as a setting | backlog 6.1, 8.3 (**PRD/NEW**) |
| Cancel a failed run's pending questions so they stop escalating | `04` §9, backlog 3.2 (**PRD/BUG**) |

Acceptance (PRD §16): *"Leaving a question for 5 minutes posts it to Slack; answering in Slack updates the web UI live, and vice versa"*. Backlog Story 10.1: *"5‑min Slack escalation both directions (live)."*

## Owed from the first build

| Item | Tag | Source |
|---|---|---|
| Run once against a real Slack workspace | **GAP** | backlog 6.3 |
| Failed runs' questions keep escalating | **BUG** | backlog 3.2 |
| One stream instead of three pollers | **BUG (perf)** | backlog 4.3 |
| Undo: keep or drop | **DEC** | backlog 4.4, D2 |

## Designed beyond the PRD

| Design | Source |
|---|---|
| The **Notifier port**, with `inline_answer` / `link_only` capabilities | `01-ports.md`, `04` §10, `notifier.ts` |
| Channel-neutral `PostedRef` and `QuestionContext` | `notifier.ts` |
| A `ConsoleNotifier` | `07-ports-in-practice.md` |
| Slack over **Socket Mode**, no public URL | drawio *Harness architecture* |
| Escalate every stop, not only questions | drawio concept 8, inbox and monitor mockups |
| Countdown, `escalated` chip, `from chat` measure, answered-in-chat toast | inbox mockup and guide |

## Ideas

| Idea | Source |
|---|---|
| **Nudge the right person** — the assignee's own DM | feature map §13 💡 |
| **An escalation ladder** — backup or lead after a second wait | feature map §13 💡 |
| **More channels** — Discord, email, webhook, desktop | feature map §13, architecture README, drawio |
| A *"my inbox"* filter and a shared pool to claim from | feature map §12 💡 |
| A trends dashboard including *"how fast questions get answered"* | feature map parking lot |

See [[Personal Routing And Ladders]] and [[Notification Channels]].

## Out of scope

| Item | Source |
|---|---|
| Authentication, user accounts, roles | PRD §2, §17 |
| Multi-machine support | PRD §17 |
| Notifications for anything other than a waiting decision | not in any source; see [[Escalation Scope]] |
| Starting tasks from a Slack message | feature map parking lot; Intake, not this component |

## Related

- [[Escalation And Notifications Index]]
- [[Escalation And Notifications Open Questions]]
- [[Human In The Loop Roadmap]]
