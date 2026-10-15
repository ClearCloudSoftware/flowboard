---
tags: [flowboard, agent-providers, open-questions]
module: Agent Providers
---

# Agent Providers Open Questions

Every place the sources disagree or leave a gap. Items marked **proposal** are inferences, not source facts.

## The contract

### 1. Is `tool_hooks` a capability?
`01-ports.md` and PRD §7 (*"Hooks are a provider capability (`tool_hooks`)"*) say yes; `agent-provider.ts` omits it. Listed as open drift in [[Capability Library Decisions]]; also [[Execution Open Questions]] #42. → [[Provider Capabilities]]

### 2. `CapabilityPack`: data or behaviour?
`agent-provider.ts`: a `mount` data union. `05` §13: `mount(spec: RunSpec): void`. **Resolved** by [[Capability Library Decisions]] D2: data. → [[Run Spec]]

### 3. Does `RunSpec` carry `exec`?
`01-ports.md`'s sketch has no `exec`; its own ExecHost section and `agent-provider.ts` do. → [[Run Spec]]

### 4. Launch inputs `RunSpec` has no field for
PRD §7's command needs `--permission-mode`, `--settings` (hooks), `--append-system-prompt` (agent prompt) and `--session-id`. The tier is only implicit in `exec`. **Proposal:** add `permissionMode` and `systemPrompt` to `RunSpec`, and treat hook settings as adapter-generated from a provider-neutral rule set. → [[Run Spec]], [[Claude Code Adapter]]

### 5. Who creates the session id?
`agent-provider.ts`: `sessionId` *"Resolves once the provider emits its session id (from system/init)"*. PRD §7: the runner generates a uuid and passes `--session-id`. → [[Session Resume And Context Replay]]

## Events

### 6. Event version `v`
`01-ports.md` and PRD §7 put `v` on every event; `events.ts` has no `v` field. → [[Normalized Event Envelope]]

### 7. Native events with no normalized kind
The stream sample has `system/hook_started`, `hook_response`, `status` and `rate_limit_event` lines. No source says whether they map to `system`, are dropped, or are kept only as raw. → [[Stream Parsing And Normalization]]

### 8. Where `summary` lives
`events.ts` puts `summary` on `tool_use` only; PRD §5/§7 give every `run_events` row a `summary` *"for the viewer"*. Adapter or runner? → [[Normalized Event Envelope]]

### 9. Live usage mid-run
`Usage` arrives only on `result`; PRD §7 wants a running number from per-message usage; `partial_stream` promises *"live token counts"*. No kind carries them. Same as [[Monitor Open Questions]] #38 and [[Execution Open Questions]] #62. **Proposal:** a `usage_delta` kind, or `Usage` on `assistant_text`. → [[Normalized Event Envelope]]

### 10. Who sets `outcome`?
`RunResult.outcome` is *"read from the produced JSON or set_outcome"* (runner-side facts), yet the adapter-emitted `result` event carries `outcome?`. Claude's native `result` has no outcome field. → [[Agent Run Handle And Result]]

## Models

### 11. Which logical vocabulary?
`reasoning-high` / `fast-cheap` / `default` (`01-ports.md`, `06` §15) vs Claude aliases as logical ids (PRD §5; [[Capability Library Decisions]] D20). Decided for v1 (aliases); open for the second provider. → [[Logical Model Ids]]

### 12. The resolution table and what is recorded
No table is written out; where it lives (adapter code, settings, DB) and what an unknown id does are unstated. `runs.model` could hold the logical id, the resolved native id, or the stream's reported id (`claude-fable-5-1` in the sample). `06` §15 says *"resolved"*. → [[Logical Model Ids]]

### 13. Draft mode target
`haiku`/`low` (PRD §13, drawio, backlog) vs `fast-cheap`/`low` (`06` §15). See [[Execution Open Questions]] #45. → [[Draft Mode And Spec Transforms]]

### 29. Effort on other providers
`Effort` adds `xhigh` and `max`; the mockups offer `low`/`medium`/`high`. How effort maps to Codex is unstated. → [[Logical Model Ids]]

## Choosing a provider

