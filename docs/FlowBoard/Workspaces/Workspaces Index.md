---
tags: [flowboard, workspaces, index]
module: Workspaces
---

# Workspaces Index

Workspaces is the FlowBoard platform component that gives each task *"A private copy of the code"* (feature map §14): a git worktree on its own branch, used as the `cwd` of every run, kept until you clean it up. In the architecture it is the **Workspace port** (component #11), which also decides *where* a process runs through the `ExecHost` it hands out.

> [!important] Two ports, one component number
> Architecture #11 splits into **Workspace** (these notes) and **ArtifactStore**. The artifact side is documented in the Task Detail set: [[Task Artifacts]], [[Task Storage On Disk]] and [[Task Workspace]].

## Start here

- [[Workspaces Overview]] — purpose, place in the system, design principles
- [[Workspaces Glossary]] — terms, and the four meanings of "workspace"

## The port and its adapters

- [[Workspace Port]] — `create`, `cwd`, `execHost`, `destroy`
- [[ExecHost Seam]] — where a process runs, owned by the workspace
- [[Workspace Adapters]] — git worktree now; container, devcontainer, remote later
- [[Git Worktree Adapter]] — the v1 reference implementation
- [[Workspace Isolation Tiers]] — `host`, `container`, `gvisor`, `microvm` as the workspace sees them

## Lifecycle and rules

- [[Workspace Lifecycle]] — from backlog to cleanup
- [[Creating A Workspace]] — on promote; the four steps
- [[Demote And Re-Promote]] — kept in the backlog, reused on return
- [[Cleaning Up A Workspace]] — explicit only, end states only
- [[Workspace Naming]] — three path and branch schemes
- [[Shared Worktree Within A Task]] — parallel steps collide
- [[Parent Repo Hygiene]] — `.git/info/exclude`
- [[Git Inside A Workspace]] — host does git; commits and merging are gaps
- [[Workspace In A Run]] — `cwd`, mounts, `/work`, artifact scan

## Under the hood

- [[Workspaces Data Model]] — columns and types
- [[Workspaces Runtime]] — where the code lives, which process runs it
- [[Workspaces API And Routes]] — promote, cancel, and the missing endpoints
- [[Workspaces Storage]] — on disk

## Surfaces and content

- [[Workspaces In The UI]] — where the workspace shows on other screens
- [[Seed Scratch Repo]] — the seeded repo and flow
- [[Workspaces Acceptance Checks]] — what must be proven

## Direction

- [[Workspaces Roadmap]] — v1, beyond the PRD, later, out of scope
- [[Workspaces Open Questions]] — 31 gaps and every proposal
- [[Workspaces Sources]] — where every fact comes from

## Related

- [[Workspaces Overview]]
- [[Task Detail Index]]
- [[Execution Index]]
- [[Component Documentation Tracker]]
- [[Sandboxing Index]]
- [[Projects Index]]
