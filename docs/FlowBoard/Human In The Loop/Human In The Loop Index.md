---
tags: [flowboard, human-in-the-loop, index]
module: Human In The Loop
---

# Human In The Loop Index

Human In The Loop is the FlowBoard module for every point where a headless agent stops for a person. It covers questions asked in five fixed shapes, batches answered as one, approval gates, failures and spent loops, the `/inbox` screen where you work them, and the chat escalation that finds you when you're away.

> [!important] The one idea to get right first
> The protocol is **park and resume**, not a live conversation. The agent asks, saves its place and stops. You answer, here or in chat, and the first answer wins. The run then resumes with your answers in hand. A parked run costs time, not money. See [[Ask Park And Resume]].

## Start here

- [[Human In The Loop Overview]] — purpose, place in the system, design principles
- [[Human In The Loop Glossary]] — terms, including the overloaded *escalate*, *blocked*, *retry* and *failure*

## Core concepts

- [[Questions]] — the one schema behind the MCP tool, the inbox and Slack
- [[Question Shapes]] — yes/no, pick one, pick many, a number, free text
- [[Question Batches]] — why five questions are one card
- [[Inbox Card Kinds]] — question, batch, gate, failure

## Behaviour and rules

- [[Ask Park And Resume]] — the 20-minute sentinel, park, `--resume --fork-session`, what waiting costs
- [[Question Lifecycle]] — pending, answered, cancelled, expired, and the step and run around them
- [[Answering Rules]] — first write wins, required vs optional, the cursor rule, undo
- [[Approving And Sending Back]] — approve, reject with a reason, *your call wins*
- [[Failures And Escalated Loops]] — spent and stuck loops, the failure card, Allow host & retry
- [[Escalation To Chat]] — the timer, Block Kit, reconciliation, the Notifier port
- [[Inbox Order And Filters]] — oldest first, grouping, *Waiting on me / Everyone*

## The screen

- [[Human In The Loop Screen]] — anatomy of `flowboard/inbox`, context panel, states
- [[Human In The Loop Controls]] — every control and key, and how the key maps differ
- [[Decisions Outside The Inbox]] — the monitor's *Needs you* band, the task-detail gate, board cards

## Under the hood

- [[Ask User MCP Server]] — broker, shim, the four tools, the file fallback
- [[Human In The Loop Runtime]] — where each piece runs, jobs, old-build bugs, testing
- [[Human In The Loop Data Model]] — `questions` and the columns HITL touches, with proposed fields
- [[Human In The Loop API And Routes]] — endpoints, SSE, proposed inbox feed
- [[Human In The Loop Storage]] — SQLite, `.vibe/` artifacts, the socket, chat refs
- [[Answers And Memory]] — answered once, not asked again

## Content and direction

- [[Seeded Questions And Gates]] — `grill`, `explain`, `review`, `ask-three`, and the mockup's sample data
- [[Human In The Loop Roadmap]] — v1 scope, designed beyond the PRD, ideas, out of scope
- [[Human In The Loop Open Questions]] — 35 places where the sources disagree or leave a gap
- [[Human In The Loop Sources]] — where every fact in these notes comes from

## Related

- [[Flow Design Index]] — where gates are designed ([[Approval Gates]])
- [[Capability Library Index]] — the skills that ask (`grill-me`) and decide (`code-review`)
- [[Component Documentation Tracker]]
