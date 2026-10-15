---
tags: [flowboard, escalation-and-notifications, index]
module: Escalation And Notifications
---

# Escalation And Notifications Index

Escalation And Notifications is how FlowBoard reaches you when a decision has waited too long. A question still pending after the threshold is posted to chat (Slack in v1) with controls to answer it there. Answers come back signed, the first answer wins wherever it was given, and the other place repaints to show it is handled. Behind it sits the **Notifier port**, so Discord, email or a webhook cost an adapter, not a rewrite.

> [!important] The one idea to get right first
> Escalation adds a second place to answer. It never moves the question. An escalated question is still `pending` in the inbox, with a posted ref beside it, and both places write through "the *same* idempotent path" (`04` §10). So everything here is about keeping two copies of one question honest: [[First Write Wins]] decides the answer, [[Resolve Everywhere]] closes the other copy.

There is no mockup for this component. This set is built from the PRD, the backlog, the architecture notes, the reference port, the drawio, and the places the inbox, monitor and task-detail mockups show escalation. The inbox side is in [[Escalation To Chat]], in the Human In The Loop set.

## Start here

- [[Escalation And Notifications Overview]]: purpose, place in the system, design principles
- [[Escalation And Notifications Glossary]]: terms, including the overloaded words *escalate*, *channel* and *chat*

## Core concepts

- [[Notifier Port]]: the interface, what it covers and what it leaves out
- [[Notification Channels]]: Slack, Discord, email, webhook, desktop, console; `inline_answer` vs `link_only`
- [[Slack Adapter]]: the one v1 channel, its API calls and config

## Behaviour and rules

- [[Escalation Timer]]: the `escalate_question` job, its skip rules and edge cases
- [[Escalation Threshold]]: the *nudge timing* setting; 5 minutes or 10
- [[Escalation Lifecycle]]: one question from asked to closed, seen from escalation
- [[Escalation Scope]]: questions only, or every stop
- [[Rendering Questions In Chat]]: kind to Block Kit, what a message carries, batches
- [[Notification Content Limits]]: title and question text only
- [[Signed Inbound Interactions]]: HMAC, replay window, the answer path
- [[First Write Wins]]: idempotent answers and what the loser sees
- [[Resolve Everywhere]]: reconciliation in both directions, and *by whom*

## Where it shows

- [[Escalation In The UI]]: every chip, count, toast and counter on other screens

## Under the hood

- [[Escalation Data Model]]: columns, job kind, setting, and proposals
- [[Escalation Runtime]]: where the code lives and the call sites
- [[Escalation API And Routes]]: the interactions endpoint and Slack calls
- [[Escalation Storage]]: tables, env, what leaves the machine

## Content and direction

- [[Escalation Defaults And Sample Content]]: defaults and mockup figures
- [[Personal Routing And Ladders]]: DM the right person, bump to a backup
- [[Escalation And Notifications Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Escalation And Notifications Open Questions]]: where the sources disagree or leave a gap
- [[Escalation And Notifications Sources]]: where every fact in these notes comes from

## Related

- [[Human In The Loop Index]]: questions, the inbox, answering rules
- [[Monitor Index]]: the needs-you band and its escalated tag
- [[Task Detail Index]]: *waiting on you*
- [[Execution Index]]: loop escalation, the other meaning of the word
- [[Component Documentation Tracker]]
