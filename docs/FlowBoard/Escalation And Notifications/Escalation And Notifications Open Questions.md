---
tags: [flowboard, escalation-and-notifications, open-questions]
module: Escalation And Notifications
---

# Escalation And Notifications Open Questions

Every place the sources disagree or leave a gap. Proposals are marked; none is in a source. Several questions are shared with [[Human In The Loop Open Questions]] (HITL) and [[Monitor Open Questions]] (Monitor); the cross-references are given.

| Theme | Questions |
|---|---|
| Timing | #1, #2, #19, #21 |
| Scope | #3, #4 |
| Rendering and content | #5, #14 |
| Transport, identity and races | #6, #10, #12, #22 |
| The port and channels | #7, #9, #11, #22 |
| Data | #8, #16 |
| Failure handling | #13 |
| UI and settings | #15, #17, #18, #20 |

### 1. 5 or 10 minutes?

5 minutes: PRD §10, §14 M6, §16; `04` §10; backlog 6.1 and 10.1; every drawio page; old brief and handoff. 10 minutes: `inbox.html` (`ESCALATE = 10 * MIN`), `inbox-guide.html`, `monitor.html:731`, mockups README. It is only a default where the value is a setting (`04` §10, `06` §15, backlog 6.1, 8.3); PRD §10 fixes it at 5. Same as HITL #18, Monitor #9, Settings And Plumbing #6. See [[Escalation Threshold]].

### 2. Milliseconds or minutes?

