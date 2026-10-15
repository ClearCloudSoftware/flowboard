---
tags: [flowboard, monitor, roadmap]
module: Monitor
---

# Monitor Roadmap

## v1 scope (PRD)

| Item | PRD | Milestone |
|---|---|---|
| Board `/p/[slug]`: columns from the flow, cards with state dot, live cost, split badge; drag Backlog ↔ Todo only | §4, §13 | **M2** *"Board renders columns from a hardcoded flow"* |
| Live session viewer `/runs/[id]`: streamed summaries, collapsible tool calls, sticky footer, Stop | §13 | **M3**, *"the milestone that proves the whole idea"* |
| `run_events` + SSE tail with `Last-Event-ID` | §7, §12 | M3 |
| Live cost from tokens, authoritative cost from the result event | §7 | M3 |
| Approve / Reject / Retry endpoints | §12 | M5 (flow engine) |
| Wasted spend figure | §13 `/costs` | M8 |

Backlog fixes that land with it: Story 2.2 (card states, progress hairline, `a` shortcut, card focus, polling errors), Story 3.4 (viewer dedupe, stream-lost state, Stop as `cancelled`), Story 2.3 (Reject asks for a reason).

## Designed beyond the PRD (monitor mockup)

- A [[Needs You Band]] above everything, oldest first, with inline Approve / Send back / Answer / Retry
- Rows with a [[Flow Bar And Step States|flow bar]] in place of columns ([[Pulse View]])
- [[Worker Slots]] with the queue and the line each agent is on
- Topbar [[Burn Today And Wasted|burn, today, wasted]]
- [[Timeline View]] and [[Pipeline View]]
- The `ESCALATED` tag on any waiting item
- **Allow host & retry** for egress denials
- A [[Task Row Detail]] with live log, artifacts and spend
- Filter, sort and a full keyboard model on the board

## Ideas

| Idea | Source |
|---|---|
| **Show who owns what**: *"each card shows its owner and who a waiting gate is on ("waiting on Alice" vs "waiting on you"); filter the board to yourself, a teammate, or unassigned, and see who the bottleneck reviewer is."* | Feature map §5 |
| **Route the next human step to a teammate** | Feature map §4 |
| **Two sign-offs on one gate** | Feature map §4 |
| **A trends dashboard**: *"throughput over time, how fast questions get answered, cost per feature."* | Feature map, parking lot |
| **Replay any past run**: *"step through exactly what happened, to debug it after the fact."* | Feature map, parking lot. Drawio *Run records*: *"replayable at $0"* |
| Projection as a **materialized view refreshed on job completion** | `02` §4 |
| **Langfuse** (later): *"self-hosted traces via a plain OTel exporter from NormalizedEvent"* | Drawio *Harness architecture*; PRD §7 |
| **Spend by person and team**, **a team budget** | Feature map §18 |
| **Run agents in the cloud** | Feature map, parking lot |
| **Jump to attention** in wide flows: *"the columns that need me must stay findable"* | Drawio card *8+ columns don't fit*; handoff flow strip |

## Out of scope

PRD §17: *"Do not build: authentication, user accounts, roles, deployment config, multi-machine support, a plugin marketplace, or anything that talks to the Anthropic API directly."* So the owner ideas above wait for the teams foundation (feature map *Across everything → Teams & collaboration*), and remote workers wait for the multi-machine decision.

## Related

- [[Monitor Open Questions]]
- [[Monitor Overview]]
- [[Monitor Index]]
