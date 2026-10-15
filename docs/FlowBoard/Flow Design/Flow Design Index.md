---
tags: [flowboard, flow-design, index]
module: Flow Design
---

# Flow Design Index

Flow Design is the FlowBoard module where you define the **recipe** a task follows: a versioned graph of steps, each one an agent (or a check command) doing one job, wired together by routes that fire always, on pass or on fail. It covers authoring steps, wiring connections, validating the artifact contract, versioning, and choosing a flow from the library.

> [!important] The one idea to get right first
> A flow is a **dataflow graph, not a call sequence**. Each step declares the files it **needs** and the files it **produces**, and a recipe only saves when every need is written by a step that runs before it. Editing never changes a recipe in place: it makes a new version, and running tasks keep theirs. See [[Artifact Contract]] and [[Flows And Flow Versions]].

## Start here

- [[Flow Design Overview]] — what the module is for and where it sits in FlowBoard
- [[Flow Design Glossary]] — terms, including the overloaded words *flow*, *step*, *version* and *retries*

## Core concepts

- [[Flows And Flow Versions]] — the versioned DAG, immutability, adopting a version
- [[Version Pinning]] — why running tasks keep the version they started on
- [[Step Definitions]] — every field on a step
- [[Step Kinds]] — skill, agent, shell (check), manual, and the StepExecutor idea
- [[Check Steps]] — plain commands whose exit code is the verdict
- [[Connections And Routes]] — `always`, `on_pass`, `on_fail`
- [[Artifact Contract]] — needs and produces, the contract between steps

## Behaviour and rules

- [[Branching Joining And Loops]] — fan-out, join, rework loop, branch
- [[Approval Gates]] — steps that stop and wait for you
- [[Step Guardrails]] — budget, turns, tools, retries, sandbox, permission mode
- [[Models And Effort]] — model and effort per step, logical ids, draft mode
- [[Flow Validation]] — what the validator checks and when it blocks a save
- [[Editing And Saving A Flow]] — adopted → edited → won't save → saved

## The library

- [[Flow Library]] — domains, search, the same-name problem, the shape glyph
- [[Adopting And Adapting A Flow]] — preview, use, borrow a step

## The screen

- [[Flow Design Screen]] — anatomy of the `flowboard/flows` designer
- [[Flow Design Controls]] — every control and key
- [[Canvas Layout And Board Order]] — positions, dagre, and board column order

## Under the hood

- [[Flow Data Model]] — `flows`, `step_defs`, `step_edges`, and proposed library fields
- [[Flow Definition Internals]] — pure validation in `packages/core`, and who consumes a flow version
- [[Flow Design API And Routes]] — HTTP endpoints and web routes
- [[Flow Storage]] — SQLite rows, JSON templates, export

## Content and direction

- [[Seeded Flows]] — the default pipeline, templates, and the mockup's sample library
- [[Role Starter Flows]] — a ready-made flow per job function
- [[Flow Design Roadmap]] — v1 scope, designed beyond the PRD, ideas, out of scope
- [[Flow Design Open Questions]] — places where the sources disagree
- [[Flow Design Sources]] — where every fact in these notes comes from

## Related

- [[Capability Library Index]] — the skills and agents that steps draw on
- [[Capabilities In Flows]]
- [[Project Default Flow]] — the project's adopted flow
- [[Sandbox Configuration]] — the per-step sandbox override
- [[Logical Model Ids]] — what `haiku` / `sonnet` / `opus` are
- [[Component Documentation Tracker]]
