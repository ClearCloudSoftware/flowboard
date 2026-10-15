---
tags: [flowboard, task-detail, behaviour, actions]
module: Task Detail
---

# Task Actions

Things you do to the **task itself rather than to a step** (task-detail guide, region 1). Gate actions (Approve, Send back) are in [[Deciding At A Gate]].

## The actions

| Action | Shown when (mockup) | What it does (guide wording) | Money (guide) | API (PRD §12) |
|---|---|---|---|---|
| **Pause** | task not done | *"Stops after the current run rather than mid-flight. The workspace stays."* | *"Stops future spend only."* | none |
| **Send to backlog** | task not done | *"Returns the task to the backlog, keeping its workspace and everything it produced."* | *"Same."* | none (backlog 2.1 *Demote* is todo → backlog only) |
| **Cancel task** | task not done (styled danger) | *"Stops any running agents and tidies up. The workspace survives until you clean it up."* | *"Anything in flight becomes wasted."* | `POST /api/tasks/:id/cancel` |
| **Open workspace** | every step done | not in the guide | — | none |
| **Clean up workspace** | every step done | *"Only offered once the task is finished or cancelled. Removes the branch and the folder."* | — | none |

In the mockup none of the topbar buttons does anything.

Actions the old sheet had to carry, from backlog Story 2.3: *"Retry, Cancel, Cleanup, Promote, Start, Demote. **PRD/GAP**"*. The mockup shows no Retry, Promote, Start or Demote, because it opens on a task already running.

## Pause

The feature map (§3) heads its bullet *"Pause, send back, or cancel"*, but the text describes only sending to the backlog and cancelling. No PRD status, column or endpoint represents a paused task. See [[Task Detail Open Questions]].

## Send to backlog

Feature map §3: *"Send a task back to the backlog (keeping its workspace)"*. The guide says the same for a task mid-flow. The PRD and backlog only define **demote** (todo → backlog), which *"keeps worktree; re‑promote reuses it"* (backlog Story 2.1). Open points: what happens to a live run, to the pinned flow version (`flow_id` is *"null while in backlog"*, PRD §5), and to `capability_pins` when a running task goes back to the backlog.

## Cancel

> **Pause, send back, or cancel** — Send a task back to the backlog (keeping its workspace), or cancel it — which stops any running agents and tidies up. — feature map §3

What "tidies up" means, from backlog Story 2.1 (**FIX**): *"Cancel: SIGTERM live runs, cancel pending questions, mark instances skipped."* A stopped run is finalised as `cancelled`, not `failed` (`03` §7–§8). Spend on a cancelled run moves to wasted (guide). The callout:

> [!warning] Stopping never refunds
> *"Cancelling a task, or sending a step back, does not recover what has already been spent — it moves that spend into wasted and stops the future spend. The only free decision on this screen is approving."* — task-detail guide

## Stop a run

The guide's pill table says that while running you can *"Watch, or stop the run from the story row if it is clearly lost."* The mockup has no stop control on a story row. Stopping is a live run viewer feature: *"A Stop button that kills the process."* (PRD §13), *"Stop = SIGTERM by pid from the route (same machine), finalize as `cancelled`."* (`03` §8). The drawio *Execution* group has a **Stop** card: *"kill the process"*.

## Retry and Fail task

At an escalation gate, PRD §8: *"**Retry** grants one more attempt and carries my note into it, like a rejection reason. It does not reset the counter. **Fail task** ends it."* Endpoint: `POST /api/step-instances/:id/retry`. No `fail` endpoint is listed. The guide's lifecycle draws *you retry* from failed back to running. See [[Attempts And Send Back]].

## Clean up workspace

See [[Task Workspace]] for which terminal states allow it. No endpoint is listed in PRD §12. The `Workspace.destroy` port method backs it.

## Related

- [[Task Detail Index]]
- [[Task Lifecycle]]
- [[Task Detail Controls]]
- [[Task Detail API And Routes]]
