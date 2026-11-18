/**
 * JiraTaskSource — pulls Jira issues via the Atlassian Rovo MCP server.
 *
 * Flow of one fetch():
 *   1. Resolve credential. 'none' → CredentialMissingError, thrown BEFORE the
 *      MCP transport opens (Review Focus #5).
 *   2. If OAuth and the token expires within 60 seconds, refresh it via the
 *      injected refreshOAuthFn BEFORE opening the transport (Review Focus #2).
 *      Avoids the mid-flight 401 race.
 *   3. Build the Rovo MCP tool call via options.ts.
 *   4. retryWithBackoff(() => mcpClient.callTool('jira_search', args, signal)).
 *      429/503/5xx map to RetryableError (honouring Retry-After);
 *      anything else propagates untouched (Review Focus #3).
 *   5. Normalize issues, extract pagination, assemble SourceResult.
 *   6. Wrap-around catch runs redactTokens(err.message, accessToken,
 *      refreshToken, apiToken). Access, refresh, API token all redacted
 *      (Review Focus #4).
 *   7. finally { await this.mcpClient.close() } — resources released on
 *      every path.
 *
 * Dependencies are injectable for tests:
 *   - resolver (always required)
 *   - mcpClient (tests inject a fake; production builds via httpTransport)
 *   - refreshOAuthFn (tests inject; production defaults to a stub until
 *     Task 5's oauth.ts lands, then a real implementation that calls
 *     Atlassian's token endpoint)
 *   - nowFn (tests inject to make the refresh window deterministic;
 *     production defaults to () => new Date())
 *   - retryPolicy (tests shrink to near-zero timing)
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md
 * and docs/superpowers/plans/2026-11-17-task-source-jira-mcp.md Task 4.
 */

import {
  DEFAULT_RETRY,
  retryWithBackoff,
  type RetryPolicy,
  type SourceCapability,
  type SourceCredentialResolver,
  type SourceCredentials,
  type SourceId,
  type SourceInput,
  type SourceResult,
  type TaskSource,
} from '@lamproom/core';
import type { McpClient } from '../../mcp/client.ts';
import { buildIssuesCall } from './options.ts';
import {
  extractPageInfo,
  normalizeJiraIssue,
  type RovoJiraSearchResult,
} from './normalize.ts';
import { CredentialMissingError, redactTokens } from './auth.ts';

type OAuthCred = Extract<SourceCredentials, { kind: 'atlassian_oauth' }>;

/** Signature of the OAuth refresh function. Task 5 provides the real one. */
export type RefreshOAuthFn = (creds: OAuthCred) => Promise<OAuthCred>;

/** How close to expiry triggers a pre-flight refresh. */
const REFRESH_WINDOW_MS = 60 * 1000;

const CAPABILITIES: ReadonlySet<SourceCapability> = new Set<SourceCapability>([
  'pull',
  'pagination',
  'incremental',
  'rich_body',
  'labels',
  'assignees',
  'stable_upstream_key',
]);

export interface JiraTaskSourceOptions {
  resolver: SourceCredentialResolver;
  defaultJql: string;
  /** Scoping key for resolver lookups. Defaults to 'default'. */
  projectId?: string;
  /** Injected for tests; required for live use (the httpTransport-backed one). */
  mcpClient: McpClient;
  /** Refresh OAuth tokens. Required when the resolver might return atlassian_oauth. */
  refreshOAuthFn?: RefreshOAuthFn;
  /** Clock. Tests override to make the refresh-window check deterministic. */
  nowFn?: () => Date;
  /** Retry policy. Defaults to DEFAULT_RETRY. */
  retryPolicy?: RetryPolicy;
  /** AbortSignal timeout per MCP call, ms. Defaults to 30s. */
  callTimeoutMs?: number;
}

export class JiraTaskSource implements TaskSource {
  readonly id: SourceId = 'jira';
  readonly capabilities = CAPABILITIES;

  private readonly resolver: SourceCredentialResolver;
  private readonly defaultJql: string;
  private readonly projectId: string;
  private readonly mcpClient: McpClient;
  private readonly refreshOAuthFn: RefreshOAuthFn;
  private readonly nowFn: () => Date;
  private readonly retryPolicy: RetryPolicy;
  private readonly callTimeoutMs: number;

