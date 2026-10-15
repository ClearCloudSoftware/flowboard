---
tags: [flowboard, escalation-and-notifications, sources]
module: Escalation And Notifications
---

# Escalation And Notifications Sources

What each source contributed. There is no mockup for this component.

| Source | Contributed |
|---|---|
| `docs/FlowBoard/Component Documentation Tracker.md` | Scope (*"Slack escalation, signed inbound, resolve everywhere"*), feature map §13, architecture #10 Notifier port, no mockup, the suggested merge into Human In The Loop |
| `docs/feature-map.md` §13 | The three features (*Escalate after a wait*, *Answer from anywhere*, *More than one channel*) and both ideas (*Nudge the right person*, *An escalation ladder*) |
| `docs/feature-map.md` §11, §12, §19, *Across everything*, parking lot | Undo ❓; *Stays in sync*; *"my inbox"* filter; **Nudge timing**; *Keeping the pieces swappable* (*"the chat channel"*); Teams & collaboration (*"a who stamped on every … answer"*); *Kick off work from outside*; trends dashboard |
| `docs/old/PRD.MD` §1, §2 | Single user, no auth, no user table |
| `docs/old/PRD.MD` §3 | `ports/` holds `Notifier`; `adapters/notify/ # slack`; worker holds the *"escalation timer"*; only web and worker open the DB |
| `docs/old/PRD.MD` §5 | `questions.answered_via`, `escalated_at`, `slack_channel`, `slack_ts`; `jobs.kind = 'escalate_question'`; `settings` |
| `docs/old/PRD.MD` §7, §8, §9 | Job leasing and stale-lease reclaim; loop escalation (the other meaning); broker as only writer, 2 s poll, 20-min park |
| `docs/old/PRD.MD` §10 | The whole Slack spec: timer, Block Kit per kind, interactions endpoint, idempotent answers, reconciliation, env config, content rule |
| `docs/old/PRD.MD` §12, §14, §16, §17 | `POST /api/slack/interactions`, `POST /api/questions/:id/answer`; M6; acceptance line; out of scope |
| `docs/old/REBUILD-BACKLOG.md` | Preamble items 1 and 5; Story 1.1 (`expired` never set); 2.1 (cancel pending questions); 3.2 (failed runs keep escalating); 4.1 (`VIBE_ASK_TIMEOUT_MS`); 4.2 (resume race); 4.3 (SSE snapshot, 2-min window, pollers); 4.4 (undo, `unanswer`, `chat.update`); Epic 6 stories 6.1–6.3; 8.3 (threshold in minutes); 10.1; decision D2 |
| `docs/old/architecture/04-hitl-and-notify.md` §9, §10 | Component #10's role, seam, genericisation, `escalation_threshold_ms`, idempotent reconciliation, security in the adapter, `link_only`, content rule; one schema three renderers; cancel on run failure |
| `docs/old/architecture/01-ports.md` | The `Notifier` sketch (second variant); `inline_answer` vs `link_only` |
| `docs/old/architecture/07-ports-in-practice.md` | `ConsoleNotifier`; `escalate()` and `onAnswered()` call sites |
| `docs/old/architecture/06-cost-and-platform.md` §15 | *"escalation threshold (minutes)"* in settings |
| `docs/old/architecture/README.md` | Five ports table (*Notifier: Slack Block Kit → Discord, email, webhook, desktop*); *"Slack is named directly"*; module layout `notify/slack/ discord/ email/`; component #10 row |
| `docs/old/architecture/02-core-and-engine.md`, `08-sandboxing.md` | The two other meanings of *escalate* (loop, privilege) |
| `docs/old/reference/core/ports/notifier.ts` | `Notifier`, `QuestionContext`, `PostedRef`; the port's boundary comment |
| `docs/old/reference/core/hitl/question.ts` | `Question`, the five kinds; one shape for three renderers |
| `docs/flowboard-ideation.drawio` — *FlowBoard ideation* | *Slack escalation* group: *"Escalate after 5 min"*, *"Verification"*, *"Notifier port / Slack today → Discord, email, webhook, desktop tomorrow"*; inbox cards *"Waiting time → Slack at 5 min"*, *"Cards resolve calmly when answered from Slack"*; edge *Notifier port → Five ports* |
| `docs/flowboard-ideation.drawio` — *Logical components* | `Notifier` port; *Slack / Block Kit + signature check* adapter; edges *Question service → Notifier* (*"escalate at 5 min"*) and *Notifier → Slack* |
| `docs/flowboard-ideation.drawio` — *Functional components* | *Escalation* group: *Escalate after 5 min*, *Verify inbound*, *Resolve everywhere*; *Answer from Slack* under Human in the loop; edge *Human in the loop → Escalation* (*"unanswered too long"*) |
| `docs/flowboard-ideation.drawio` — *Harness architecture* | *"Escalation + Notifier / escalate_question after 5 min · Slack Socket Mode + Block Kit, so no public URL · first answer wins, web or Slack"*; *"Slack / Socket Mode WebSocket, outbound only"*; edge H *"Block Kit after 5 min"*; job loop kinds; concept 8 *Human escalation*; life-of-a-step letter H |
| `docs/mockups/inbox.html` | `ESCALATE = 10 * MIN`; `isEscalated` on every card; `soon` countdown; topbar and status bar; context panel *from chat*; `via` tags; the answered-in-chat toast; empty state |
| `docs/mockups/inbox-guide.html` | *The escalation timer*, *Whoever answers first wins*, the life-of-a-question diagram, the two-branch walkthrough, the *from chat* rule |
| `docs/mockups/monitor.html`, `monitor-guide.html` | `ESCALATED` tag past 10 min on any needs-you item; *Escalated* row (*"Not a button"*) |
| `docs/mockups/task-detail-guide.html` | *waiting on you*: *"Anything past your escalation window should already have reached you in chat."* |
| `docs/mockups/capability-library.html` | A `notify` step in a sample flow, which is not this component |
| `docs/mockups/README.md` | The inbox mockup's ten-minute crossing and the answered-in-chat moment |
| `docs/old/design/brief.md`, `README.md`, `Vibe Kanban.dc.html` | *"After five minutes a question escalates to Slack"*; the colour ramp; `→ Slack in 0m 48s`; collapsed escalated batch; the answered-from-Slack sequence (1e); `answeredVia: 'ui' \| 'slack'`; footer figures; threshold as a tweak |
| Sibling vault sets | [[Escalation To Chat]], [[Answering Rules]], [[Question Lifecycle]], [[Human In The Loop Data Model]], [[Human In The Loop Open Questions]] #4, #16, #18–#23; [[Waiting And Escalation]], [[Monitor Open Questions]] #8–#10; [[Cost API And Routes]] |

## Not found

No source mentions escalation in `docs/old/architecture/03-execution-substrate.md`, `05-environment-and-registry.md` or `09-memory.md`, `docs/mockups/flow-designer*.html`, `task-detail.html` or `capability-library-guide.html`, or in the other reference `.ts` files.

## Related

- [[Escalation And Notifications Index]]
- [[Escalation And Notifications Open Questions]]
- [[Component Documentation Tracker]]
