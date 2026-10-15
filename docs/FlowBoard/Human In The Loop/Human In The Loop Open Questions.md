---
tags: [flowboard, human-in-the-loop, decisions]
module: Human In The Loop
---

# Human In The Loop Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Every **proposal** made in another note is listed here.

## What the inbox holds

### 1. Questions only, or gates and failures too?

PRD §10 scopes the inbox to questions: *"Every pending question across all projects"*, fed by `GET /api/questions?state=pending` (§12). Approve and Reject live on the task detail sheet (§13). The inbox mockup mixes four card kinds. The drawio harness card reads *"Inbox /inbox / questions, approval gates, escalated loops"*, and concept 8 says *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* `04` §9 has *"`a` approves the focused gate"*. **Proposal** in [[Human In The Loop API And Routes]]: a `GET /api/inbox` feed and one SSE stream covering all four kinds. See [[Inbox Card Kinds]].

### 2. Queue order

*"newest-blocking-first"* (PRD §10, `04` §9, backlog Story 4.3), *"most-urgent first"* (feature map §12), or *"Oldest first, not most important"* (inbox guide, mockup, monitor). *Newest-blocking-first* reads either as the most recently blocked first or as the one blocking longest. The guide argues for the second: *"it does know which has been blocking a run the longest"*. See [[Inbox Order And Filters]].

### 3. Grouping

By task (PRD §10, feature map §12), one card per `batch_id` (`04` §9, backlog 4.3), by `(taskId, stepRunId)` (old handoff), or one card per item (mockup). Two waiting items on one task are two cards in the mockup and one group in the PRD.

### 4. Who is "me"?

The mockup filters *Waiting on me / Everyone*, labels cards *waiting on dana*, and toasts *"dana answered … in chat"*. PRD §2: *"No auth, no multi-tenancy, no user table"*. `questions` has no assignee and records only the channel (`answered_via`). PRD §10 still asks the Slack repaint to show *"resolved and by whom"*. The feature map calls identities *"the one genuinely new foundation the team ideas need"*. **Proposal** in [[Human In The Loop Data Model]]: `answered_by` plus an assignee, once identities exist.

## Waiting and parking

### 5. When does a run let go?

The mockups park on ask: *"When an agent asks, it saves its place and lets go of its worker"* (inbox guide); *"the run stopped billing the moment it asked"* (monitor guide); *"paused, billing stopped"* (task detail). The PRD holds the tool call open, polling every 2 s, for up to 20 minutes before the sentinel (§9; `04` §9; backlog 4.1; drawio *"20 min unanswered → park"*). During those 20 minutes the process and its worker slot stay busy. The feature map agrees with the PRD (*"If you don't answer within a while"*). A blocked CLI generates no tokens, so *"not billing"* may hold either way. *"slot released"* holds only after parking. See [[Ask Park And Resume]].

### 6. Task status while a question waits

Backlog Story 4.2 sets the task `blocked` on park. The PRD uses `blocked` for spent or stuck loops (§8) and non-transient failures (§7). The monitor's *blocked* filter means *"everything waiting on a human"*. One status covers waiting on you, out of attempts, and broken. See [[Question Lifecycle]].

### 7. A `resume_step` job, or `start_run`?

Backlog Story 1.1: *"`jobs.kind` includes `resume_step` (or drop it, see 4.4)."* (**DEC**). PRD §9 resumes with *"a new `start_run`"*, and `jobs.kind` (§5) has no `resume_step`.

### 8. Who writes `questions.json` and `answers.json`?

The seeded `grill` step produces `questions` and `answers` (PRD §15), and the PRD's disk example has `02-questions.json` and `02-answers.json` (§6). `04` §9 frames the protocol as artifacts. On the MCP path the record is the `questions` table, and no source says who writes the files, or whether they exist at all. See [[Human In The Loop Storage]].

### 9. HITL in a sandbox — D9 is stale

Backlog **D9**: *"Artifact-file park/resume by default; host-side broker over a unix socket when richer."* Story 3.5 offers both. PRD §9, `08-sandboxing.md` and the architecture README (*"decided: host-side broker on every tier"*) settle on the broker, with the file exchange as the no-MCP fallback. Feature map §10 also still asks *"❓ … how an agent asks you questions from inside a sealed box."* The D9 row and the feature map ❓ should be updated.

## Questions and answers

### 10. Kind names

`yes_no | single_select | multi_select | text | number` (PRD, `question.ts`); `yes_no | single | multi | text | number` (old handoff); `yesno | one | many | num | text` (mockup); *yes / no, pick one, pick many, a number, free text* (guide). **Proposal** in [[Question Shapes]]: the PRD names are canonical and the guide's words are display labels. The answer channel differs the same way: `answered_via` is `'web' | 'slack'` (PRD §5), and the old handoff's `answeredVia` is `'ui' | 'slack'`.

