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
| default model | Meant to be a **logical** model id (`reasoning-high`, `fast-cheap`, `default`) that the adapter resolves to a native one (`reasoning-high` → `opus` / `o3`). The PRD schema still stores a native id (`DEFAULT 'sonnet'`), and the mockup shows `opus` / `sonnet` / `haiku` |
| default effort | `low` · `medium` · `high` in the mockup. The PRD gives `agents.default_effort` no value list (the `low\|medium\|high\|xhigh\|max` comment is on `step_defs.effort`) |
| allowed tools | JSON array; null means unrestricted |
| builtin flag | Builtin agents are read-only in the editor |

The step can override model and effort; the agent's values are defaults.

## Provider neutrality

The architecture wants agents provider-neutral. `05-environment-and-registry.md` §13 says they are *"already provider-neutral except default model ids (use logical ids …)"* — so moving `default_model` to a logical id, resolved per provider by `AgentProvider.resolveModel()`, is a change still to make; the PRD stores `DEFAULT 'sonnet'`.

The mockup still records provider packs for agents, but unevenly: `architect`, `developer`, `reviewer` and `scout` have Claude and Codex packs; `tester`, `sec-analyst` and `scribe` are Claude-only. Agent packs carry no version (an internal `'—'` sentinel that is never displayed), so the row reads *installed · 12 Sep*.

At run time the Claude adapter passes the prompt with `--append-system-prompt` (PRD §7, for `kind='agent'`).

## Defining an agent

Agents enter the library two ways: **defined here**, or **inside a bundle pack** cloned from GitHub — the Delivery, Security and Marketing packs all bring agents. The topbar's **+ Define agent** is meant to create one with:

- a prompt
- a default model and effort
- an allowed-tools list

(The PRD form adds name and description.)

> [!note] Not designed yet
> In the mockup the button opens no form: it selects `architect` and switches the kind filter to Agents. The field list above comes from the field guide. See [[Capability Library Open Questions]] #10.

The rebuild backlog (Story 7.2) asks for a CRUD form with builtin agents read-only, and one error-handling style for create and update.

## Detail pane

- **defaults** — model (*"logical id — the adapter maps it"*) and effort
- **prompt** — the full system prompt
- **tools it may use**, **used by**
- no **source** block: agent records carry no repository, even when they arrived in a cloned pack (the pack holds the source)

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

Mockup data quirk: `scribe`'s used-by lists *Launch campaign @core v2*, while `scout` and the Marketing pack list *Launch campaign @growth v4*.

Sample prompt (`reviewer`):

> You review a change against the plan it came from. Report each plan item as met, deviated or missing, and say which files are the evidence.

## Agent memory

The memory design gives agents and skills their own scope: *about an agent or skill — what that role has picked up*. Memories scoped to the step's agent/skill are recalled into the prompt as a seventh part, inserted just before the closing headless instruction and capped at `settings.memory.max_recall_chars` (default 6,000). See [[Capability Library Roadmap]].

## Related

- [[Capability Kinds]]
- [[Seeded Capabilities]]
- [[Capability Runtime Mounting]]
- [[Capability Data Model]]
