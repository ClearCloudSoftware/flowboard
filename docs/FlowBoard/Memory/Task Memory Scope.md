---
tags: [flowboard, memory, scope]
module: Memory
---

# Task Memory Scope

`{ kind: 'task'; taskId: string }`: *"within a task, across attempts (rework warm-start)"* (`memory-store.ts`).

| | |
|---|---|
| Holds | *why attempt 1 failed, decisions taken mid-task* (`09-memory.md`) |
| Written from | *each run in the task* (`09`) |
| Read into | *the next attempt (rework loop)* (`09`) |
| PRD wording | *"`task` (why attempt 1 failed → attempt 2 starts warm)"* (PRD §11.2) |
| Mockup sample | `task`: *"Attempt 1 died on an egress denial — npmjs.org is now on this step's allowlist."* (task-detail aside) |
| Mem0 mapping | *"a `run_id`/session or a metadata namespace"* (`09`), not decided |

## The problem it fixes

*"A **rework loop** (attempt 2, 3) re-derives why attempt 1 failed from the artifacts alone."* (`09`). The feature map: *"within a *task* (so attempt 2 knows why attempt 1 failed)"*.

This is the one scope that does not cross the task boundary. It overlaps with what the [[Rework Loop]] already passes along: the failing step's artifacts in *"read these first"*, and a human's reject reason. See [[Artifacts Versus Memory]].

> [!question] Gaps
> - **Failed runs write nothing.** Commit happens *"after a run succeeds"* (PRD §7, §11.2). A rework after a `fail` outcome works, because a run that sets `fail` still exits 0. The mockup's egress-denial line describes an infrastructure failure, which is a failed run and so commits nothing. See [[Memory Open Questions]] #13.
> - **After the task ends** no source says whether task memories are kept, archived or deleted. See [[Memory Open Questions]] #18.
> - **Parallel branches** (`implement` ∥ `tests`) both write the task scope. No ordering rule; with `local` both are stored as written.

## Related

- [[Memory Scopes]]
- [[Rework Loop]]
- [[Attempts And Send Back]]
- [[Memory Carried Into A Task]]
- [[Memory Index]]
