---
tags: [flowboard, execution, behaviour, start]
module: Execution
---

# Starting A Task

How a task goes from the backlog to its first running step.

## Two moves: promote, then start

| Move | What it does | Source |
|---|---|---|
| **Promote** (Backlog → Todo) | Pins the flow version, creates the worktree | *"POST /api/tasks/:id/promote -- backlog -> todo, pin flow, create worktree"* (PRD §12) |
| **Start** (Todo → running) | Hands the task to the engine | backlog 2.1: *"**Start** (todo → running): decide auto‑start on promote vs explicit Start; expose it on the card and in the sheet."* (**GAP/DEC**) |

Feature map §3: *"**Start a task** — Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow."* And the open question: *"❓ Should starting a task happen automatically when you pull it out of the backlog, or be a separate "Start" button?"*

> [!question] D1: auto-start or a Start button
> Backlog decision D1: *"Auto‑start on promote vs explicit Start"*, default *"Explicit Start button on card + sheet; promote stays cheap"*. The drawio *FlowBoard ideation* card agrees: *"D1 · Auto-start on promote? / Default: explicit Start button on card + sheet; promote stays cheap."*
>
> The backlog intro records why it matters: *"**Todo → running had no UI trigger.** PRD implies promotion leads into the flow; the code added `POST /api/tasks/:id/start` with no button until 2026‑09‑09 (still uncommitted)."* The PRD's API list (§12) has no start endpoint.
>
> The mockup guides read the other way: promote **is** the start. The task-detail guide's lifecycle diagram draws *"you promote it"* from `backlog` straight to `running`, with no `todo` box. The monitor guide's beat 2, *"You promote it"*: *"The first step is now in line. It has a private copy of the repo waiting for it, but no worker yet"*. No mockup draws a Start button ([[Monitor Open Questions]] #24, [[Task Detail Open Questions]] #10). See [[Execution Open Questions]] #1 and [[Promoting A Task]].

## What promote does

From PRD §11 and backlog 2.1. No source gives the order of these steps. The intake side is [[Promoting A Task]]; the workspace side is [[Creating A Workspace]].

1. `git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>` (PRD §11).
2. *"Store both paths on the task."* (PRD §11)
3. *"pre‑create `.vibe/task-<id>`; append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog 2.1, **PRD/FIX**).
4. *"Pin `tasks.flow_id` at promotion; project flow edits never move in‑flight tasks."* (backlog 2.1, **PRD**)

Acceptance agrees: PRD §14 M2, *"Promote Backlog → Todo creates a worktree. No agents run yet."*; PRD §16, *"Promoting a task creates a git worktree on its own branch"*; backlog 10.1, *"Promote creates worktree + branch."*

> [!question] Which process runs `git worktree add`?
> PRD §12 puts *"create worktree"* in the promote route, in `apps/web`. The drawio draws the *Workspace manager* (*"git worktree add / remove per task"*) inside `apps/worker`, and `apps/web` as *"thin: validates, calls core, enqueues; never spawns agents"*. No job kind creates a workspace (PRD §5 `jobs.kind`; drawio *Job loop*). PRD §2 bans only *"a long-lived child process"* from route handlers, so a short `git` call in the route is allowed by the letter. See [[Execution Open Questions]] #69, [[Workspaces Open Questions]] #2 and [[Job Queue]].

`tasks.capability_pins` is *"set when the task starts"* (PRD §5). Whether that is promote or Start is not stated.

> [!warning] Pinned at promotion, or at start?
> The sources split on when the flow is pinned and the workspace made:
>
> | At promotion | At start |
> |---|---|
> | PRD §5 `tasks.flow_id`: *"null while in backlog, pinned on promotion"* | PRD §4: *"Flows are version-pinned at task start."* |
> | PRD §12: *"backlog -> todo, pin flow, create worktree"* | drawio *FlowBoard ideation*: *"Tasks pin flow_id at start"* |
> | PRD §11: worktree *"On promotion from Backlog to Todo"* | drawio *Functional components*: *"Start task / pin flow version"* |
> | backlog 2.1: *"Pin `tasks.flow_id` at promotion"* | feature map §3: *"Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow."* |
> | PRD §14 M2: *"Promote Backlog → Todo creates a worktree."* | feature map §14: workspace *"created when the task starts"* |
> | PRD §16: *"Promoting a task creates a git worktree on its own branch"* | architecture README: *"a task pins its version at start"* |
>
> While promote and Start were one move, the two readings were the same. Once D1 separates them, "task start" is ambiguous. See [[Execution Open Questions]] #2, [[Workspaces Open Questions]] #1 and [[Flow Design Open Questions]] #7.

The drawio *Harness architecture* page draws a different worktree path: *"<repo>/.flowboard/worktrees/task-<id> on branch fb/task-<id>"*. The task-detail mockup has a third: `~/.flowboard/ws/auth-refactor` on branch `flowboard/auth-refactor` (`task-detail.html`). See [[Execution Open Questions]] #3, [[Workspace Naming]] and [[Task Workspace]].

## What Start does

No source spells out the steps. From the drawio *Life of one step*:

> *"A You press Start, or the engine advances a task. A server action validates the request. B Next.js writes the task and step rows plus a start_run job, then returns. It never spawns anything."*

*Proposal*, assembled from PRD §5 and §8:

1. Set `tasks.status = 'running'`.
2. Create a `pending` step instance for every step definition with `is_entry = 1`.
3. Enqueue one `start_run` job per entry instance.

How many entry steps a flow may have is not settled. Backlog 5.1's validation lists *"exactly one entry"*, but `02` §2 states the same rule as *"exactly one producer"*, so "entry" there most likely means each `requires` entry, not the flow's entry step ([[Execution Open Questions]] #65). The seeded flow starts at `research`. See [[Step Definitions]].

## Going back

*"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* (backlog 2.1, **NEW**). Feature map §3: *"Send a task back to the backlog (keeping its workspace)"*. No demote endpoint is listed in PRD §12.

The task-detail mockup's **Send to backlog** is a wider move: *"Returns the task to the backlog, keeping its workspace and everything it produced."*, and it *"can happen from anywhere"*, including a running task. Whether it is the same action as demote, what it does to live runs, and whether a re-promote pins a newer flow version are not stated. See [[Demote And Re-Promote]], [[Workspaces Open Questions]] #9 and #10.

## On the screens

- Board: *"Drag is enabled only between Backlog and Todo — everything downstream is driven by the engine, and dragging there would lie about what the system does."* (PRD §13).
- The monitor has no promote or Start control ([[Monitor Open Questions]] #24).
- Task sheet: backlog 2.3 lists *"Retry, Cancel, Cleanup, Promote, Start, Demote."* (**PRD/GAP**). Backlog 9.4 asks for a *"keyboard equivalent for promote/demote"*; no key is named.
- The drawio *Functional components* Intake box: *"Promote Backlog → Todo / the only drag that means anything"*.

## Related

- [[Execution Index]]
- [[Task Lifecycle]]
- [[Version Pinning]]
- [[Task Workspace]]
- [[Execution Controls]]
- [[Promoting A Task]]
- [[Creating A Workspace]]
- [[Demote And Re-Promote]]
