---
tags: [flowboard, memory, scope]
module: Memory
---

# Agent Memory Scope

`{ kind: 'agent'; agentId: string }`: *"one role/skill: knowledge it accrues across runs"* (`memory-store.ts`).

| | |
|---|---|
| Holds | *what `researcher` learned about this stack; questions `/grill-me` has settled* (`09-memory.md`) |
| Written from | *that agent's own run outputs* (`09`) |
| Read into | *that agent's next run* (`09`) |
| Recalled as | *"the step's agent"* (`RecallQuery`); *"the step's *agent/skill*"* (PRD §11.2) |
| Mockup sample | none: the task-detail aside shows `you`, `project` and `task` only |
| Mem0 mapping | `agent_id` (`09`) |

## The problem it fixes

*"The `researcher` agent re-reads the architecture every time."* (`09`). The feature map §21: *"about an *agent or skill* (what that role has picked up)"*.

## Agent or skill?

The scope spans both. `09`'s own example mixes them: an agent (`researcher`) and a skill (`/grill-me`). The field is `agentId`, and PRD §11.2 says *"the step's *agent/skill*"*.

A step can name an agent, a skill, or both. The PRD seed flow does: `implement` is agent `developer` with skill `/ponytail`, `review` is `reviewer` with `/code-review` (PRD §15). The [[Capability Library Decisions]] (D27) allow a step to name an agent and a skill together.

> [!question] Which id goes in `agentId`?
> For a skill-only step, the skill's id? For an agent-plus-skill step, the agent, the skill, or two scopes? And is the id per project, since agents are scoped by project (Capability Library D23)? See [[Memory Open Questions]] #8.

The Capability Library side is in [[Agent Capabilities]] (*Agent memory*) and listed as an idea in [[Capability Library Roadmap]].

## Related

- [[Memory Scopes]]
- [[Agent Capabilities]]
- [[Skill Capabilities]]
- [[Memory Index]]
