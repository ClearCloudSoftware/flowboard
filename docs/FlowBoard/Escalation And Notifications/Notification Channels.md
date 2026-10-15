---
tags: [flowboard, escalation-and-notifications, concept, adapters]
module: Escalation And Notifications
---

# Notification Channels

> **More than one channel** — *"Built so chat, email, or other channels can all plug in, not just one."* (feature map §13)

A channel is one adapter behind the [[Notifier Port]].

## Every channel the sources name

| Channel | Capability | Status | Source |
|---|---|---|---|
| **Slack** | `inline_answer` (Block Kit) | v1, the only adapter (PRD M6) | PRD §10, architecture README |
| **Discord** | `inline_answer` (*"Discord components"*) | later | `01-ports.md`, architecture README, `notifier.ts` |
| **Email** | `link_only` | later | `01-ports.md` (*"`link_only` channels (email) send a deep link to `/inbox`"*) |
| **Webhook** | `link_only` (*"a bare webhook"*) | later | `04` §10, `01-ports.md` |
| **Desktop** | not stated | later | architecture README, drawio (*"Slack today → Discord, email, webhook, desktop tomorrow"*) |
| **Console** | `link_only` | example only | `07-ports-in-practice.md` |

The module layout reserves folders for three: *"`notify/slack/  discord/  email/`"* (architecture README). PRD §3 has only *"`notify/  # slack`"*.

## Two capability levels

| | `inline_answer` | `link_only` |
|---|---|---|
| What the message holds | *"native controls (Slack blocks, Discord components)"* | *"a deep link to `/inbox`"* |
| Where you answer | In the channel | In the inbox |
| Inbound path | Yes, signed interactions | None |
| Repaint on answer | `updateResolved` | `updateResolved` (for console, a log line) |
| Cost of adding one | An adapter that renders and verifies | *"skip rich UI entirely … New channels cost an adapter, not a bespoke interactive UI each."* (`04` §10) |

The *capabilities* field is a set, so a channel could in principle hold both.

## The console example

`07-ports-in-practice.md` shows the smallest adapter, *"A trivial `link_only` adapter shows the shape; the Slack adapter swaps the body for Block Kit and adds signature verification, nothing else."*

```ts
export class ConsoleNotifier implements Notifier {
  readonly id = 'console';
  readonly capabilities = new Set(['link_only'] as const);

  async postQuestion(q: Question, ctx: QuestionContext): Promise<PostedRef> {
    console.log(`[${ctx.taskTitle} · ${ctx.stepName}] ${q.prompt}  →  ${ctx.sessionUrl ?? '/inbox'}`);
    return { channel: 'stdout', ref: q.id };
  }
  async updateResolved(ref: PostedRef, by: string) {
    console.log(`[resolved by ${by}] ${ref.ref}`);
  }
}
```

## When no channel is configured

*"No token configured → log and continue (channel is optional)."* (`04` §10). PRD §10: *"If the token is absent, log the escalation and carry on — Slack is optional."* The inbox works the same either way.

> [!question] One channel, or several at once?
> The PRD wires exactly one Slack channel (`SLACK_CHANNEL_ID`). The call site in `07` takes one injected `notifier`. Nothing says how a channel is picked when more than one is configured, or whether a question can go to two. See [[Escalation And Notifications Open Questions]] #9.

## Related

- [[Notifier Port]]
- [[Slack Adapter]]
- [[Personal Routing And Ladders]]
- [[Escalation And Notifications Roadmap]]
