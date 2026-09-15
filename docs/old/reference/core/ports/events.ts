/**
 * Normalized run telemetry — shared by the AgentProvider port, the runner, the
 * live viewer, and the cost ledger. Every provider adapter parses its native
 * stream into these types; nothing downstream sees provider-specific JSON.
 *
 * See docs/architecture/01-ports.md.
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

/** The seven normalized event kinds. */
export type NormalizedEvent =
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; summary: string }
  | { type: 'tool_result'; ok: boolean; output: unknown }
  | { type: 'system'; sessionId?: string }
  | { type: 'result'; usage: Usage; outcome?: 'pass' | 'fail' }
  | { type: 'error'; message: string };
