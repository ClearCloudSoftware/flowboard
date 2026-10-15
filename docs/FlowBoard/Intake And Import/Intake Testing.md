---
tags: [flowboard, intake-and-import, testing]
module: Intake And Import
---

# Intake Testing

Import is *"the feature that broke repeatedly"* (`05` §14), so its checks are spelled out more than most.

## Acceptance

| Check | Source |
|---|---|
| *"Importing a markdown backlog twice produces no duplicates and picks up edits"* | PRD §16 |
| *"Promoting a task creates a git worktree on its own branch"* | PRD §16 |
| *"Import twice → no duplicates, edits picked up (both file shapes)."* | backlog 10.1 |
| *"Promote creates worktree + branch."* | backlog 10.1 |
| *"make it a scripted check over both file shapes"* | `05` §14 |

Backlog 10.1 asks for each PRD §16 item *"as an automated or scripted check"*.

## The reference self-check

```
node docs/old/reference/adapters/source/markdown/markdown-source.ts
```

prints *"MarkdownTaskSource self-check passed"*. It covers both shapes, an explicit id, and key stability across two runs. It does **not** cover the upsert, re-import counts, the agent path, or acceptance-criteria sub-sections. See [[Markdown Task Source]].

## What the first build missed

*"Milestone verification was curl + sqlite only. No browser was ever driven"* (backlog, *What went wrong*, item 1). The browser lane (backlog 0.2) lists *"board drag"*. The import button's progress and the Backlog ↔ Todo drag are UI behaviour that a curl check cannot see.

## Gaps

**Proposal**, not in a source. Cases worth adding, from [[Parser Edge Cases]]:

- re-import after a title edit (expect a duplicate unless an id is given; see [[Intake And Import Open Questions]] #4);
- a `### Acceptance criteria` sub-section (#2);
- two tasks with the same title, then reordered (#10);
- a pasted import whose job fails and retries (#11).

## Related

- [[Intake And Import Index]]
- [[Idempotent Upsert]]
- [[Execution Testing]]
- [[Parser Edge Cases]]
