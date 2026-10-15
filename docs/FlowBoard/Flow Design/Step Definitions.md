---
tags: [flowboard, flow-design, concept, steps]
module: Flow Design
---

# Step Definitions

> **Steps** — Each step is one job for one agent: what to do, which AI model to use, how hard to think, how much it may spend, and whether it should pause for your approval. — feature map §2

A step definition is a node in a flow version. The PRD's example: *"Code review, Sonnet, high effort, waits for my approval."* (§4)

## Fields across the sources

Each source lists a different subset of fields. ✓ = present.

| Field | PRD `step_defs` (§5) | Backlog 8.2 inspector | Drawio *Add step form* | Mockup inspector | Note |
|---|---|---|---|---|---|
| Key (stable slug) | `key` | — | — | `id` (shown in pane header) | Unique per flow |
| Name (column header) | `name` | — | — | label on the node | |
| Kind | `kind` | kind | Skill or Agent | — | [[Step Kinds]] |
| Skill / agent | `skill_id`, `agent_id` | skill/agent | ✓ | **Agent** (free text) | [[Capabilities In Flows]] |
| Command | `command` (shell only) | — | — | — | [[Check Steps]] |
| Prompt template | `prompt_template` | prompt template | — | — | Supports `{{placeholders}}` |
| Model | `model` default `sonnet` | model | ✓ | **Model** | [[Models And Effort]] |
| Effort | `effort` default `medium` | effort | ✓ | **Effort** | [[Models And Effort]] |
| Permission mode | `permission_mode` default `bypassPermissions` | permission mode | — | — | [[Step Guardrails]] |
| Allowed tools | `allowed_tools` (JSON, null = unrestricted) | allowed tools | limits | — | [[Step Guardrails]] |
| Max turns | `max_turns` | limits | limits | — | [[Step Guardrails]] |
| Budget | `max_budget_usd` | limits | limits | **Budget** | [[Step Guardrails]] |
| Attempts | `max_attempts` default 3 | limits | — | **Retries** (0–5) | Not the same number — [[Flow Design Open Questions]] #11 |
| Advance mode | `advance_mode` `auto`/`approval` | advance mode | ✓ | **Approval** checkbox | [[Approval Gates]] |
| Sandbox | — (setting; optional `step_defs.sandbox_profile` in backlog 1.1) | — | — | **Sandbox** | [[Step Guardrails]] |
| Requires | `requires` (JSON array of artifact type keys) | requires | ✓ | **needs** | [[Artifact Contract]] |
| Produces | `produces` | produces | ✓ | **produces** | [[Artifact Contract]] |
| Board order | `board_order` | — | — | — | [[Canvas Layout And Board Order]] |
| Entry | `is_entry` | entry | — | — | [[Flow Validation]] |
| Position | — | *Decide* (backlog 8.2) | *Don't persist* (D4) | `x`, `y` | [[Canvas Layout And Board Order]] |

Bold = control label in the flow-designer mockup.

## The prompt template

`prompt_template` is *"appended to the invocation, supports {{placeholders}}"* (PRD §5). It is part 5 of the six-part prompt, with `{{task_title}}`, `{{task_body}}`, `{{acceptance_criteria}}`, `{{non_goals}}`, `{{artifact:<type>}}` and `{{worktree}}` substituted (PRD §7). Placeholder lists differ between sources — [[Flow Design Open Questions]] #16.

## How a step's fields reach the run

| Step field | Becomes (PRD §7) |
|---|---|
| `model` | `--model <step.model>` |
| `effort` | `--effort <step.effort>` |
| `permission_mode` | `--permission-mode` |
| `allowed_tools` | `--allowedTools` (always plus `mcp__vibe__*`) |
| `max_turns` | `--max-turns N` |
| `max_budget_usd` | `--max-budget-usd N` |
| agent's system prompt | `--append-system-prompt` for `kind='agent'` |
| skill slug | `/slug` invocation, prompt part 4 |
| `requires` | prompt part 2, *"read these first"* paths |
| `produces` | prompt part 3, exact output paths |

The provider-neutral version is `RunSpec` in `agent-provider.ts`: `model` (logical id), `effort`, `toolPolicy`, `capabilities`, `limits: { maxTurns, maxBudgetUsd }`.

## Mockup defaults

`buildPreview()` and **+ Step** in the flow-designer mockup use: agent `agent`, model `sonnet`, effort `medium`, budget `$1.00`, no gate, `retries: 2`, sandbox `sealed container`, produces `<id>.md`. These are mockup values, not decided defaults.

## Sample step

From the mockup's open flow, *Software delivery @core v4*:

| Step | Agent | Model | Effort | Budget | Gate | Needs | Produces |
|---|---|---|---|---|---|---|---|
| Research | scout | haiku | low | $0.50 | | — | `brief.md` |
| Plan | architect | opus | high | $2.00 | | `brief.md` | `plan.md` |
| Build | developer | opus | high | $6.00 | | `plan.md` | `changes.patch` |
| Tests | tester | sonnet | medium | $3.00 | | `plan.md` | `test-report.md` |
| Threat model | sec-analyst | sonnet | high | $2.00 | | `design.md` | `threats.md` |
| Review | reviewer | sonnet | medium | $2.00 | ✓ | `changes.patch`, `test-report.md` | `review.md` |
| Summarize | scribe | haiku | low | $0.30 | | `review.md` | `summary.md` |

All use `retries: 2` and `sealed container`. `Threat model` is the step borrowed in the walkthrough; its `design.md` need is the validation problem. See [[Adopting And Adapting A Flow]].

## Related

- [[Step Kinds]]
- [[Step Guardrails]]
- [[Flow Data Model]]
- [[Flow Design Controls]]
