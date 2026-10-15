---
tags: [flowboard, workspaces, testing]
module: Workspaces
---

# Workspaces Acceptance Checks

What the sources ask to be proven about workspaces.

## In the sources

| Check | Source |
|---|---|
| *"Promoting a task creates a git worktree on its own branch"* | PRD §16 |
| *"Promote creates worktree + branch."* | backlog 10.1 |
| *"Promote Backlog → Todo creates a worktree. No agents run yet."* | PRD §14 M2 |
| README lists known constraints *"shared worktree … manual cleanup"* | backlog 10.2 |
| Demote keeps the worktree; re-promote reuses it | backlog 2.1 (**NEW**) |
| Cleanup only by explicit action, only when done/cancelled/failed | backlog 2.1 (**PRD**) |
| A FIX from the first build that must not regress: *"path aliases break when spawned from the worktree cwd"* | backlog 3.2 |

PRD §16 and backlog 10.1 check only creation. Nothing checks cleanup, demote, reuse or the exclude line.

> [!note] Proposal
> Add checks that: re-promote after demote does not fail and reuses the folder; the parent repo's `git status` stays clean after promote; cleanup is refused before an end state; cleanup never runs on its own. These notes' suggestions, listed in [[Workspaces Open Questions]].

## Testability

The architecture's test double is `ReplayProvider` (*"Replays recorded stream-json in tests. No CLI, no cost."*, drawio). It replaces the agent, not the workspace: runs still need a real worktree. The drawio *Test lane*: *"vitest on engine rules, fingerprinting and the prompt builder · ReplayProvider drives whole flows at $0 · Playwright E2E against the real UI"*. No source names a fake Workspace adapter.

## Related

- [[Workspaces Index]]
- [[Execution Testing]]
- [[Seed Scratch Repo]]
- [[Workspaces Roadmap]]
