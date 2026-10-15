---
tags: [flowboard, monitor, seed, sample-data]
module: Monitor
---

# Monitor Sample Data

The mockup opens on *"the board mid-morning"*: twelve tasks seeded in `TASKS` (`monitor.html`), all of them FlowBoard working on itself. The PRD's real seed is separate: one project, the *Software delivery* flow, and sample tasks (PRD §15; drawio card *Seed data*: *"One project, default flow, sample tasks, so the app is alive on first run."*). See [[Seeded Flows]].

## The flow

`research → plan → build ∥ tests → review → summarize`, shown as `v4` in the topbar. Only `review` is a gate. Models: research haiku, plan opus, build opus, tests sonnet, review sonnet, summarize haiku.

> [!note] The seeded flow has moved on
> Decision **D26** (2026-10-15) makes the seed flow the PRD's **nine** steps with the `explain` and `review` gates and a `check` step. The monitor still draws the older six-step flow. See [[Monitor Open Questions]] #28.

## The twelve tasks

| Task | Repo | Title | State at open |
|---|---|---|---|
| `auth-refactor` | flowboard/api | Rotate refresh tokens on every use | **Gate** at review, waited 5m |
| `csv-export` | flowboard/api | Stream the ledger export instead of buffering it | **Asking** at plan, 12.5m: 3 options |
| `sandbox-egress` | flowboard/runner | Default-deny egress allowlist, per step | Build running ~32m, tests done |
| `billing-webhook` | flowboard/api | Idempotency keys for replayed Stripe events | Build **failed**, attempt 3, $1.44 wasted, *"egress denied — api.stripe.com not in the step allowlist"* |
| `docs-pass` | flowboard/docs | Plain-English feature map for the v3 rebuild | Research running, 3m |
| `mem0-adapter` | flowboard/core | Wire the self-hosted memory port behind the seam | Build ∥ tests both running (⑂2) |
| `cost-rollup` | flowboard/core | Wasted-spend metric, per flow version | Research done, plan queued |
| `provider-codex` | flowboard/providers | Codex CLI behind the AgentProvider seam | **Asking** at research, 8m: 2 options |
| `pdf-import` | flowboard/api | Pull quoted prices out of supplier PDFs | Research queued |
| `flow-versioning` | flowboard/core | Pin a running task to the flow version it started on | Done ~71m ago; build took 2 attempts, $0.79 wasted |
| `inbox-keyboard` | flowboard/web | Number-key answers, no mouse, in the inbox | Done ~111m ago |
| `drawio-export` | flowboard/web | Export a flow as a drawio diagram | Backlog, no runs |

At open: 4 running (every slot full), 2 queued, 4 in Needs you. Oldest first: `billing-webhook`, `csv-export`, `provider-codex`, `auth-refactor`. The guide's anatomy diagram shows different illustrative counts (`3/4`, `queue 5`, `NEEDS YOU 2`).

The two questions:

- `csv-export`: *"The ledger export can stream straight out of Postgres, or stage to object storage first. Streaming is cheaper but holds a connection for the whole export."*: `Stream from Postgres` · `Stage to object storage` · `Decide it yourself`.
- `provider-codex`: *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"*: `Estimate from tokens` · `Record as unknown`.

`billing-webhook` has no `tests` run although `plan` fans out to both. That looks like a seed slip.

## Log lines

Canned per task in `LOGS`, revealed one every 18 seconds of real time. For example, `sandbox-egress`:

```
› read  docs/old/architecture/08-sandboxing.md (412 lines)
› edit  runner/src/sandbox/egress.ts
› edit  runner/src/sandbox/allowlist.json
◆ egress denied  registry.npmjs.org → adding to step allowlist
› run   pnpm vitest run tests/sandbox
✓ 41 passed  (3.8s)
⋯ thinking  (effort: high)
```

`pdf-import` shows `› waiting for a worker slot`. Tasks without their own lines use a generic three.

## Artifacts

| Step | File | Size |
|---|---|---|
| research | `brief.md` | 4.1 kB |
| plan | `plan.md` | 11.7 kB |
| build | `changes.patch` | 38.2 kB |
| tests | `test-report.md` | 2.9 kB |
| review | `review.md` | 6.4 kB |
| summarize | `summary.md` | 1.8 kB |

## Shared with other mockups

| Task | Here | Elsewhere |
|---|---|---|
| `auth-refactor` | Gate at review, 5m | Task-detail mockup opens on it at the gate (*"the same task the monitor shows waiting"*); inbox: gate, 5m, *"Review passed with 2 notes"* |
| `billing-webhook` | Failed build, attempt 3, $1.44 | Inbox: *"Attempt 3 of 3 failed — egress denied to api.stripe.com"*, 42m |
| `csv-export` | One question, 3 options | Inbox: a **batch of five** questions |
| `provider-codex` | Question at research | Inbox: same question |
| `pdf-import` | Research queued | Inbox: a question at **plan**, waiting on **dana** |
| Running set | sandbox-egress build, mem0 build ∥ tests, docs-pass research | Inbox `RUNNING`: the same four |

The `csv-export` and `pdf-import` differences are [[Monitor Open Questions]] #5 and #28.

## Related

- [[Life Of A Task]]
- [[Seeded Flows]]
- [[Monitor Screen]]
