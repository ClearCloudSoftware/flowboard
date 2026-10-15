---
tags: [flowboard, task-detail, seed, sample]
module: Task Detail
---

# Sample Task Auth Refactor

The task the task-detail mockup opens on. It is *"Seeded at the review gate — the same task the monitor shows waiting"* (mockup comment), the task the monitor guide walks through, and one of the cards in the inbox guide's opening beat. It is sample data, not seed data: the PRD's seed (§15) is one project, one flow and *"sample tasks"* (drawio *Seed data*) with no content given.

## The task

| Field | Value |
|---|---|
| id | `auth-refactor` |
| title | *Rotate refresh tokens on every use* |
| body | *Every refresh should hand back a new token pair and invalidate the one presented, so a stolen refresh token is useful exactly once. Raised after the session audit in September.* |
| repo | `flowboard/api` |
| branch | `flowboard/auth-refactor` |
| workspace | `~/.flowboard/ws/auth-refactor` |
| owner | `you` |
| flow | `Software delivery @core v4` (v5 exists) |
| created / started | today 09:14 / today 09:21 |

## The steps

| Step | Agent | Model · effort | State | Time | Kept | Wasted | Attempts | Artifact |
|---|---|---|---|---|---|---|---|---|
| Research | `scout` | haiku · low | done | 1m 32s | $0.01 | — | 1 | `brief.md` 4.1 kB |
| Plan | `architect` | opus · high | done | 4m 10s | $0.58 | — | 1 | `plan.md` 11.7 kB |
| Build | `developer` | opus · high | done | 8m 00s | $1.12 | $0.48 | 2 | `changes.patch` 38.2 kB |
| Tests | `tester` | sonnet · medium | done | 5m 06s | $0.26 | — | 1 | `test-report.md` 2.9 kB |
| Review | `reviewer` | sonnet · medium | **gate** | 3m 12s, then waiting | $0.16 | — | 1 | `review.md` 6.4 kB |
| Summarize | `scribe` | haiku · low | pending | — | — | — | 1 | — |

Totals: kept **$2.13**, wasted **$0.48**, bill **$2.61**, agent time **22m 00s**, retries **1**. The recipe averages **$2.14** across 182 tasks on v4. Plan's raw cost is `0.585`, which `toFixed(2)` shows as `$0.58`.

## The story in the logs

1. **Research** reads `src/auth/session.ts`, `src/auth/jwt.ts` and `docs/security/session-audit-sep.md`, then writes the brief: *"6 findings, 2 open questions"*.
2. **Plan** asks *"Rotate on every use, or only when the refresh token is near expiry?"* You answer **Every use** after 2m 14s. It writes `plan.md` with *"3 work items with acceptance criteria"*. Its log says *"asked you 2 questions"*, but the data holds one (see [[Questions Within A Task]]).
3. **Build** attempt 1: *"egress denied: registry.npmjs.org was not in the step allowlist"*, so $0.48 wasted. Attempt 2 edits `jwt.ts`, `family.ts` and `metrics.ts`, gets `✓ 34 passed (2.1s)`, and logs *"⋯ item 3 skipped — no migration tooling in this workspace"*.
4. **Tests** writes `tests/auth/rotate.test.ts`, gets *"41 passed, coverage 88% on src/auth"*, and flags *"◆ no test covers the token-family case — plan item 2"*.
5. **Review** flags *"item 2 deviates from the plan — revokes one token, not the family"* and *"item 3 not implemented"*, then gives the verdict *"passed with 2 notes"*. The gate opens.
6. **Summarize** waits for your approval.

Plan versus built for this task: [[Plan Versus Built]]. Memory lines: [[Memory Carried Into A Task]].

## After approval (mockup)

Summarize runs for 7 s of wall time on haiku, with its cost billed at ×24 (as if it ran 2m 48s), and writes `summary.md` 1.8 kB: *"✓ summary written — the task is done"*. The guide's beat puts the final bill at **$2.63**.

## The same task in other mockups

| Mockup | Differences |
|---|---|
| `monitor.html` | Steps are seeded as `run(step, state, startMin, durMin)`: `22`, `20.4`, `16.2`… are start offsets in minutes ago. The durations (1.6, 4.2, 8.0, 5.1, 3.2 min) roughly match task detail. Build and Tests start together, so they run in parallel. |
| `monitor-guide.html` | Bill **$1.96 → $1.98** at done, *"none of it wasted"*. Send back puts Build on **attempt 2**, with $1.12 moved to wasted. |
| `inbox.html` | The review gate card, waiting 5 min: *"Review passed with 2 notes — approve, or send it back?"* Its hint: *"Sending back re-queues build and moves everything the last attempt spent into wasted."* |
| `capability-library-guide.html` | Cites *"the failure that burned $0.48 on the build in the task detail screen"* to explain amber tool chips and the egress allowlist. |

The task's cost history differs between the monitor (no failed build) and task detail (a failed build attempt). See [[Task Detail Open Questions]].

## Against the PRD seed flow

The mockup's six-step *Software delivery* is not the PRD's nine-step seed (§15; [[Capability Library Decisions]] D26). It has no `grill`, `explain` or `check` step. Its keys differ (`build` for `implement`). Its models differ (`scout` on haiku/low here, sonnet/medium in the PRD). Its artifacts are named differently. [[Seeded Flows]] covers the mockup's flow as *"The mockups' Software delivery"*.

## Related

- [[Task Detail Index]]
- [[Task Detail Screen]]
- [[Deciding At A Gate]]
- [[Seeded Flows]]
