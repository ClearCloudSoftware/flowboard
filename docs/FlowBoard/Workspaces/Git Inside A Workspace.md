---
tags: [flowboard, workspaces, rule, git]
module: Workspaces
---

# Git Inside A Workspace

What may happen in git inside a task's worktree, who does it, and what the sources leave out.

## The host does all git work

> *"not the project's git remote, because the host does all git work and the agent never needs to push or fetch"* — PRD §11.1, on the egress allowlist

`08`: *"Not the git remote: the host does all git work."* `01-ports.md` on `egressAllow`: *"no git remote"*. The drawio egress proxy card: *"allowlist: api.anthropic.com · api.openai.com (later) · npm / PyPI · no git remote"*.

The drawio draws a dashed edge from the project repo to GitHub, labelled *"host-side push / fetch"*. Dashed means *"optional or later"* (drawio legend).

## What the agent may not do

The per-run `PreToolUse` hooks deny (PRD §7):

- *"writes outside the task's worktree;"*
- *"any path matching a line of the task's `non_goals` that is written as a path or glob;"*
- *"destructive commands: `rm -rf` outside the worktree, any `git push`, `git reset --hard` or `git checkout` of the base branch, and piping a download into a shell."*

Feature map §10: *"no writing outside the task's folder, no touching what the task lists as off-limits, no pushing code or destructive commands."* See [[Run Guardrails At Launch]].

## Commits

| Source | Says |
|---|---|
| PRD §6 | *"git tracks the files so they are diffable and reviewable"* |
| Feature map §15 | *"tracked in git like any other change"* |
| Drawio *Harness architecture* | artifacts *"committed alongside the code"* |
| Task-detail mockup, Files tab | *"an ordinary file in this task's own copy of the repo, committed on its own branch"* |
| Task-detail guide | *"FlowBoard files the output into the task's own copy of the repo, committed on its own branch."* |

No source says who runs `git commit` (the agent, the runner after each run, or a step), when, or with what message. The hooks do not forbid an agent commit. See [[Workspaces Open Questions]].

## Getting the work back

No source describes how a task's branch reaches the project's main line.

- PRD §17 rules nothing out here, and §12 has no merge endpoint.
- The feature map's *Software developer* starter flow ends in a step: `D -->|approved| E[Merge and integrate]`.
- The flow-designer mockup's `sdlc` step names include *"Merge and integrate"*, and a forked flow is described as *"No approval gate — it merges itself."*

So merging is imagined as a **flow step**, not a workspace action. But the hooks deny `git push` and `git checkout` of the base branch, and egress blocks the git remote. A merge step would have to run on the host. *(Inference.)*

## The base branch

The hooks protect *"the base branch"*. No source defines it. The reference `worktree add … -b vibe/task-<id>` names no start point, so it branches from the repo's current `HEAD` *(git behaviour, inferred)*.

## Related

- [[Workspaces Index]]
- [[Workspace In A Run]]
- [[Cleaning Up A Workspace]]
- [[Task Artifacts]]
- [[Workspaces Open Questions]]
