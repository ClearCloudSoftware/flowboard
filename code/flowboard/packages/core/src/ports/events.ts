/**
 * Normalized run telemetry — shared by the AgentProvider port, the runner, the
 * live viewer, and the cost ledger. Every provider adapter parses its native
 * stream into these types; nothing downstream sees provider-specific JSON.
 *
 * See docs/FlowBoard/Agent Providers/Normalized Event Envelope.md.
 */

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  numTurns: number;
  /** Absent when the provider lacks `native_cost`; PricingService fills it from tokens. */
  costUsd?: number;
}

export const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, numTurns: 0 };

/**
 * The seven normalized event kinds, plus `usage`: running token totals for the
 * run so far, emitted mid-run so the live view shows a running number.
 * `raw` carries the native message the event came from, for `run_events.raw`.
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
