---
tags: [flowboard, execution, index]
module: Execution
---

# Execution Index

Execution is the part of FlowBoard that **makes a task move**. It starts a task, runs one step at a time as a headless agent session or a shell command, reads the outcome, and decides what happens next: advance, fan out, wait at a join, loop back for rework, stop at a gate, or hand the task to you. Behind it sit three architecture components: the flow execution engine (#3), the runner (#6) and the job queue and worker (#7).

> [!important] The one idea to get right first
> **The engine only ever sees work outcomes.** A run ends with `pass`, `fail` or no outcome, and the engine follows the matching edges. Everything else is kept away from it. Rate limits and crashes are retried by the runner and *"doesn't use up a try"* (feature map §4). A missing outcome is *"never a pass"* (PRD §8). A spent or stuck loop is handed to you, not failed: *"Escalate, don't fail, when a loop is spent or stuck."* (PRD §8). See [[Run Outcomes]] and [[Loop Guard And Escalation]].

## Start here

- [[Execution Overview]]: purpose, place in the system, design principles
- [[Execution Glossary]]: terms, including the overloaded *attempt*, *retry*, *blocked*, *job*, *worker* and *stop*

## Core concepts

- [[Execution Entities]]: step definition, step instance, run, attempt, job, and how they relate
- [[Run Outcomes]]: `pass`, `fail`, no outcome, and where each comes from
- [[Execution State Machines]]: task, step instance, run and job states, with diagrams
- [[Agent Launch Contract]]: the AgentProvider port, `RunSpec`, `RunResult`, capabilities
- [[Prompt Assembly]]: the six parts, the seventh, placeholders, the resume prompt
- [[Shell Step Execution]]: check steps at run time, exit code as the verdict
- [[Run Guardrails At Launch]]: permission gate, hooks, tools, plugins, limits
- [[Draft Mode And Spec Transforms]]: overriding model and effort before launch

## Behaviour and rules

- [[Starting A Task]]: promote, pin, worktree, Start, entry steps
- [[Advancement Rules]]: what happens after a run succeeds
- [[Fan-Out And Join]]: parallel branches and waiting for them
- [[Rework Loop]]: sending work back to an earlier step
- [[Loop Guard And Escalation]]: `max_attempts`, the shared budget, Retry or Fail task
- [[Stuck Detection And Fingerprints]]: stopping a loop that changes nothing
- [[Infra Retries]]: transient failures, backoff, and what blocks a task
- [[Stopping And Cancelling]]: Stop a run, Cancel a task, Pause, worker shutdown
- [[Task Completion]]: when a task is done, failed or stranded
- [[Life Of One Step]]: the drawio's A to I walk through one step

## Where execution shows

- [[Execution Surfaces]]: the screens that show and steer execution (there is no Execution screen)
- [[Execution Controls]]: every control that starts, stops or redirects work

## Under the hood

- [[Job Queue]]: the `jobs` table, job kinds, leasing, the concurrency cap
- [[Worker Lifecycle]]: the worker process, restart recovery, graceful shutdown
- [[Runner Pipeline]]: from leased job to recorded outcome
- [[Execution Data Model]]: the tables and columns execution reads and writes
- [[Execution Runtime]]: processes, packages, ports, events
- [[Execution API And Routes]]: PRD endpoints and proposed ones
- [[Execution Storage]]: SQLite, run records, worktrees, sockets
- [[Execution Testing]]: ReplayProvider, the fake CLI, acceptance checks

## Content and direction

- [[Seeded Flow Execution]]: how the *Software delivery* flow runs, edge by edge
- [[Execution Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Execution Open Questions]]: where the sources disagree or leave a gap
- [[Execution Sources]]: where every fact in these notes comes from

## Related

- [[Flow Design Index]]: the recipe the engine follows
- [[Human In The Loop Index]]: questions and gates that pause execution
- [[Monitor Index]]: watching execution across tasks
- [[Task Detail Index]]: one task's execution history
- [[Capability Library Index]]: the skills and agents a run mounts
- [[Component Documentation Tracker]]
