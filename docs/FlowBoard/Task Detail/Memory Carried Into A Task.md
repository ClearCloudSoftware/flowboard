---
tags: [flowboard, task-detail, behaviour, memory]
module: Task Detail
---

# Memory Carried Into A Task

The aside's **carried in from memory** block shows what the task started with. The guide's region 5: *"what memory it started with"*.

## On the screen

| Tag | Line |
|---|---|
| `you` | *Prefers vitest; never suggest jest for this repo.* |
| `project` | *Auth lives in src/auth; sessions are Redis-backed with a 14-day refresh window.* |
| `task` | *Attempt 1 died on an egress denial — npmjs.org is now on this step's allowlist.* |

## The mechanism (sources)

- Memory is **off by default** and additive: *"with it off, every flow behaves exactly as this spec describes"* (PRD §11.2).
- Four scopes: `user`, `project`, `agent`, `task` (PRD §11.2, feature map §21). The `task` scope is *"why attempt 1 failed → attempt 2 starts warm"*.
- Recall happens **per run**, not per task: *"Before a step runs, FlowBoard hands the agent the relevant things it has already learned"* (feature map §21). It becomes prompt part 7, *"labelled as background rather than instructions"*, capped at `max_recall_chars` (default 6,000) (PRD §7).
- *"Recall the `user` scope into every run; `project`/`agent`/`task` per step."* (`09-memory.md`)
- The audit trail is `run_memories(run_id, memory_id, scope)`: *"recording what was recalled into each run"* (PRD §11.2), used *"for the audit trail and for a 'why did it think that?' trace"* (`09`).

## Gaps

- **Per task or per run?** Recall is per run, so different steps see different memories. The aside shows one list for the whole task. `run_memories` could fill a per-run view in the story row (a suggestion; [[Memory API And Routes]] proposes a task-level union for the aside). Same as [[Memory Open Questions]] #9.
- **The `agent` scope is missing** from the mockup's three tags, and the tag `you` is not a scope name: the PRD and `09` call that scope `user`.
- **When memory is off**, no source says whether the block is hidden or shows an empty state.
- **The `task` line is mid-task.** *"Attempt 1 died on an egress denial"* was written during this task, so it was not *carried in*. It reads as task-scope memory created by attempt 1 and recalled into attempt 2. But memory commits only after a run succeeds (PRD §7: *"after a success the runner also `write()`s"*; PRD §11.2: *"Commit, after a run succeeds"*), and attempt 1 failed. See [[Memory Open Questions]] #13 and [[Task Memory Scope]].
- **The allowlist claim.** *"npmjs.org is now on this step's allowlist"* implies someone changed the step's egress allowlist mid-task. Under [[Version Pinning]], a running task keeps its flow version, so a step-level change should not reach it. Yet the inbox guide says **Allow host & retry** *"adds the blocked host to that step's allowlist, then re-queues the run"*, and the monitor guide *"Adds the blocked host to this step's egress allowlist, then re-queues the run as the next attempt"*: a step-definition edit that does reach the running task. Whether that makes a new flow version is open; see [[Task Detail Open Questions]] #12 and [[Flow Design Open Questions]].

## Related

- [[Task Detail Index]]
- [[Questions Within A Task]]
- [[Attempts And Send Back]]
- [[Memory In The UI]]
