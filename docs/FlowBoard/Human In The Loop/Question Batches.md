---
tags: [flowboard, human-in-the-loop, concept, batches]
module: Human In The Loop
---

# Question Batches

> **Ask in batches** — An agent can pose a whole set of questions at once, which beats a slow drip of one at a time. — feature map §11

## What a batch is

A batch is the set of questions one step asks in one call: `ask_user_batch(questions[])` *"Inserts all questions with a shared `batch_id` and blocks until every required one is answered"* (PRD §9). The old brief: *"Questions usually arrive in batches of five to eight from one step. Show a batch as a coherent group I can work down, not as eight unrelated cards."* The drawio *Work a batch* card says the same: *"5–8 questions from one step, as a group"*.

`ask_user_batch` is *"the preferred path"* (PRD §9). `04` §9 prefers it too: *"`ask_user_batch` preferred so a whole question set arrives at once."*

## Why five questions are one card

> [!quote] inbox guide
> *"When a step needs several things decided, it asks for all of them at once and parks. That is deliberate, and the reason is on the card: the run is waiting for the whole set. Answering one at a time would mean the agent wakes, finds it still can't proceed, and parks again — restarting your wait each time and paying to re-read its own context."*

The PRD's reason is the blocking problem: *"Answering seven questions in one screen is better than a drip feed, and it avoids the blocking problem entirely for most steps."* (§9). Our reading (inference): a batch answered in one sitting comes back before the 20-minute sentinel, so the run never parks. It also asks skill authors to *"Structure `/grill-me` and similar skills to emit their whole question set at once via `ask_user_batch`."*

## Anatomy of a batch card (mockup)

| Element | Means | Detail |
|---|---|---|
| `question 3 of 5` | Where you are | The guide's sample card |
| The pips | One per question | *"Filled means answered, ringed means the one you are looking at. They are also buttons — click straight to any question."* (inbox guide) |
| `2 of 5 answered` (the tally) | Progress | *"Independent of where you are in the batch. You can answer them in any order."* (inbox guide) |
| `← Prev` / `Next →` | Move within the batch | Disabled at the ends (mockup) |
| `↵ Submit all 5` | Submit | *"Greyed until every non-optional question has a value. One submission, one resume."* (inbox guide) |
| Hint line | Why you can't send part of it | Before (mockup): *"The agent asked these together and is parked until it has all of them. Answering one at a time would restart the wait each time."* After (mockup; guide beat 5): *"All answered. Submitting sends them as one batch — the run picks up where it stopped, with every answer in hand."* |

One question shows at a time. `←` / `→` move between them, and answers are kept as you move (mockup `answers` map). `j` / `k` leave the card without losing your answers (inbox guide actions: *"Your answers are kept."*).

## The sample batch

`csv-export · plan`, *"5 questions from one step — answer them together"* (inbox mockup):

| # | Kind | Question | Options / default |
|---|---|---|---|
| 1 | pick one | *Stream the ledger export straight from Postgres, or stage it to object storage first?* | Stream from Postgres · Stage to object storage · You decide |
| 2 | yes / no | *Should a failed export retry automatically?* | — |
| 3 | number | *How many rows per chunk?* | `50000` rows |
| 4 | pick many | *Which output formats should it emit?* | CSV · TSV · JSONL · Parquet |
| 5 | free text | *Anything about the ledger schema the plan should know?* | *Optional — leave blank if nothing comes to mind* |

## Earlier layout

The old design handoff (1a) rendered a batch as **one Card** listing every question as a row. It had a header (task title, project slug, step badge, `6 questions`, elapsed, `→ Slack in 0m 48s`, `session ↗`) and a sub-line: *"Answer all six to unblock the run. Blocked 4m 12s · burning idle."* Rows took focus one at a time, and `j`/`k` crossed batch boundaries. The mockup instead shows one question at a time with pips.

> [!warning] Open
> The PRD's answer endpoint is per question (`POST /api/questions/:id/answer`), but the mockup submits a batch as one. Escalation is per question too. See [[Human In The Loop Open Questions]] #15 and #20.

## Related

- [[Questions]]
- [[Question Shapes]]
- [[Ask Park And Resume]]
- [[Answering Rules]]
