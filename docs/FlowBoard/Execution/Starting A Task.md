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

## What promote does

From PRD §11 and backlog 2.1:

1. `git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>` (PRD §11).
2. *"Store both paths on the task."* (PRD §11)
3. *"pre‑create `.vibe/task-<id>`; append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog 2.1, **PRD/FIX**).
4. *"Pin `tasks.flow_id` at promotion; project flow edits never move in‑flight tasks."* (backlog 2.1)

`tasks.capability_pins` is *"set when the task starts"* (PRD §5). Whether that is promote or Start is not stated.

The drawio *Harness architecture* page draws a different worktree path: *"<repo>/.flowboard/worktrees/task-<id> on branch fb/task-<id>"*. See [[Execution Open Questions]] and [[Task Workspace]].

## What Start does

No source spells out the steps. From the drawio *Life of one step*:

> *"A You press Start, or the engine advances a task. A server action validates the request. B Next.js writes the task and step rows plus a start_run job, then returns. It never spawns anything."*

*Proposal*, assembled from PRD §5 and §8:

1. Set `tasks.status = 'running'`.
2. Create a `pending` step instance for every step definition with `is_entry = 1`.
3. Enqueue one `start_run` job per entry instance.

How many entry steps a flow may have is a flow-design question; the seeded flow has one (`research`). See [[Step Definitions]].

## Going back

*"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* (backlog 2.1, **NEW**). Feature map §3: *"Send a task back to the backlog (keeping its workspace)"*. No demote endpoint is listed in PRD §12.

## On the screens

- Board: *"Drag is enabled only between Backlog and Todo — everything downstream is driven by the engine, and dragging there would lie about what the system does."* (PRD §13).
- The monitor has no promote or Start control ([[Monitor Open Questions]] #24).
- The drawio *Functional components* Intake box: *"Promote Backlog → Todo / the only drag that means anything"*.

## Related

- [[Execution Index]]
- [[Task Lifecycle]]
- [[Version Pinning]]
- [[Task Workspace]]
- [[Execution Controls]]
