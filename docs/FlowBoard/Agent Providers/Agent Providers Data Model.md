---
tags: [flowboard, agent-providers, data-model]
module: Agent Providers
---

# Agent Providers Data Model

The port's types live in code (`core/ports/`); the database stores what the runner records about each run. Providers have no table of their own.

## Types

| Type | File | Note |
|---|---|---|
| `AgentProvider`, `ProviderId`, `Capability`, `Effort` | `agent-provider.ts` | [[AgentProvider Port]], [[Provider Capabilities]] |
| `RunSpec`, `PromptParts`, `ArtifactRef`, `ToolServer`, `CapabilityPack` | `agent-provider.ts` | [[Run Spec]] |
| `AgentRun`, `RunResult` | `agent-provider.ts` | [[Agent Run Handle And Result]] |
| `NormalizedEvent`, `Usage` | `events.ts` | [[Normalized Event Envelope]] |
| `ExecHost`, `SandboxProfile`, `ChildHandle`, `IsolationTier` | `exec-host.ts` | [[Providers And Sandboxing]] |
| `ReplayScript` | `replay-provider.ts` | [[Replay Provider]] |
| `SpecTransform` | `06` §15 | [[Draft Mode And Spec Transforms]] |
| `PricingService` | `06` §12 | [[Pricing Service]] |

```mermaid
classDiagram
  class AgentProvider {
    id: ProviderId
    capabilities: ReadonlySet~Capability~
    resolveModel(logical) string
    launch(spec) AgentRun
  }
  class RunSpec {
    prompt: PromptParts
    model: string
    effort?: Effort
    toolPolicy?
    tools?: ToolServer[]
    capabilities?: CapabilityPack[]
    cwd: string
    exec?: ExecHost
    resume?
    limits?
  }
  class AgentRun {
    sessionId: Promise~string~
    pid: number
    events: AsyncIterable~NormalizedEvent~
    result: Promise~RunResult~
    stop()
  }
  class RunResult {
    usage: Usage
    exitCode: number
    outcome?
    error?
  }
  AgentProvider ..> RunSpec : launch
  AgentProvider ..> AgentRun : returns
  AgentRun --> RunResult
  RunSpec --> ExecHost
```

## Database columns the port feeds

From PRD §5 unless noted.

| Table.column | Filled from | Note |
|---|---|---|
| `runs.claude_session_id` | `AgentRun.sessionId` / `--session-id` | `02` §1: rename to `agent_session_id` |
| `runs.pid` | `AgentRun.pid` | restart re-attach |
| `runs.exit_code` | `RunResult.exitCode` | |
| `runs.error` | `RunResult.error` | stderr tail |
| `runs.cost_usd` | `Usage.costUsd` (or PricingService) | |
| `runs.input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `num_turns` | `Usage` | |
| `runs.provider` | — | proposed by `02` §1; not in PRD §5 |
| `runs.model`, `runs.effort` | the resolved model and effort | backlog Story 1.1 (*"the three columns that proved necessary"*); `02` §1; not in PRD §5's SQL |
| `runs.sandbox` | `exec.id` | PRD §11.1 prose; drawio *SQLite* node; not in PRD §5's SQL |
| `run_events.seq`, `type`, `v`, `raw`, `summary` | each `NormalizedEvent` | `v` defaults to 1 |

## Columns the runner reads to build `RunSpec`

| Column | `RunSpec` field |
|---|---|
| `step_defs.model` (default `'sonnet'`), `agents.default_model` | `model` |
| `step_defs.effort` (default `'medium'`), `agents.default_effort` | `effort` |
| `step_defs.allowed_tools`, `agents.allowed_tools`, `skills.allowed_tools` | `toolPolicy` (agent ∩ skill ∩ step, PRD §7) |
| `step_defs.max_turns`, `max_budget_usd` | `limits` |
| `step_defs.permission_mode` (default `'bypassPermissions'`) | none ([[Agent Providers Open Questions]] #4) |
| `agents.system_prompt` | none (`--append-system-prompt`) |
| `tasks.capability_pins`, `step_defs.extra_plugin_ids` | `capabilities` |
| `tasks.worktree_path` | `cwd` |
| `settings` draft mode | applied as a `SpecTransform` |

> [!note] No provider column anywhere
> No table stores which provider a step, flow, project or run uses. PRD §5 is Claude-only by construction; [[Capability Library Decisions]] D1/D23 keep it so in v1. [[Agent Providers Open Questions]] #14 and #16.

## Related

- [[Execution Data Model]]
- [[Cost Data Model]]
- [[Capability Data Model]]
- [[Agent Providers Storage]]
