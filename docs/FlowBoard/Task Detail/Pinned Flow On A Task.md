---
tags: [flowboard, task-detail, concept, pinning]
module: Task Detail
---

# Pinned Flow On A Task

The aside's **flow** block: `Software delivery @core v4`, and in ochre, *"v5 exists — this task keeps v4 until it finishes"*.

## What a task pins

| Pin | Column | When | Source |
|---|---|---|---|
| Flow version | `tasks.flow_id` | at promotion (PRD §5, §12, backlog Story 2.1) or at start (PRD §4, architecture README, drawio *"Tasks pin flow_id at start"* and *Start task* · *"pin flow version"*, feature map §3 *"locks in the recipe it will follow"*) | see [[Task Detail Open Questions]] #10 |
| Plugin commits and agent rows | `tasks.capability_pins` | *"set when the task starts"* | PRD §5; [[Capability Library Decisions]] D10 |

*"Flows are version-pinned at task start. `tasks.flow_id` points at a specific flow version. Editing a project's flow never moves an in-flight task."* (PRD §4).

*"Each plugin dir is the commit recorded in the task's `capability_pins`, not the currently installed one, so an update never reaches a running task; agent rows are pinned the same way."* (PRD §7).

The design-side rule, the promote-or-start disagreement and the edge cases are in [[Version Pinning]]. Whether a re-promote after **Send to backlog** pins again is [[Workspaces Open Questions]] #10.

## What task detail adds

- The **newer version notice** is the only place the screen tells you the recipe has moved on. It is ochre (*wants you*) though nothing is asked of you.
- The **recipe average** on the Cost tab is per pinned version (*"across 182 tasks on v4"*). See [[Task Cost And Wasted Spend]].
- The spine is drawn from the **pinned** version's steps, not the project's active flow. The board takes its columns from *"the project's active flow"* (PRD §13).

## Gaps

- The aside does not show `capability_pins`. If `code-review` has been updated since the task started, nothing says this task runs the older commit.
- The flow identity `Software delivery @core v4` (name + author + version) comes from the flow-designer mockup's shared library. The PRD's flows are per project with no author (`UNIQUE (project_id, name, version)`). See [[Flow Design Open Questions]].

## Related

- [[Task Detail Index]]
- [[Version Pinning]]
- [[Task Record]]
