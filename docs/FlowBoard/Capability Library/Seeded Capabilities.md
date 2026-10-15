---
tags: [flowboard, capability-library, seed]
module: Capability Library
---

# Seeded Capabilities

FlowBoard ships with a starter set so the sample recipes work out of the box (feature map: *"A starter set — comes with a handful of ready skills and agents"*). Seeded items are authored by `@flowboard/core` and marked *ships with FlowBoard*.

The sources give **two different starter sets**. The PRD/backlog set is what v1 was specified to seed; the mockup set is the newer design's catalogue.

## v1 seed (PRD §15, backlog Story 1.2)

**Skills** — real local skill directories under `./skills/` with a `SKILL.md` each (PRD §15); backlog Story 1.2 makes them plugin dirs (`.claude-plugin/plugin.json` + `skills/<slug>/SKILL.md`). Local, so the question loop (M4) and flow engine (M5) are testable without GitHub:

| Skill | Contract |
|---|---|
| `grill-me` | Uses `ask_user_batch`; honours `no_answer_yet` |
| `code-review` | Reviews the diff against acceptance criteria, non-goals and raw `check_output`; **must call `set_outcome`**; told to look for failures, not confirm the work |
| `explain-simply` | Explains the plan (approval step) |
| `ponytail` | Implements the plan |
| `ask-three` | M4 smoke test: asks three questions of different kinds (named in backlog Story 1.2; the PRD's M4 only says "a trivial skill that asks three questions") |

**Agents:** PRD §15 seeds `researcher`, `planner`, `test-writer`, `summarizer` and `backlog-importer` (builtin). Backlog Story 1.2 adds `web-researcher`, `research-summarizer` and `fact-checker` for its second flow template.

`backlog-importer` turns a markdown file into a JSON array of `{ import_key, title, body, acceptance_criteria?, non_goals? }`.

**Seed flow** (software development):

| key | kind | capability | model | effort | advance |
|---|---|---|---|---|---|
| research | agent | `researcher` | sonnet | medium | auto |
| grill | skill | `/grill-me` | sonnet | medium | auto |
| plan | agent | `planner` | opus | high | auto |
| explain | skill | `/explain-simply` | haiku | low | **approval** |
| implement | skill | `/ponytail` | opus | high | auto |
| tests | agent | `test-writer` | sonnet | high | auto |
| check | shell | project `check_command` | — | — | auto |
| review | skill | `/code-review` | opus | high | **approval** |
| summarize | agent | `summarizer` | sonnet | medium | auto |

Backlog Story 1.2 still calls this "the 8-step table"; the working-tree PRD added the `check` shell step, making nine.

**Second flow template** (backlog Story 1.2): `researcher` — scope → web research → summarize → grounding ✋, with an `on_fail` loop.

## Mockup catalogue (Delivery pack)

Seeded via the **Delivery pack** (claude 1.0, codex 0.5, from `github.com/flowboard/capabilities` @ `a91c4f2`):

- **Skills:** `code-review`, `grill-me`, `plan-implementation`
- **Agents:** `architect`, `developer`, `reviewer`, `tester`, `scout`, `scribe`
- **Flows:** Software delivery, Code review

Non-seeded examples: Security pack (@team-sec), Marketing pack (@growth), `domain-model` (@alex).

## Mapping between the two sets

| v1 (PRD) | Mockup |
|---|---|
| `researcher` | `scout` |
| `planner` | `architect` (+ skill `plan-implementation`) |
| `ponytail` (skill) | `developer` (agent) |
| `test-writer` | `tester` |
| `code-review` | `code-review` + `reviewer` |
| `summarizer` | `scribe` |
| `grill-me` | `grill-me` |
| `explain-simply`, `ask-three`, `backlog-importer`, `web-researcher`, `research-summarizer`, `fact-checker` | — |

This mapping is an interpretation by role, not stated in the sources. See [[Capability Library Open Questions]].

## Related

- [[Skill Capabilities]]
- [[Agent Capabilities]]
- [[Bundle Packs]]
