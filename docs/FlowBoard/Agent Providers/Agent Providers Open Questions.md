---
tags: [flowboard, agent-providers, open-questions]
module: Agent Providers
---

# Agent Providers Open Questions

Every place the sources disagree or leave a gap. Items marked **proposal** are inferences, not source facts.

## The contract

### 1. Is `tool_hooks` a capability?
`01-ports.md` and PRD §7 (*"Hooks are a provider capability (`tool_hooks`)"*) say yes; `agent-provider.ts` omits it. Listed as open drift in [[Capability Library Decisions]]; also [[Execution Open Questions]] #42 and [[Sandboxing Open Questions]] #25. → [[Provider Capabilities]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): yes. `Capability` gains `tool_hooks`; it means the provider enforces `RunSpec.guards` inside the agent.

### 2. `CapabilityPack`: data or behaviour?
`agent-provider.ts`: a `mount` data union. `05` §13: `mount(spec: RunSpec): void`. **Resolved** by [[Capability Library Decisions]] D2: data. → [[Run Spec]]

### 3. Does `RunSpec` carry `exec`?
`01-ports.md`'s sketch has no `exec`; its own ExecHost section and `agent-provider.ts` do. → [[Run Spec]]

### 4. Launch inputs `RunSpec` has no field for
PRD §7's command needs `--permission-mode`, `--settings` (hooks), `--append-system-prompt` (agent prompt) and `--session-id`. The tier is only implicit in `exec`. The runner, not the adapter, writes the Claude-format `mcp.json` and hook `settings.json` (`03` §6; PRD §9; drawio *Runner*). **Proposal:** add `permissionMode` and `systemPrompt` to `RunSpec`, and treat hook settings as adapter-generated from a provider-neutral rule set. → [[Run Spec]], [[Claude Code Adapter]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): `RunSpec` gains `permissionMode`, `systemPrompt` and `guards: GuardRules` (provider-neutral rules; `core/guard.ts` checks them). The SDK takes all three as options, so the runner writes no Claude-format `settings.json`.