### 14. How does a step pick its provider?
The capability-library guide: *"Steps name their provider individually — one flow can mix them."* `02` §2 validates against the step's *"target provider"*. `07`: the provider is constructed *"in the composition root"*, one per runner. `step_defs` has no provider column (PRD §5). Moot in v1 (D1). **Proposal:** a nullable `step_defs.provider` defaulting to a project or global setting. → [[Capability Negotiation]], [[Adding A Provider]]

### 15. Provider ids
`claude-code` (port), `claude-cli` (PRD §3 folder), `claude` (capability-library mockup); `codex` vs `codex-cli`. The port's union is open in `agent-provider.ts`, closed in `01-ports.md`. → [[AgentProvider Port]]

### 16. Run columns
PRD §5 has `runs.claude_session_id` and no `provider`, `model`, `effort` or `sandbox`. `02` §1 renames and adds `provider`; backlog 1.1 adds `model`/`effort`; PRD §11.1 and the drawio mention `runs.sandbox`. → [[Agent Providers Data Model]]

### 17. Is Codex in v1?
The drawio *Logical components* legend says *"dashed = not in v1"* and draws *Codex CLI* solid. PRD §3, the drawio *Harness architecture* and D1 say later. → [[Codex Adapter]]

## Validating the port

### 18. ACP or a hand-written port?
Open decision 2 in the architecture README; no outcome recorded. → [[Agent Client Protocol Option]]

### 19. The Codex spike's risk points
Unresolved: (a) resume semantics, (b) cost, (c) MCP injection. `04` §9 already states *"Claude *and* Codex speak MCP"*, which (c) asks to confirm. → [[Codex Adapter]]

### 20. Which replay harness?
A `NormalizedEvent` script (`replay-provider.ts`), a raw `stream-sample.jsonl` (`01-ports.md`), or a fake `claude` binary (backlog 0.2). Only the binary exercises the Claude parser; only the script tests provider-neutrality. → [[Replay Provider]]

### 21. Replay's fixed capability set
`sessions`, `partial_stream`, `native_cost` only, so replayed park/resume and HITL take the fallback paths. **Proposal:** let `ReplayScript` declare capabilities. → [[Replay Provider]]

### 22. Is a replay stop transient?
`stop()` settles with exit code 130; PRD §7 treats *"process killed by a signal"* as transient. Same as [[Execution Open Questions]] #55 and [[Monitor Open Questions]] #35. → [[Agent Run Handle And Result]]

## Environment

### 23. Credentials for non-Claude providers
`ANTHROPIC_BASE_URL` → proxy is Claude's mechanism. The drawio lists *"api.openai.com (later)"* on the allowlist; the Codex injection mechanism is unstated. → [[Providers And Sandboxing]]

### 24. Isolating headless runs from personal config
Backlog 0.1 **DEC**: empty `--settings` or `CLAUDE_CONFIG_DIR`. D5 recommends *"Empty `--settings` file per run"*, but PRD §7 uses `--settings` for the hook file, so it cannot be empty. The stream sample itself shows personal `SessionStart` hooks and MCP servers. → [[Claude Code Adapter]]

### 25. No capability for `maxTurns`
`budget_cap` covers `maxBudgetUsd`; nothing covers `maxTurns`. → [[Provider Capabilities]]

### 26. Capability data at design time
Validation and greying happen in `apps/web` and the browser; providers are adapters core may not import; PRD §12 has no capabilities route. **Proposal:** static capability descriptors per provider id in `core/ports`. → [[Capability Negotiation]], [[Agent Providers API And Routes]]

### 30. Re-attaching after restart
Restart recovery re-attaches by pid (`03` §7), but the port only gives a stream through `launch()`. How a new worker re-reads a live process's output is unstated. → [[Agent Providers Runtime]]

## Minor

### 27. "Three members"
`07` says *"the same three members"* and lists four. → [[AgentProvider Port]]

### 28. Gemini CLI
Named once (architecture README table), nowhere else. → [[Adding A Provider]]

## Related

- [[Agent Providers Index]]
- [[Agent Providers Sources]]
- [[Execution Open Questions]]
- [[Capability Library Open Questions]]
