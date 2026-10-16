---
tags: [flowboard, monitor, ui, detail]
module: Monitor
---

# Task Row Detail

Clicking a row in the [[Pulse View]] (or `↵` / `o`) opens an inline detail under it, in two blocks. Only one row is open at a time.

## Left block: steps and live output

| Part | Content |
|---|---|
| Header | `STEPS` and the task's repo (`flowboard/api`) |
| Step chips | One per step that has a run, queued ones included: `Label` then `model · duration · cost` (or `model · queued`), `· ×N` when retried. Petrol for running, brick for failed, ochre for held. A task with no runs at all shows *"Not started"* |
| Sent back | When a gate was rejected: `← <your reason>` |
| Log header | `LIVE — build` with `33m · $5.96` when a run is live, else `LAST OUTPUT` |
| Log | The agent's recent lines, styled by kind; a failed run adds `✕ <error>` |
| Actions | **Stop this run** (only while a run is live) · **See it on the timeline** · **See the flow** |

The log lines in the mockup are canned per task and reveal one line per 18 simulated seconds (1.8 s real at ×10), then loop. Their prefixes suggest the event kinds the real viewer would summarise:

| Prefix | Example | Matching `NormalizedEvent` (inferred) |
|---|---|---|
| `›` | `› read  docs/old/architecture/08-sandboxing.md (412 lines)` | `tool_use` summary |
| `✓` | `✓ 41 passed  (3.8s)` | `tool_result`, ok |
| `◆` | `◆ egress denied  registry.npmjs.org → adding to step allowlist` | `tool_result`, not ok |
| `⋯` | `⋯ thinking  (effort: high)` | `thinking` |

The mapping is an inference, not stated in any source ([[Monitor Open Questions]] #4).

## Right block: artifacts and spend

| Part | Content |
|---|---|
| Artifacts | Header *"the contract for the next step"*. One line per finished step: `.flowboard/<task-id>/<file>` and its size. Otherwise *"Nothing written yet."* Only `done` runs are listed, so a review held at the gate is missing ([[Monitor Open Questions]] #47) |
| Spend | *This task, so far*, *Burned on redone work* (brick when non-zero), and *Sandbox: container · default-deny egress*, a fixed string for every task ([[Monitor Open Questions]] #25) |

Artifact files in the mockup: `brief.md`, `plan.md`, `changes.patch`, `test-report.md`, `review.md`, `summary.md`. The path differs from PRD §6 (`<worktree>/.vibe/task-<id>/NN-<type>.<ext>`). See [[Monitor Open Questions]] #26 and [[Artifact Contract]].

## Against the task detail screen

PRD §13 opens a *task detail sheet* from the card. The task-detail mockup is a full screen with **Story**, **Plan vs built**, **Files** and **Cost** tabs. The row detail is a short version of it, and the monitor has no link to the full screen or to the [[Live Run Viewer]] ([[Monitor Open Questions]] #4).

## Related

- [[Pulse View]]
- [[Live Run Viewer]]
- [[Monitor Actions And Costs]]
- [[Artifact Contract]]
