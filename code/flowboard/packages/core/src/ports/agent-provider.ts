/**
 * AgentProvider — the port that makes coding-agent CLIs interchangeable.
 *
 * This is the seam of the whole system. `core/` and the runner (not built yet;
 * `run-agent` stands in) program against this interface;
 * `adapters/src/agent/<claude|opencode|replay>/` implement it. No file under
 * `core/` or the runner may import a provider adapter — only this port.
 *
 * An adapter's job is exactly two mappings:
 *   1. RunSpec  ->  the provider's native CLI flags / config.
 *   2. the provider's native event stream  ->  NormalizedEvent (./events.ts).
 *
 * Everything else — the flow engine, board projection, cost ledger, HITL
 * protocol, live viewer — consumes only the normalized outputs and never learns
 * which provider ran.
 *
 * See docs/FlowBoard/Agent Providers/AgentProvider Port.md.
 */

import type { NormalizedEvent, Usage } from './events.ts';
import type { ExecHost } from './exec-host.ts';

// ---------------------------------------------------------------------------
// Identity & capabilities
// ---------------------------------------------------------------------------

/** Well-known provider ids; the `(string & {})` keeps autocomplete without closing the set. */
export type ProviderId = 'claude-code' | 'codex' | 'opencode' | 'replay' | (string & {});

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * What a provider can do. The engine and flow editor query this BEFORE using a
 * knob, and degrade gracefully when it is absent (capability negotiation):
 *
 *   effort            drop the flag; editor greys the field
 *   sessions          a stable session id is reported
 *   resume_fork       supports --resume --fork-session; else fall back to
 *                     context-replay (re-inject requires/produces + answers)
 *   mcp_tools         can inject MCP tool servers; else HITL uses the
 *                     artifact-file fallback (agent writes questions.json, exits)
 *   plugins           can mount CapabilityPacks as plugin dirs
 *   allowed_tools     tool allow/deny is enforced, not advisory
 *   permission_modes  supports a bypass/ask permission mode
 *   native_cost       reports cost in USD; else PricingService derives it
 *   partial_stream    emits incremental deltas (live token counts) mid-turn
 *   budget_cap        honours maxBudgetUsd; else it is advisory
 *   tool_hooks        enforces `RunSpec.guards` inside the agent; else the
 *                     sandbox alone guards the run, and the flow editor says so
 */
export type Capability =
  | 'effort'
  | 'sessions'
  | 'resume_fork'
  | 'mcp_tools'
  | 'plugins'
  | 'allowed_tools'
  | 'permission_modes'
  | 'native_cost'
  | 'partial_stream'
  | 'budget_cap'
  | 'tool_hooks';

/** Permission modes, in Claude Code's vocabulary; other providers map them (OpenCode: rules plus its answers to asks). */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';

// ---------------------------------------------------------------------------
// Run inputs
// ---------------------------------------------------------------------------

export interface ArtifactRef {
  /** Declared artifact type key, e.g. 'research_brief'. */
  type: string;
  /** Absolute path in the task's workspace. */
  path: string;
}

/**
 * The six-part prompt (PRD §7), passed structured rather than pre-flattened so
 * each adapter can place the parts where its provider wants them (e.g. system
 * vs user turn). A core helper renders the canonical order (../prompt.ts).
 * Assembly itself is provider-neutral and lives in the runner.
 */
export interface PromptParts {
  /** 1. Preamble: task title + body. */
  preamble: string;
  /** 2. Input artifacts — "read these first". */
  inputs: ArtifactRef[];
  /** 3. Exact output paths the step must write, one per `produces`. */
  outputs: ArtifactRef[];
  /** 4. Slash invocation for a skill, fully qualified, e.g. "/grill-me:grill-me". */
  invocation?: string;
  /** 5. `prompt_template` with {{placeholders}} already substituted. */
  template?: string;
  /** 6. Closing headless instruction: no terminal, use ask_user for questions. */
  closing: string;
}

/** An MCP tool server to inject (e.g. the ask-user server). Used only when `mcp_tools` is present. */
export interface ToolServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * A mountable capability (a "skill"/plugin, generalized). The registry stores
 * it; the adapter interprets `mount` in its own terms.
 */
export interface CapabilityPack {
  id: string;
  provider: ProviderId;
  mount:
    | { kind: 'plugin_dir'; path: string } // Claude: plugins [{ type: 'local', path }]
    | { kind: 'system_prompt'; text: string } // provider without plugins
    | { kind: 'native'; config: Record<string, unknown> };
}

