---
tags: [flowboard, escalation-and-notifications, concept, port]
module: Escalation And Notifications
---

# Notifier Port

The Notifier is one of *"the five ports that carry the whole program"* (architecture README). It *"Abstracts escalation away from Slack Block Kit. A channel advertises how richly it can collect an answer."* (`01-ports.md`).

| Port | Today (only adapter) | Unlocks |
|---|---|---|
| **Notifier** | Slack Block Kit | Discord, email, webhook, desktop |

(architecture README, *The five ports that carry the whole program*)

## The interface

The reference file `docs/old/reference/core/ports/notifier.ts`:

```ts
/** Context the channel shows alongside the question (PRD §10: title + question text only, never artifact bodies). */
export interface QuestionContext {
  taskTitle: string;
  stepName: string;
  /** Deep link to the live session / inbox row. */
  sessionUrl?: string;
}

/** A handle on a posted message, for later chat.update-style reconciliation. */
export interface PostedRef {
  channel: string;
  /** Provider message id — Slack's `ts`, a Discord message id, an email thread id. */
  ref: string;
}

export interface Notifier {
  readonly id: string;
  /** `inline_answer` renders native controls; `link_only` sends a deep link to /inbox. */
  readonly capabilities: ReadonlySet<'inline_answer' | 'link_only'>;
  postQuestion(q: Question, ctx: QuestionContext): Promise<PostedRef>;
  updateResolved(ref: PostedRef, by: string): Promise<void>;
}
```

The file's own comment sets the boundary: *"Reconciliation (first-write-wins, repaint on answer/undo) is channel-independent and lives in core/hitl; the adapter only renders and verifies signatures."*

## What lives where

| Concern | Lives in | Source |
|---|---|---|
| The timer, skip rules, first-write-wins, repaint triggers | `core/hitl` | `notifier.ts`, `04` §10 |
| The `Notifier` interface | `core/ports` | PRD §3, `01-ports.md` |
| Block Kit rendering, `chat.postMessage`, `chat.update` | the Slack adapter, `adapters/notify/slack` | PRD §3, architecture README |
| Signature verification | the adapter | *"Security stays in the adapter"* (`04` §10) |
| The `Question` shape the adapter renders | `core/hitl/question.ts` | reference file |

*"`core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule."* (architecture README).

## Two versions of the interface

> [!warning] The sources sketch the port twice
> `01-ports.md` (described as *"TypeScript-shaped pseudocode; the point is the shape of the seam, not the exact fields"*):
> ```ts
> interface Notifier {
>   id: 'slack' | 'discord' | 'email' | 'webhook';
>   capabilities: Set<'inline_answer' | 'link_only'>;
>   postQuestion(q: Question): Promise<{ channel: string; ref: string }>;  // ref = slack_ts equiv
>   updateResolved(ref: string, by: string): Promise<void>;                // chat.update equiv
> }
> ```
> Against `notifier.ts`: the `id` is a closed union, not a string; `postQuestion` takes no `QuestionContext`; `updateResolved` takes a bare `ref` string, not a `PostedRef`. The `07` `ConsoleNotifier` uses `id = 'console'`, which the union doesn't allow. See [[Escalation And Notifications Open Questions]] #7.

## What the port does not cover

- **Inbound.** Neither version has a method for receiving answers. Each adapter handles its own interactions (for Slack, `POST /api/slack/interactions`) and calls the shared answer path. See [[Signed Inbound Interactions]].
- **Cancellation.** There is `updateResolved` but no way to repaint a message when its question is cancelled or expires. See [[Escalation Lifecycle]] and Open Questions #11.
- **Choosing a channel.** Nothing says how a channel is chosen if more than one is configured. See [[Notification Channels]].

## Related

- [[Notification Channels]]
- [[Slack Adapter]]
- [[Escalation Runtime]]
- [[Resolve Everywhere]]
- [[Escalation And Notifications Index]]
