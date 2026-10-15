---
tags: [flowboard, monitor, walkthrough]
module: Monitor
---

# Life Of A Task

The monitor guide's centrepiece is a scrubber that walks `auth-refactor` (*"Rotate refresh tokens on every use"*) from backlog to done. *"At the approval gate you can take either branch."* Twelve shared beats, then three for **Approve** or three for **Send back**. The costs are the guide's own figures.

## Shared beats

| # | Beat | Bar (rsch · plan · b∥t · rev · sum) | Cost | Rule (guide) |
|---|---|---|---|---|
| 1 | In the backlog | all pending | $0 | *"Nothing runs until you promote it."* |
| 2 | You promote it | queued · … | $0 | *"**research** queued · no dependencies to satisfy, so it was eligible immediately."* |
| 3 | Research starts | running · … | $0.01 | *"A worker freed → **research** running · haiku at $0.008/min."* |
| 4 | Research lands, plan queues | done · queued | $0.01 | *"**research** done → **plan** queued · its only dependency is satisfied."* |
| 5 | Plan starts | done · running | $0.30 | *"**plan** running · opus at $0.14/min."* |
| 6 | Plan asks you something | done · hold | $0.59 | *"**plan** asking · billing stopped, slot released, a card appears in Needs you."* |
| 7 | You answer, and it fans out | done · done · queued∥queued | $0.59 | *"**plan** done → **build** and **tests** queued · fan-out."* |
| 8 | Both branches run | … running∥running | $0.94 | *"Two of your four slots are on this task. The row shows ⑂2."* |
| 9 | Tests finish first | … running∥done · pending | $1.42 | *"**tests** done · **review** stays pending, its join is unsatisfied."* |
| 10 | Build lands, review queues | … done∥done · queued | $1.71 | *"**build** done → join satisfied → **review** queued."* |
| 11 | Review runs | … running | $1.80 | *"**review** running · sonnet at $0.05/min."* |
| 12 | The gate opens | … hold | $1.96 | *"**review** done → **gate** · your call overrides whatever the agent concluded."* |

Beat 6 card: *"Rotate on every use, or only when the refresh token is close to expiry?"* with `1 Every use · 2 Near expiry · 3 Decide it yourself`. Beat 12 card: *"Review passed. Approve the change so the task can move to summarize?"* with `a Approve · r Send back`.

Some of the guide's explanations:

- Beat 1: *"The task exists and has a title, and nothing else. No workspace, no agent, no spend. This is the only place on the board you can drag a card into."*
- Beat 2: *"It has a private copy of the repo waiting for it, but no worker yet — all four are busy on other tasks."*
- Beat 4: *"`brief.md` is written to the task workspace. That file is the contract the next step reads — this is why steps can hand off without a shared conversation."*
- Beat 5: *"A more expensive model, because planning is where getting it wrong is costliest. Watch the rate: this one step will outspend research a hundred times over."*
- Beat 8: *"Two agents on one task, in the same workspace, on independent work. This is where the board earns its keep — serially this would be two waits, not one."*

## Branch A: Approve

| # | Beat | Cost | Rule |
|---|---|---|---|
| 13 | You approve | $1.96 | *"**review** done → **summarize** queued."* *"approving is the only decision on this screen that costs nothing at all."* |
| 14 | Summarize runs | $1.97 | *"**summarize** running · haiku."* |
| 15 | Done | $1.98 | *"**summarize** done → no next step → task finished · $1.98, none of it wasted."* |

## Branch B: Send back

| # | Beat | Cost | Wasted | Rule |
|---|---|---|---|---|
| 13 | You send it back | $0.84 | $1.12 | *"**review** discarded → **build** queued, attempt 2 · $1.12 moved to wasted."* |
| 14 | Build runs again | $1.19 | $1.12 | *"**build** running, attempt 2 · **tests** untouched."* |
| 15 | And you're back at the gate | $1.68 | $1.12 | *"Back at beat 12, one attempt and $1.12 poorer. Retries are capped, then the task fails."* |

*"Everything the first build spent is now counted as wasted — the work is gone, the money isn't."* And: *"a gate you keep re-opening is a signal the recipe needs fixing, not the code."*

> [!note] Reading the figures
> The cost column is kept spend and the bill is cost + wasted. In beat 13 the bill is $0.84 + $1.12 = $1.96, so nothing disappears in the guide's figures. The mockup code differs: `reject()` deletes the review run, so its cost leaves the bill ([[Monitor Open Questions]] #17). That is the accounting rule from [[Burn Today And Wasted]]. Beat 15's *"then the task fails"* contradicts backlog decision D3, though PRD §16's checklist agrees with the guide ([[Flow Design Open Questions]] #11).

## Related

- [[Hand-Off Rules]]
- [[Monitor Actions And Costs]]
- [[Monitor Sample Data]]
- [[Approval Gates]]
