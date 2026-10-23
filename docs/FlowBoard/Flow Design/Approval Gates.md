---
tags: [flowboard, flow-design, behaviour, gates]
module: Flow Design
---

# Approval Gates

> **Auto or approval** — Some steps move on by themselves when done; others stop and wait for your go-ahead. — feature map §2

## The setting

`step_defs.advance_mode` is `'auto' | 'approval'`, default `auto` (PRD §5). The mockup shows it as an **Approval** checkbox, *waits for you*, and the canvas marks a gated step with pause bars.

The flow-designer guide: *"The pause bars mean this step stops when its agent is done and waits for your approval before anything downstream starts."* Its field table adds: *"Whether the step stops and waits for you when it's done. This is what puts it in the monitor's *Needs you* band."*

As built in run-flow (2026-10-23), the setting is `gate: approval` on a step. When its run ends, the gate opens whatever outcome the run reported: `approval needed; it reported pass: <reason>`, with the outcome and reason only when set. The reason names no agent, so it reads right on a shell step too. See [[Run Flow Reference#Gates and their choices]].

## Advance modes

The drawio card *Advance modes* (page *FlowBoard ideation*): *"auto · wait for approval · wait for answers (park / resume via prompt replay)."* Only the first two are design-time choices. Waiting for answers happens whenever a run asks required questions.

After a run succeeds (PRD §8):

1. *"If the step has `advance_mode='approval'`, set the step instance to `awaiting_approval` and stop. It advances only when I click Approve."*
2. *"If the step has unanswered required questions, set `awaiting_answers` and stop."*
3. *"Otherwise mark it `done` and enqueue `advance_task`."*

## Gates you don't design

The engine also parks a step at a gate when:

- a step with conditional edges reports **no outcome** (*"no outcome reported"*);
- a rework loop is **spent** (`max_attempts`) or **stuck** (same check fingerprint twice).

As built in run-flow (2026-10-23), a spent loop reads `<target> has used <n> of <max> attempts` and a stuck one `<step> failed the same way twice`. Three more gates open by themselves: a fail that no route handles (`failed, and no edge handles a failure`), an agent run that did not write a declared output (`did not write: <types>`), and a run that failed rather than reporting a result (`run failed: <error>`), which includes a shell step that exits 126 or 127 or is killed by a signal.

The drawio concept 8 *Human escalation*: *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack. Your call overrides the agent's."*

## What approve and reject mean

*"Your call wins — If you approve or reject a step, your decision overrides whatever the agent concluded, and a rejection carries your reason into the next attempt."* (feature map §4). Backlog Story 5.2: *"reject sets `fail` + reason; reject with no `on_fail` edge fails the task."* So a gated step's `on_fail` edge decides where a rejection sends the work.

As built in run-flow (2026-10-23):

- **Reject is offered only when the step has an `on_fail` route** (the run-flow plan). Without one, the gate offers Approve, Retry this step and Fail the flow. **Fail the flow** is how a person fails the task; nothing else fails a flow.
- **Reject is a fail, so it also fires `always` routes.** An approval step with `always → ship` and `on_fail → fix` starts both when rejected; use `on_pass` for a route a rejection must not take. When the `on_fail` route is a rework route, the rework resets the `always` target instead (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]).
- **A note goes to the runs the decision starts.** Every gate asks *Note for the next run (optional)*. Approve's note goes to the steps its `on_pass` and `always` routes start; Reject's goes to the rework target, or to the targets of a forward `on_fail` route and of `always` routes. An agent run reads it as *"A person's note for this attempt: <note>"*; a shell run gets it as `FLOWBOARD_NOTE`. A note typed at Fail the flow is kept only in the run's `flow.jsonl` (also Claude's call).

## Choosing where to gate

| Advice | Source |
|---|---|
| *"No gate on the last step before a merge means nothing human ever sees the result."* | flow-designer guide, field table |
| *"Each gate is a place the flow stops and waits for a human. More gates, more of your time, fewer surprises."* / bad sign: *"Zero gates on anything that ships."* | flow-designer guide, *What to compare* |
| A step with no gate and no sandbox is flagged *unattended and unsandboxed* | flow-designer mockup inspector; see [[Step Guardrails]] |

The canvas bar counts gates (`1 approval gate`), and every variant card in an expanded library group shows its gate count. A single-author entry shows none.

## Where seeded flows gate

| Flow | Gated steps | Source |
|---|---|---|
| PRD seed | `explain`, `review` | PRD §15 |
| Software delivery @core v4 | `review` | flow-designer, monitor, task-detail mockups |
| Old design handoff | *"Plan needs approval"* | `docs/old/design/README.md` |

See [[Flow Design Open Questions]] #29.

## Ideas

- **Assign a step to a person or role** — *"a manual or approval step can name who does it (a specific teammate, or a role like 'reviewer')"* (feature map §2 ideas).
- **Two sign-offs on one gate** — *"the same 'join' that waits for parallel branches, applied to humans"* (feature map §4 ideas). Four flows in the mockup library carry two gates: *Code review* @team-sec v2, *Story refinement* @pm-guild v1, *Incident response* @team-sec v3 and *Launch campaign* @growth v4.
- **Team guardrails** — *"a review step must wait for approval"* as a rule nobody can quietly lift (feature map §16 ideas).
- **Separation of duties** — *"whoever ran the build can't be the one who approves its own review"* (feature map §3 ideas).

## Related

- [[Step Definitions]]
- [[Connections And Routes]]
- [[Step Guardrails]]
