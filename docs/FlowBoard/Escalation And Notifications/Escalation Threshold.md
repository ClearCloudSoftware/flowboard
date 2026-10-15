---
tags: [flowboard, escalation-and-notifications, setting]
module: Escalation And Notifications
---

# Escalation Threshold

How long a question waits before it is posted to chat. The feature map calls it **Nudge timing**: *"How long a question waits before it escalates to chat."* (§19 Settings).

## Where it is set

| Source | Wording |
|---|---|
| PRD §10 | Fixed: *"`run_after = now + 5 minutes`"*. No setting. |
| `04` §10 | *"`now + settings.escalation_threshold_ms` (default 5 min)"* |
| `06` §15 | *"**Settings** (`settings` table): draft mode, escalation threshold (minutes), theme …"* |
| backlog Story 6.1 | *"`settings.escalation_threshold_ms` (default 5 min)"* (**PRD/NEW**) |
| backlog Story 8.3 | *"escalation threshold in minutes"* (**PRD/NEW**) |
| old design handoff | *"Escalation threshold is a setting (default 5 minutes); the prototype exposes it as a tweak."* |
| old design prototype | `escalationMinutes ?? 5` |

## The default

> [!warning] 5 minutes or 10?
> **5 minutes:** PRD §10, §14 M6 (*"5-minute timer"*), §16 (*"Leaving a question for 5 minutes"*); `04` §10 (*"5-min timer"*); backlog 6.1 and Story 10.1 (*"5‑min Slack escalation both directions"*); every drawio page (*"Escalate after 5 min"*, *"escalate at 5 min"*, *"escalate_question after 5 min"*, *"to Slack after 5 minutes"*); old brief (*"After five minutes a question escalates to Slack"*) and handoff.
>
> **10 minutes:** inbox mockup (`ESCALATE = 10 * MIN`, status bar *"escalation after 10m"*); inbox guide (*"Ten minutes without an answer…"*, *"10m, no answer"*, *"past the ten-minute window"*); monitor mockup (`> 10 * MIN`); mockups README (*"one card crosses the ten-minute threshold"*).
>
> Since the value is a setting, this is only the default. See [[Escalation And Notifications Open Questions]] #1.

> [!warning] Milliseconds or minutes?
> `04` §10 and backlog 6.1 name the key `escalation_threshold_ms`. `06` §15 and backlog 8.3 describe the setting in minutes. Probably minutes in the UI and milliseconds in storage, but no source says so. Open Questions #2.

## Changing it

The inbox guide gives the one tuning rule in the sources: *"If **from chat** is most of the total, you are not really using this screen — the escalation window is too short, or you are not here when agents ask."*

Nothing says whether a change applies to questions already waiting. Their `escalate_question` job already has a fixed `run_after` (PRD §10), so as written a change only affects new questions. See [[Escalation And Notifications Open Questions]] #19.

> [!question] No route changes it
> PRD §12 lists no settings endpoint. The same gap is raised for draft mode in [[Cost API And Routes]]. See [[Escalation API And Routes]].

## Related

- [[Escalation Timer]]
- [[Escalation Data Model]]
- [[Escalation Defaults And Sample Content]]
- [[Waiting And Escalation]]
