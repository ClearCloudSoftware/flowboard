---
tags: [flowboard, task-detail, screen, tabs]
module: Task Detail
---

# Task Detail Tabs

*"Same task, four questions. Number keys 1–4 switch between them."* — task-detail guide

| Key | Tab | Count badge | Answers (guide) | Reach for it when (guide) |
|---|---|---|---|---|
| `1` | **Story** | number of steps (6) | *"What happened, in order, and what each step cost."* | *"You want the narrative — including the question you answered and the attempt that failed."* |
| `2` | **Plan vs built** | plan rows, including unplanned (4) | *"Did we build what we said we would?"* | *"**Always, before approving.** It is the only view that compares intent against the working tree."* |
| `3` | **Files** | changed files + artifacts (4 + 5 = 9) | *"What exists now, and where."* | *"You want to open an artifact, or see the shape of the diff before reading it."* |
| `4` | **Cost** | none | *"Where the money went, and how much of it was wasted."* | *"The bill looks high, or you are deciding whether a retry is worth paying for."* |

Switching tabs scrolls the page back to the top. The screen opens on **Story** with Build expanded.

## Story

One row per step, in flow order. The row head shows the run icon, step name, `agent · model · effort`, duration (or `waiting 5m`, or `not started`), cost (with `+$0.48 wasted` under it), and `↺ n`. Clicking a row toggles it. Several rows can be open at once.

An expanded row shows, in order:

1. the failed attempt, as a red band (*"✕ attempt 1 — … — $0.48 spent on that attempt and thrown away."*)
2. the question you answered, as an ochre block (see [[Questions Within A Task]])
3. the log (see [[Step Instances And Runs]])
4. the artifact chip (`brief.md 4.1 kB`), or *"Nothing written yet."*

## Plan vs built

See [[Plan Versus Built]].

## Files

Two lists:

**artifacts** — *"what each step produced — the contract the next step reads"*. One row per step that wrote one: path `.flowboard/auth-refactor/<file>`, the step, the size.

**working tree** — *"4 files · +165 −16 · on flowboard/auth-refactor"*. One row per changed file with `+a −d`. In the mockup the list is derived from the plan rows' files, so a change not tied to any plan row or unplanned row could not appear.

Closing note: *"Everything here is an ordinary file in this task's own copy of the repo, committed on its own branch — nothing is hidden in a database. The workspace stays until you clean it up, and only once the task is finished or cancelled."*

> [!question] Committed by whom?
> *"committed on its own branch"* appears in the Files note and the guide. The drawio says artifacts are *"committed alongside the code"*. The PRD only says the files live in the worktree and *"git tracks the files"* (§6). The agent is denied `git push` and checkout of the base branch by the hook (PRD §7), and *"the host does all git work"* (PRD §11.1). No source says when or by whom a commit is made.

## Cost

See [[Task Cost And Wasted Spend]].

## Ideas not on the tabs

- **A link to each run in the live viewer**: PRD §10 puts *"a link to the live session"* on inbox rows. Task detail has none.
- **Compare any two artifacts**: *"compare two of them (like the plan against the final summary) side by side"* (feature map §15). The mockup compares only the plan against the tree.
- **Replay any past run**: *"step through exactly what happened, to debug it after the fact"* (feature map parking lot). The drawio keeps *"data/runs/<id>/spec.json + raw stream, replayable at $0"*.

## Related

- [[Task Detail Index]]
- [[Task Detail Screen]]
- [[Task Detail Controls]]
- [[Task Detail Marks]]
