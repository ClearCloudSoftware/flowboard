---
tags: [flowboard, monitor, index]
module: Monitor
---

# Monitor Index

The Monitor is the FlowBoard screen you leave open all day. It shows every task at a glance, puts everything that is waiting on a human at the top, shows how busy the worker slots are, and keeps a running bill. It also covers the **live run viewer**, where you watch one agent session stream as it happens.

> [!important] The one idea to get right first
> The monitor shows where work **is**, not where you would like it to be. The engine moves every task by following the flow. You have exactly four levers: *"approve, send back, answer, retry or stop"* (monitor guide). Colour appears only where something is happening or something is wanted, so **amber on the screen means a human is the bottleneck**. See [[Hand-Off Rules]] and [[Needs You Band]].

## Start here

- [[Monitor Overview]]: purpose, place in the system, design principles
- [[Monitor Glossary]]: terms, including the overloaded words *board*, *gate*, *retry*, *wasted* and *worker*

## Core concepts

- [[Task Status Icons]]: five task statuses (six icons) and which one wins
- [[Flow Bar And Step States]]: one cell per step, seven run states shown as six marks
- [[Needs You Band]]: everything blocked on a human, oldest first
- [[Worker Slots]]: the concurrency cap, the queue and what is running now
- [[Burn Today And Wasted]]: the three money numbers and what each counts
- [[Board Projection]]: the PRD's Kanban read model, which the monitor reshapes

## Behaviour and rules

- [[Hand-Off Rules]]: advance, fan out, join, loop back. Nothing else moves work
- [[Monitor Actions And Costs]]: every decision and what it does to the bill
- [[Waiting And Escalation]]: what a waiting task costs, and when it goes to chat
- [[Failures And Retries]]: attempts, *Allow host & retry*, *Retry as-is*, stop
- [[Life Of A Task]]: `auth-refactor` from backlog to done, down both branches of the gate

## The screen

- [[Monitor Screen]]: the five bands, layout, marks, empty states
- [[Monitor Controls]]: every control and key
- [[Pulse View]]: the home list, filter and sort
- [[Timeline View]]: work against waiting, over time
- [[Pipeline View]]: the flow graph with live counts per step
- [[Task Row Detail]]: what opens when you click a row
- [[Live Run Viewer]]: `/runs/[id]`, one session streaming live

## Under the hood

- [[Monitor Data Model]]: the tables the monitor reads, and a proposed state mapping
- [[Monitor Runtime]]: how the screen derives status, ranks rows and stays live
- [[Event Stream And SSE]]: `NormalizedEvent`, `run_events`, SSE replay
- [[Monitor API And Routes]]: PRD endpoints and proposed monitor endpoints
- [[Monitor Storage]]: what is persisted and where; the monitor stores nothing of its own

## Content and direction

- [[Monitor Sample Data]]: the mockup's twelve seeded tasks and their logs
- [[Monitor Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Monitor Open Questions]]: where the sources disagree or leave a gap
- [[Monitor Sources]]: where every fact in these notes comes from

## Related

- [[Flow Design Index]]: the recipe the monitor shows running
- [[Capability Library Index]]
- [[Component Documentation Tracker]]
