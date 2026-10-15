---
tags: [flowboard, escalation-and-notifications, storage]
module: Escalation And Notifications
---

# Escalation Storage

| What | Where | Source |
|---|---|---|
| Escalation state of a question: `escalated_at`, `slack_channel`, `slack_ts` | `questions` in `data/flowboard.db` | PRD §3, §5 |
| Who answered, from where: `answered_via`, `answered_at` | `questions` | PRD §5 |
| Pending timers | `jobs` rows, `kind = 'escalate_question'`, `run_after` | PRD §5, §10 |
| Threshold | `settings` (`escalation_threshold_ms`) | `04` §10, backlog 6.1 |
| Slack secrets and target | `.env.local`: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` | PRD §10 |
| The escalation log line when there is no token | the worker's log | PRD §10 (*"log the escalation and carry on"*) |
| The message itself | Slack | — |

*"Only `apps/web` and `apps/worker` open the SQLite file"* (PRD §3). The drawio *Harness architecture* SQLite box lists `questions` and `jobs (run_after, lease)` among *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*.

## Secrets

The tokens are host-side only. The sandbox mounts list *"never : ~/.ssh, cloud credentials, flowboard.db, docker.sock"* (drawio *Harness architecture*), and the agent never talks to Slack: the worker posts, and the web app receives interactions (PRD §3, §12).

> [!note] Settings vs env
> The threshold lives in `settings`, editable at runtime. The channel and tokens live in `.env.local` (PRD §10); no source says when they are read. No source puts channel choice in `settings`.

## What leaves the machine

Only the message. The rule allows task title and question text; the interface also carries the step name and a link, and select questions need their options ([[Notification Content Limits]]).

## Related

- [[Escalation Data Model]]
- [[Slack Adapter]]
- [[Human In The Loop Storage]]