  constructor(opts: JiraTaskSourceOptions) {
    this.resolver = opts.resolver;
    this.defaultJql = opts.defaultJql;
    this.projectId = opts.projectId ?? 'default';
    this.mcpClient = opts.mcpClient;
    this.refreshOAuthFn =
      opts.refreshOAuthFn ??
      (async () => {
        throw new Error('JiraTaskSource: refreshOAuthFn not configured — provide one when the resolver may return atlassian_oauth');
      });
    this.nowFn = opts.nowFn ?? (() => new Date());
    this.retryPolicy = opts.retryPolicy ?? DEFAULT_RETRY;
    this.callTimeoutMs = opts.callTimeoutMs ?? 30_000;
  }

  async fetch(input: SourceInput): Promise<SourceResult> {
    const rawCred = await this.resolver.resolve(this.id, this.projectId);
    if (rawCred.kind === 'none') {
      throw new CredentialMissingError(this.id, this.projectId);
    }
    if (rawCred.kind !== 'atlassian_oauth' && rawCred.kind !== 'atlassian_api_token') {
      throw new Error(`jira source: unsupported credential kind '${rawCred.kind}'`);
    }

    const cred = await this.maybeRefresh(rawCred);
    const accessToken = cred.kind === 'atlassian_oauth' ? cred.accessToken : undefined;
    const refreshToken = cred.kind === 'atlassian_oauth' ? cred.refreshToken : undefined;
    const apiToken = cred.kind === 'atlassian_api_token' ? cred.token : undefined;

    try {
      const call = buildIssuesCall(input, this.defaultJql, {
        cloudId: cred.kind === 'atlassian_oauth' ? cred.cloudId : undefined,
        baseUrl: cred.kind === 'atlassian_api_token' ? cred.baseUrl : undefined,
      });

      const payload = await retryWithBackoff(async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.callTimeoutMs);
        try {
          const raw = await this.mcpClient.callTool<unknown>(
            call.name,
            call.arguments as unknown as Record<string, unknown>,
            { signal: ac.signal },
          );
          return unwrapRovoResponse(raw);
        } finally {
          clearTimeout(timer);
        }
      }, this.retryPolicy);

      const seen = new Set<string>();
      const tasks = payload.issues.map((issue) => normalizeJiraIssue(issue, this.id, seen));
      const info = extractPageInfo(payload);
      return info.nextCursor !== undefined
        ? { tasks, nextCursor: info.nextCursor, usage: info.usage }
        : { tasks, usage: info.usage };
    } catch (err) {
      throw reThrowRedacted(err, accessToken, refreshToken, apiToken);
    } finally {
      await this.mcpClient.close();
    }
  }

  private async maybeRefresh(
    cred: Extract<SourceCredentials, { kind: 'atlassian_oauth' | 'atlassian_api_token' }>,
  ): Promise<Extract<SourceCredentials, { kind: 'atlassian_oauth' | 'atlassian_api_token' }>> {
    if (cred.kind !== 'atlassian_oauth') return cred;
    const expiresAtMs = Date.parse(cred.expiresAt);
    const nowMs = this.nowFn().getTime();
    if (expiresAtMs - nowMs > REFRESH_WINDOW_MS) return cred;
    return await this.refreshOAuthFn(cred);
  }
}

/**
 * Rovo MCP wraps every response in `{ content: [{ type: 'text', text: '<JSON string>' }], isError?: boolean }`.
 * Unwrap it to the inner JSON. `isError: true` with a text payload means the
 * tool rejected the call (bad JQL, missing scope, etc.); surface that message
 * so the caller sees Rovo's words, not a Lamproom-internal one.
 */
function unwrapRovoResponse(raw: unknown): RovoJiraSearchResult {
  const envelope = raw as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  const first = envelope.content?.[0];
  const text = first?.text;
  if (typeof text !== 'string') {
    throw new Error('jira source: Rovo returned no text content');
  }
  let inner: unknown;
  try {
    inner = JSON.parse(text);
  } catch {
    throw new Error(`jira source: Rovo returned non-JSON text: ${text.slice(0, 200)}`);
  }
  if (envelope.isError === true) {
    const msg = (inner as { message?: string }).message ?? text.slice(0, 500);
    throw new Error(`jira source: ${msg}`);
  }
  return inner as RovoJiraSearchResult;
}

function reThrowRedacted(
  err: unknown,
  accessToken: string | undefined,
  refreshToken: string | undefined,
  apiToken: string | undefined,
): Error {
  if (err instanceof CredentialMissingError) return err;
  const errorInstance = err instanceof Error ? err : new Error(String(err));
  const redacted = redactTokens(errorInstance.message, accessToken, refreshToken, apiToken);
  if (redacted === errorInstance.message) return errorInstance;
  const clone = new Error(redacted);
  clone.name = errorInstance.name;
  return clone;
}