### 11. Required vs optional

The PRD has a per-question `required` flag, default true. The mockup treats every free-text question as optional and every other kind as required. The guide: *"Free text counts as answered even when empty"*. Should `text` default to `required = false`? Can a non-text question be optional, and how does the inbox show it?

### 12. Fields the screen needs that the schema lacks

Number `def` (default) and `unit`, text `placeholder`, the card's one-line `sum`, and the old handoff's range hint (*"integer · 1–64"*). None is in `questions` or `Question`. **Proposal** in [[Human In The Loop Data Model]]: `default`, `unit`, `placeholder`, `min`/`max`, `summary`. Each would also need a place in the MCP tool's input and the Slack renderer. Whatever the field is called, an untouched default must count as an answer (the guide: *"accepting it is the fast path"*).

### 13. Can a pick-many be answered with nothing?

The old handoff has `0` = *none* (*"or press 0 for none"*). Backlog Story 4.3 lists the `0` key without saying what it does. The mockup needs at least one pick before the question counts as answered.

### 14. More than nine options; batch size

`1`–`9` cover nine options. The PRD uses a *"RadioGroup, or Buttons if ≤3 short options"*, and the old handoff a RadioGroup for *">3 or long options"*. Neither says how many. Batches are *"five to eight"* typically (old brief, guide, drawio), but no source caps a batch or an option list.

### 15. Partial answers: per question or per batch?

The PRD answers one question per call (`POST /api/questions/:id/answer`), and resume fires *"When the last required answer arrives"*. The mockup holds answers locally and submits a batch as one (the guide: *"One submission, one resume"*). With per-question writes, a teammate in Slack could answer question 2 of a batch you are halfway through. **Proposal** in [[Human In The Loop API And Routes]]: a batch answer endpoint.

### 16. Undo window

Feature map §11 ❓, backlog Story 4.4 (**DEC/NEW**) and decision **D2** (*"Drop from the MCP path; keep web-side undo only while no agent is waiting"*). The old handoff has an `undo` link; the mockup has none. Open: whether to keep it, how long, whether it can undo an answer a resumed run already read, and how it interacts with memory commit ([[Answers And Memory]]). See [[Answering Rules]].

### 17. The `expired` state

*"Either use `questions.state='expired'` or remove it. Today it is never set."* (backlog Story 1.1, **BUG**). Nothing defines when a question expires.

## Escalation

### 18. 5 or 10 minutes?

5 minutes: PRD §10, §14 M6, §16; `04` §10; backlog Story 6.1; drawio; old brief and handoff. 10 minutes: inbox mockup (`ESCALATE = 10 * MIN`, *"escalation after 10m"*), inbox guide (*"Ten minutes without an answer"*), monitor mockup. The value is a setting (`escalation_threshold_ms`), so this is only the default. The unit is also undecided. `04` and backlog Story 6.1 use milliseconds (`escalation_threshold_ms`); `06` §15 and backlog Story 8.3 say minutes.

### 19. Do gates and failures escalate?

PRD escalation is per question (`escalate_question`, `questions.escalated_at`). In the mockup, gates and failures escalate too: `billing-webhook` shows *escalated*, and `isEscalated` applies to every card. Concept 8: *"lands in one inbox, then Slack."* The schema has nowhere to record an escalated gate. **Proposal** in [[Human In The Loop Data Model]]: `escalated_at` and a notify ref on `step_instances`.

### 20. One chat message per question or per batch, and with which controls?

`escalate_question` is enqueued per question insert (PRD §10), so a batch of five would post five messages. The mockup escalates the batch card as one.

The guide promises the chat message carries *"the same controls on it"*, and that a shape *"looks and behaves the same everywhere you might answer it — here, or in chat"*. PRD §10 renders text and number questions in Slack as *"a button that opens a modal with a `plain_text_input`"*, and multi-select as a `multi_static_select`.

### 21. Slack over HTTP or Socket Mode?

PRD §10: `POST /api/slack/interactions` with a signing secret; backlog 6.2 details HMAC verification. The drawio harness: *"Slack Socket Mode + Block Kit, so no public URL"* and *"Socket Mode WebSocket, outbound only"*. A local-first app has no public URL for Slack to call, which favours Socket Mode. The PRD config and verification steps assume HTTP. The drawio also disagrees with itself: its ideation and functional pages keep *"Signature check on Slack interactions"* and *"Verify inbound / signature check on interactions"*, which Socket Mode doesn't use.

### 22. Notifier interface variants

