/**
 * Ticket envelope types — SourceUsage, ZERO_SOURCE_USAGE, addUsage.
 *
 * Sits next to task-source.ts the same way events.ts sits next to
 * agent-provider.ts. The envelope is shared by the runner, the cost ledger,
 * and the import route — anything that needs to attribute API quota consumed
 * by a TaskSource.
 *
 * Unlike AgentProvider's `Usage`, which counts tokens and dollars, this counts
 * requests and rate-limit headroom. A source that bills per call (rare) reports
 * `costUsd`; most set it to zero (undefined) and the ledger counts nothing.
 *
 * See docs/Lamproom/Intake And Import/TaskSource Port.md and
 * docs/superpowers/specs/2026-11-14-task-source-port-design.md.
 */

/**
 * Quota consumed by one or more TaskSource calls.
 *
 * `requests` counts network-successful calls only. A call that failed with a
 * RetryableError and succeeded on the next attempt counts as one. This is a
 * deliberate decision: the ledger measures what the source saw, not what the
 * client tried.
 *
 * `rateLimitRemaining` and `rateLimitResetAt` carry the latest headers from
 * the source so the caller can decide whether to keep paginating.
 *
 * `bytesRead` is informational. `costUsd` is almost always undefined; present
 * only for sources that bill by API call.
 */
export interface SourceUsage {
  requests: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  bytesRead?: number;
  costUsd?: number;
}

/** A zero-valued usage, used as an identity for `addUsage` and as a seed. */
export const ZERO_SOURCE_USAGE: SourceUsage = { requests: 0 };

/**
 * Combine two usages. Pure.
 *
 * Rules:
 *   - `requests`, `bytesRead`, `costUsd` are summed when present.
 *   - `rateLimitRemaining` takes the LOWER value (the tighter headroom).
 *   - `rateLimitResetAt` takes the LATER value (the one further in the future).
 *   - Missing fields on one side pass through from the other.
 */
export function addUsage(a: SourceUsage, b: SourceUsage): SourceUsage {
  const out: SourceUsage = { requests: a.requests + b.requests };

  const bytes = (a.bytesRead ?? 0) + (b.bytesRead ?? 0);
  if (a.bytesRead !== undefined || b.bytesRead !== undefined) out.bytesRead = bytes;

  const cost = (a.costUsd ?? 0) + (b.costUsd ?? 0);
  if (a.costUsd !== undefined || b.costUsd !== undefined) out.costUsd = cost;

  if (a.rateLimitRemaining !== undefined && b.rateLimitRemaining !== undefined) {
    out.rateLimitRemaining = Math.min(a.rateLimitRemaining, b.rateLimitRemaining);
  } else if (a.rateLimitRemaining !== undefined) {
    out.rateLimitRemaining = a.rateLimitRemaining;
  } else if (b.rateLimitRemaining !== undefined) {
    out.rateLimitRemaining = b.rateLimitRemaining;
  }

  if (a.rateLimitResetAt !== undefined && b.rateLimitResetAt !== undefined) {
    out.rateLimitResetAt = a.rateLimitResetAt > b.rateLimitResetAt ? a.rateLimitResetAt : b.rateLimitResetAt;
  } else if (a.rateLimitResetAt !== undefined) {
    out.rateLimitResetAt = a.rateLimitResetAt;
  } else if (b.rateLimitResetAt !== undefined) {
    out.rateLimitResetAt = b.rateLimitResetAt;
  }

  return out;
}
