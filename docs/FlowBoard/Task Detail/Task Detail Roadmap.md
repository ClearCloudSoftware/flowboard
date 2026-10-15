---
tags: [flowboard, task-detail, roadmap]
module: Task Detail
---

# Task Detail Roadmap

## v1 scope (PRD)

What PRD §13 asks of the **task detail sheet**, with the related acceptance items:

- [ ] *"Timeline of step instances with state, attempts, cost and duration."* Backlog Story 2.3 adds model and effort per step (**GAP**).
- [ ] *"Artifacts listed as links that open a rendered markdown viewer."* (JSON as `<pre>`, backlog Story 2.3)
- [ ] *"Approve / Reject buttons on the step that is awaiting approval."* Reject asks for a reason (backlog Story 2.3 **BUG**).
- [ ] *"A diff view between `plan.md` and `summary.md` when both exist"*, side by side (backlog Story 2.3 **GAP**). PRD §16: *"The task detail sheet diffs `plan.md` against `summary.md`"*.
- [ ] Retry, Cancel, Cleanup, Promote, Start, Demote (backlog Story 2.3 **PRD/GAP**).
- [ ] Loading and error states (backlog Story 2.3 **BUG**).
- [ ] Worktree on promotion, cleanup only by explicit action (PRD §11, §16 *"Promoting a task creates a git worktree on its own branch"*).

Milestone: **M2** *"Tasks and board, no automation … Promote Backlog → Todo creates a worktree"* (PRD §14). The sheet's run, gate and diff content depends on M3–M5.

## Designed beyond the PRD (mockup and guide)

| Feature | Where |
|---|---|
| A full page with a header, spine and four tabs, instead of a sheet | mockup |
| Plan vs built as **per-item verdicts** against the working tree, with hunks | mockup, guide |
| Kept / wasted / bill per task, and the recipe average | mockup Cost tab |
| Agent time vs wall clock, *waiting on you* timer | mockup header, guide |
| The gate banner stating the reviewer's findings | mockup |
| The aside: owner, workspace, pinned flow and newer-version notice, memory, questions, timeline | mockup |
| Status bar with sandbox posture | mockup |
| Pause, Send to backlog, Open workspace | mockup |
| Keyboard `a`, `r`, `Esc`, `1`–`4` | mockup |
| The three alphabets, the queued vs pending distinction | guide |
| *"Stopping never refunds"* and *"Approving is free"* as stated rules | guide |

## Ideas (feature map)

- **An owner per task** — *"hand it off or reassign it as it moves"* (§3)
- **Pull a teammate in** — *"@mention someone on a task to drop a light 'take a look' into their inbox"* (§3)
- **Separation of duties** — *"whoever ran the build can't be the one who approves its own review"* (§3)
- **Two sign-offs on one gate**, **route the next human step to a teammate** (§4)
- **Discuss an artifact** — comments with @mentions on the plan or review (§15)
- **Spend by person and team** (§18)
- **Show who owns what** on the board (§5)
- Parking lot: **Replay any past run**, **Check for hidden manipulation** (injection scan of artifacts), **A trends dashboard** (*"cost per feature"*)

All the team ideas rest on *"identities for the people involved"* (feature map, *Across everything → Teams & collaboration*).

## Later (drawio dashed)

- **Isolate the workspace**: *"devcontainer / Docker sandbox / remote host later"* (*Functional components*)
- **Container workspace** adapter (*Logical components*)
- **Injection scan (later)**: *"LLM Guard over artifacts before the next step or memory trusts them"* (*Harness architecture*)
- **Knowledge assets (later)** (*Harness architecture*)

## Out of scope

*"Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace"* (PRD §17). So an **owner** other than *you* is out of v1.

## Related

- [[Task Detail Index]]
- [[Task Detail Open Questions]]
- [[Task Detail Sources]]
