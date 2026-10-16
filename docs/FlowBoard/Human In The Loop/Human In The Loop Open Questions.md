---
tags: [flowboard, human-in-the-loop, decisions]
module: Human In The Loop
---

# Human In The Loop Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building. Every **proposal** made in another note is listed here. Numbers are stable; new questions are appended. Where a sibling set logs the same question, it is named with *Same as*.

## What the inbox holds

### 1. Questions only, or gates and failures too?

PRD §10 scopes the inbox to questions: *"Every pending question across all projects"*, fed by `GET /api/questions?state=pending` (§12). Approve and Reject live on the task detail sheet (§13). The inbox mockup mixes four card kinds. The drawio disagrees with itself: its *Logical components* inbox is *"open questions across projects"*, while the harness card reads *"Inbox /inbox / questions, approval gates, escalated loops"* and concept 8 says *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* The mockups README calls the inbox *"every question and approval waiting on you"*, with no failures. `04` §9 has *"`a` approves the focused gate"*. **Proposal** in [[Human In The Loop API And Routes]]: a `GET /api/inbox` feed and one SSE stream covering all four kinds. See [[Inbox Card Kinds]]. Related: [[Monitor Open Questions]] #48.

### 2. Queue order

*"newest-blocking-first"* (PRD §10, `04` §9, backlog Story 4.3), *"most-urgent first"* (feature map §12), or *"Oldest first, not most important"* (inbox guide, mockup, monitor). *Newest-blocking-first* reads either as the most recently blocked first or as the one blocking longest. The guide argues for the second: *"it does know which has been blocking a run the longest"*. See [[Inbox Order And Filters]]. Same as [[Monitor Open Questions]] #6.

### 3. Grouping

By task (PRD §10, feature map §12), one card per `batch_id` (`04` §9, backlog 4.3), by `(taskId, stepRunId)` (old handoff), or one card per item (mockup). Two waiting items on one task are two cards in the mockup and one group in the PRD. The monitor mockup shows one band item per task (its first blocking run), so in effect it groups by task as the PRD does. Related: [[Monitor Open Questions]] #5 (batches in the monitor's band).

### 4. Who is "me"?

The mockup filters *Waiting on me / Everyone*, labels cards *waiting on dana*, and toasts *"dana answered … in chat"*. PRD §2: *"No auth, no multi-tenancy, no user table"*. `questions` has no assignee and records only the channel (`answered_via`). PRD §10 still asks the Slack repaint to show *"resolved and by whom"*. The feature map calls identities *"the one genuinely new foundation the team ideas need"*, with light roles for *"who can edit recipes, approve gates, install skills, see costs, open a repo"*, and suggests *"Local-collab first — named people, assignees, and per-person routing need no accounts server"*. **Proposal** in [[Human In The Loop Data Model]]: `answered_by` plus an assignee, once identities exist. Same as [[Escalation And Notifications Open Questions]] #10 and [[Monitor Open Questions]] #29.

## Waiting and parking

### 5. When does a run let go?

The mockups park on ask: *"When an agent asks, it saves its place and lets go of its worker"* (inbox guide); *"the run stopped billing the moment it asked"* and *"It saved its place and let go of its worker — from this moment it costs nothing to leave it waiting"* (monitor guide); *"paused, billing stopped"* (task detail); *"A run that asks you a question saves its place and stops billing"* (task-detail guide). The PRD holds the tool call open, polling every 2 s, for up to 20 minutes before the sentinel (§9; `04` §9; backlog 4.1; drawio *"20 min unanswered → park"*). During those 20 minutes the process and its worker slot stay busy. The feature map agrees with the PRD (*"If you don't answer within a while"*). A blocked CLI generates no tokens, so *"not billing"* may hold either way. *"slot released"* holds only after parking. See [[Ask Park And Resume]]. Same as [[Monitor Open Questions]] #8 and #42, [[Escalation And Notifications Open Questions]] #21, [[Task Detail Open Questions]] #17 and [[Cost And Control Open Questions]] #9.

### 6. Task status while a question waits

Backlog Story 4.2 sets the task `blocked` on park, and tags that item **PRD**. The PRD uses `blocked` for spent or stuck loops (§8) and non-transient failures (§7). The monitor's *blocked* filter means *"everything waiting on a human"*, and the task-detail status bar reads *blocked on you* while a gate waits (its header pill reads *waiting on you*). The PRD doesn't say what a plain approval gate does to the task status. One status covers waiting on you, out of attempts, and broken. See [[Question Lifecycle]] and #39. Same as [[Execution Open Questions]] #11.

