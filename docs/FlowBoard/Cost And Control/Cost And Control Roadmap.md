---
tags: [flowboard, cost-and-control, roadmap]
module: Cost And Control
---

# Cost And Control Roadmap

## v1 scope (PRD)

| Item | Milestone | Source |
|---|---|---|
| Cost captured on the run | **M3**: *"cost captured on the run. **This is the milestone that proves the whole idea.** Do not proceed until you can watch a real session stream in the browser and see its cost land in the database."* | PRD §14 |
| Rework runs marked wasted | M5 lists *"rework loops with `max_attempts` escalation"*; no milestone names the `wasted` flag or infra retries | PRD §7, §8, §14 |
| Live cost on the viewer footer and board card | M3 lists the *"SSE session viewer"*; no milestone names live cost | PRD §13, §14 |
| `/costs` rollups | **M8**: *"Cost views and flow editor UI."* | PRD §14 |
| Draft mode toggle | No milestone names it; backlog 8.3 puts it in Epic 8 (M8) | PRD §13, §14 |
| Per-step `max_turns`, `max_budget_usd` | Not assigned a milestone | PRD §5, §7 |
| Memory cost tagged apart | M9 lists the memory layer; no milestone names the cost tag | PRD §11.2, §14 |

Acceptance (PRD §16):

- [ ] *"A step runs, streams live to `/runs/[id]`, and records a non-zero cost"*
- [ ] *"`/costs` shows spend per step definition and a separate wasted-spend figure"*
- [ ] *"Draft mode forces every step to haiku/low"*

Backlog 10.1 tightens the first: *"with non‑zero cost **and live turns/cost during the run**."*

## Backlog items

| Story | Item | Tag |
|---|---|---|
| 0.1 | Probe where `total_cost_usd`, `num_turns`, `session_id`, `message_delta.usage` live; verify `--max-turns`, `--max-budget-usd` | PRD, FIX |
| 0.2 | Fake `claude` binary so runs can be tested without spend | GAP |
| 1.1 | `runs.model`, `runs.effort` so draft mode can't corrupt cost views | PRD/FIX |
| 1.3 | Projects list this-week spend; rolling 7 days or calendar week | PRD/DEC |
| 2.2 | Card live cost, per-branch cost; incremental `num_turns` | PRD/handoff, BUG |
| 2.3 | Timeline cost and model/effort per step | PRD/GAP |
| 3.2 | Cumulative `message_delta.usage`; `total_cost_usd` authoritative; draft mode records actual model/effort | BUG, PRD/BUG, PRD/FIX |
| 3.3 | Graceful shutdown marks runs `cancelled`, not `failed` | GAP |
| 3.4 | Viewer running cost, estimated from tokens until `result` | PRD/BUG |
| 3.5 | Map logical caps to physical limits; draft mode and sandbox as `RunSpec` transformers | NEW |
| 4.3 | Inbox right rail with live cost estimate | handoff |
| 5.2 | Rework marks downstream runs wasted | PRD |
| 7.3 | The importer agent runs on haiku (outside any step run, **inferred**; [[Cost And Control Open Questions]] #23) | FIX |
| 8.1 | `/costs` charts and tables, filters, red token, loading state | PRD, GAP, BUG |
| 8.3 | Draft mode toggle in settings | PRD/NEW |
| 9.2 | Chrome spend today, one summary poller | handoff |
| 10.1 | Acceptance: live turns/cost, `/costs` per step + wasted, draft mode haiku/low | — |

## Designed beyond the PRD

| Design | Where |
|---|---|
| `PricingService` and provider-blind rollups | `06` §12 |
| Versioned, dated price table | `06` §12 (idea) |
| Draft mode as a `SpecTransform`, with logical model `fast-cheap` | `06` §15 |
| Append-only usage journal | `02` §1 (idea) |
| `native_cost`, `partial_stream`, `budget_cap` capabilities | `agent-provider.ts` |
| Burn rate (`/hr`) and *today* | monitor and inbox mockups |
| Kept / wasted / bill per task; recipe average | task-detail mockup and guide |
| Budget chip, ceiling per task, draft toggle in the designer, `~$/task` in the library | flow-designer mockup and guide |
| Stopped runs counted as wasted | monitor and task-detail guides |
| *"Under roughly a tenth"* as a health guide | monitor guide |

## Ideas

| Idea | Source |
|---|---|
| **Spend by person and team** | feature map §18 |
| **A team budget**: a monthly cap, alert its lead as it fills | feature map §18 |
| **Team guardrails vs personal defaults**: a budget cap nobody can quietly lift | feature map §16 |
| Light roles: who can *"see costs"* | feature map, *Teams & collaboration* |
| **Auto-pick the AI per step**: *"best or cheapest model"* | feature map, parking lot |
| **A trends dashboard**: *"throughput over time, how fast questions get answered, cost per feature"* | feature map, parking lot |
| Other transforms: *"force-local-model, cap-budget-globally, pin-a-model for an incident"* | `06` §15 |
| Deterministic gates as `$0` shell steps (semgrep, gitleaks, trivy) | drawio *Harness architecture* |
| Langfuse via an OTel exporter | PRD §7, drawio |
| Replay any past run (feature map parking lot); *"replayable at $0"* (drawio *Run records*) | feature map, drawio |

## Out of scope

- *"anything that talks to the Anthropic API directly. Every model call goes through the `claude` CLI."* (PRD §17). **Inferred:** so FlowBoard reads cost from the CLI, never from a billing API. (As built: OpenCode runs go through `opencode serve` instead, since 2026-10-18; both adapters read cost from the agent's own events, never from a billing API. See [[OpenCode Adapter]].)
- Authentication, user accounts, roles (PRD §17). Per-person spend needs identities first.
- Mem0's managed cloud (PRD §17).

## Related

- [[Cost And Control Open Questions]]
- [[Monitor Roadmap]]
- [[Flow Design Roadmap]]