### 5. Who creates the session id?
`agent-provider.ts`: `sessionId` *"Resolves once the provider emits its session id (from system/init)"*. PRD §7: the runner generates a uuid and passes `--session-id`. → [[Session Resume And Context Replay]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the provider reports it. The session id is always read from `system/init`; the adapter passes none, which also fits providers that cannot take a caller-chosen id (OpenCode).

## Events

### 6. Event version `v`
`01-ports.md` and PRD §7 put `v` on every event; `events.ts` has no `v` field. Same as [[Monitor Open Questions]] #39 and [[Execution Open Questions]] #62. → [[Normalized Event Envelope]]

### 7. Native events with no normalized kind
The stream sample has `system/hook_started`, `hook_response`, `status` and `rate_limit_event` lines. No source says whether they map to `system`, are dropped, or are kept only as raw. → [[Stream Parsing And Normalization]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): dropped. They produce no normalized event; partial text deltas are folded into the final `assistant_text`.

### 8. Where `summary` lives
`events.ts` puts `summary` on `tool_use` only; PRD §5/§7 give every `run_events` row a `summary` *"for the viewer"*. Adapter or runner? Also [[Monitor Open Questions]] #39. → [[Normalized Event Envelope]]

### 9. Live usage mid-run
`Usage` arrives only on `result`; PRD §7 wants a running number from per-message usage; `partial_stream` promises *"live token counts"*. No kind carries them. Same as [[Monitor Open Questions]] #38, [[Execution Open Questions]] #62 and [[Cost And Control Open Questions]] #2. **Proposal:** a `usage_delta` kind, or `Usage` on `assistant_text`. → [[Normalized Event Envelope]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): a `usage` kind carrying running totals for the run, emitted on `message_start` and `message_delta`. Every event also carries `raw`, the native message it came from.

### 10. Who sets `outcome`?
`RunResult.outcome` is *"read from the produced JSON or set_outcome"* (runner-side facts), yet the adapter-emitted `result` event carries `outcome?`. Claude's native `result` has no outcome field. → [[Agent Run Handle And Result]]

## Models

### 11. Which logical vocabulary?
`reasoning-high` / `fast-cheap` / `default` (`01-ports.md`, `06` §15) vs Claude aliases as logical ids (PRD §5; [[Capability Library Decisions]] D20). Decided for v1 (aliases); open for the second provider. Also [[Flow Design Open Questions]] #15. → [[Logical Model Ids]]

### 12. The resolution table and what is recorded
No table is written out; where it lives (adapter code, settings, DB) and what an unknown id does are unstated. `runs.model` could hold the logical id, the resolved native id, or the stream's reported id (`claude-fable-5-1` in the sample). `06` §15 says *"resolved"*. → [[Logical Model Ids]]

### 13. Draft mode target
`haiku`/`low` (PRD §13, drawio, backlog) vs `fast-cheap`/`low` (`06` §15). See [[Execution Open Questions]] #45. → [[Draft Mode And Spec Transforms]]

## Choosing a provider

### 14. How does a step pick its provider?
The capability-library guide: *"Steps name their provider individually — one flow can mix them."* `02` §2 validates against the step's *"target provider"*. `07`: the provider is constructed *"in the composition root"*, one per runner. `step_defs` has no provider column (PRD §5). Moot in v1 (D1). **Proposal:** a nullable `step_defs.provider` defaulting to a project or global setting. → [[Capability Negotiation]], [[Adding A Provider]]

### 15. Provider ids
`claude-code` (port), `claude-cli` (PRD §3 folder), `claude` (capability-library mockup); `codex` vs `codex-cli`. The port's union is open in `agent-provider.ts`, closed in `01-ports.md`. → [[AgentProvider Port]]

### 16. Run columns
PRD §5 has `runs.claude_session_id` and no `provider`, `model`, `effort` or `sandbox`. `02` §1 renames and adds `provider`; backlog 1.1 adds `model`/`effort`; PRD §11.1 prose names `runs.sandbox` *"alongside `runs.model`/`runs.effort`"*, as do `08`, backlog 1.1 and the drawio. Also [[Cost And Control Open Questions]] #14, [[Settings And Plumbing Open Questions]] #22. → [[Agent Providers Data Model]]

### 17. Is Codex in v1?
The drawio *Logical components* legend says *"dashed = not in v1"* and draws *Codex CLI* solid; the capability-library mockup treats Codex as live. PRD §3, the drawio *Harness architecture* and D1 say later. → [[Codex Adapter]]

## Validating the port

### 18. ACP or a hand-written port?
Open decision 2 in the architecture README; no outcome recorded. → [[Agent Client Protocol Option]]

### 19. The Codex spike's risk points
Unresolved: (a) resume semantics, (b) cost, (c) MCP injection. `04` §9 already states *"Claude *and* Codex speak MCP"*, which (c) asks to confirm. → [[Codex Adapter]]

### 20. Which replay harness?
A `NormalizedEvent` script (`replay-provider.ts`), a raw `stream-sample.jsonl` (`01-ports.md`; drawio *"Replays recorded stream-json"*), or a fake `claude` binary (backlog 0.2). The binary exercises the whole Claude adapter; the script skips parsing; the raw replay needs a parser inside the replay adapter that no source describes. → [[Replay Provider]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the replay provider stays a `NormalizedEvent` script; the Claude normalizer is tested against the recorded `stream-sample.jsonl`, and the provider against a fake `query()` that spawns a real child.

### 21. Replay's fixed capability set
`sessions`, `partial_stream`, `native_cost` only, so replayed park/resume and HITL take the fallback paths. **Proposal:** let `ReplayScript` declare capabilities. → [[Replay Provider]]

### 22. Is a replay stop transient?
`stop()` settles with exit code 130; PRD §7 treats *"process killed by a signal"* as transient. Same as [[Execution Open Questions]] #55 and [[Monitor Open Questions]] #35. → [[Agent Run Handle And Result]]

## Environment

### 23. Credentials for non-Claude providers
`ANTHROPIC_BASE_URL` → proxy is Claude's mechanism. The drawio lists *"api.openai.com (later)"* on the allowlist and labels the CLI-to-proxy edge *"HTTPS_PROXY"*; the Codex injection mechanism is unstated. Same as [[Sandboxing Open Questions]] #28. → [[Providers And Sandboxing]]

### 24. Isolating headless runs from personal config
Backlog 0.1 **DEC**: empty `--settings` or `CLAUDE_CONFIG_DIR`. D5 recommends *"Empty `--settings` file per run"* (backlog; the drawio D5 card: *"D5 · Hook isolation / Empty --settings file per headless run."*), but PRD §7 uses `--settings` for the hook file, so it cannot be empty. The stream sample itself shows personal `SessionStart` hooks injecting plugin text, plus personal plugins and MCP servers. Same as [[Execution Open Questions]] #52 and [[Sandboxing Open Questions]] #24. → [[Claude Code Adapter]]

### 25. No capability for `maxTurns`
`budget_cap` covers `maxBudgetUsd`; nothing covers `maxTurns`. → [[Provider Capabilities]]

### 26. Capability data at design time
Validation and greying happen in `apps/web` and the browser; providers are adapters core may not import; PRD §12 has no capabilities route. **Proposal:** static capability descriptors per provider id in `core/ports`. → [[Capability Negotiation]], [[Agent Providers API And Routes]]

## Minor

### 27. "Three members"
`07` says *"the same three members"* and lists four. → [[AgentProvider Port]]

### 28. Gemini CLI
Named once (architecture README table), nowhere else. → [[Adding A Provider]]

## Models and environment, continued

### 29. Effort on other providers
`Effort` adds `xhigh` and `max`; the flow-designer mockup offers `low`/`medium`/`high` (also [[Flow Design Open Questions]] #15). How effort maps to Codex is unstated. → [[Logical Model Ids]]

### 30. Re-attaching after restart
Restart recovery re-attaches by pid (`03` §7), but the port only gives a stream through `launch()`. How a new worker re-reads a live process's output is unstated. Same as [[Execution Open Questions]] #31. → [[Agent Providers Runtime]]

## Mappings and failures

### 31. The Claude adapter's capability set and flag mapping
No source writes out the Claude adapter's `capabilities` set or a `RunSpec` → flag table; both in these notes are **inferred** from PRD §7 and `03` §5. Gaps the inference exposes: `toolPolicy.deny` has no Claude flag in PRD §7; backlog 0.1 asks to verify a `--tools` flag whose one backlog use is the importer agent (*"haiku, `--tools ""`"*, Story 7.3; #36), with no step-level `RunSpec` field mapping to it; `--include-partial-messages` implies `partial_stream`, yet no live-usage event exists (#9). → [[Claude Code Adapter]], [[Provider Capabilities]]

### 32. Mapping Claude's usage fields onto `Usage`
**Inferred, not sourced:** `cache_creation_input_tokens` → `cacheWrite`, `cache_read_input_tokens` → `cacheRead`, `num_turns` → `numTurns`. Unstated: whether `input` includes cached tokens, and whether `result.usage` or `modelUsage` is the authority. PRD §7: *"Verify the actual field names against your `docs/stream-sample.jsonl` probe."* Whether the cost is a bill at all (`costBasis: "list"`) is [[Cost And Control Open Questions]] #7. → [[Stream Parsing And Normalization]]

### 33. `is_error` on a zero exit
Backlog 3.2: *"non‑zero or `is_error` → failed"*. `RunResult` has `exitCode` and `error` but no flag for a CLI-reported error on exit 0. **Proposal:** the adapter emits an `error` event and sets `error` on `RunResult`, and the runner treats a set `error` as failed. → [[Agent Run Handle And Result]]

**Decided 2026-10-18** (Claude adapter implementation, [[Provider SDK Fit Analysis]]): the proposal. A set `RunResult.error` means failed, even when `exitCode` is 0.

## Placement and inference

### 34. Where the stream parser lives
The port puts it in the adapter (`agent-provider.ts`; `03` §5). The drawio puts it in the core's *Run orchestrator* (*"spawns run, parses stream-json, emits events"*, *Logical components*) and in a separate worker *Stream parser* node fed straight from `claude`'s stdout (*Harness architecture*, edge *G*). → [[Stream Parsing And Normalization]], [[Provider Boundary Rules]]

### 35. Other inferred mappings in these notes
Labelled in place, listed here so none reads as sourced: which component consumes each event kind ([[Normalized Event Envelope]]); who performs each degradation ([[Capability Negotiation]]); port field → column and column → `RunSpec` field ([[Agent Providers Data Model]]); what each PRD §12 route returns ([[Agent Providers API And Routes]]); the ACP needs → port mapping ([[Agent Client Protocol Option]]); the launch sequence ([[Agent Providers Runtime]]).

### 36. Agent calls outside a step
The backlog's import agent (Story 7.3: *"haiku, `--tools ""`"*, *"Isolate the importer from global hooks"*) is a Claude call with no step. Whether it goes through the `AgentProvider` port is [[Intake And Import Open Questions]] #12. → [[Provider Boundary Rules]]

## Related

- [[Agent Providers Index]]
- [[Agent Providers Sources]]
- [[Execution Open Questions]]
- [[Capability Library Open Questions]]
