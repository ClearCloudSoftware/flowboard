---
tags: [flowboard, task-detail, glossary]
module: Task Detail
---

# Task Detail Glossary

> [!warning] Overloaded words
> **acceptance criteria**, **attempt**, **retry**, **send back**, **waiting**, **done**, **failed**, **escalation**, **story** and **workspace** each mean more than one thing in the sources. Each one is flagged ⚠ below.

| Term | Meaning | Source |
|---|---|---|
| **Task** | *"The individual pieces of work — a feature, a bug, a question — that move through a recipe."* | feature map §3 |
| **Task detail** | The view of one task's whole story. A **sheet** in the PRD, the backlog and the drawio *ideation* page; a **page** in the mockup; the route `/t/[id]` on the drawio *Harness architecture* page. | PRD §13, drawio |
| **Acceptance criteria** | ⚠ On the task: *"the exact conditions that close the task"*. On a plan item: the *"accepts when"* line written by the Plan step. | PRD §5; mockup |
| **Non-goals** | *"what the agents must not touch or attempt"*; also enforced by the hook on path-shaped lines | PRD §5, §7 |
| **Step instance** | *"one task's occupancy of one step definition. Has state and artifacts."* | PRD §4 |
| **Run** | *"one attempt at a step instance"* | PRD §4 |
| **Attempt** | ⚠ A work attempt, counted against `max_attempts`. Not to be confused with a **run**: an infra retry is a new run *"with the same `attempt` number"*. Nor with `jobs.attempts`, which counts queue retries. | PRD §5, §7; `03` §7 |
| **Retry** | ⚠ (1) An **infra retry**: automatic, same attempt, not counted. (2) **Retry** at an escalation gate: *"grants one more attempt and carries my note into it"*. (3) The header's **retries**: Σ extra attempts. (4) The guide's *you retry* arrow from failed. | PRD §7, §8; mockup; guide |
| **Send back** | ⚠ (1) At a gate: reject with a reason, re-queuing the rework target. (2) **Send to backlog**: a task action. The feature map's *"Pause, send back, or cancel"* uses the second sense. | guide; feature map §3 |
| **Reject** | The PRD and API word for **send back** at a gate. | PRD §12 |
| **Gate** | A step instance in `awaiting_approval`. See [[Deciding At A Gate]] | PRD §8 |
| **Waiting** | ⚠ The guide's task state *"waiting · on you · $0/min"*: a gate or a question. Not a PRD status; maps to `running` or `blocked`. Also *queued*, waiting for a worker. | guide |
| **Blocked** | A PRD task status: a spent or stuck loop, a parked question, or a non-transient infra failure. Not shown as such on the screen. | PRD §5, §7, §8; backlog Story 4.2 |
| **Queued** | A step ready to run, *"waiting for a free worker"*. Not a PRD step state. | guide |
| **Pending** | A step *"Not started, and it can't be — something upstream is unfinished."* PRD §5 lists `pending` as an instance state without defining it. | guide; PRD §5 |
| **Done** | ⚠ A step done, or the whole task done. | — |
| **Failed** | ⚠ A run failed (infra), a step instance failed, or the task failed. Only the last means the task is over. | PRD §5 |
| **Outcome** | `pass` / `fail` on a step instance, set by a shell exit code, `set_outcome`, or `{"outcome":…}` in an artifact. *"A missing outcome is never a pass."* | PRD §8 |
| **Artifact** | *"the verbatim, within-task output — a real file on disk, git-tracked, diffable, the contract the next step reads"* | `05` §11 |
| **Workspace** | ⚠ The task's git worktree (the feature map's *"private copy of the code"*). Also the **Workspace port**, which can be a container. Not the per-run sandbox container. | feature map §14; `01` |
| **Worktree** | The git mechanism behind a v1 workspace: `git worktree add … -b <branch>` | PRD §11 |
| **Spine** | The header's row of one segment per step | mockup |
| **Story** | ⚠ The first tab: every step and its runs. Also the tracker's *"One task's whole story"* (mockups README: *"the whole story of one task"*), meaning the screen. | mockup; tracker |
| **Plan vs built** | The tab lining up `plan.md` items against the working tree | mockup |
| **Verdict** | One of *as planned*, *deviated*, *not built*, *unplanned*, on a plan item | guide |
| **Deviated** | *"Something was built for this item, but not what was asked."* | guide |
| **Unplanned** | *"A change nobody asked for."* | guide |
| **Hunk** | The diff excerpt behind a verdict | mockup |
| **Bill** | Kept + wasted. *"It never goes down."* | guide |
| **Kept** | *"spend on attempts whose output is still in the workspace"* | guide |
| **Wasted** | *"spend on attempts that were thrown away"*; `runs.wasted = 1` | guide; PRD §5 |
| **Agent time** | *"The sum of run durations. **Not** how long the task has been open."* | guide |
| **Waiting on you** | *"How long the current gate or question has been open, ticking."* | guide |
| **Recipe average** | Cost per task on the same flow version | mockup; PRD §13 |
| **Pinned** | The flow version and capability commits a task keeps until it finishes | PRD §4, §5 |
| **Park** | A run that ended its turn to wait for answers; resumed with `--resume … --fork-session` | PRD §9 |
| **Escalation** | ⚠ (1) A loop spent or stuck, handed to you as a gate. (2) A question posted to Slack after 5 minutes. PRD §10 escalates only questions; the guide's *waiting on you* and the drawio *Human escalation* concept send gates to chat too ([[Monitor Open Questions]] #10) | PRD §8, §10; guide; drawio |
| **Recipe** | The feature map's plain word for a flow | feature map §2 |
| **Promote** | Backlog → Todo: pin the flow, create the worktree | PRD §11, §12 |
| **Demote** | Todo → Backlog, keeping the worktree. Not the same as **Send to backlog**, which the guide allows *"from anywhere"* | backlog Story 2.1; guide |
| **Start** | Todo → running. A separate action under backlog D1 (a default, not decided); the guide's *you promote it* goes straight to running | backlog Story 2.1, D1; guide |
| **Pause** | *"Stops after the current run rather than mid-flight."* No PRD status | guide |

## Related

- [[Task Detail Index]]
- [[Task Detail Overview]]
- [[Flow Design Glossary]]
