---
tags: [flowboard, intake-and-import, roadmap, adapters]
module: Intake And Import
---

# Future Task Sources

Sources beyond a markdown file. None is in v1.

> **Room for other sources** — *"Built so future sources (issue trackers, webhooks) can plug into the same path."* — feature map §17

## Named adapters

| Source | Where named |
|---|---|
| GitHub Issues | architecture README (five-ports table), `05` §14, `task-source.ts` comment, `01-ports.md` id `'github'`, feature map §17 (*"tools like GitHub or Linear"*), drawio *FlowBoard ideation* |
| Linear | architecture README, `05` §14, `task-source.ts`, `01-ports.md` id `'linear'`, feature map §17, drawio |
| Jira | architecture README, `05` §14, drawio *FlowBoard ideation*. Not in the `01-ports.md` id union |
| webhook | architecture README, `05` §14, `task-source.ts`, `01-ports.md` id `'webhook'`, feature map §17 |

The architecture README's module layout reserves `adapters/source/markdown/  github/`. The drawio *Logical components* adapter box is labelled *"Markdown / Issues import"*. The PRD names none of them: its `adapters/` list has no `source/` folder (PRD §3).

## Related ideas

| Idea | Source |
|---|---|
| **Kick off work from outside**: *"start a task straight from a GitHub issue, a Slack message, or on a schedule."* | feature map parking lot |
| **Schedule trigger (later)**: *"cron-style rows in jobs → maintenance flows: knowledge-asset refresh, nightly gates"* | drawio *Harness architecture* (dashed) |
| An empty **Integrations** group | drawio *FlowBoard ideation* |

A Slack message as a task source is listed in [[Escalation And Notifications Roadmap]] as belonging here, not to escalation.

## What the port does not settle

All **open**; no source answers them. See [[Intake And Import Open Questions]] #25.

- **Push versus pull.** `fetch(input)` pulls from content or a path. A webhook pushes. How a webhook reaches `fetch` is not described.
- **Keys from trackers.** The rule is *"never trust an upstream/agent-supplied key"* (`task-source.ts`). Whether an issue number counts as upstream is not said.
- **Two-way sync.** Nothing says whether closing a task closes the issue.
- **Credentials and egress.** GitHub appears on the *Harness architecture* page only for *"skill install (git clone) · project remote"*.

## Related

- [[Intake And Import Index]]
- [[TaskSource Port]]
- [[Intake And Import Roadmap]]
- [[Intake And Import Open Questions]]