### 7. A `resume_step` job, or `start_run`?

Backlog Story 1.1: *"`jobs.kind` includes `resume_step` (or drop it, see 4.4)."* (**DEC**). PRD §9 resumes with *"a new `start_run`"*, and `jobs.kind` (§5) has no `resume_step`. Same as [[Execution Open Questions]] #37.

### 8. Who writes `questions.json` and `answers.json`?

The seeded `grill` step produces `questions` and `answers` (PRD §15), and the PRD's disk example has `02-questions.json` and `02-answers.json` (§6). `04` §9 frames the protocol as artifacts. On the MCP path the record is the `questions` table, and no source says who writes the files, or whether they exist at all. See [[Human In The Loop Storage]].

### 9. HITL in a sandbox — D9 is stale

Backlog **D9**: *"Artifact-file park/resume by default; host-side broker over a unix socket when richer."* Story 3.5 offers both. PRD §9, `08-sandboxing.md` and the architecture README (*"decided: host-side broker on every tier"*) settle on the broker, with the file exchange as the no-MCP fallback. Feature map §10 also still asks *"❓ … how an agent asks you questions from inside a sealed box."* The D9 row and the feature map ❓ should be updated. Same as [[Sandboxing Open Questions]] #30; see [[Host-Side Brokers]].

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

Feature map §11 ❓, backlog Story 4.4 (**DEC/NEW**) and backlog decision **D2** (*"Drop from the MCP path; keep web-side undo only while no agent is waiting"*). The old handoff has an `undo` link; the mockup has none. Open: whether to keep it, how long, whether it can undo an answer a resumed run already read, and how it interacts with memory commit ([[Answers And Memory]]). See [[Answering Rules]]. Same as [[Escalation And Notifications Open Questions]] #18 and [[Memory Open Questions]] #16.

### 17. The `expired` state

*"Either use `questions.state='expired'` or remove it. Today it is never set."* (backlog Story 1.1, **BUG**). Nothing defines when a question expires. Same as [[Escalation And Notifications Open Questions]] #11 (what a cancelled or expired question leaves in chat).

## Escalation

### 18. 5 or 10 minutes?

5 minutes: PRD §10, §14 M6, §16; `04` §10; backlog Stories 6.1 and 10.1; drawio; old brief and handoff; the old design prototype (`Vibe Kanban.dc.html`, `escalationMinutes` default 5, range 1–30). 10 minutes: inbox mockup (`ESCALATE = 10 * MIN`, *"escalation after 10m"*), inbox guide (*"Ten minutes without an answer"*), monitor mockup, mockups README (*"one card crosses the ten-minute threshold while you watch"*). Whether it is a setting at all is disputed. PRD §10 fixes it (*"`run_after = now + 5 minutes`"*), and PRD §13's settings list (draft mode, sandbox, memory) has no threshold. It is a setting, so 5 is only a default, in `04` §10 (`settings.escalation_threshold_ms`), `06` §15 (*"escalation threshold (minutes)"*), backlog Stories 6.1 and 8.3, feature map §19 (**Nudge timing**) and the old handoff (*"Escalation threshold is a setting (default 5 minutes)"*). Where it is a setting, the unit is also undecided. `04` and backlog Story 6.1 use milliseconds (`escalation_threshold_ms`); `06` §15 and backlog Story 8.3 say minutes. Same as [[Escalation And Notifications Open Questions]] #1 and #2, [[Monitor Open Questions]] #9, [[Execution Open Questions]] #59 and [[Settings And Plumbing Open Questions]] #6.

### 19. Do gates and failures escalate?

PRD escalation is per question (`escalate_question`, `questions.escalated_at`). In the inbox mockup, gates and failures escalate too: `billing-webhook` shows *escalated*, and `isEscalated` applies to every card. The inbox guide's beat 1 says so in words: *"Two have been waiting past the ten-minute window, so they are in your chat tool as well as here"*, and one of the two is the failure. The monitor mockup marks every *Needs you* item past 10 minutes `escalated`, though its guide lists *Escalated* only for a question. The task-detail guide's *waiting on you* row: *"Anything past your escalation window should already have reached you in chat"*, for a gate or a question. Concept 8: *"lands in one inbox, then Slack."* The schema has nowhere to record an escalated gate. **Proposal** in [[Human In The Loop Data Model]]: `escalated_at` and a notify ref on `step_instances`. Same as [[Escalation And Notifications Open Questions]] #3 and [[Monitor Open Questions]] #10.

