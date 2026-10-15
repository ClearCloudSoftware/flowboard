---
tags: [flowboard, execution, internals, queue]
module: Execution
---

# Job Queue

The `jobs` table is how the web process hands work to the worker. Feature map §8: *"A to-do list for the system itself, so slow jobs happen in the background instead of freezing the screen."*

## Why a queue

- *"Next.js route handlers must never spawn a long-lived child process; they enqueue jobs and the worker picks them up"* (PRD §2).
- *"**Hand off the slow work** — The screens never run agents directly; they drop a job on the queue and a background worker picks it up."* (feature map §8)
- *"Job queue decoupling route handlers from process spawning → the worker can become a fleet later, for free."* (architecture README). The drawio *Job queue + worker* card: *"Route handlers enqueue; the worker spawns processes. Becomes a fleet later, for free."*

## The table

```sql
CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- 'start_run'|'advance_task'|'escalate_question'|'import_backlog'
  payload    TEXT NOT NULL,
  run_after  INTEGER NOT NULL,
  state      TEXT NOT NULL,   -- 'queued'|'leased'|'done'|'failed'
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  leased_at  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX jobs_ready ON jobs(state, run_after);
```

(PRD §5)

## Job kinds

| Kind | Enqueued by | Does | Source |
|---|---|---|---|
| `start_run` | Start, `advance_task`, rework, resume, infra retry | builds the command and launches one run | PRD §7, §9 |
| `advance_task` | a step marked `done` | *"resolves outgoing edges from the completed step definition"* | PRD §8 |
| `escalate_question` | question insert, `run_after = now + 5 minutes` | posts to Slack if still pending | PRD §10. Backlog 6.1 and `04` §10 make the delay a setting: *"`escalate_question` at `now + settings.escalation_threshold_ms` (default 5 min); skip if answered or already posted."* The inbox mockup escalates after 10 minutes, and the monitor mockup tags needs-you items past 10 minutes ([[Execution Open Questions]] #59, [[Escalation Timer]]). |
| `import_backlog` | `POST /api/import/backlog` | backlog import; pasted `content` *"goes to a temp file, enqueues `import_backlog` with `cleanup`, returns `{queued}`; worker deletes the temp file"* | backlog 7.3 (**NEW (uncommitted)**); [[Import Job Lifecycle]] |
| `resume_step`? | — | *"`jobs.kind` includes `resume_step` (or drop it, see 4.4)."* (**DEC**) | backlog 1.1 |

The drawio *Job loop* card lists the four PRD kinds. The drawio also draws a *Schedule trigger (later)*: *"cron-style rows in jobs → maintenance flows: knowledge-asset refresh, nightly gates"*.

No job kind creates a task's worktree, though the drawio puts the *Workspace manager* in the worker ([[Starting A Task]], [[Execution Open Questions]] #69, [[Workspaces Open Questions]] #2).

The `payload` shapes are not specified, beyond backlog 7.3's `cleanup` flag on `import_backlog`. *Proposal:* `start_run` `{ stepInstanceId, attempt, resume?: { sessionId, answers } }`; `advance_task` `{ taskId, stepInstanceId }`. Listed in [[Execution Open Questions]] #34.

## Leasing

*"The worker leases jobs from the `jobs` table (`UPDATE ... SET state='leased' WHERE id = (SELECT ...)` inside a transaction, with a stale-lease reclaim after 10 minutes)."* (PRD §7)

Backlog 3.1 (**PRD**): *"Lease inside a transaction with `UPDATE … WHERE id=(SELECT … LIMIT 1) RETURNING`; stale‑lease reclaim at 10 min; `attempts`/`last_error`; concurrency cap `VIBE_MAX_RUNS`."*

*Illustrative* shape (columns from PRD §5; the query text is not in any source):

```sql
UPDATE jobs SET state = 'leased', leased_at = :now, attempts = attempts + 1
WHERE id = (
  SELECT id FROM jobs
  WHERE state = 'queued' AND run_after <= :now
  ORDER BY run_after LIMIT 1
)
RETURNING *;
```

## The concurrency cap

*"**Do the right amount at once** — A cap on how many agents run at the same time, so your machine isn't overwhelmed."* (feature map §8). The cap is `VIBE_MAX_RUNS` (backlog 3.1, `03` §7, drawio *Job loop*). No source gives its default, or says whether it is an environment variable or a setting; the monitor mockup uses `CAP = 4` and its guide says *"raise the worker cap"* without saying where. See [[Worker Slots]], [[Environment And Configuration]], [[Execution Open Questions]] #36 and [[Monitor Open Questions]] #20.

## Known bug

Backlog 3.1 (**BUG**): *"`start_run` must not be completed before the child is spawned; a crash mid‑spawn currently loses the run."* `03` §7 repeats it.

## Gaps

- **Long runs and the 10-minute reclaim** ([[Execution Open Questions]] #33). If a `start_run` job stays `leased` for the life of its run, any run longer than 10 minutes would be reclaimed. If it is marked `done` once spawned, a crash mid-run is recovered by the worker's restart logic instead. The sources do not say which; the bug above implies "done once spawned".
- **What `failed` means.** No rule for when a job gives up rather than re-queuing; `attempts` and `last_error` exist without a limit ([[Execution Open Questions]] #35).
- **Ordering.** Oldest `run_after` first is the natural reading of the index; not stated.
- **Which jobs the cap applies to.** `VIBE_MAX_RUNS` caps runs. *Inference:* `advance_task`, `escalate_question` and `import_backlog` jobs do not wait for a slot, though `import_backlog` may run an agent (backlog 7.3). Whether a shell run takes a slot is not stated either.

## Related

- [[Execution Index]]
- [[Worker Lifecycle]]
- [[Runner Pipeline]]
- [[Worker Slots]]
- [[Execution Data Model]]
- [[Escalation Timer]]
- [[Import Job Lifecycle]]
