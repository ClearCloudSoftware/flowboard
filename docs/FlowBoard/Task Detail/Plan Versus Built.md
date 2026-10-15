---
tags: [flowboard, task-detail, behaviour, plan-vs-built]
module: Task Detail
---

# Plan Versus Built

The distinctive part of task detail. The design brief calls it *"The payoff of the whole workflow … This is the screen I'll show people."* The mockups README calls it *"the distinctive one"*.

## The idea

> The plan is a real file with numbered items and acceptance criteria. The build's output is a real patch. So the two can be lined up *mechanically*: each item gets a verdict based on what is actually in the working tree, not on what the agent said it did in its summary. — task-detail guide

> **Deviations are the point of this view.** Every step wrote a real file, so the plan and the patch can be lined up mechanically — the agent's own account of what it did is not the evidence. — task-detail mockup

## Two designs in the sources

| | PRD / backlog / brief / drawio | Task-detail mockup |
|---|---|---|
| Left side | `plan.md` | `plan.md`'s numbered items, each with *"accepts when:"* |
| Right side | `summary.md` | *"what landed in the workspace"*: files changed, with +/− line counts |
| Method | a text diff of two documents: *"A diff view between `plan.md` and `summary.md` when both exist"* (PRD §13); *"side‑by‑side two‑document diff"* (backlog Story 2.3) | a per-item **verdict**, expandable to the diff hunk |
| When available | once both exist, so after Summarize | before approving, at the review gate |
| Header | — | `plan.md vs the working tree` |

The two answer different questions. The PRD's version compares what the plan said with what the **summary says** was built. The design brief says the same: *"what the planning step said would be built, next to what the summary step says was actually built."* The mockup compares the plan with what the **working tree contains**, and says outright that the agent's account is not the evidence. The PRD acceptance item *"The task detail sheet diffs `plan.md` against `summary.md`"* tests the first. See [[Task Detail Open Questions]].

## The four verdicts

| Badge | Status | Means (guide) | What it should make you do (guide) | Colour |
|---|---|---|---|---|
| `as planned` | `matched` | *"A change in the tree does what the item asked, and the acceptance criterion is met."* | *"Spot-check it and move on."* | stone |
| `deviated` | `deviated` | *"Something was built for this item, but not what was asked."* | *"**Read the hunk.** Decide whether the difference matters — this is the verdict most likely to ship a bug."* | ochre |
| `not built` | `missed` | *"Nothing in the tree corresponds to the item. The story log says why."* | *"Decide whether the item was actually needed. If it was, send it back — approving is accepting the gap."* | brick |
| `unplanned` | `unplanned` | *"A change nobody asked for. Not automatically wrong, but it is untested scope."* | *"Ask whether it earns its place. Unplanned code rarely has a test behind it."* | petrol |

> [!important] Deviated is the verdict to fear
> *"Deviated is the verdict to fear, not missed. A missing item is loud: the column is empty and you notice. A deviation is quiet — it has a file, a diff and a green test run behind it. This view exists mostly to make that difference visible in one glance."* — task-detail guide

## Layout

- **Tally line**: `3 planned · 1 as planned · 1 deviated · 1 not built · 1 unplanned`, each count in its verdict colour.
- **Column heads**: *what the plan asked for* / *what landed in the workspace*.
- **One row per plan item**, plus one row per unplanned change:
  - left: item number, text, `accepts when: <criterion>`; or *"Nothing in the plan asked for this."*
  - right: verdict badge, then each file `path +a −d` with a one-line note; or the `why`, or *"No file in the workspace corresponds to this item."*
- **Click a row** to expand the diff hunk behind the verdict (`openHunk`). Rows without a hunk (the missed item) expand to nothing.
- **Closing note**: *"Item 2 passed review with a note; item 3 quietly did not happen at all."*

## The sample

| # | Item | Accepts when | Verdict | Files |
|---|---|---|---|---|
| 1 | *Rotate the refresh token on every use, invalidating the one presented.* | *Replaying a spent refresh token is rejected with 401.* | as planned | `src/auth/jwt.ts` +48 −12, `tests/auth/rotate.test.ts` +64 −0 |
| 2 | *Store a token family id so replaying any token in a family revokes the whole family.* | *Replaying an old token logs the session out everywhere.* | deviated | `src/auth/family.ts` +31 −4: *"Revokes the single presented token, not the family."* |
| 3 | *Add a migration for the token_family column.* | *The migration runs clean against a fresh database.* | not built | — *"Build reported no migration tooling in this workspace and moved on."* |
| — | — | — | unplanned | `src/auth/metrics.ts` +22 −0: *"Useful, but nobody asked for it — and nothing tests it."* |

The deviation's hunk:

```diff
@@ src/auth/family.ts
+  await revoke(token.jti)
   // TODO: walk the family and revoke siblings
   —  review.md flagged this as a deviation from plan item 2
```

## How the verdicts are produced

**No source says.** "Lined up mechanically" needs:

- a `plan.md` with stable item numbers and per-item acceptance criteria (a format the Plan step must write)
- a mapping from changed files and hunks to plan items
- a judgement of whether a change *"does what the item asked, and the acceptance criterion is met"*

The third is not mechanical. In the sample, the verdicts agree with the reviewer's notes (*"◆ item 2 deviates from the plan"*, *"◆ item 3 not implemented"*), which suggests the review step produces them. The hunk comment *"review.md flagged this as a deviation from plan item 2"* points the same way.

> [!question] Proposal, not sourced
> One reading that fits every source: the Plan step writes `plan.md` with numbered items and criteria; the Review step writes a structured per-item verdict alongside `review.md` (it already *"reviews the diff against the task's acceptance criteria"*, PRD §15); and FlowBoard computes the file list and the **unplanned** set mechanically from the branch diff (files touched by no item). This would need a new artifact type, e.g. `plan_check`. Listed in [[Task Detail Open Questions]].

## Related

- [[Task Detail Index]]
- [[Deciding At A Gate]]
- [[Task Artifacts]]
- [[Task Detail Tabs]]
- [[Artifact Contract]]