`01-ports.md`: `id: 'slack' | 'discord' | 'email' | 'webhook'`, `postQuestion(q)`, `updateResolved(ref: string, by)`. `notifier.ts`: `id: string`, `postQuestion(q, ctx)`, `updateResolved(ref: PostedRef, by)`. `07`: a `ConsoleNotifier` with `id = 'console'`. **Proposal:** the reference `.ts` is canonical, and the schema's `slack_channel`/`slack_ts` generalise to a channel-neutral ref ([[Human In The Loop Data Model]]).

### 23. How waiting time shows

The old handoff ramps colour (grey under 2 min, amber from 2 min), collapses escalated batches by default, and shows `→ Slack in 0m 48s`. The mockup shows a countdown only in the last 3 minutes and keeps escalated cards in the queue (the oldest is open first).

## Decisions

### 24. Failure card vs the escalated-loop gate

PRD §8: a spent or stuck loop sets `awaiting_approval` + task `blocked`, shows the last artifact, and offers **Retry** (with a note, counter not reset) or **Fail task**. The mockups' failure card offers **Allow host & retry**, **Retry as-is** and **Open the log**, with no Fail task and no note. Its example, an egress denial counted as *Attempt 3 of 3*, looks like a run failure (non-zero exit), which PRD §7 sends to `blocked` without counting an attempt. Which states produce a failure card, and what does it offer? Some sources skip the gate altogether and fail the task at the cap: PRD §16 (*"three failed attempts fail the task"*), backlog Story 10.1 and the drawio card *D3* (*"Fail on the 4th"*). That disagreement is [[Flow Design Open Questions]] #11. **Proposal** in [[Human In The Loop API And Routes]]: a fail-task endpoint. See [[Failures And Escalated Loops]].

### 25. *Retry as-is* for transient failures

The monitor guide offers *Retry as-is* for *"a flaky test, a rate limit, a transient error"*. PRD §7 already retries transient failures automatically (30 s, 2 min, 8 min). So a failure reaches you only after a 4th transient failure, or for a non-transient cause.

### 26. *Allow host & retry* edits a step definition

It *"adds api.stripe.com to this step's egress allowlist"*. Does that make a new flow version? Who may widen egress from an inbox card? Same as [[Flow Design Open Questions]] #14. **Proposal** in [[Human In The Loop API And Routes]]: an allow-host endpoint.

### 27. Is a send-back reason required?

Backlog Story 2.3: *"Reject asks for a reason"*. The mockup sends `needs another pass` when the box is blank, and prefills a sample reason. PRD §8 calls the escalation Retry note *"my note"* without requiring it.

## Screen and keyboard

### 28. Key maps disagree

See the table in [[Human In The Loop Controls]]. `y`/`n`, `0`, `⌘Enter`, `g i`/`g b` and `?` are in the PRD-side sources but not the mockup. `←`/`→` exist only in the mockup. `r` is *send back* in the mockups and *Retry now* in the old handoff's error state. `Esc` clears an answer (old handoff) or cancels the reason box (mockup). `j`/`k` move between questions in the PRD and between cards in the mockup.

### 29. `↵` approves a gate

In the mockup, `Enter` on an open gate approves it. The guide documents `↵` as *"Submit the card"*, and approval is `a`. One stray Enter clears a review.

### 30. Submitting from inside a field

Keys are ignored while an input or textarea has focus, so a number or text answer can't be submitted from inside the field. You have to `Tab` to the button first. The PRD's text control uses `Cmd+Enter`.

### 31. Live transport — settled

The old handoff says *"Server push (websocket)"*. The PRD (§2: *"not websockets"*), `04` §9 and backlog 4.3 say SSE. Listed only so the handoff isn't followed by mistake.

### 32. Where the context figures come from

*Next decision in about 4 minutes*, *median reply*, *from chat N of M*, *costing you $/hr* and *answered today* are not specified. Backlog 4.3 says *"next checkpoints (median ETA)"*; the old handoff has *"label/ETA pairs"*. **Proposal:** answer metrics from `answered_at − created_at` and `answered_via`; burn from live run cost; next decision from the median duration of the running steps that lead to a gate.

### 33. Loading and error states

The mockup has none. The old handoff (1d) and backlog 4.3 specify skeletons, *"Lost the orchestrator"*, a stale badge, and controls disabled. The handoff's error state *"blocks submission rather than queuing it"*.

### 34. Light or dark?

PRD §13: *"Dark-first"*. The old handoff is dark with a light variant (1f). The mockup is light only, and backlog Story 9.1 makes light the default. Same as [[Flow Design Open Questions]] #34.

### 35. Accessibility of the controls

The mockup labels the number and text fields and the pips, but its option buttons have no group role, and no source specifies focus order or screen-reader output for the one-open-card model. Backlog Story 9.4 asks for *"labels for every control"*. See [[Human In The Loop Controls]].

## Related

- [[Human In The Loop Index]]
- [[Human In The Loop Roadmap]]
- [[Human In The Loop Sources]]
- [[Flow Design Open Questions]]
