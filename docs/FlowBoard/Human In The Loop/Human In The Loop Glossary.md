---
tags: [flowboard, human-in-the-loop, glossary]
module: Human In The Loop
---

# Human In The Loop Glossary

| Term | Meaning |
|---|---|
| **Question** | One thing an agent asks you, stored as a `questions` row: `prompt`, optional `help`, a `kind`, `options` for the select kinds, `required` (PRD §5). See [[Questions]]. |
| **Kind / shape** | The question's form: `yes_no`, `single_select`, `multi_select`, `text`, `number` (PRD §5, `question.ts`). The inbox guide calls them *shapes* and labels them *yes / no, pick one, pick many, a number, free text*. See [[Question Shapes]]. |
| **Batch** | Questions asked together by one step, sharing a `batch_id` (PRD §5). Asked with `ask_user_batch`. The mockup submits a batch as one; the PRD answers one question per call (Open Questions #15). See [[Question Batches]]. |
| **Card** | One item in the inbox queue. Four kinds: question, batch, gate, failure (inbox guide). See [[Inbox Card Kinds]]. |
| **Gate** | A step instance in `awaiting_approval`, waiting for Approve or Send back. It is set by `advance_mode='approval'`, a missing outcome, or a spent or stuck loop (PRD §8). |
| **Approve** | Clear a gate: the step counts as passed and the next step queues. *"approve means pass"* (PRD §8). |
| **Send back / reject** | Fail a gate with a reason that is *"handed to the next attempt"* (inbox guide). The PRD and API say **reject** (`POST /api/step-instances/:id/reject`); the mockups say **Send back**. See [[Approving And Sending Back]]. |
| **Failure card** | The inbox card for a step that *"ran out of attempts"* (inbox guide). See [[Failures And Escalated Loops]]. |
| **Park** | The run saves its state and exits while it waits for answers: run `parked`, step instance `awaiting_answers` (PRD §9). PRD §1 also says steps *"park and wait for me to approve or answer questions"*, so it loosely covers gates too. |
| **Resume** | Start a new run that continues the parked session with the answers: `--resume <claude_session_id> --fork-session` (PRD §9), or context-replay when the provider can't fork (`01-ports.md`). |
| **Sentinel** | `{ "status": "no_answer_yet", … }`, returned by the ask tool after 20 minutes so the agent writes its state and ends its turn (PRD §9). As built (2026-10-18), the shim would pass it through unchanged, but nothing sends it: `run-agent`'s broker has no time limit and both adapters lift theirs, so a question waits until it is answered. |
| **Broker** | The part of the worker process that is *"the only writer of the `questions` table"*. One unix socket per run (PRD §9). Answers still arrive through `apps/web` endpoints: see Open Questions #36. As built (2026-10-18), the only broker is `run-agent`'s (`cli/src/ask/broker.ts`): it asks one batch at a time in the terminal and writes no table. |
| **Shim** | `code/flowboard/packages/ask-user/` (the PRD's `apps/mcp-shim`), a stdio MCP server named `flowboard` that the CLI launches. It forwards tool calls to the broker and *"never opens the database"* (PRD §9); it reads only `FLOWBOARD_ASK_SOCKET`. `02` §1 and backlog Story 1.1 have the MCP process open the DB: see Open Questions #37. |
| **Escalation (to chat)** | Posting a still-pending question to a chat channel after a wait (PRD §10). Also called a **nudge** (feature map §19 *Nudge timing*). |
| **Escalation threshold** | How long a question waits before escalation: `settings.escalation_threshold_ms`, default 5 minutes (`04` §10). The inbox mockup uses 10. See [[Human In The Loop Open Questions]] #18. |
| **First write wins** | Of two answers to the same question, the first stored one counts. The second submitter sees *"already answered by <channel>"* (PRD §10). |
| **Reconciliation** | Keeping web and chat in step: a chat answer repaints the inbox, a web answer repaints the chat message (`chat.update`) (PRD §10). |
| **Notifier** | The port behind escalation. Slack is the adapter the PRD builds; Discord, email and webhook are others (`notifier.ts`). The drawio orders them: *"Slack today → Discord, email, webhook, desktop tomorrow"*. |
| **`inline_answer` / `link_only`** | Notifier capabilities. An `inline_answer` channel renders native controls; a `link_only` channel sends *"a deep link to `/inbox`"* (`01-ports.md`). |
| **`answered_via`** | The channel an answer came through, `'web' \| 'slack'` (PRD §5). The mockup shows it as a `web` / `slack` tag. |
| **Waiting on me / Everyone** | The inbox topbar filter (mockup). The schema has no notion of *who*: see Open Questions #4. |
| **Needs you** | The monitor's triage band and the task-detail gate banner. Both are other places to make the same decisions. See [[Decisions Outside The Inbox]]. |
| **Wasted** | Spend moved aside when work is discarded (`runs.wasted = 1`). Sending back moves the discarded attempt's spend to wasted. |

> [!warning] Overloaded words
> - **"Escalate"** means two things here. *Loop escalation* stops a spent or stuck rework loop at a human gate (PRD §8, *"Escalate, don't fail"*). *Chat escalation* posts a waiting question to Slack (PRD §10). Both route to you, through different mechanisms. A third, unrelated sense is *privilege escalation* in the sandbox (`08`: *"No privilege escalation"*).
> - **"Blocked"** is a task status (PRD §5). It is set on a spent or stuck loop (§8), on a non-transient run failure (§7), and, per backlog Story 4.2, when a run parks (*"task blocked"*). The monitor's *blocked* filter means *"everything waiting on a human"*, and the task-detail status bar reads *blocked on you* while a gate waits (its header pill reads *waiting on you*). The PRD doesn't say what a plain approval gate does to the task status; [[Task Lifecycle]] leaves it `running` as an inference ([[Execution Open Questions]] #11). See Open Questions #6.
> - **"Parked"** means a run waiting for answers (PRD §9). The monitor guide also calls a failed task parked: *"The task is parked and spending nothing."*
> - **"Retry"** means three things. An **infra retry** automatically re-runs after a transient failure and is not counted (PRD §7). **Retry** on an escalated-loop gate *"grants one more attempt and carries my note into it"* (§8). **Retry as-is** and **Allow host & retry** are failure-card actions (mockup). See [[Failures And Escalated Loops]].
> - **"Answer"** can mean the value you give, the `answers` artifact type (PRD §6), or the API verb (`POST /api/questions/:id/answer`).
> - **"Questions"** is both the table and an artifact type (`questions`, PRD §6). With MCP the rows are the record. Over the file fallback, the artifact *is* the batch (`04` §9).
> - **"Failure"** on a card means *out of attempts*. Elsewhere a *run failure* means a non-zero exit (PRD §7), which is not the same thing. See Open Questions #24.
> - **"Inbox"** is the `/inbox` screen. The feature map ideas also use it for a person's queue (*"drop a light 'take a look' into their inbox"*, §3).

## Related

- [[Human In The Loop Index]]
- [[Flow Design Glossary]]
- [[Capability Library Glossary]]
- [[Escalation And Notifications Glossary]]
- [[Execution Glossary]]
