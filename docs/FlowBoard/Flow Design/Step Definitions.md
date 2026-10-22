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
| Kind | `kind` (`ai`/`shell`/`manual`) | kind | Skill or Agent | — | [[Step Kinds]] |
| Agent and/or skill | `agent_id`, `skill_id` — either or both (D27) | agent and/or skill | ✓ | **Agent** (free text) | [[Capabilities In Flows]] |
| Extra plugins | `extra_plugin_ids` (JSON array of `plugins.id`, default `[]`) — *"mounted alongside the skill's plugin"* | — | — | — | [[Capability Runtime Mounting]] |
| Command | `command` (shell only) | — | — | — | [[Check Steps]] |
| Prompt template | `prompt_template` | prompt template | — | — | Supports `{{placeholders}}` |
| Model | `model` default `sonnet` | model | ✓ | **Model** | [[Models And Effort]] |
| Effort | `effort` default `medium` | effort | ✓ | **Effort** | [[Models And Effort]] |
| Permission mode | `permission_mode` default `bypassPermissions` | permission mode | — | — | [[Step Guardrails]] |
| Allowed tools | `allowed_tools` (JSON, null = unrestricted) | allowed tools | — | — | [[Step Guardrails]] |
| Max turns | `max_turns` | limits* | limits* | — | [[Step Guardrails]] |
| Budget | `max_budget_usd` | limits* | limits* | **Budget** | [[Step Guardrails]] |
| Attempts | `max_attempts` default 3 | limits* | limits* | **Retries** (0–5) | Not the same number — [[Flow Design Open Questions]] #11 |
| Advance mode | `advance_mode` `auto`/`approval` | advance mode | ✓ | **Approval** checkbox | [[Approval Gates]] |
| Sandbox | no column; `settings.sandbox_profile` is *"overridable per step"* (§11.1). Backlog 1.1 adds an optional `step_defs.sandbox_profile` | — | — | **Sandbox** | [[Step Guardrails]]; [[Sandbox Configuration]] |
| Egress allowlist | no column; part of the same `sandbox_profile` override | — | — | — | [[Flow Design Open Questions]] #14 |
| Requires | `requires` (JSON array of artifact type keys) | requires | ✓ | **needs** | [[Artifact Contract]] |
| Produces | `produces` | produces | ✓ | **produces** | [[Artifact Contract]] |
| Board order | `board_order` | — | — | — | [[Canvas Layout And Board Order]] |
| Entry | `is_entry` | entry | — | — | [[Flow Validation]] |
| Position | — | *Decide* (backlog 8.2) | — | `x`, `y` | Drawio card *D4 · Don't persist node positions*; [[Canvas Layout And Board Order]] |

Bold = control label in the flow-designer mockup. *limits\** = the generic word in backlog 8.2 and the drawio card (*"Skill or Agent → model, effort, advance mode, requires, produces, limits."*). Which columns it covers is inferred. Backlog 8.2 lists allowed tools separately.

## The prompt template

`prompt_template` is *"appended to the invocation, supports {{placeholders}}"* (PRD §5). It is part 5 of the six-part prompt, with `{{task_title}}`, `{{task_body}}`, `{{acceptance_criteria}}`, `{{non_goals}}`, `{{artifact:<type>}}` and `{{worktree}}` substituted (PRD §7). Placeholder lists differ between sources — [[Flow Design Open Questions]] #16.

## How a step's fields reach the run

| Step field | Becomes (PRD §7) |
|---|---|
| `model` | `--model <step.model>` |
| `effort` | `--effort <step.effort>` |
| `permission_mode` | `--permission-mode` |
| `allowed_tools` | `--allowedTools`: agent ∩ skill, narrowed by the step's list (D28), always plus `mcp__vibe__*` |
| `max_turns` | `--max-turns N` |
| `max_budget_usd` | `--max-budget-usd N` |
| skill's plugin + `extra_plugin_ids` | `--plugin-dir` per plugin, at the commit in the task's `capability_pins` (PRD §7; D10, D14) |
| agent's system prompt | `--append-system-prompt`, whenever the step names an agent |
| skill slug | `/<plugin>:<slug>` invocation, prompt part 4, whenever the step names a skill |
| `requires` | prompt part 2, *"read these first"* paths |
| `produces` | prompt part 3, exact output paths |

> [!warning] The shipped code differs
> - No runner maps a step yet; `pnpm run-agent` builds a `RunSpec` from its own task file ([[Run Config Reference]]). The Claude adapter passes Agent SDK options, which SDK 0.3.302 turns into the installed CLI's flags: `model`, `effort`, `permissionMode` (default `dontAsk`; `run-agent` defaults to `acceptEdits`), `allowedTools`/`disallowedTools`, `maxTurns`, `maxBudgetUsd` and `plugins`. The `systemPrompt`, appended to the `claude_code` preset, goes to the CLI over stdin in the SDK's initialize request, not as a flag. Claude puts the fully qualified skill invocation first in the prompt; OpenCode rewrites it as `Use the "<slug>" skill.` ([[Run Spec]]).
> - The injected server is `flowboard`, not `vibe`: each adapter pre-approves it (`mcp__flowboard__*` on Claude, `flowboard_*` on OpenCode) whether or not an allow list is set, and an explicit deny still wins (2026-10-22). OpenCode maps the same `RunSpec` into its own config. See [[Claude Code Adapter]] and [[OpenCode Adapter]].

The provider-neutral version is `RunSpec` in `agent-provider.ts`: `model` (logical id), `effort`, `toolPolicy`, `capabilities`, `limits: { maxTurns, maxBudgetUsd }`; since 2026-10-18 also `permissionMode`, `systemPrompt` and `guards` ([[Run Spec]]).

## Mockup defaults

The flow-designer mockup fills steps in two ways:

| Field | **+ Step** | `buildPreview()` (library preview) |
|---|---|---|
| Agent | `agent` | `ROLE[lib.domain] \|\| 'agent'` (e.g. `developer`, `analyst`) |
| Model | `sonnet` | `opus` if `lib.cost / lib.steps > 0.3`, else `sonnet` |
| Effort | `medium` | `medium` |
| Budget | `$1.00` | `lib.cost / lib.steps * 1.6` |
| Gate | none | set on `lib.gates` steps, counted back from the second-to-last |
| Retries | `2` | `2` |
| Sandbox | `sealed container` | `sealed container` |
| Produces | `<id>.md` | `[]` |

These are mockup values, not decided defaults.

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
