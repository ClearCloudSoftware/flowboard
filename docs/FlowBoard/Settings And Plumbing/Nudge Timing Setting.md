---
tags: [flowboard, settings-and-plumbing, settings, escalation]
module: Settings And Plumbing
---

# Nudge Timing Setting

Feature map §19: *"**Nudge timing** — How long a question waits before it escalates to chat."* The architecture calls it the **escalation threshold**.

Escalation And Notifications documents it in full in [[Escalation Threshold]]. That covers the default (5 or 10 minutes), the unit (ms or minutes), and whether a change affects waiting questions. The settings-side facts are below.

| Aspect | What the sources say |
|---|---|
| Key | `settings.escalation_threshold_ms` (`04` §10, backlog 6.1) |
| Unit | milliseconds in the key (`04` §10, backlog 6.1); minutes in `06` §15's list of the `settings` table and in backlog 8.3's settings story. No source says which unit the UI shows |
| Default | 5 minutes, stated as a default only in `04` §10, backlog 6.1 and the old handoff. PRD §10 (also §14 M6, §16) and the drawio fix the value at 5 minutes with no setting at all. The inbox and monitor mockups, the inbox guide and the mockups README use 10 minutes ([[Escalation And Notifications Open Questions]] #1) |
| Range | 1–30 minutes, only in the old design prototype (`escalationMinutes`, `min:1, max:30`) |
| Read by | the `escalate_question` job, scheduled at *"`now + settings.escalation_threshold_ms`"* (`04` §10) |
| Before it was a setting | PRD §10 fixes it: *"enqueue an `escalate_question` job with `run_after = now + 5 minutes`"* |

The threshold is read when the question is inserted, because that is when the job's `run_after` is computed (PRD §10, `04` §10). So, as written, a change only reaches questions asked afterwards ([[Escalation And Notifications Open Questions]] #19).

## Related

- [[Escalation Threshold]]
- [[Escalation Timer]]
- [[Settings Catalogue]]
- [[Settings Defaults]]
