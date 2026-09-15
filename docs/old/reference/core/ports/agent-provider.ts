/**
 * AgentProvider — the port that makes coding-agent CLIs interchangeable.
 *
 * This is the seam of the whole system. `core/` and `runner/` program against
 * this interface; `adapters/agent/<claude|codex|replay>/` implement it. No file
 * under `core/` or `runner/` may import a provider adapter — only this port.
 *
 * An adapter's job is exactly two mappings:
 *   1. RunSpec  ->  the provider's native CLI flags / config.
 *   2. the provider's native event stream  ->  NormalizedEvent (./events.ts).
 *
 * Everything else — the flow engine, board projection, cost ledger, HITL
 * protocol, live viewer — consumes only the normalized outputs and never learns
 * which provider ran.
 *
 * See docs/architecture/01-ports.md and docs/architecture/03-execution-substrate.md.
 */

import type { NormalizedEvent, Usage } from './events';
import type { ExecHost } from './exec-host';

// ---------------------------------------------------------------------------
// Identity & capabilities
// ---------------------------------------------------------------------------

/** Well-known provider ids; the `(string & {})` keeps autocomplete without closing the set. */
export type ProviderId = 'claude-code' | 'codex' | 'replay' | (string & {});

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
  | 'budget_cap';

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
 * vs user turn). A core helper renders the canonical order; adapters must not
 * reorder. Assembly itself is provider-neutral and lives in the runner.
 */
export interface PromptParts {
  /** 1. Preamble: task title + body. */
  preamble: string;
  /** 2. Input artifacts — "read these first". */
  inputs: ArtifactRef[];
  /** 3. Exact output paths the step must write, one per `produces`. */
  outputs: ArtifactRef[];
  /** 4. Slash invocation for kind='skill', e.g. "/grill-me". */
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
    | { kind: 'plugin_dir'; path: string }        // Claude: --plugin-dir
    | { kind: 'system_prompt'; text: string }     // provider without plugins
    | { kind: 'native'; config: Record<string, unknown> };
}

/** Everything needed to launch one attempt of one step, provider-agnostically. */
export interface RunSpec {
  prompt: PromptParts;
  /** Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel(). */
  model: string;
  /** Dropped by the adapter when `effort` is unsupported. */
  effort?: Effort;
  /** Tool allow/deny globs. The runner always appends the ask-user tools so a restrictive list can't lock out HITL. */
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
   * works for any provider. From `workspace.execHost(task)`. See ./exec-host.ts
   * and docs/architecture/08-sandboxing.md.
   */
  exec?: ExecHost;
  /** Resume a prior session; `fork` requires the `resume_fork` capability, else context-replay. */
  resume?: { sessionId: string; fork?: boolean };
  limits?: { maxTurns?: number; maxBudgetUsd?: number };
}

// ---------------------------------------------------------------------------
// Run outputs  (Usage & NormalizedEvent imported from ./events)
// ---------------------------------------------------------------------------

export interface RunResult {
  usage: Usage;
  exitCode: number;
  /** Drives conditional edges; read from the produced JSON or set_outcome. Defaults to 'pass'. */
  outcome?: 'pass' | 'fail';
  /** stderr tail on failure. */
  error?: string;
}

/** A live handle on one running attempt. */
export interface AgentRun {
  /** Resolves once the provider emits its session id (from system/init). */
  sessionId: Promise<string>;
  pid: number;
  /** Normalized event stream; the runner tees this to run_events + SSE. */
  events: AsyncIterable<NormalizedEvent>;
  /** Resolves on process exit. */
  result: Promise<RunResult>;
  /** SIGTERM the child. */
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
  /** Spawn one attempt. Non-blocking: returns a handle whose promises settle as the run proceeds. */
  launch(spec: RunSpec): AgentRun;
}
