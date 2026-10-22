---
tags: [flowboard, capability-library, index]
module: Capability Library
---

# Capability Library Index

The Capability Library is the FlowBoard module that holds the reusable building blocks that flow steps draw on: **skills**, **agents**, and **packs**. Flows reference capabilities by name. The library is where those names come from.

> [!important] The one idea to get right first
> A **capability** is the logical thing a step asks for (`code-review`). A **provider pack** is one packaging of that capability for one agent CLI (a Claude plugin directory, a Codex config). Almost everything unusual about the library follows from that split. See [[Capability Versus Provider Pack]].

> [!check] v1 is decided
> The v1 design was settled on 2026-10-15: Claude-only, the **plugin** as the unit of install, a per-project store, and tasks that pin capability versions. Read [[Capability Library Decisions]] before the rest — the notes below mark where v1 departs from the sources.

## Start here

- [[Capability Library Overview]] — what the module is for and where it sits in FlowBoard
- [[Capability Versus Provider Pack]] — the core concept
- [[Capability Library Glossary]] — terms, including the two meanings of "pack"
- [[Capability Library Decisions]] — the v1 design, D1–D31

## The three kinds

- [[Capability Kinds]] — skill vs agent vs bundle, side by side
- [[Skill Capabilities]] — packaged instructions invoked like slash commands
- [[Agent Capabilities]] — named roles with a prompt, model, effort and tools
- [[Bundle Packs]] — skills, agents and flows installed as one unit (deferred)

## Behaviour and rules

- [[Provider Coverage And Portability]] — Claude vs Codex packs, and why a step can refuse a capability (deferred)
- [[Capability Tools And Egress]] — declared tools, network-capable tools, and the sandbox allowlist
- [[Installing A Capability From GitHub]] — clone, parse, check, confirm
- [[Updating And Removing Capabilities]] — task pins, update preview and blocked removal
- [[Capabilities In Flows]] — how steps reference capabilities and how validation uses them

## The screen

- [[Capability Library Screen]] — anatomy of the `flowboard/library` screen
- [[Capability Library Controls]] — every control and what it does

## Under the hood

- [[Capability Data Model]] — tables, records and the `CapabilityPack` type
- [[Capability Runtime Mounting]] — how a capability reaches a running agent
- [[Capability Library API And Routes]] — HTTP endpoints and web routes
- [[Capability Storage On Disk]] — where installed capabilities live

## Content and direction

- [[Seeded Capabilities]] — the starter set that ships with FlowBoard
- [[Capability Library Roadmap]] — v1 scope, later ideas, and what is out of scope
- [[Capability Library Open Questions]] — places where the sources disagree or leave a gap: 1–18 with their outcome, 19 answered by the build, 20–26 still open
- [[Capability Library Sources]] — where every fact in these notes comes from

## Related

- [[Component Documentation Tracker]]
- [[Flow Design Index]] — the steps that draw on the library
- [[Execution Index]] — the runs that mount it
- [[Agent Providers Index]] — the port and adapter that mount packs
- [[Sandboxing Index]] — read-only plugin mounts and the egress wall
- [[Projects Index]] — the project that owns the store
- [[Memory Index]] — the agent/skill memory scope
