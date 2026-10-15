---
tags: [flowboard, agent-providers, seed, samples]
module: Agent Providers
---

# Agent Providers Defaults And Sample Content

## Defaults

| Default | Value | Source |
|---|---|---|
| Provider | Claude Code (the only adapter; *"Every model call goes through the `claude` CLI"*) | PRD §17; [[Capability Library Decisions]] D1 |
| `step_defs.model` | `'sonnet'` | PRD §5 |
| `step_defs.effort` | `'medium'` | PRD §5 |
| `step_defs.permission_mode` | `'bypassPermissions'` | PRD §5 |
| `agents.default_model` / `default_effort` | `'sonnet'` / `'medium'` | PRD §5 |
| Draft mode | *"overrides every step to `--model haiku --effort low`"* | PRD §13 |
| `run_events.v` | `1` | PRD §5 |
| ReplayProvider `streamDelayMs` | `0` (*"instant, for tests"*) | `replay-provider.ts` |

## Seed flow models

The *Software delivery* seed flow (PRD §15) sets the models every v1 run starts with:

| Step | Model | Effort |
|---|---|---|
| `research` | sonnet | medium |
| `grill` | sonnet | medium |
| `plan` | opus | high |
| `explain` | haiku | low |
| `implement` | opus | high |
| `tests` | sonnet | high |
| `check` | — (shell, no provider) | — |
| `review` | opus | high |
| `summarize` | sonnet | medium |

All values are Claude aliases, used as logical ids under [[Capability Library Decisions]] D20. The capability-library mockup gives seeded agents different defaults (for example `scout` `haiku`/`low`, `reviewer` `sonnet`/`medium`); see [[Seeded Capabilities]].

## Sample content

| Sample | Where | What it shows |
|---|---|---|
| ReplayProvider self-check script | `replay-provider.ts`; `07` | `system` `abc-123` → `assistant_text` `hello` → `result` with `input 100, output 50, numTurns 2, costUsd 0.012, outcome 'pass'` |
| `stream-sample.jsonl` | `docs/old/` | A real Claude Code `stream-json` run: one turn, `total_cost_usd` `0.45876175`, native model `claude-fable-5-1` |
| Task `provider-codex`, *"Codex CLI behind the AgentProvider seam"*, project `flowboard/providers` | `monitor.html` | A `research` run in state `asking` |
| The same task's question | `inbox.html`, `inbox-guide.html` | *"The Codex CLI reports no per-call cost. Estimate spend from token counts, or record it as unknown and leave the totals honest?"* — options *Estimate from tokens* / *Record as unknown*. The guide's walkthrough branches: you answer it in the inbox (*Estimate from tokens* preselected), or a teammate, dana, answers it in Slack and the record reads *"How should we record Codex spend? → Estimate from tokens"*. |
| `PROVIDERS`: `claude` (*Claude Code*), `codex` (*Codex CLI*) | `capability-library.html`, `capability-library-guide.html` | Two providers, a pack per provider; 7 of the 17 sample capabilities have a Codex pack, shown as *"codex packs for 7 of 17"* (computed in the mockup, written out in the guide) |

> [!note] The sample question is the spike's risk point (b)
> The mockups' Codex question restates `01-ports.md`'s *"Codex reports tokens, not dollars"*. The mockup offers *"Record as unknown"* as an option; the architecture's answer is PricingService (`06` §12). See [[Usage And Native Cost]].

## Related

- [[Seeded Flows]]
- [[Seeded Capabilities]]
- [[Replay Provider]]
- [[Codex Adapter]]
- [[Cost Defaults And Sample Figures]]
