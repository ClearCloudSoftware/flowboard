---
tags: [flowboard, human-in-the-loop, roadmap]
module: Human In The Loop
---

# Human In The Loop Roadmap

## v1 scope (PRD)

| Milestone | HITL content |
|---|---|
| **M4 — The question loop** | *"MCP server with `ask_user_batch`, blocking with the 20-minute sentinel, inbox page with all five control types, park-and-resume. Verify end to end with a trivial skill that asks three questions of different kinds."* |
| **M5 — Flow engine** | *"approval gates, rework loops with `max_attempts` escalation"*. Proof: *"a run that sets no outcome stops at a gate instead of passing."* |
| **M6 — Slack escalation** | *"5-minute timer, Block Kit rendering, interaction handler, idempotency and reconciliation both directions."* |
| **M9 — Memory** | *"a preference answered once in the inbox is recalled into the next task and not asked again"* |

> [!warning] The shipped code differs
> Of M4, only the MCP server is built (2026-10-18), for `run-agent`: `ask_user` and `ask_user_batch` in `packages/ask-user`, answered in the terminal. It has no 20-minute sentinel: both adapters lift their MCP time limits and the broker has none, so a question waits until it is answered ([[Run Agent CLI Decisions]] R20). See [[Ask User MCP Server]].

PRD §16 acceptance items for HITL:

- *"`/grill-me` asks a batch of questions that appear in `/inbox` with correct controls per kind"*
- *"Leaving a question for 5 minutes posts it to Slack; answering in Slack updates the web UI live, and vice versa"*
- *"A question left for 20 minutes parks the run; answering resumes it with the answers in context"*
- *"`explain` and `review` stop and wait for my approval; the rest advance automatically"*
- *"Rejecting a review sends the task back to `implement` as attempt 2, and three failed attempts fail the task"* (this conflicts with backlog D3's *escalate, never auto-fail*: [[Flow Design Open Questions]] #11)

Backlog Epics 4 (question loop) and 6 (Slack escalation), Story 5.2 (gates) and the Story 10.1 checklist carry these as stories, with the **BUG/FIX/GAP** items listed in [[Human In The Loop Runtime]]. The pitch counts *"the human-question loop"* and *"escalation"* among the eight build milestones.

A `manual` step kind is also in v1: PRD §5 has `kind` *"'ai' | 'shell' | 'manual'"* and the §13 flow editor offers *"an AI, shell or manual step"*. No rule says what it does or whether it reaches the inbox ([[Step Kinds]]; [[Execution Open Questions]] #6; [[Human In The Loop Open Questions]] #41).

## Designed beyond the PRD

| Feature | Where |
|---|---|
| Gates and failures as inbox cards, beside questions | inbox mockup; drawio harness *Inbox*; concept 8 |
| One open card at a time; answering opens the next | inbox mockup, guide |
| One question at a time in a batch, with pips, a tally and `←`/`→` | inbox mockup |
| Number default and unit; text placeholder; a *you decide* option | inbox mockup, guide |
| *Waiting on me / Everyone* filter, *waiting on <who>* | inbox mockup |
| Escalation countdown chip (last 3 min) and *escalated* chip | inbox mockup |
| Context panel: running now, burn rate, next decision, answered today, recently answered with channel | inbox mockup; old handoff right rail |
| Failure card: *Allow host & retry*, *Retry as-is* | inbox, monitor mockups |
| *Needs you* band and task-detail gate banner | monitor, task-detail mockups |
| Loading and *Lost the orchestrator* states; answered-elsewhere swap with `undo` | old handoff 1d, 1e; backlog Stories 4.3, 4.4 |

## Ideas

| Idea | Source |
|---|---|
| A "my inbox" filter | feature map §12 |
| A shared pool to claim from | feature map §12 |
| Nudge the right person (DM the assignee) | feature map §13 |
| An escalation ladder (backup or lead, SLA-style) | feature map §13 |
| More channels: Discord, email, webhook, desktop | feature map §13; architecture README ports table; `01-ports.md` (no desktop); drawio |
| Assign a step to a person or role | feature map §2 |
| Route the next human step to a teammate | feature map §4 |
| Two sign-offs on one gate | feature map §4 |
| Separation of duties | feature map §3 |
| Pull a teammate in with an @mention (*"no formal gate needed"*) | feature map §3 |
| A *who* stamped on every approve, reject and answer | feature map *Across everything* |
| Shared team memory of answers | feature map §21 |
| A trends dashboard including *"how fast questions get answered"* | feature map *Parking lot* |
| A human task as one of several step executors (a StepExecutor interface; `manual` itself is already a v1 kind, above) | `02` §3; architecture README open decision 1; feature map *Parking lot* (*"A step could also call a service or be a simple human checklist."*) |
| *"How an agent asks you questions from inside a sealed box"* (❓) | feature map §10; answered by the broker (PRD §9) |

## Out of scope for v1

- *"authentication, user accounts, roles"* (PRD §17), so there is no real *who* for a filter or a stamp.
- *"No auth, no multi-tenancy, no user table. Do not add them 'for later'"* (PRD §2).
- Channels beyond Slack: the PRD builds only a Slack adapter (§3) and calls Slack optional (§10). The Notifier port allows others later.
- The artifact-file fallback in practice: v1 is Claude-only (Capability Library **D1**), so every run has MCP. The build went further: OpenCode, built on 2026-10-18 as a second provider, takes an injected MCP server too; whether it is in v1 is [[Agent Providers Open Questions]] #38.
- *"A shared team tier"* (feature map *Parking lot*).

## Related

- [[Human In The Loop Open Questions]]
- [[Human In The Loop Overview]]
- [[Flow Design Roadmap]]
