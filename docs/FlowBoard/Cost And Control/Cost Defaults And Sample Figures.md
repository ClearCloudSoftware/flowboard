---
tags: [flowboard, cost-and-control, seed, sample-data]
module: Cost And Control
---

# Cost Defaults And Sample Figures

Cost has no seed data of its own. It has defaults, and every mockup carries sample figures.

## Defaults

| Setting | Default | Source |
|---|---|---|
| `step_defs.model` | `sonnet` | PRD §5 |
| `step_defs.effort` | `medium` | PRD §5 |
| `step_defs.max_budget_usd` | none (nullable) | PRD §5 |
| `step_defs.max_turns` | none (nullable) | PRD §5 |
| `step_defs.max_attempts` | 3 | PRD §5 |
| Infra retries | up to 3, backoff 30 s · 2 min · 8 min | PRD §7 |
| Draft mode | off (**inferred**: no source states it; see [[Settings Defaults]]); when on, `haiku` / `low` | PRD §13 |
| Memory | `none` (off) | PRD §13 |
| `memory.max_recall_chars` | 6,000 (≈1,500 tokens) | PRD §7 |
| Mockup new step | `sonnet`, `medium`, budget `$1.00`, retries 2 | `flow-designer.html:700` |

## Seeded flow: models and efforts

PRD §15 *Software delivery*: `research` sonnet/medium, `grill` sonnet/medium, `plan` opus/high, `explain` haiku/low, `implement` opus/high, `tests` sonnet/high, `check` shell (no model, `$0`), `review` opus/high, `summarize` sonnet/medium. No step sets a budget or turn cap. See [[Seeded Flows]].

## Mockup rates

Used by the monitor, inbox and task-detail mockups. Simulation only, not real prices.

| Model | $/min | An hour | Monitor guide: typically used for |
|---|---|---|---|
| haiku | 0.008 | $0.48 | *"Research and summarize — reading and condensing, where the cheap model is genuinely enough."* |
| sonnet | 0.05 | $3.00 | *"Tests and review — judgement, but bounded."* |
| opus | 0.14 | $8.40 | *"Plan and build — where a wrong answer is expensive to unwind."* |

`monitor.html:436`, `inbox.html:235` (`RUNNING`), `task-detail.html:274`. The monitor runs a ×10 demo clock. The task-detail mockup multiplies by 24.

## Sample figures

| Where | Figure | Source |
|---|---|---|
| Probe | one turn, `total_cost_usd: 0.45876175`, `costBasis: "list"` | `docs/old/stream-sample.jsonl` |
| ReplayProvider | `costUsd: 0.012`, 150 tokens, 2 turns | `replay-provider.ts`, `07-ports-in-practice.md` |
| Inbox context | burn = (0.14 + 0.14 + 0.05 + 0.008) × 60 = **$20.28/hr**; today **$19.46**; wasted **$2.55** (about 13%) | `inbox.html:379`–`388` |
| Inbox failure | `billing-webhook`: *"Three attempts, $1.44 spent and thrown away"* | `inbox.html:204` |
| Task detail `auth-refactor` | kept $2.13 · wasted $0.48 · bill $2.61; recipe average $2.14 over 182 tasks on v4 | `task-detail.html`, task-detail guide |
| Flow library | `~$/task` from $0.19 (`Code review @alex` v3) to $3.07 (`Launch campaign @growth` v4); `Software delivery @core v4` $2.14 over 182 runs | `flow-designer.html:292`–`321` |
| Flow designer | `Code review @team-sec`: *"Slower and ~3× the cost — required for payment paths."* | `flow-designer.html:303` |
| Old design handoff | chrome `4 running · $28.40 today`; board header `14 tasks · $28.40 today`; the prototype ticks the figure up from `28.4` | `docs/old/design/README.md`, `Vibe Kanban.dc.html` |
| Pitch | *"[$96k/year]"* agent spend, *"[~$24k]"* wasted, *"[~25%, ~$24k/year]"* evaporating on thrown-away runs. Marked as *"illustrative placeholder"* | `docs/pitch.md` |

> [!note] The inbox sample is over the guideline
> $2.55 wasted on a $19.46 day is about 13%, above the monitor guide's *"roughly a tenth"*. Nothing in the inbox mockup flags it.

## Inbox fixtures about cost

- `provider-codex`, pending: *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"* See [[Pricing Service]].
- `cost-rollup`, answered: *"Roll up by model, or by step?"* → **Both**.

## Related

- [[Monitor Sample Data]]
- [[Sample Task Auth Refactor]]
- [[Models And Effort]]
- [[Cost Surfaces]]
