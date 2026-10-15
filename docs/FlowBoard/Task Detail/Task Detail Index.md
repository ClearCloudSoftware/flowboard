---
tags: [flowboard, task-detail, index]
module: Task Detail
---

# Task Detail Index

Task Detail is the FlowBoard view of **one task's whole story**: every step and run it went through, the files it produced, what it cost, and the evidence you need at a gate to decide whether the work should ship. It also covers the parts of the system behind that view: the task record, its per-task workspace, and its artifacts.

> [!important] The one idea to get right first
> The screen is built for **one moment**: an agent wants your go-ahead. Its answer to *"should this ship?"* never rests on the agent's own account of what it did. Every step wrote a real file into the task's own workspace, so the plan can be lined up against what actually landed in the tree. **Deviated**, not missed, is the verdict to fear. See [[Plan Versus Built]] and [[Deciding At A Gate]].

## Start here

- [[Task Detail Overview]] — purpose, place in the system, design principles
- [[Task Detail Glossary]] — terms, including the overloaded *attempt*, *retry*, *send back*, *waiting* and *workspace*

## Core concepts

- [[Task Record]] — the task's fields, acceptance criteria, non-goals, owner
- [[Step Instances And Runs]] — step instance vs run vs attempt, states, the log
- [[Task Artifacts]] — real files, how they get registered, naming, viewing
- [[Task Workspace]] — the worktree per task, path, branch, cleanup, the Workspace port
- [[Pinned Flow On A Task]] — the flow version and capability commits a task keeps

## Behaviour and rules

- [[Task Lifecycle]] — statuses, what moves a task, when it is done or failed
- [[Task Actions]] — Pause, Send to backlog, Cancel, Clean up, Retry, Fail task
- [[Deciding At A Gate]] — why a task stops, Approve, Send back, the walkthrough
- [[Plan Versus Built]] — the four verdicts, and the two competing designs
- [[Attempts And Send Back]] — rework rules, `↺` marks, what send back does to the money
- [[Task Cost And Wasted Spend]] — bill, kept, wasted, agent time, the recipe average
- [[Questions Within A Task]] — the question you answered, parked runs
- [[Memory Carried Into A Task]] — what the task started with

## The screen

- [[Task Detail Screen]] — layout, regions, states, empty states, responsive
- [[Task Detail Tabs]] — Story, Plan vs built, Files, Cost
- [[Task Detail Marks]] — the three alphabets and the status pill
- [[Task Detail Controls]] — every control and key

## Under the hood

- [[Task Data Model]] — the tables, derived figures, missing columns
- [[Task Detail Runtime]] — reading, live updates, the mockup's model, the two ports (#11)
- [[Task Detail API And Routes]] — the route, PRD endpoints, proposed endpoints
- [[Task Storage On Disk]] — SQLite, worktree, artifacts, lifetimes

## Content and direction

- [[Sample Task Auth Refactor]] — the mockup's task, step by step
- [[Task Detail Roadmap]] — v1 scope, designed beyond the PRD, ideas, out of scope
- [[Task Detail Open Questions]] — 30 places the sources disagree or leave a gap
- [[Task Detail Sources]] — where every fact in these notes comes from

## Related

- [[Flow Design Index]] — the recipe a task follows
- [[Capability Library Index]] — the skills and agents its steps run
- [[Component Documentation Tracker]]
