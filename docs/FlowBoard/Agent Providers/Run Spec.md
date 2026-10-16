---
tags: [flowboard, agent-providers, concept, contract]
module: Agent Providers
---

# Run Spec

`RunSpec` is *"Everything needed to launch one attempt of one step, provider-agnostically."* (`agent-provider.ts`). The runner builds it; the adapter turns it into native flags.

## Fields

| Field | Type | Reference wording (`agent-provider.ts`) |
|---|---|---|
| `prompt` | `PromptParts` | The six-part prompt (below) |
| `model` | `string` | *"Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel()."* See [[Logical Model Ids]]. |
| `effort?` | `Effort` | *"Dropped by the adapter when `effort` is unsupported."* `01-ports.md`: *"low\|medium\|high\|xhigh\|max (dropped if unsupported)"* |
| `toolPolicy?` | `{ allow?: string[]; deny?: string[] }` | *"Tool allow/deny globs. The runner always appends the ask-user tools so a restrictive list can't lock out HITL."* |
| `tools?` | `ToolServer[]` | *"MCP servers to inject. Ignored when `mcp_tools` is absent."* |
| `capabilities?` | `CapabilityPack[]` | *"Skills/plugins to mount."* |
| `cwd` | `string` | *"Workspace path (the Workspace port owns its lifecycle)."* |
| `exec?` | `ExecHost` | *"Where the CLI process runs — host by default, or a sandbox (container/microVM). The adapter spawns through this instead of raw child_process, so sandboxing works for any provider."* See [[Providers And Sandboxing]]. |
| `resume?` | `{ sessionId: string; fork?: boolean }` | *"Resume a prior session; `fork` requires the `resume_fork` capability, else context-replay."* See [[Session Resume And Context Replay]]. |
| `limits?` | `{ maxTurns?: number; maxBudgetUsd?: number }` | — |

## `PromptParts`

> *"The six-part prompt (PRD §7), passed structured rather than pre-flattened so each adapter can place the parts where its provider wants them (e.g. system vs user turn). A core helper renders the canonical order; adapters must not reorder. Assembly itself is provider-neutral and lives in the runner."* — `agent-provider.ts`

| # | Field | Reference wording |
|---|---|---|
| 1 | `preamble: string` | *"Preamble: task title + body."* (PRD §7 adds acceptance criteria and non-goals) |
| 2 | `inputs: ArtifactRef[]` | *"Input artifacts — "read these first"."* |
| 3 | `outputs: ArtifactRef[]` | *"Exact output paths the step must write, one per `produces`."* |
| 4 | `invocation?: string` | *"Slash invocation for kind='skill', e.g. "/grill-me"."* (PRD §7 qualifies it as `/<plugin>:<slug>`) |
| 5 | `template?: string` | *"`prompt_template` with {{placeholders}} already substituted."* |
| 6 | `closing: string` | *"Closing headless instruction: no terminal, use ask_user for questions."* |

`ArtifactRef` is `{ type, path }`: *"Declared artifact type key, e.g. 'research_brief'"* and *"Absolute path in the task's workspace."*

The full assembly rules, including the optional memory part 7 that `PromptParts` has no slot for, are in [[Prompt Assembly]] ([[Execution Open Questions]] #51). `09-memory.md` lists *"the prompt contract on AgentProvider"* among what memory touches.

## `ToolServer`

```ts
export interface ToolServer { name: string; command: string; args?: string[]; env?: Record<string, string>; }
```

The ask-user shim is the one named example. PRD §9: *"The runner writes a per-run `mcp.json` pointing at it and passes `RUN_ID` and the socket path as environment variables."*

## `CapabilityPack`

```ts
export interface CapabilityPack {
  id: string;
  provider: ProviderId;
  mount:
    | { kind: 'plugin_dir'; path: string }        // Claude: --plugin-dir
    | { kind: 'system_prompt'; text: string }     // provider without plugins
    | { kind: 'native'; config: Record<string, unknown> };
}
```

*"The registry stores it; the adapter interprets `mount` in its own terms."* (`agent-provider.ts`). `05` §13 sketches `mount(spec: RunSpec): void` as a method instead; [[Capability Library Decisions]] D2 settled it as data. Mounting itself is documented in [[Capability Runtime Mounting]].

## What `RunSpec` does not carry

> [!warning] The PRD command needs more than `RunSpec` holds
> PRD §7's `claude` command uses `--permission-mode`, `--settings` (the per-run hook file), `--append-system-prompt` (the agent's system prompt) and `--session-id` (a runner-generated uuid). None has a `RunSpec` field. The sandbox tier travels only implicitly, through `exec.id` / `exec.profile.tier` (backlog 1.1 adds an optional `step_defs.sandbox_profile` override). And the runner, not the adapter, *"writes a per-run `settings.json` with `PreToolUse` hooks"* and the `mcp.json` (`03` §6; PRD §9; the drawio *Runner* card), both Claude-format files. See [[Agent Providers Open Questions]] #4 and #5.

## Transforms before launch

Draft mode is *"a pure function applied before `launch()`"*:

```ts
type SpecTransform = (spec: RunSpec) => RunSpec;
const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });
```

*"Provider-neutral, composable with any future override (force-local-model, cap-budget-globally, pin-a-model for an incident), and it records the *resolved* model/effort on the run so cost stays honest"* (`06` §15). See [[Draft Mode And Spec Transforms]].

Backlog Story 3.5 adds a second transform: *"draft mode and the sandbox profile compose as `RunSpec` transformers."* No source fixes the order of the chain ([[Settings And Plumbing Open Questions]] #10).

## Related

- [[AgentProvider Port]]
- [[Agent Run Handle And Result]]
- [[Prompt Assembly]]
- [[Capability Negotiation]]
- [[Agent Providers Data Model]]
