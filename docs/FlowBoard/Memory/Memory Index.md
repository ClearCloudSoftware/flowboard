---
tags: [flowboard, memory, index]
module: Memory
---

# Memory Index

Memory is what FlowBoard carries from one task to the next, so agents stop starting from scratch. Before a run, the runner **recalls** what earlier runs learned and adds it to the prompt as background. After a run succeeds, it **commits** (distils) the run's declared artifacts and answers back to the store. Memory has four scopes (user, project, agent, task), sits behind the `MemoryStore` port, and is **off by default**.

> [!important] The one idea to get right first
> Memory is additive. *"with it off, every flow behaves exactly as this spec describes; memory is never on the critical path of a run"* (PRD §11.2). Everything here is optional plumbing around the runner. It makes runs warmer and cheaper, and it has to prove that it does, or it gets turned off. See [[Memory Off By Default]] and [[Measuring Memory Payoff]].

There is no mockup for this component. This set is built from the PRD, `09-memory.md` and the other architecture notes, the reference port, the feature map, the drawio, and the one place a mockup shows memory (the task-detail aside).

## Start here

- [[Memory Overview]]: purpose, place in the system, design principles
- [[Memory Glossary]]: terms, including the overloaded words *memory*, *commit*, *scope* and *user*
- [[Artifacts Versus Memory]]: the two jobs, and why they must not be confused

## Core concepts

- [[MemoryStore Port]]: the interface, its two calls and its types
- [[Memory Scopes]]: the four scopes side by side
- [[User Memory Scope]]: the single operator's preferences and recurring answers
- [[Project Memory Scope]]: one codebase's conventions and gotchas
- [[Agent Memory Scope]]: what one role or skill picks up across runs
- [[Task Memory Scope]]: why attempt 1 failed, for attempt 2
- [[Memory Adapters]]: `none`, `local`, `mem0`, `mem0-cloud` compared
- [[Local Memory Adapter]]: the first real adapter, FTS5 in `flowboard.db`
- [[Mem0 Adapter]]: the later, self-hosted adapter with fact extraction

## Behaviour and rules

- [[Memory Lifecycle]]: one memory from a run's output to a later prompt
- [[Memory Recall]]: before launch, the scope union and the query
- [[Recalled Memory In The Prompt]]: prompt part 7, its label, cap and placement
- [[Memory Commit]]: after a success, from declared artifacts and answers only
- [[Contradictions And Freshness]]: newest-first under `local`, supersede under Mem0
- [[Memory Trust Boundary]]: injection, poisoning, host-side broker, egress
- [[Memory Off By Default]]: the additive rule and how it is proved
- [[Measuring Memory Payoff]]: wasted spend, inbox repeats, the net figure

## Where it shows

- [[Memory In The UI]]: the task-detail aside, the settings section, `/costs`
- [[Memory Settings]]: the `memory` block in settings

## Under the hood

- [[Memory Data Model]]: `memories`, `run_memories`, the settings block, the port types
- [[Memory Runtime]]: where the code lives and where the runner calls it
- [[Memory API And Routes]]: what the sources give (almost nothing) and proposals
- [[Memory Storage]]: SQLite, the Mem0 vector store, and what never leaves the machine

## Content and direction

- [[Memory Defaults And Sample Content]]: defaults and the mockup's sample memories
- [[Memory Roadmap]]: v1 scope, designed beyond the PRD, ideas, out of scope
- [[Memory Open Questions]]: where the sources disagree or leave a gap
- [[Memory Sources]]: where every fact in these notes comes from

## Related

- [[Execution Index]]: the runner that brackets every launch with recall and commit
- [[Human In The Loop Index]]: answers, the most valuable thing memory holds ([[Answers And Memory]])
- [[Task Detail Index]]: *carried in from memory* ([[Memory Carried Into A Task]])
- [[Cost And Control Index]]: the memory bucket ([[Memory Cost Accounting]])
- [[Capability Library Index]]: agents and skills, the owners of the agent scope
- [[Component Documentation Tracker]]