/**
 * In-agent guard rules (PRD §7 hooks), provider-neutral. Adapters with the
 * `tool_hooks` capability enforce them on every tool call; see ../guard.ts.
 * Only file-edit tools and recursive `rm` are checked against paths: any other
 * shell command an allow rule permits can still write anywhere.
 */
export interface GuardRules {
  /** Absolute dirs writes may land in, links followed; normally just the task's worktree. A recursive `rm` must stay inside one too. */
  writeRoots: string[];
  /** Globs relative to `cwd` (path.matchesGlob: `*` stays in one folder, dot names match, case is ignored on macOS and Windows), from the task's non-goals; no file-edit write may match one. */
  denyPaths?: string[];
  /** Regex sources matched against shell commands; a match is denied. Nothing is added for you: pass DEFAULT_DENY_COMMANDS for PRD §7's set. */
  denyCommands?: string[];
}

/** Everything needed to launch one attempt of one step, provider-agnostically. */
export interface RunSpec {
  prompt: PromptParts;
  /** Logical model id; the adapter resolves it via resolveModel() (Claude: an alias, as is; OpenCode: its table, or "provider/model" as is). */
  model: string;
  /** Dropped by the adapter when `effort` is unsupported. */
  effort?: Effort;
  /**
   * Tool allow/deny entries in Claude Code's vocabulary (`Read`, `Bash(git *)`, `mcp__server__tool`); other
   * adapters translate them. The adapter always pre-approves each injected tool server, so neither a restrictive
   * allow list nor a missing one can lock out HITL; an explicit deny still wins.
   */
  toolPolicy?: { allow?: string[]; deny?: string[] };
  /** MCP servers to inject. Ignored when `mcp_tools` is absent. */
  tools?: ToolServer[];
  /** Skills/plugins to mount. */
  capabilities?: CapabilityPack[];
  /** Workspace path (the Workspace port owns its lifecycle). */
  cwd: string;
  /**
   * Where the CLI process runs — host by default, or a sandbox (container/microVM).
   * The adapter spawns through this instead of raw child_process, so sandboxing
   * works for any provider. From `workspace.execHost(task)`.
   */
  exec?: ExecHost;
  /** Resume a prior session; `fork` requires the `resume_fork` capability, else context-replay. */
  resume?: { sessionId: string; fork?: boolean };
  limits?: { maxTurns?: number; maxBudgetUsd?: number };
  /** Chosen by the caller (run-agent's `permissions.mode`; the runner's permission gate is not built); adapters default to the most restrictive headless mode, `dontAsk`. */
  permissionMode?: PermissionMode;
  /** The agent's system prompt, added to the provider's own (Claude: appended to the claude_code preset). */
  systemPrompt?: string;
  /** Enforced in-agent when the provider has `tool_hooks`. */
  guards?: GuardRules;
}

// ---------------------------------------------------------------------------
// Run outputs  (Usage & NormalizedEvent imported from ./events)
// ---------------------------------------------------------------------------

export interface RunResult {
  /** The run's totals; for a run that ended before its result, the last running totals (Claude: tokens, no cost). */
  usage: Usage;
  exitCode: number;
  /** Drives conditional edges; read from the produced JSON or set_outcome. Unset is NOT 'pass': the engine parks the step at a human gate. */
  outcome?: 'pass' | 'fail';
  /**
   * Set when the run failed: the provider's own error report (e.g. Claude's
   * `is_error` result) or the stderr tail. A set `error` means failed, even
   * when `exitCode` is 0.
   */
  error?: string;
}

/** A live handle on one running attempt. */
export interface AgentRun {
  /** Resolves once the provider emits its session id (from system/init); rejects if the run ends without one. */
  sessionId: Promise<string>;
  /** Resolves once the process is spawned; `-1` if it never was. */
  pid: Promise<number>;
  /** Normalized event stream; the runner tees this to run_events + SSE. */
  events: AsyncIterable<NormalizedEvent>;
  /** Resolves when the run is over and its process has exited. */
  result: Promise<RunResult>;
  /** Stop the run; `result` settles as stopped. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

export interface AgentProvider {
  readonly id: ProviderId;
  /** What this provider supports; drives capability negotiation. */
  readonly capabilities: ReadonlySet<Capability>;
  /** Map a logical model id to this provider's native id, e.g. 'reasoning-high' -> 'opus' | 'o3'. */
  resolveModel(logical: string): string;
  /** Launch one attempt. Non-blocking: returns a handle whose promises settle as the run proceeds. */
  launch(spec: RunSpec): AgentRun;
}
