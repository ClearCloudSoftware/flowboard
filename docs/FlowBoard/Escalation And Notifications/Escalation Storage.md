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

The tokens are host-side only. The sandbox mounts list *"never: ~/.ssh, cloud credentials, flowboard.db, docker.sock"* (drawio *Harness architecture*); PRD §11.1: *"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* The agent never talks to Slack: the worker posts, and the web app receives interactions (PRD §3, §12). See [[Sandbox Mounts]].

**Inference:** `.env.local` sits in FlowBoard's own directory, and a sandbox mounts only the task worktree, the step's plugin dirs and the ask socket (PRD §11.1, drawio), so the Slack secrets never reach a sandbox. No source says this about `.env.local` directly.

> [!note] Slack is not on the egress allowlist (inference)
> The sandbox allowlist holds *"the model endpoint and the package registries a build needs"* (PRD §11.1). Slack is not on it, and need not be: the Slack calls are made by host processes (the worker posts, PRD §3; `apps/web` receives interactions, PRD §12), outside any sandbox, the same host-side reasoning the sources apply to the `ask_user` broker and memory. No source mentions Slack in an egress context, or says which process makes the `chat.update` call. See [[Egress Allowlist]] and [[Host-Side Brokers]].

> [!note] Settings vs env
> The threshold lives in `settings` (where it is a setting at all; see [[Escalation Threshold]]), though no route edits it yet. The channel and tokens live in `.env.local` (PRD §10); no source says when they are read. No source puts channel choice in `settings`.

## What leaves the machine

Only the message. The rule allows task title and question text; the interface also carries the step name and a link, and select questions need their options ([[Notification Content Limits]]).

## Related

- [[Escalation Data Model]]
- [[Slack Adapter]]
- [[Human In The Loop Storage]]
- [[Environment And Configuration]]
- [[Egress Allowlist]]
