---
tags: [flowboard, human-in-the-loop, api]
module: Human In The Loop
---

# Human In The Loop API And Routes

## Web routes

| Route | Screen | Source |
|---|---|---|
| `/inbox` | The inbox | PRD §10, §13 |
| `/runs/[id]` | Live session viewer, linked from each question (*"a link to the live session"*) | PRD §10, §13 |
| `/p/[slug]` and its task detail sheet | Approve / Reject on the awaiting step | PRD §13 |

The drawio *Harness architecture* names the inbox *"Inbox /inbox / questions, approval gates, escalated loops; j / k, 1–9, Enter"* and task detail `/t/[id]`.

## Endpoints in the PRD (§12)

```
POST   /api/step-instances/:id/approve      POST /api/step-instances/:id/reject
POST   /api/step-instances/:id/retry
GET    /api/questions?state=pending         POST /api/questions/:id/answer
POST   /api/tasks/:id/cancel
POST   /api/slack/interactions
```

*"All handlers are thin: validate with zod, call a function in `packages/core`, return JSON."* (PRD §12). `06` §15: *"Every port is called from `src/lib/`, **never from a route**"*.

| Endpoint | Does | Notes |
|---|---|---|
| `GET /api/questions?state=pending` | List pending questions | The inbox's feed in the PRD |
| `POST /api/questions/:id/answer` | Answer one question, first write wins | Loser gets *"already answered by <channel>"* (PRD §10) |
| `POST /api/step-instances/:id/approve` | Clear a gate (pass) | — |
| `POST /api/step-instances/:id/reject` | Fail a gate with a reason | Backlog Story 2.3: *"API accepts it … UI never sends it"* |
| `POST /api/step-instances/:id/retry` | One more attempt on an escalated loop, with a note | PRD §8 |
| `POST /api/tasks/:id/cancel` | Cancel the task, including its pending questions | backlog Story 2.1 |
| `POST /api/slack/interactions` | Inbound Slack answers; verifies the signing secret | PRD §10, backlog Story 6.2 |

From the backlog:

| Endpoint | Source |
|---|---|
| `POST /api/questions/:id/unanswer` | Story 4.4 (**NEW**), only if the undo window is kept |
| `/api/inbox/summary` | Story 4.3 names it as one of *"three overlapping pollers"* in the old build, to be collapsed into one SSE stream |

## Live updates

- *"the inbox subscribes to an SSE stream"* (PRD §10).
- *"One SSE snapshot stream (pending + recently-answered) so Slack answers repaint the open page — collapse the three overlapping pollers the backlog flags into that one stream."* (`04` §9 *Inbox notes*)
- Backlog Story 4.3: *"SSE snapshot stream (pending + answered in last 2 min)"*.
- The drawio harness: *"SSE endpoints / tail run_events by seq, questions and task state from SQLite (works across processes; catches up on reconnect)"*.
- The old handoff said *"Server push (websocket)"*. The PRD stack settles it: *"Server-Sent Events … not websockets"* (§2).

## Proposed

> [!warning] Proposal — not in any source
> Each is listed in [[Human In The Loop Open Questions]].

| Endpoint | Why | OQ |
|---|---|---|
| `GET /api/inbox` → `{ items: [question \| batch \| gate \| failure], recent: […] }` | The mockup's queue mixes gates and failures with questions; the PRD's feed lists only questions | #1 |
| `GET /api/inbox/stream` (SSE) | The one snapshot stream `04` §9 asks for; the path is not named anywhere | #1 |
| `POST /api/questions/batch/:batchId/answer` with `{ answers: { [id]: value } }` | *"One submission, one resume"* (inbox guide); avoids a half-answered batch | #15 |
| `POST /api/step-instances/:id/fail-task` (or `reject` with `{ failTask: true }`) | PRD §8's **Fail task** choice has no endpoint | #24 |
| `POST /api/step-instances/:id/allow-host` `{ host }` | The failure card's *Allow host & retry* | #26 |

## Related

- [[Human In The Loop Runtime]]
- [[Escalation To Chat]]
- [[Approving And Sending Back]]
- [[Flow Design API And Routes]]
