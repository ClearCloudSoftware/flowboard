---
tags: [flowboard, intake-and-import, behaviour, promote, lifecycle]
module: Intake And Import
---

# Promoting A Task

Moving a task from **Backlog** to **Todo**. It is the last step of intake and the first of execution. The drawio *Functional components* Intake card: *"Promote Backlog → Todo / the only drag that means anything"*.

This note covers promote from the intake side. What happens after, including Start, is in [[Starting A Task]].

## What promote does

> `POST /api/tasks/:id/promote` — *"backlog -> todo, pin flow, create worktree"* (PRD §12)

1. **Worktree.** *"Every task gets its own worktree so parallel steps cannot collide on the filesystem. On promotion from Backlog to Todo:"* `git -C <repo_path> worktree add <repo_path>/.vibe-worktrees/task-<id> -b vibe/task-<id>` (PRD §11).
2. **Paths.** *"Store both paths on the task."* (PRD §11): `branch_name`, `worktree_path`.
3. **Housekeeping.** *"pre‑create `.vibe/task-<id>`; append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean"* (backlog 2.1, **PRD/FIX**).
4. **Pin.** *"Pin `tasks.flow_id` at promotion; project flow edits never move in‑flight tasks."* (backlog 2.1). PRD §5: `flow_id` *"null while in backlog, pinned on promotion"*.
5. **Status.** `backlog` → `todo`.

Acceptance (PRD §16): *"Promoting a task creates a git worktree on its own branch"*. Backlog 10.1: *"Promote creates worktree + branch."*

```mermaid
stateDiagram-v2
  [*] --> backlog: create, import or seed
  backlog --> todo: promote (drag or button)
  todo --> backlog: demote (keeps worktree)
  todo --> running: Start (D1)
```

## Promote and Start

> [!question] D1: does promote start the task?
> Backlog decision D1, *"Auto‑start on promote vs explicit Start"*, recommends *"Explicit Start button on card + sheet; promote stays cheap"*. The drawio *FlowBoard ideation* card repeats it. Feature map §3 still asks: *"❓ Should starting a task happen automatically when you pull it out of the backlog, or be a separate "Start" button?"*
>
> The mockup guides draw promote as start. Monitor guide beat 2, *"You promote it"*: *"The first step is now in line. It has a private copy of the repo waiting for it, but no worker yet"*, with rule *"**research** queued"*. Task-detail guide: `backlog` → `running`, arrow *"you promote it"*, and no `todo` box.
>
> If D1 holds, "pinned at task start" (PRD §4) and "pinned on promotion" (PRD §5) stop meaning the same thing. See [[Version Pinning]], [[Execution Open Questions]] #2, [[Flow Design Open Questions]] #7, [[Intake And Import Open Questions]] #14.

## Ways to promote

| Way | Source |
|---|---|
| Drag a card Backlog → Todo | PRD §13; backlog 2.2 *"Native HTML5 drag only Backlog ↔ Todo; Todo drop target only while dragging."* |
| A Promote button in the task sheet | backlog 2.3: *"Retry, Cancel, Cleanup, Promote, Start, Demote."* (**PRD/GAP**) |
| A keyboard key | backlog 9.4: *"keyboard equivalent for promote/demote"* (**BUG**), key not named |

See [[Intake In The UI]].

## Going back: demote

Backlog 2.1 (**NEW**): *"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* PRD §12 has no demote route.

The task-detail mockup also has **Send to backlog** on a task that is already running: *"Returns the task to the backlog, keeping its workspace and everything it produced."* Its guide: *"**Pause**, **Send to backlog** and **Cancel** are not drawn because they can happen from anywhere."* Whether that is the same action as demote is [[Intake And Import Open Questions]] #16. See [[Task Actions]].

## What promote costs

Nothing. Monitor guide beats 1–2 show `$0` for both *In the backlog* and *You promote it*, and D1's reason is that *"promote stays cheap"*. A worktree is a local git operation.

## Related

- [[Intake And Import Index]]
- [[Starting A Task]]
- [[Task Workspace]]
- [[Version Pinning]]
- [[Intake In The UI]]
- [[Life Of A Task]]
