---
tags: [flowboard, capability-library, agent]
module: Capability Library
---

# Agent Capabilities

An **agent** is a named role — a *who* rather than a *how*. In a step definition it is `kind='agent'` with an `agent_id`.

## What an agent carries

| Field | Meaning |
|---|---|
| name / slug | `architect`, `reviewer`, `scout` |
| description | One line shown in the rail |
| system prompt | The role's standing instructions |
| default model | A **logical** model id; the adapter maps it (`opus`, `sonnet`, `haiku`, or `reasoning-high` → `opus` / `o3`) |
| default effort | `low` · `medium` · `high` (the schema also allows `xhigh`, `max`) |
| allowed tools | JSON array; null means unrestricted |
| builtin flag | Builtin agents are read-only in the editor |

The step can override model and effort; the agent's values are defaults.

## Provider neutrality

An agent is already provider-neutral except for the model id, and the model id is logical, so it is resolved per provider by `AgentProvider.resolveModel()`. The mockup still records a pack per provider for each agent (without a version, shown as `—`), because a provider must be able to mount it.

At run time the Claude adapter passes the prompt with `--append-system-prompt` (PRD §7, for `kind='agent'`).

## Defining an agent

Agents are not cloned; they are **defined here**. The topbar's **+ Define agent** creates one with:

- a prompt
- a default model and effort
- an allowed-tools list

(The PRD form adds name and description.) The rebuild backlog (Story 7.2) asks for a CRUD form with builtin agents read-only, and one error-handling style for create and update.

## Detail pane

- **defaults** — model (*"logical id — the adapter maps it"*) and effort
- **prompt** — the full system prompt
- **tools it may use**, **used by**
- no **source** block: a locally defined agent has no repository

## Example agents in the mockup

| Agent | Model | Effort | Tools | Role |
|---|---|---|---|---|
| `architect` | opus | high | Read, Grep, Write | Plans before it types; never edits code |
| `developer` | opus | high | Read, Write, Edit, Bash | Implements one plan item at a time |
| `reviewer` | sonnet | medium | Read, Grep | Compares the diff to the plan; reads only |
| `tester` | sonnet | medium | Read, Write, Bash | Tests against acceptance criteria; reports gaps |
| `scout` | haiku | low | Read, Grep, WebFetch | Reads widely and cheaply; first step of most flows |
| `sec-analyst` | sonnet | high | Read, Grep | Trust boundaries and attacker capability |
| `scribe` | haiku | low | Read, Write | Closing summary under 200 words |

Sample prompt (`reviewer`):

> You review a change against the plan it came from. Report each plan item as met, deviated or missing, and say which files are the evidence.

## Agent memory

The memory design gives agents and skills their own scope: *about an agent or skill — what that role has picked up*. Memories scoped to the step's agent/skill are recalled into the prompt (slot 7) before the run. See [[Capability Library Roadmap]].

## Related

- [[Capability Kinds]]
- [[Seeded Capabilities]]
- [[Capability Runtime Mounting]]
- [[Capability Data Model]]
