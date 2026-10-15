---
tags: [flowboard, workspaces, seed]
module: Workspaces
---

# Seed Scratch Repo

The seed content that bears on workspaces: a git repo to cut worktrees from, and a seeded flow that shares one.

## The scratch repo

| Source | Wording |
|---|---|
| PRD §14 M1 | *"Seed a project pointing at a scratch git repo."* |
| Backlog 1.2 (**PRD**) | *"Seed project pointing at an auto‑`git init`ed scratch repo."* |
| PRD §15 | *"Seed the scratch project's `check_command` with something that exists in the scratch repo."* |
| PRD §14 M5 | *"a deliberately failing test in the scratch repo sends the seeded flow from `check` back to `implement` with the raw log"* |

The scratch repo is what M2 first promotes into (*"Promote Backlog → Todo creates a worktree"*).

> [!note] Gap
> `git worktree add` needs at least one commit to branch from. A freshly `git init`ed repo has none. *(Git behaviour, inferred.)* No source says the seed makes an initial commit. Listed in [[Workspaces Open Questions]] #4. The scratch repo's path and contents are [[Intake And Import Open Questions]] #20 and [[Projects Open Questions]] #19.

## The seeded flow on one worktree

The *Software delivery* flow (PRD §15) fans out `explain → implement` and `explain → tests`, then joins at `check`. Both branches write the same worktree. The tester is *"scoped to `tests/` via its prompt and `allowedTools`"* (PRD §11). See [[Shared Worktree Within A Task]] and [[Seeded Flows]].

## Related

- [[Workspaces Index]]
- [[Seeded Flows]]
- [[Creating A Workspace]]
- [[Workspaces Acceptance Checks]]
