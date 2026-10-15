---
tags: [flowboard, monitor, sources]
module: Monitor
---

# Monitor Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `0a60ef0` (2026-10-15).

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/monitor.html` | The screen: topbar, workers strip, needs-you band, view switcher, pulse rows, row detail, timeline, pipeline, status bar. The simulation (`SPEED`, `CAP`, `RATE`, `DUR`, `tick`, `schedule`, `advance`, `finish`). The flow as data (`STEPS`, `ORDER`, `COLS`, `NEXT`, `DEPS`). Derivations (`statusOf`, `whereOf`, `blocking`, `needsList`, `filtered`, `timingOf`, `burnRate`). Actions (`approve`, `reject`, `answer`, `retry`, `stop`). Twelve seeded tasks, `LOGS`, `ARTS`. Escalation at 10 minutes. Keyboard handler. Empty states, responsive and reduced-motion CSS, signal colours, hatching |
| `docs/mockups/monitor-guide.html` | Field guide: the four questions, anatomy (six regions), the one rule of the layout, task status table, step state table, the state diagram, the four hand-off rules, why you can't drag, the 15-beat walkthrough with both branches, every action with its money column, the three money numbers, the rate table, *Wasted is the number to attack*, the three views, filter and sort, keyboard |
| `docs/feature-map.md` §5, §9 | §5 The board: columns from the recipe, card contents, drag only where honest, click to dive in, keyboard; idea *Show who owns what*. §9 Live run viewer: watch, expand, running tally, Stop |
| `docs/feature-map.md` §4, §8, §13, §18, §19, §20, parking lot | §4 engine rules (*silence isn't success*, retry limit, *hiccups don't count*, *your call wins*); §8 concurrency cap; §13 escalation; §18 wasted spend; §19 nudge timing, appearance; §20 live updates; parking lot (trends dashboard, replay any past run, run in the cloud) |
| `docs/old/PRD.MD` | §2 SSE and the separate worker; §4 *the board is a projection*, version pinning, loop guard; §5 `tasks`, `step_instances`, `runs` (incl. `wasted`), `run_events`, `questions`, `artifacts`, `jobs`, `settings`; §6 artifact paths; §7 event handling, versioned events, cost, infra-failure classification; §8 advancement, fan-out, join, rework, escalation gate, fingerprint; §9 20-minute park; §10 inbox order, 5-minute escalation, reconciliation; §12 endpoints and SSE replay; §13 board, viewer, costs, *Dark-first*; §14 M2, M3; §15 seed; §16 acceptance; §17 out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Story 2.1 task lifecycle, Start; 2.2 board projection (card states, hairline BUG, `a` BUG, polling); 2.3 Reject reason BUG; 3.1 job queue, `VIBE_MAX_RUNS`; 3.2 live tokens and cost BUGs; 3.3 restart recovery, `cancelled`; 3.4 streaming and viewer; 4.3 inbox SSE snapshot; 5.2 advancement (skipped, approve overrides); 8.1 costs; 8.3 escalation threshold setting; 9.2 one summary poller; 9.4 `aria-live`; 10.1 acceptance; decisions D1, D3 |
| `docs/old/architecture/02-core-and-engine.md` §3, §4 | Engine rules; component #4 Board projection (role, seam, materialized-view idea) |
| `docs/old/architecture/03-execution-substrate.md` §7, §8 | Job queue and worker lifecycle; component #8 Event stream & live viewer |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Board group (6 cards incl. D1 and *8+ columns don't fit*), Runner & live viewer group, Flow engine D3 card, Slack *Escalate after 5 min*, Costs. *Logical components*: Board → Task & run state, Run viewer → Run orchestrator, *escalate at 5 min*. *Functional components*: Observability group (4 cards), Cost & control, Execution → Observability `events` edge. *Harness architecture*: Board, Task detail `/t/[id]`, Run viewer cards; front-end tech (EventSource, no client store); SSE endpoints; Read models; SQLite card; Run records; Job loop (`VIBE_MAX_RUNS`); Stream parser; Escalation + Notifier; Langfuse (later); concept 8 Human escalation; life-of-a-step beat G |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/architecture/README.md` | *A projection, not the model*; *Board = projection of `step_instances` → CQRS*; component index #4 and #8 |
| `docs/old/architecture/01-ports.md` | The normalized event envelope, versioning and OTel names, keep the raw line |
| `docs/old/architecture/06-cost-and-platform.md` §12, §15 | Cost ledger and PricingService (Claude's price table is a passthrough); live card cost and viewer estimate read the same `Usage`; settings (escalation threshold) |
| `docs/old/reference/core/ports/events.ts` | `NormalizedEvent` and `Usage` types; no `v`, `summary` only on `tool_use`, usage only on `result` |
| `docs/old/reference/core/ports/agent-provider.ts` | `AgentRun.stop()` (*"SIGTERM the child"*), *"tees this to run_events + SSE"*, the `partial_stream` capability |
| `docs/old/reference/core/ports/exec-host.ts` | `ChildHandle.kill()` |
| `docs/old/reference/adapters/agent/replay/replay-provider.ts` | A stopped replay settles with `exitCode: 130, error: 'stopped'` |
| `docs/old/architecture/03-execution-substrate.md` §6 | *"tee events to `run_events` + the SSE emitter"* |
| `docs/old/architecture/07-ports-in-practice.md` | Live cost updated only on `result` |
| `docs/old/design/Vibe Kanban.dc.html` | The looped-back card labelled with the failed step |
| `docs/old/stream-sample.jsonl` | The probe the parser is written against (PRD §0) |
| `docs/old/design/brief.md` | §2 the board (card must show, drag legibility), §4 live session viewer (*signal density*), §5 wasted spend; *Calm, not alarming*; *Dark-first* |
| `docs/old/design/README.md` | 1b card states, 1c board and flow strip, 1d empty/loading/error, board keyboard (`h`/`l`, `[`/`]`), live cost cadence, one shared ticker, 5-minute default threshold, *≤ ~14 columns*, *"Blocked 4m 12s · burning idle"*, accent for approvals and amber for questions |
| `docs/mockups/README.md` | Monitor and guide summaries; the accounting bug the guide found; palette and *spend boldness in one place* |
| `docs/mockups/inbox.html`, `inbox-guide.html` | Oldest-first rule shared with the band; `ESCALATE = 10 * MIN`; shared seed tasks (`billing-webhook`, `csv-export` as a batch, `provider-codex`, `auth-refactor`, `pdf-import` with `who: 'dana'`); `RUNNING` set; *a parked run is not billing you*; *the next task down this flow will not pay the same toll* |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | `auth-refactor` *"the same task the monitor shows waiting"*; workspace path `~/.flowboard/ws/auth-refactor`; NEEDS YOU gate banner |
| `docs/mockups/flow-designer-guide.html` | Approval *"is what puts it in the monitor's Needs you band"*; selected node rail *"matches the row treatment on the monitor"* |
| `docs/FlowBoard/Flow Design/*` | Linked rather than repeated: [[Branching Joining And Loops]], [[Approval Gates]], [[Canvas Layout And Board Order]], [[Version Pinning]], [[Seeded Flows]], [[Flow Design Open Questions]] #11, #14, #24, #34 |
| `docs/FlowBoard/Capability Library/Capability Library Decisions.md` | D26, the nine-step seed flow; D15, host tier fails closed for git-sourced plugins |

## Related

- [[Monitor Index]]
- [[Monitor Open Questions]]
