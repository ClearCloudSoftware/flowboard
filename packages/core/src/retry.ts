/**
 * retryWithBackoff + RetryableError — the retry helper every HTTP TaskSource
 * adapter uses when the source returns a 429 or a 5xx that is actually a
 * transient server hiccup.
 *
 * The rule: only `RetryableError` triggers a retry. Any other thrown error
 * propagates immediately with no retry, no logging, no mask. Adapters are
 * responsible for mapping transport-specific errors (Octokit's `{status:429,
 * headers:{'retry-after'}}`, a fetch `TypeError`, a Jira secondary rate
 * limit) to `RetryableError` with the right `retryAfterMs`. Core knows
 * nothing about any specific HTTP library.
 *
 * When `respectRetryAfter` is true and the thrown `RetryableError` carries a
 * `retryAfterMs`, that value wins over the exponential schedule — because the
 * source has told us exactly when to try again and guessing differently is a
 * recipe for secondary rate-limiting.
 *
 * See docs/superpowers/specs/2026-11-14-task-source-port-design.md,
 *     section "Rate limits and pagination".
 */

/**
 * Retry policy. Adapters typically take this as a constructor option so tests
 * can shrink it to near-zero timing and so operators can tune per source.
 */
export interface RetryPolicy {
  /** Total attempts including the first. 1 means "no retries". */
  maxAttempts: number;
  /** Exponential base in milliseconds. The nth retry waits `baseMs * 2^(n-1)`. */
  baseMs: number;
  /** Per-sleep cap. The exponential schedule never exceeds this. */
  maxMs: number;
  /** When true, a RetryableError with retryAfterMs overrides the exponential schedule. */
  respectRetryAfter: boolean;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseMs: 500,
  maxMs: 10_000,
  respectRetryAfter: true,
};

/**
 * Thrown by an adapter to signal "retry me, please" to `retryWithBackoff`.
 * Anything else propagates immediately.
 *
 * `retryAfterMs` is honoured when the policy's `respectRetryAfter` is true.
 * Adapters SHOULD set it when the source returned a `Retry-After` header or
 * equivalent (Jira's secondary rate limit sends it; GitHub's primary rate
 * limit exposes it via `X-RateLimit-Reset`).
 */
export class RetryableError extends Error {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Run `fn` and retry on `RetryableError` up to `policy.maxAttempts`.
 *
 * The retry schedule:
 *   - Attempt 1 runs immediately.
 *   - Attempt n (n > 1) waits either `error.retryAfterMs` (when present and
 *     `respectRetryAfter` is true) or `min(baseMs * 2^(n-2), maxMs)`.
 *   - After `maxAttempts` the final error is re-thrown.
 *
 * Non-retryable errors propagate immediately with no sleep and no retry.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err;
      lastError = err;
      if (attempt === policy.maxAttempts) break;
      const waitMs = computeWait(err, attempt, policy);
      await delay(waitMs);
    }
  }
  throw lastError;
}

function computeWait(err: RetryableError, attempt: number, policy: RetryPolicy): number {
  if (policy.respectRetryAfter && err.retryAfterMs !== undefined) {
    return err.retryAfterMs;
  }
  const exponential = policy.baseMs * 2 ** (attempt - 1);
  return Math.min(exponential, policy.maxMs);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
