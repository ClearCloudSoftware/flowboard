---
tags: [flowboard, capability-library, seed]
module: Capability Library
---

# Seeded Capabilities

FlowBoard ships with a starter set so the sample recipes work out of the box (feature map: *"A starter set — comes with a handful of ready skills and agents"*). Seeded items are authored by `@flowboard/core` and marked *ships with FlowBoard*.

The sources give **two different starter sets**. The PRD/backlog set is what v1 was specified to seed; the mockup set is the newer design's catalogue.

## v1 seed set (decided)

[[Capability Library Decisions|D22, D25–D31]]: **the seeds are exactly what the seed flow uses** — nothing ships unused, so no seed starts life with a hollow *used by nothing* dot (D25).

The seed flow is **Software delivery**: the PRD's nine steps with the mockup's role names and the `explain` approval gate kept (D26). A step can name an agent, a skill or both (D27):

| key | Agent | Skill | Advance | Change from the PRD |
|---|---|---|---|---|
| `research` | `scout` | — | auto | `researcher` → `scout` |
| `grill` | — | `/grill-me` | auto | — |
| `plan` | `architect` | `/plan-implementation` | auto | `planner` → `architect`, plus the skill |
| `explain` | — | `/explain-simply` | **approval** | — |
| `implement` | `developer` | `/ponytail` | auto | adds `developer` |
| `tests` | `tester` | — | auto | `test-writer` → `tester` |
| `check` | shell | — | auto | — |
| `review` | `reviewer` | `/code-review` | **approval** | adds `reviewer` |
| `summarize` | `scribe` | — | auto | `summarizer` → `scribe` |

Models, efforts, `requires` and `produces` stay as in the PRD table below; an agent's defaults only prefill the step editor.

| Kind | Seeds | Notes |
|---|---|---|
| agent | `scout`, `architect`, `developer`, `tester`, `reviewer`, `scribe` | `scout` gets `Read, Grep` only — it researches the repo, so step one never fails closed on egress (D29). `tester` **writes** tests for the acceptance criteria; the `check` step runs them (D28) |
| skill | `grill-me` | Contract: uses `ask_user_batch`, honours `no_answer_yet` |
| skill | `plan-implementation`, `explain-simply`, `ponytail` | The how of `plan`, `explain` and `implement` |
| skill | `code-review` | Contract: must call `set_outcome` |

Not seeds:

- **`backlog-importer`** — internal to markdown import (Story 7.3); never shown in the library or the step picker, so it cannot be removed out from under import (D30).
- **`ask-three`** — the M4 smoke test; a test fixture loaded by the test setup (D30).
- **The `researcher` flow template** and its agents (`web-researcher`, `research-summarizer`, `fact-checker`) — out of v1 until open-web research has an egress answer, such as a search-API host on the allowlist (D31).

How seeds are delivered:

- They live in FlowBoard's own repo as plugin dirs (backlog Story 1.2 layout) and seeded agents as files, and are **copied into each project's store** under FlowBoard's commit (D6).
- A FlowBoard upgrade stages new seed commits as *update available*; nothing changes until you click (D12).
- Seeds are invoked fully qualified like any plugin skill, e.g. `/grill-me:grill-me` (D16).
- Seeds run on the host tier; git-installed plugins do not (D15).
- Seeded agents are read-only, with **Duplicate to edit** (D21).

## Original v1 seed (PRD §15, backlog Story 1.2)

As the PRD and backlog first specified it; both now carry the decided set above.

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

**Second flow template** (backlog Story 1.2): `researcher` — scope → web research → summarize → grounding ✋, with an `on_fail` loop.

## Mockup catalogue (Delivery pack)

Bundle packs are deferred (D3), so v1 seeds these from FlowBoard's repo rather than as a pack.

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

This mapping is an interpretation by role, not stated in the sources. D22 adopted the mockup names; D27 then let `developer` and `reviewer` join `/ponytail` and `/code-review` on the same steps, as the mockup's used-by data already showed.

## Related

- [[Capability Library Decisions]]
- [[Skill Capabilities]]
- [[Agent Capabilities]]
- [[Bundle Packs]]
