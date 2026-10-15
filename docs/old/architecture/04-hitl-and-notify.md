# 04 — Human-in-the-loop & notification

The async protocol that lets a headless agent ask a human a question, and the escalation ladder that chases
the human across channels. The central reframe: **MCP is an optimization, the artifact-file exchange is the
primitive** — which is also what makes HITL provider-agnostic.

← back to [README](./README.md) · ports: [01](./01-ports.md)

---

## 9. Human-in-the-loop protocol

- **Role:** the `questions` model, the `ask_user` MCP server, park/resume, and the `/inbox` screen (PRD §9–10).
- **Seam — the key reframe:** the fundamental protocol is not MCP. It is:

  > agent emits a `questions` artifact → engine **parks** the run → human answers → engine **resumes** with an
  > `answers` artifact in context.

  MCP `ask_user` / `ask_user_batch` is sugar that makes this *feel* synchronous by blocking in-session and
  polling the `questions` table every 2s, returning a `no_answer_yet` sentinel after 20 min. Underneath, park
  (write state, exit) + resume (`--resume --fork-session`, or context-replay) is the durable primitive — and
  the spec already implements exactly that.

- **Genericize:** two integration strategies behind one interface, chosen by provider capability
  ([01](./01-ports.md#capability-negotiation)):
  1. **MCP tool injection** where `mcp_tools` is present (Claude *and* Codex speak MCP) — synchronous feel,
     `ask_user_batch` preferred so a whole question set arrives at once.
  2. **Artifact-file fallback** for any provider without it — the engine watches the `produces:questions` path;
     when the agent writes it and exits, that *is* the batch. Park/resume makes this natural: no MCP? Then
     questions are just an artifact type the engine already knows how to watch.

  So HITL genericizes to **"MCP where available, file protocol universal."** The MCP side is the same on every
  tier: a stdio shim the CLI launches, forwarding over a unix socket to a broker in the worker, which is the only
  writer of `questions` (PRD §9). Host and sandbox runs take one path.
- **Composes with:** blocks a run ([03 §6](./03-execution-substrate.md#6-runner--execution-host)), fills the
  inbox, and triggers escalation (10). The **race fix** (backlog): an answer that arrives while the process is
  still exiting must not be lost — completion re-checks "answers arrived after last poll" and resumes instead
  of marking the step done. On any run failure, **cancel that step's pending questions** so they stop
  escalating.
- **Idea:** the `questions` artifact *is* the schema. One JSON shape — `{ id, prompt, help?, kind, options?,
  required? }` per question, five `kind`s (`yes_no|single_select|multi_select|text|number`) — drives three
  renderers with zero divergence: the MCP tool return, the `/inbox` controls, and the Slack/Discord blocks
  (10). Define it once in `core/hitl`.

### Inbox notes

Newest-blocking-first, one card per `batch_id`, five controls per `kind`, per-row elapsed, session link.
Keyboard-first (`j`/`k`, `1`–`9`, `y`/`n`, `Enter`, `⌘Enter`, `a` approves the focused gate). One SSE snapshot
stream (pending + recently-answered) so Slack answers repaint the open page — collapse the three overlapping
pollers the backlog flags into that one stream.

## 10. Notification / escalation → Notifier port

- **Role:** 5-min timer → post the question to a channel → bidirectional reconciliation, first-write-wins.
- **Seam:** Block Kit is Slack-specific; abstract to the **Notifier port**
  ([01](./01-ports.md#notifier)). A channel advertises `inline_answer` vs `link_only`; the same `questions`
  schema from (9) renders natively per adapter.
- **Genericize:** the mechanism is channel-independent — only rendering and signature verification differ:
  - **Escalation job** `escalate_question` at `now + settings.escalation_threshold_ms` (default 5 min); skip if
    already answered or posted. No token configured → log and continue (channel is optional).
  - **Idempotent reconciliation:** first write wins via a conditional UPDATE; the loser sees "already answered
    by `<channel>`". `updateResolved` (`chat.update` for Slack) repaints on web answer, channel answer, and undo.
  - **Security stays in the adapter:** Slack's v0 HMAC on the raw body, 300s replay window, `timingSafeEqual`.
- **Composes with:** subscribes to (9)'s question lifecycle; writes answers back through the *same* idempotent
  path as the web inbox, so web and channel can't diverge.
- **Idea:** `link_only` channels (email, a bare webhook) skip rich UI entirely — the message is a deep link to
  `/inbox`. New channels cost an adapter, not a bespoke interactive UI each. Never include artifact bodies or
  file contents in a notification — only task title + question text (PRD §10).
