/**
 * MCP error types + retry mapping.
 *
 * The McpClient wrapper catches transport-level errors from the MCP SDK and
 * rethrows them wrapped in these classes; adapter code then passes them
 * through `mapMcpError` to decide whether to retry.
 *
 * Separation of concerns:
 *   - The SDK raises whatever shape it raises (changes between versions).
 *   - The transport.ts layer catches and rewraps into McpTransportError /
 *     McpCallError, so the client code sees a stable shape.
 *   - mapMcpError turns those into RetryableError (from @lamproom/core) when
 *     the HTTP status is one the caller should back off from.
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md.
 */

import { RetryableError } from '@lamproom/core';

/**
 * A transport-level failure: the HTTP round trip to the MCP server returned
 * a non-2xx status, or the connection dropped. Carries the status code and
 * the response headers so the caller can inspect `Retry-After` etc.
 */
export class McpTransportError extends Error {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  constructor(message: string, status: number, headers: Record<string, string>) {
    super(message);
    this.name = 'McpTransportError';
    this.status = status;
    this.headers = headers;
  }
}

/**
 * A tool-call failure: the transport succeeded, the MCP server responded, but
 * the tool itself returned an error (e.g. "invalid JQL", "issue not found").
 * Not retryable — a different input is needed.
 */
export class McpCallError extends Error {
  readonly toolName: string;
  readonly cause?: unknown;
  constructor(message: string, toolName: string, cause?: unknown) {
    super(message);
    this.name = 'McpCallError';
    this.toolName = toolName;
    this.cause = cause;
  }
}

/**
 * Map a transport error to a RetryableError when the HTTP status warrants a
 * retry; otherwise return the error untouched. McpCallError (tool-level) is
 * always non-retryable. Non-Error values are wrapped.
 *
 * Rules:
 *   - 429 Too Many Requests        -> RetryableError (honours Retry-After)
 *   - 503 Service Unavailable       -> RetryableError (honours Retry-After)
 *   - >=500                         -> RetryableError (honours Retry-After if present)
 *   - 4xx other than 429            -> propagate untouched (bad request, auth, not found)
 *   - McpCallError                  -> propagate untouched
 *   - non-Error values              -> wrapped in Error
 */
export function mapMcpError(err: unknown): Error {
  if (err instanceof McpTransportError) {
    const retryAfter = err.headers['retry-after'];
    const retryAfterMs = retryAfter !== undefined ? Number(retryAfter) * 1000 : undefined;
    if (err.status === 429) return new RetryableError(err.message, retryAfterMs);
    if (err.status === 503) return new RetryableError(err.message, retryAfterMs);
    if (err.status >= 500) return new RetryableError(err.message, retryAfterMs);
    return err;
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}