### 20. One chat message per question or per batch, and with which controls?

`escalate_question` is enqueued per question insert (PRD §10), so a batch of five would post five messages. The mockup escalates the batch card as one.

The guide promises the chat message carries *"the same controls on it"*, and that a shape *"looks and behaves the same everywhere you might answer it — here, or in chat"*. The monitor guide: *"posted to your chat tool with the same buttons"*. PRD §10 renders text and number questions in Slack as *"a button that opens a modal with a `plain_text_input`"*, and multi-select as a `multi_static_select`. Same as [[Escalation And Notifications Open Questions]] #4 and #5.

### 21. Slack over HTTP or Socket Mode?

PRD §10: `POST /api/slack/interactions` with a signing secret; backlog 6.2 details HMAC verification. The drawio harness: *"Slack Socket Mode + Block Kit, so no public URL"* and *"Socket Mode WebSocket, outbound only"*. A local-first app has no public URL for Slack to call, which favours Socket Mode. The PRD config and verification steps assume HTTP. The drawio also disagrees with itself: its ideation and functional pages keep *"Signature check on Slack interactions"* and *"Verify inbound / signature check on interactions"*, alongside the harness's Socket Mode. No source says how signing works over a WebSocket. Same as [[Escalation And Notifications Open Questions]] #6; how an interaction reaches the adapter's check is [[Escalation And Notifications Open Questions]] #22.

### 22. Notifier interface variants

`01-ports.md`: `id: 'slack' | 'discord' | 'email' | 'webhook'`, `postQuestion(q)`, `updateResolved(ref: string, by)`. `notifier.ts`: `id: string`, `postQuestion(q, ctx)`, `updateResolved(ref: PostedRef, by)`. `07`: a `ConsoleNotifier` with `id = 'console'`. **Proposal:** the reference `.ts` is canonical, and the schema's `slack_channel`/`slack_ts` generalise to a channel-neutral ref ([[Human In The Loop Data Model]]). Same as [[Escalation And Notifications Open Questions]] #7 and #8.

### 23. How waiting time shows

The old handoff ramps colour (grey under 2 min, amber from 2 min), collapses escalated batches by default, and shows `→ Slack in 0m 48s`. Its own open questions flag the collapse: *"Batch collapse-on-escalation is asserted, not user-tested — worth a flag."* The mockup shows a countdown only in the last 3 minutes and keeps escalated cards in the queue (the oldest is open first). Same as [[Escalation And Notifications Open Questions]] #20.

## Decisions

### 24. Failure card vs the escalated-loop gate

PRD §8: a spent or stuck loop sets `awaiting_approval` + task `blocked`, shows the last artifact, and offers **Retry** (with a note, counter not reset) or **Fail task**. The mockups' failure card offers **Allow host & retry**, **Retry as-is** and **Open the log**, with no Fail task and no note. Its example, an egress denial counted as *Attempt 3 of 3*, looks like a run failure (non-zero exit), which PRD §7 sends straight to `blocked` as an infrastructure failure instead of through the attempt-counted rework loop. The monitor guide re-queues *Allow host & retry* *"as the next attempt"*, so after *Attempt 3 of 3* it starts a 4th run past the cap the card says is spent. Which states produce a failure card, and what does it offer? Some sources skip the gate altogether and fail the task at the cap: PRD §16 (*"three failed attempts fail the task"*), backlog Story 10.1, the drawio card *D3* (*"Fail on the 4th"*), the monitor guide (*"Retries are capped, then the task fails."*) and the task-detail guide (*"After the limit the engine gives up and fails the task"*). That disagreement is [[Flow Design Open Questions]] #11. **Proposal** in [[Human In The Loop API And Routes]]: a fail-task endpoint. See [[Failures And Escalated Loops]]. Same as [[Execution Open Questions]] #14, #20 and #22, [[Monitor Open Questions]] #11 and #12, [[Task Detail Open Questions]] #11 and #12, and [[Sandboxing Open Questions]] #14.

### 25. *Retry as-is* for transient failures

The monitor guide offers *Retry as-is* for *"a flaky test, a rate limit, a transient error"*. PRD §7 already retries transient failures automatically (30 s, 2 min, 8 min). So a failure reaches you only after a 4th transient failure, or for a non-transient cause. Same as [[Execution Open Questions]] #23 and [[Monitor Open Questions]] #37.

