---
tags: [flowboard, flow-design, versioning, rule]
module: Flow Design
---

# Version Pinning

> **Flows are version-pinned at task start.** `tasks.flow_id` points at a specific flow version. Editing a project's flow never moves an in-flight task. — PRD §4

## The rule

A task records the flow version it runs on, and keeps it until it finishes. Editing the flow creates a new version for *new* tasks only.

```mermaid
sequenceDiagram
  participant You
  participant Flow as Software delivery
  participant T as 3 running tasks
  Note over Flow: v4 adopted
  T->>Flow: pinned to v4
  You->>Flow: edit, Save as v5
  Note over Flow: v5 adopted
  T-->>Flow: still on v4 until they finish
  Note over Flow: new tasks start on v5
```

## Where the screens show it

| Screen | What it says |
|---|---|
| Flow designer status bar | `3 tasks still running on v4 — they keep it until they finish` |
| Flow designer guide, walkthrough | *"The three tasks already running stay on v4 until they finish."* |
| Task detail aside | `Software delivery @core v4` and *"v5 exists — this task keeps v4 until it finishes"* |
| Capability-library guide, pinning table | *task — "The flow version it started on. — Nothing happens to it. You can edit the flow freely while it runs."* |

## What is pinned and what is not

| Thing | Pinned? | Source |
|---|---|---|
| A task's flow version | Yes | PRD §4 |
| A flow's capabilities (skills, agents) | **No** — a flow names capabilities, not capability versions; an update reaches every flow on its next run | capability-library guide; [[Updating And Removing Capabilities]] |
| Settings such as draft mode and sandbox defaults | No (inference: PRD §13 describes them as settings but does not say when they are read) | PRD §13 |

> [!note] A pinned flow can still change behaviour
> Because capabilities are not pinned, updating `code-review` changes what a pinned `v4` task does on its next run. The capability-library mockup warns instead of pinning. See [[Capability Library Open Questions]] #4.

## When pinning happens

The sources disagree on whether pinning happens at **promotion** (backlog → todo) or at **start** (todo → running).

| Promotion | Start |
|---|---|
| PRD §5: `tasks.flow_id` *"null while in backlog, pinned on promotion"* | PRD §4: *"Flows are version-pinned at task start."* |
| PRD §12: `POST /api/tasks/:id/promote -- backlog -> todo, pin flow, create worktree` | Architecture README: *"a task pins its version at start"* |
| Backlog Story 2.1: *"Pin `tasks.flow_id` at promotion"* | drawio card *Start task · pin flow version* |

Backlog D1's *default recommendation* (not yet decided) is an explicit Start button: *"Explicit Start button on card + sheet; promote stays cheap"*. See [[Flow Design Open Questions]] #7.

The feature map (§3) says *"Kicking off a task gives it a clean, private copy of the code to work in and locks in the recipe it will follow."*

## Edge cases

- **Board columns.** The board takes its columns from *"the project's active flow ordered by `board_order`"* (PRD §13). A task pinned to an older version can be on a step the active version no longer has. No source says where that card sits.
- **The monitor shows one version.** The monitor mockup's topbar shows a single `v4`. A mixed fleet of v4 and v5 tasks is not designed.
- **Archived versions.** `flows.is_archived` exists (PRD §5). Archiving a version tasks still pin is not covered.

## Related

- [[Flows And Flow Versions]]
- [[Editing And Saving A Flow]]
- [[Canvas Layout And Board Order]]
