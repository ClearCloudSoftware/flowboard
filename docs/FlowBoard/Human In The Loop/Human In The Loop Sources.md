---
tags: [flowboard, human-in-the-loop, sources]
module: Human In The Loop
---

# Human In The Loop Sources

Every fact in these notes comes from the files below (paths relative to the repo root).

> [!note] Source revision
> These notes follow the sources as of commit `0a60ef0` (2026-10-15) on `dev`, and take the [[Capability Library Decisions]] (D1, D26–D30) as settled. Bare **D**-numbers from the backlog's *Decisions to close* table are written "backlog D*n*", and those from the Capability Library as "Capability Library D*n*".
>
> A grounding pass on 2026-10-15 corrected three bugs in `docs/mockups/inbox.html`, so it now matches its own guide:
> - An untouched number default now counts as an answer.
> - *Retry as-is* no longer runs *Allow host & retry*.
> - The queue really sorts oldest first, including under *Everyone*.

## Primary

| File | What it contributes |
|---|---|
| `docs/mockups/inbox.html` | The screen: topbar count and filter, queue, context panel, status bar, toast. `ITEMS` (failure, batch, two questions, gate), `RUNNING`, `ANSWERED`. `control()` and `answered()` per shape. Card bodies for each kind, the reason form, `resolve()` (cursor rule, 200 ms fade), `submit()`, keyboard handler (`j`/`k`, arrows, `1`–`9`, `↵`, `a`, `r`, `esc`), `ESCALATE = 10 * MIN`, the 3-minute *escalates in* window, the simulated Slack answer at 9 s |
| `docs/mockups/inbox-guide.html` | Anatomy (4 regions), *Oldest first, not most important*, the five shapes table, *Free text is the escape hatch*, the four card kinds table, *Why five questions are one card*, batch elements table, *a parked run is not billing you*, the state strip, the escalation timer, *Whoever answers first wins*, the cursor rule, the 7-beat walkthrough (5 common beats + 2 per ending), every control, keyboard, *Number keys toggle in a pick-many* |
| `docs/feature-map.md` §11, §12, §13 | Ask in batches, pause and pick back up, one shared format, ❓ undo; inbox most-urgent first, grouped by task, keyboard, sync, context panel; escalate after a wait, answer from anywhere, more channels; ideas (my inbox, shared pool, nudge the right person, escalation ladder) |
| `docs/feature-map.md` §2, §3, §4, §5, §10, §19, §20, §21, *Across everything*, parking lot, appendix | Assign a step to a person or role; owner, @mention, separation of duties; silence isn't success, retry limit, stuck, hiccups, *your call wins*, route to a teammate, two sign-offs; *waiting on Alice*; ❓ asking from a sealed box; nudge timing; live updates; remember your answers, shared team memory; teams foundation; trends dashboard; the handoff relay |
| `docs/old/PRD.MD` | §1 *park and wait*; §2 SSE, no user table; §3 layout (`core`, `notify`, worker broker and escalation timer, `mcp-shim`); §4 loops guarded; §5 `questions`, `step_instances`, `runs`, `jobs`; §6 `questions`/`answers` types and disk layout; §7 closing instruction, `mcp__vibe__*`, infra-failure classes; §8 approval, `awaiting_answers`, no outcome, escalate-don't-fail, Retry / Fail task; §9 broker, shim, four tools, 2 s poll, 20-min sentinel, park, resume, prefer batching; §10 inbox, controls per kind, escalation, Block Kit, idempotency, reconciliation, Slack config, content rule; §11.1 socket mount; §11.2 memory; §12 endpoints; §13 board dots, sheet Approve/Reject, `/inbox`, *Dark-first*; §14 M4, M5, M6, M9; §15 seeded gates and `grill`; §16 acceptance; §17 out of scope |
| `docs/old/architecture/04-hitl-and-notify.md` | §9 the reframe, two strategies, broker on every tier, race fix, cancel on failure, one schema three renderers, *Inbox notes*; §10 timer, idempotent reconciliation, signature checks, `link_only`, content rule |
| `docs/flowboard-ideation.drawio` | *FlowBoard ideation*: Inbox group (7 cards incl. D2), Slack escalation group, *Advance modes*, D3, *Remembers your answers*. *Logical components*: Inbox → Question service, MCP ask tool, Notifier, *escalate at 5 min*, *answers → resume*. *Functional components*: Human in the loop group (4 cards), Escalation group (3 cards), edges to Execution, Escalation, Memory. *Harness architecture*: Inbox card, broker, shim, Escalation + Notifier (Socket Mode), Slack, Mounts, concept 8 *Human escalation*, *Dual encoding*, life-of-a-step H |