### 26. *Allow host & retry* edits a step definition

It *"adds api.stripe.com to this step's egress allowlist"*. Does that make a new flow version? Who may widen egress from an inbox card? The feature map's light roles (*"who can edit recipes, approve gates …"*) are a later idea. Same as [[Flow Design Open Questions]] #14, [[Execution Open Questions]] #24, [[Monitor Open Questions]] #13 and [[Sandboxing Open Questions]] #11. **Proposal** in [[Human In The Loop API And Routes]]: an allow-host endpoint.

### 27. Is a send-back reason required?

Backlog Story 2.3: *"Reject asks for a reason"*. All three mockups send `needs another pass` when the box is blank, and the inbox and task-detail ones prefill a sample reason. PRD §8 calls the escalation Retry note *"my note"* without requiring it. Same as [[Task Detail Open Questions]] #32; where the reason goes in the prompt is [[Execution Open Questions]] #21.

## Screen and keyboard

### 28. Key maps disagree

See the table in [[Human In The Loop Controls]]. `y`/`n`, `0`, `⌘Enter`, `g i`/`g b` and `?` are in the PRD-side sources but not the mockup. `←`/`→` exist only in the mockup. `r` is *send back* in the mockups and *Retry now* in the old handoff's error state. `Esc` clears an answer (old handoff) or cancels the reason box (mockup). `j`/`k` move between questions in the PRD and between cards in the mockup; backlog Story 4.3 tracks focus *"by question id"*. Across surfaces: task detail uses `1`–`4` for tabs, and the monitor's `a`, `r` and `1`–`9` act only when the top *Needs you* item is the matching kind, so in the seeded state (a failure on top) they do nothing. The monitor puts no failure action on a key; the inbox puts *Allow host & retry* on `↵` (on a failure card `Enter` submits it), and *Retry as-is* has no key anywhere. Related: [[Monitor Open Questions]] #44.

### 29. `↵` approves a gate

In the mockup, `Enter` on an open gate approves it. The guide documents `↵` as *"Submit the card"*, and approval is `a`. One stray Enter clears a review.

### 30. Submitting from inside a field

Keys are ignored while an input or textarea has focus, so a number or text answer can't be submitted from inside the field. You have to `Tab` to the button first. The PRD's text control uses `Cmd+Enter`. The mockup's 1 s re-render also rebuilds the open card, so the field loses focus within a second (a mockup bug; it pauses only for the reason box).

### 31. Live transport — settled

The old handoff says *"Server push (websocket)"*. The PRD (§2: *"not websockets"*), `04` §9 and backlog 4.3 say SSE. Listed only so the handoff isn't followed by mistake.

### 32. Where the context figures come from

*Next decision in about 4 minutes*, *median reply*, *from chat N of M*, *costing you $/hr* and *answered today* are not specified. Backlog 4.3 says *"next checkpoints (median ETA)"*; the old handoff has *"label/ETA pairs"*, and already shows such figures without saying how they are computed (`answered today: 34 · median response 41s · escalation threshold 5m`; `next checkpoint ~4m · questioning step usually asks 5–8 · 34 answered today`). **Proposal:** answer metrics from `answered_at − created_at` and `answered_via`; burn from live run cost; next decision from the median duration of the running steps that lead to a gate. Same as [[Monitor Open Questions]] #15 and [[Cost And Control Open Questions]] #3.

### 33. Loading and error states

The mockup has none. The old handoff (1d) specifies skeletons, *"Lost the orchestrator"*, a stale badge and disabled controls, and its error state *"blocks submission rather than queuing it"*. Backlog Story 4.3 lists *"loading skeleton; "lost the orchestrator" card; stale badge; empty state"*, and Story 9.4 asks for *"`aria-live` on the lost‑connection banner"*. Same as [[Monitor Open Questions]] #31.

### 34. Light or dark?

PRD §13 and the old brief: *"Dark-first"* (*"Light mode should work but dark is the one to design."*). The old handoff is dark with a light variant (1f). The mockup is light only, and backlog Story 9.1 makes light the default. `06` §15 makes it a setting, *"theme (light/dark/system)"*, and the feature map asks for *"light and dark"*. Same as [[Flow Design Open Questions]] #34, [[Monitor Open Questions]] #27 and [[Settings And Plumbing Open Questions]] #7.

### 35. Accessibility of the controls

