/**
 * Normalized run telemetry — shared by the AgentProvider port, the runner, the
 * live viewer, and the cost ledger. Every provider adapter parses its native
 * stream into these types. Tool events are the exception: `tool_use.name`,
 * `tool_use.input` and `tool_result.output` keep the provider's own tool names
 * and shapes (Claude's `Read` with `file_path`; OpenCode's `read` with `filePath`).
 *
 * See docs/FlowBoard/Agent Providers/Normalized Event Envelope.md.
 */

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** The main agent's turns (model calls); subagents' tokens and cost count, their turns do not. */
  numTurns: number;
  /**
   * USD as the provider reports it. Claude reports it only on the result, so its live `usage` events (and a run
   * stopped before the result) have none; OpenCode reports it on every event, with 0 for a model it has no price
   * for. Absent means "price it from tokens".
   */
  costUsd?: number;
}

export const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0 };

/**
 * The eight normalized event kinds. `usage` carries running totals for the run
 * so far, emitted mid-run so the live view shows a running number. `raw`
 * carries the native message the event came from, for `run_events.raw`; an
 * error the adapter raises with no native message behind it (a thrown
 * exception, a limit it enforces) has none.
 */
export type NormalizedEvent = (
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; summary: string }
  | { type: 'tool_result'; ok: boolean; output: unknown }
  | { type: 'system'; sessionId?: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }
  | { type: 'error'; message: string }
) & { raw?: unknown };