`escalation_threshold_ms` in `04` §10 and backlog 6.1; *"escalation threshold (minutes)"* in `06` §15 and *"in minutes"* in backlog 8.3. **Proposal:** store milliseconds, show minutes (also the proposal in [[Settings Data Model]], with the old prototype's 1–30 minute range).

### 3. Questions only, or gates, failures and escalated loops too?

PRD: `escalate_question` only, columns only on `questions`. Drawio concept 8: *"Every stop (gate, question, spent or stuck loop) lands in one inbox, then Slack."* The inbox and monitor mockups tag gates and failures as escalated. Same as HITL #19, Monitor #10. **Proposal** (shared with [[Human In The Loop Data Model]]): `step_instances.escalated_at`, `notify_channel`, `notify_ref`. See [[Escalation Scope]].

### 4. One message per question, or per batch?

One job per inserted question (PRD §10) posts a batch as N messages. The mockup escalates the batch card once, and the inbox guide argues a batch should be answered together. Same as HITL #20. See [[Rendering Questions In Chat]].

### 5. "The same controls" in chat?

Inbox guide: *"posted to your chat tool with the same controls on it"*. PRD §10: text and number open a modal with `plain_text_input`. Nothing says how a number typed in Slack is validated, or how a required answer is enforced there. See [[Rendering Questions In Chat]].

### 6. Slack over HTTP or Socket Mode?

PRD §10, §12 and backlog 6.2: an inbound endpoint with HMAC verification. Drawio *Harness architecture*: *"Slack Socket Mode + Block Kit, so no public URL"*, *"Socket Mode WebSocket, outbound only"*. A local app has no public URL for Slack to call. The drawio's other pages keep the signature check. Same as HITL #21. See [[Slack Adapter]], [[Signed Inbound Interactions]].

### 7. Which Notifier interface?

`01-ports.md`: `id` is a union of four names, `postQuestion(q)`, `updateResolved(ref: string, by)`. `notifier.ts`: `id: string`, `postQuestion(q, ctx)`, `updateResolved(ref: PostedRef, by)`. `07` uses `id = 'console'`. Same as HITL #22. **Proposal:** treat `notifier.ts` as canonical, since `07` compiles against it. See [[Notifier Port]].

### 8. Slack-named columns

`slack_channel`, `slack_ts`, and `answered_via` values `'web' | 'slack'` (PRD §5) tie the schema to one adapter. The old handoff used `answeredVia: 'ui' | 'slack'`. **Proposal:** `notify_channel`, `notify_ref` (the rename is shared with HITL #22), and `answered_via` holding the Notifier `id` (new here). See [[Escalation Data Model]].

### 9. One channel or several?

One `SLACK_CHANNEL_ID` in the PRD; one injected `notifier` in `07`; a port built for many. Nothing says how a channel is chosen, whether a question can go to two, or whether channel choice belongs in `settings`. See [[Notification Channels]].

### 10. Who answered, and who may answer?

PRD §10 wants the repaint to show *"by whom"*; `updateResolved(ref, by)` carries a name; the mockups say *"dana answered"* and *"handled by you"*. But the schema stores only `answered_via`, and PRD §2 has *"no user table"*. No source restricts who may answer in Slack, and the signature only proves the request came from Slack. **Proposal:** `questions.answered_by` holding the Slack display name or `you` for the web. Related: HITL #4, [[Personal Routing And Ladders]].

### 11. Repainting a cancelled or expired question

`updateResolved` is the only repaint. When a run fails, pending questions are cancelled *"so they stop escalating"* (`04` §9); when a task is cancelled, too (backlog 2.1). But a message already in Slack keeps its live buttons. `expired` is never set (backlog 1.1, **BUG**; HITL #17). **Proposal:** call `updateResolved(ref, 'cancelled')`, or add an `updateCancelled(ref, reason)` method. See [[Escalation Lifecycle]].

### 12. What does the loser of a race see?

PRD §10: *"already answered by <channel>"*. Inbox guide: *"The loser is not an error; the second place simply closes."* Where the message shows and what `<channel>` holds is not said. See [[First Write Wins]].

### 13. Posting fails, or posts twice

No retry rule for a failed `chat.postMessage`, though `jobs` has `attempts` and `last_error`. If the worker posts and dies before saving `slack_ts`, the reclaimed job (*"stale-lease reclaim after 10 minutes"*, PRD §7) sees nothing posted and posts again. **Proposal:** record `escalated_at` before posting and treat a set `escalated_at` with no ref as *"posted, ref unknown"*. See [[Escalation Timer]].

### 14. Can question text leak content?

The rule bans *"artifact bodies or file contents"* (PRD §10), but the agent writes the question text. No length limit or redaction is specified. The rule also allows only *"title + question text"*, while `QuestionContext` carries `stepName` and `sessionUrl` and select questions need their options; no source says whether those are within the rule. See [[Notification Content Limits]].

### 15. Toast or no toast?

Old handoff 1e: *"No colour flash, no toast, no motion beyond the opacity change."* The mockup shows a toast: *"dana answered pdf-import · plan in chat — it's closed here too"*. See [[Escalation In The UI]].

### 16. "Only writer of questions"

PRD §9: the broker *"is the only writer of the `questions` table"*; `04` §9, `08` (*"which alone writes `questions`"*) and the drawio broker card (*"only writer of questions"*) repeat it. Web answers, Slack answers and the escalation job's `saveRef` also write it. First-write-wins needs every answer to go through one conditional UPDATE. Not reconciled. See [[Escalation Runtime]].

### 17. No settings route

The threshold is a setting in `04` §10, `06` §15 and backlog 6.1 and 8.3 (feature map §19 names it *Nudge timing*), but PRD §12 has no settings endpoint, and PRD §10 fixes the value at 5 minutes. **Proposal:** `GET` / `PATCH /api/settings`, shared with [[Cost API And Routes]], [[Settings And Plumbing API And Routes]], [[Memory API And Routes]] and [[Sandboxing API And Routes]]; tracked as [[Settings And Plumbing Open Questions]] #2. See [[Escalation API And Routes]].

### 18. Undo and the chat message

Keep a 10 s undo or not (backlog 4.4, decision D2; feature map §11 ❓). If kept, `chat.update` on undo (backlog 4.4, 6.2), but nothing says whether the Slack buttons come back. Same as HITL #16. See [[Answering Rules]].

### 19. Does a threshold change affect questions already waiting?

Each question's `escalate_question` job gets a fixed `run_after` at insert (PRD §10). As written, changing the setting only affects new questions. Not stated either way.

### 20. How waiting time shows

The old handoff ramps colour, collapses escalated batches by default (*"asserted, not user-tested"*) and shows `→ Slack in 0m 48s` in the open batch's header. The mockup shows a countdown only in the last 3 minutes. Same as HITL #23.

### 21. Does the run park before or after escalation?

PRD §9 holds the agent's call open for 20 minutes before parking; the inbox guide's diagram draws *parked* before *escalated*. Same as Monitor #8. See [[Escalation Lifecycle]].

### 22. How does a Slack interaction reach the adapter?

The port has no inbound method (`01-ports.md`, `notifier.ts`). Signature verification *"stays in the adapter"* (`04` §10; `notifier.ts`: *"the adapter only renders and verifies signatures"*). But the route is thin and calls *"a function in `packages/core`"* (PRD §12), and `06` §15 says *"Every port is called from `src/lib/`, **never from a route**"*. No source says how the route hands the raw body and headers to the adapter's check without calling an adapter itself. **Proposal:** the route passes the raw body and headers to one core function, which asks the injected channel adapter to verify and parse, then calls the shared answer path. See [[Signed Inbound Interactions]], [[Notifier Port]].

## Related

- [[Escalation And Notifications Index]]
- [[Escalation And Notifications Sources]]
- [[Human In The Loop Open Questions]]
- [[Monitor Open Questions]]