## Secondary

| File | What it contributes |
|---|---|
| `docs/old/REBUILD-BACKLOG.md` | *What went wrong* item 5 (undo in the MCP tool); Story 0.2 test lanes; 1.1 `step_instances.reason`, `resume_step`, `expired` BUG; 1.2 `grill-me` and `code-review` contracts; 2.1 cancel questions; 2.2 `a` chip BUG; 2.3 Reject asks for a reason; 3.2 resume-prompt and cancel-questions BUGs; 3.3 restart recovery; 3.5 HITL in a sandbox; 4.1–4.4 question loop; 5.2 approve overrides, reject semantics; 6.1–6.3 escalation; 8.3 threshold in minutes; 9.1 light default; 9.2 amber inbox count; 9.4 accessibility; 10.1 checklist; decisions D2, D3, D9 |
| `docs/old/architecture/README.md` | HITL as one of three halves; *park/resume … provider-agnostic HITL primitive*; dependency rule; Notifier row; module layout (`hitl/`, `notify/`); component index #9, #10; open decision 3 (HITL-in-sandbox decided) |
| `docs/old/architecture/01-ports.md` | `mcp_tools`, `resume_fork` and the fallbacks; Codex risk point (c); `ReplayProvider`; the Notifier sketch |
| `docs/old/architecture/02-core-and-engine.md` | §1 `step_instances.reason`; §3 approve overrides, reject semantics, no outcome, escalation at the cap, stuck detection, StepExecutor *human task* |
| `docs/old/architecture/03-execution-substrate.md` §6 | Closing instruction, resume prompt repeats paths, `mcp.json` on every tier |
| `docs/old/architecture/05-environment-and-registry.md` §13 | `grill-me` uses `ask_user_batch`; `code-review` calls `set_outcome` |
| `docs/old/architecture/06-cost-and-platform.md` §15 | Settings: escalation threshold (minutes); thin API |
| `docs/old/architecture/07-ports-in-practice.md` | `ConsoleNotifier`, the escalation call site, `onAnswered` |
| `docs/old/architecture/08-sandboxing.md` | *decided, host-side broker on every tier* |
| `docs/old/architecture/09-memory.md` | Answers into the `user` and `agent` scopes; *answer a preference once*; measure inbox repeats |
| `docs/old/reference/core/hitl/question.ts` | `QuestionKind`, `QuestionOption`, `Question` |
| `docs/old/reference/core/ports/notifier.ts` | `QuestionContext`, `PostedRef`, `Notifier` |
| `docs/old/reference/core/ports/agent-provider.ts` | `mcp_tools` / `resume_fork` fallbacks, `ToolServer`, `RunSpec.resume`, prompt part 6, unset outcome → human gate |
| `docs/old/design/brief.md` §1 | Inbox brief: five types, batches of five to eight, waiting time, answered from Slack, empty state, keyboard |
| `docs/old/design/README.md` | 1a inbox (batch card, controls, resolved row, escalated batch, footer, right rail); 1b attention rows; 1d empty, loading, error; 1e resolving under you; 1f light mode; keyboard model; elapsed-time colours; answered-elsewhere; state management (`draftAnswers`, `Question`) |
| `docs/mockups/monitor.html`, `monitor-guide.html` | *Needs you* band (gate, question, failure), keys on the top item, 10-minute escalated mark, status table, failure actions, *Answering is free; stopping is not*, Timeline hatching |
| `docs/mockups/task-detail.html`, `task-detail-guide.html` | Gate banner, *Send back to build*, *Compare plan vs built*, the answered question in the Story tab, *Answering is free* cost note |
| `docs/mockups/flow-designer-guide.html` | Approval *"puts it in the monitor's Needs you band"* |
| `docs/mockups/README.md` | Summaries of the inbox and its guide; monitor keys |
| `docs/FlowBoard/Capability Library/Capability Library Decisions.md` | D1 Claude-only; D22 `grill-me` contracts; D26 seed flow; D28 `mcp__vibe__*`; D30 `ask-three` is a fixture |
| `docs/FlowBoard/Flow Design/*` | Linked rather than repeated: [[Approval Gates]], [[Step Guardrails]], [[Branching Joining And Loops]], [[Seeded Flows]] |

## Related

- [[Human In The Loop Index]]
- [[Human In The Loop Open Questions]]
