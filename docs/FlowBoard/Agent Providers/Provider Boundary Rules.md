---
tags: [flowboard, agent-providers, behaviour, architecture]
module: Agent Providers
---

# Provider Boundary Rules

The rules that keep provider knowledge inside the adapter.

## The dependency rule

> *"**Dependency rule for the rebuild:** the domain (flow engine, board projection, question protocol, cost ledger) depends only on **ports**; everything provider-specific is an **adapter** behind one. `core/` and `runner/` must never import from `adapters/` — only from `core/ports/`. Enforce with a lint rule. If adding Codex requires touching anything outside `adapters/agent/codex/` plus a couple of capability checks, the abstraction leaked."* — architecture README, *Thesis*

PRD §3 states the package form: *"`packages/core` imports no framework, no database driver and no CLI."* The drawio *FlowBoard ideation* page: *"core/ never imports adapters/ / Only core/ports. Enforce with a lint rule."*

As built (2026-10-22): `core` imports only Node built-ins and its own files, so the rule holds, but no lint rule enforces it; `code/flowboard/eslint.config.mjs` is the Next.js default. There is no `runner/` yet. `run-agent` stands in from `packages/cli`, which may import the adapters because it is not the runner (R6 in [[Run Agent CLI Decisions]]).

## What the spec leaked, and where it goes

The architecture README: *"Today the spec bleeds adapters into the core: the runner builds `claude` flags inline (§7), the question loop assumes MCP (§9), Slack is named directly (§10), isolation is hardwired to git worktrees (§11)."*

| Leak | Fix | Source |
|---|---|---|
| Runner builds `claude` flags | Flags live in the Claude adapter | `03` §5 |
| `runs.claude_session_id` | Rename to `agent_session_id`; add `runs.provider` | `02` §1 |
| Skills as Claude plugins | `skills` gains `provider` + `format`; a plugin dir is *"one packaging"* | `02` §1; `05` §13 |
| Question loop assumes MCP | `mcp_tools` capability, file fallback | `04` §9 |
| Default model ids | Logical ids | `05` §13 |

## What lives where

| Concern | Lives in | Source | On `dev` (2026-10-22) |
|---|---|---|---|
| `RunSpec` → native flags | adapter | `agent-provider.ts` | Built: Agent SDK options on Claude; config, env and permission rules on OpenCode |
| Native stream → `NormalizedEvent` | adapter | `agent-provider.ts` | Built: `claude/normalize.ts`, `opencode/normalize.ts` |
| Claude-specific fixes (`--plugin-dir`, `message_delta`, `session_id`, `total_cost_usd`, `mcp__vibe__*`) | Claude adapter | `03` §5 | Built; the allow covers every injected tool server as `mcp__<name>__*` |
| Prompt assembly | runner, provider-neutral | `agent-provider.ts` | `run-agent` stands in; `core/src/prompt.ts` renders the parts, and each adapter places them |
| Draft mode | runner, as a `SpecTransform` | `06` §15 | Not built |
| Permission gate, infra-retry classification | runner | `03` §6 | Not built |
| Pricing tokens for providers without `native_cost` | `PricingService` | `06` §12 | Not built |
| Pack format | registry stores; adapter mounts | `05` §13 | Adapters mount; no registry. `run-agent` builds packs from `plugins:` and `skills:` |
| Where the process runs | `ExecHost` | `exec-host.ts` | Host tier only (`adapters/src/exec/host.ts`) |
| Turning `tools` and `guards` into the provider's own config | adapter, in memory | [[Agent Providers Open Questions]] #4 | Built: Claude gets SDK `mcpServers` and a `PreToolUse` hook callback; OpenCode gets `mcp` and a guard plugin in `OPENCODE_CONFIG_CONTENT`. No file is written |

> [!warning] Two placements the design drew differently
> - The design has the runner write Claude-format `mcp.json` and hook `settings.json` (`03` §6; PRD §9; drawio *Runner*), though `03` §5 wants Claude specifics in the adapter. Decided 2026-10-18 ([[Agent Providers Open Questions]] #4): each adapter builds its own config in memory, as in the last row above.
> - The drawio puts stream parsing in the core's *Run orchestrator* (*Logical components*) and in a separate worker *Stream parser* node (*Harness architecture*), not in the adapter. The code follows the port: each adapter normalizes its own stream. [[Agent Providers Open Questions]] #34; see [[Stream Parsing And Normalization]].

## The neutral vocabulary is Claude Code's

The port's provider-neutral inputs use Claude Code's names (`core/src/ports/agent-provider.ts`):

- `toolPolicy` entries are Claude Code tool rules: `Read`, `Bash(git *)`, `mcp__<server>__<tool>`.
- `PermissionMode` is Claude Code's six modes.
- The guard (`core/src/guard.ts`) knows Claude's tool names. It checks `Write`, `Edit`, `MultiEdit` and `NotebookEdit` against paths and `Bash` against commands, and allows any other name.

OpenCode translates all three. `TOOL_NAMES` in `opencode/permissions.ts` maps tool names to OpenCode permission keys and lowercases unknown ones. Modes become permission rules plus the adapter's answers to permission requests. The guard plugin passes `write`, `edit` and `apply_patch` to the guard as `Write`, and `bash` as `Bash`. A new adapter that forgets to translate gets a guard that silently allows everything.

Tool events cross the other way unchanged: `tool_use` and `tool_result` keep each provider's own tool names and shapes (`Read` with `file_path` on Claude, `read` with `filePath` on OpenCode; `events.ts`), and so does `summary`. Anything that reads tool events still sees provider strings.

## Tests of the abstraction

- *"Components 6–8 contain **zero provider strings** once 5 is extracted"* (`03` intro).
- *"If a route ever needs to know whether it's Claude or Codex, something leaked upward."* (`06` §15).
- The worker *"is a **generic executor host** — nothing about it knows the provider."* (`03` §7).
- The four-step checklist in [[Adding A Provider]].
- No source applies these tests to agent calls outside a step. The backlog's import agent (Story 7.3: *"haiku, `--tools ""`"*) is a second Claude invocation; whether it goes through the port is [[Intake And Import Open Questions]] #12.

## Related

- [[Adding A Provider]]
- [[AgentProvider Port]]
- [[OpenCode Adapter]]
- [[Agent Providers Storage]]
- [[Agent Providers API And Routes]]