The mockup labels the number and text fields and the pips, but its option buttons have no group role, its toast has no `role="status"` or `aria-live`, and its 1 s re-render resets focus. No source specifies focus order or screen-reader output for the one-open-card model. Backlog Story 9.4 asks for *"labels for every control"* and *"`aria-live` on the lost‑connection banner"*; the feature map for a design *"friendly to screen readers"*. The old handoff sets *"Contrast floor: 4.5:1 for all text"* and draws focus as the accent left border and number chip, *"not as a browser outline"*. See [[Human In The Loop Controls]]. Same as [[Monitor Open Questions]] #50.

## Added in the second grounding pass

### 36. Who writes answers to `questions`?

PRD §9: the broker *"is the only writer of the `questions` table"*. But answers land in its `answer`, `answered_at`, `answered_via` and `state` columns, and they arrive through `POST /api/questions/:id/answer` and `POST /api/slack/interactions`, handlers in `apps/web` (§12), which opens the DB (§3). The escalation job also saves its chat ref on the row. Either `apps/web` writes the answer columns, or it hands answers to the broker. See [[Human In The Loop Storage]]. Same as [[Escalation And Notifications Open Questions]] #16.

### 37. Does the MCP side open the database?

PRD §3 and §9: the shim *"never opens the database"*; §11.1: it *"cannot open the host SQLite file"*; `08`: *"No DB file or network inside the box"*. `02` §1 and backlog Story 1.1 open the DB *"so worker and MCP (foreign cwd) hit the same file"*, the first build's design. See [[Ask User MCP Server]]. Same as [[Execution Open Questions]] #54 and [[Settings And Plumbing Open Questions]] #20.

### 38. Resume by fork, or by prompt replay?

PRD §9 resumes with `--resume <claude_session_id> --fork-session`; the drawio harness says only *"resume with --resume"* and doesn't say whether it forks; `01-ports.md` keeps context-replay as the fallback without `resume_fork`. The drawio *Advance modes* card reads *"park / resume via prompt replay"*, the architecture README lists *"Park/resume via prompt replay"* as the primitive, and `04` §9 allows either. Which is the v1 mechanism for Claude? See [[Ask Park And Resume]] and [[Session Resume And Context Replay]].

### 39. An exit-0 run after the sentinel: `succeeded` or `parked`?

PRD §7: *"On exit code 0, set the run to `succeeded`, scan for artifacts, then apply the advancement rules in §8."* §8 then sets `awaiting_answers` *"after a run succeeds"*. PRD §9: *"The runner sees the process exit, sets the run to `parked`"*. Backlog Story 4.2 sides with §9. See [[Question Lifecycle]].

### 40. Approval step with unanswered questions

*"After a run succeeds"* PRD §8 checks `advance_mode='approval'` before unanswered required questions. An approval step whose run ends with required questions open would wait at `awaiting_approval` and never reach `awaiting_answers`, so you could approve a step whose questions nobody answered. Intended? See [[Approving And Sending Back]]. Same as [[Execution Open Questions]] #5.

### 41. What a `manual` step does

PRD §5 allows `kind = 'manual'` and the §13 flow editor offers it, but no rule says how it runs, whether it lands in the inbox as a card, who completes it, or what sets its outcome. The feature map's ideas (*"a manual or approval step can name who does it"*, *"a simple human checklist"*) point at a human task. See [[Human In The Loop Roadmap]] and [[Step Kinds]]. Same as [[Execution Open Questions]] #6.

### 42. What else a resume carries

Whether memory recall runs again on resume ([[Memory Open Questions]] #10); where a sandboxed run's CLI session is kept between containers ([[Sandboxing Open Questions]] #18); and whether the resumed run's cost is a new row or adds to the parked one ([[Cost And Control Open Questions]] #16; PRD §9's *"a new `start_run`"* suggests a new run). See [[Ask Park And Resume]].

### 43. When did a gate start waiting?

The inbox shows *waited 5m* on a gate card, and the monitor and task detail tick the same figure, but `step_instances` has no timestamp for entering `awaiting_approval`. **Proposal** in [[Human In The Loop Data Model]]: `step_instances.awaiting_since`. Same as [[Monitor Open Questions]] #22.

## Related

- [[Human In The Loop Index]]
- [[Human In The Loop Roadmap]]
- [[Human In The Loop Sources]]
- [[Flow Design Open Questions]]
- [[Escalation And Notifications Open Questions]]
- [[Execution Open Questions]]
