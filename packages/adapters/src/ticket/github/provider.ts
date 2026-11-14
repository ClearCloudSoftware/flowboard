/**
 * GithubTaskSource — pulls GitHub issues as ParsedTask[] via GraphQL.
 *
 * The flow for one fetch():
 *
 *   1. Resolve credential via the injected resolver. 'none' →
 *      CredentialMissingError, thrown BEFORE any network call
 *      (Review Focus #3).
 *   2. Build the GraphQL query + variables via options.ts.
 *   3. Call graphqlFn through retryWithBackoff. The default graphqlFn is a
 *      thin wrapper around @octokit/graphql; tests inject their own.
 *   4. Octokit errors with status 429 or 403 + a Retry-After header map to
 *      RetryableError with retryAfterMs. Anything else propagates
 *      immediately — no masking.
 *   5. Normalise each node via normalize.ts, extract pageInfo, assemble
 *      SourceResult.
 *   6. Wrap-around catch runs redactToken on any error message before
 *      re-throwing — the token must never leak into logs.
 *
 * Pagination is the caller's loop. `fetch()` returns one page plus
 * `nextCursor`; the caller re-calls until `nextCursor` is undefined.
 *
 * ingest() is not implemented — webhooks are a later plan.
 *
 * See docs/superpowers/plans/2026-11-14-task-source-port-markdown-and-github.md,
 *     Task 8.
 */

import { graphql as octokitGraphql } from '@octokit/graphql';
import {
  DEFAULT_RETRY,
  RetryableError,
  retryWithBackoff,
  type SourceCapability,
  type SourceCredentialResolver,
  type SourceId,
  type SourceInput,
  type SourceResult,
  type TaskSource,
  type RetryPolicy,
} from '@lamproom/core';
import { buildIssuesQuery, type GithubTarget } from './options.ts';
import { extractPageInfo, normalizeIssueNode, type GithubIssuesPayload } from './normalize.ts';
import { CredentialMissingError, redactToken } from './auth.ts';

export type GraphqlFn = (query: string, variables: Record<string, unknown>) => Promise<GithubIssuesPayload>;

export interface GithubTaskSourceOptions {
  target: GithubTarget;
  resolver: SourceCredentialResolver;
  /** Scoping key for resolver lookups. Defaults to 'default'. */
  projectId?: string;
  /** Injectable transport for tests. */
  graphqlFn?: GraphqlFn;
  /** Retry policy. Defaults to DEFAULT_RETRY. */
  retryPolicy?: RetryPolicy;
}

export { CredentialMissingError };

export class GithubTaskSource implements TaskSource {
  readonly id: SourceId = 'github';
  readonly capabilities: ReadonlySet<SourceCapability> = new Set<SourceCapability>([
    'pull',
    'pagination',
    'incremental',
    'labels',
    'assignees',
    'stable_upstream_key',
  ]);

  private readonly target: GithubTarget;
  private readonly resolver: SourceCredentialResolver;
  private readonly projectId: string;
  private readonly injectedGraphqlFn?: GraphqlFn;
  private readonly retryPolicy: RetryPolicy;

  constructor(opts: GithubTaskSourceOptions) {
    this.target = opts.target;
    this.resolver = opts.resolver;
    this.projectId = opts.projectId ?? 'default';
    this.injectedGraphqlFn = opts.graphqlFn;
    this.retryPolicy = opts.retryPolicy ?? DEFAULT_RETRY;
  }

  async fetch(input: SourceInput): Promise<SourceResult> {
    const credential = await this.resolver.resolve(this.id, this.projectId);
    if (credential.kind === 'none') {
      throw new CredentialMissingError(this.id, this.projectId);
    }
    if (credential.kind !== 'github_pat') {
      // Branch is currently unreachable because the union only has 'none' and
      // 'github_pat' — kept so a new SourceCredentials kind lands as an
      // explicit failure here rather than a silent runtime cast.
      const kind = (credential as { kind: string }).kind;
      throw new Error(`github source: unsupported credential kind '${kind}'`);
    }

    const token = credential.token;
    const graphqlFn = this.injectedGraphqlFn ?? this.makeOctokitGraphqlFn(token);
    const { query, variables } = buildIssuesQuery(input, this.target);

    try {
      const payload = await retryWithBackoff(() => {
        return graphqlFn(query, variables as unknown as Record<string, unknown>).catch((err: unknown) => {
          throw mapTransportError(err);
        });
      }, this.retryPolicy);

      const seen = new Set<string>();
      const tasks = payload.repository.issues.nodes.map((node) => normalizeIssueNode(node, this.id, seen));
      const info = extractPageInfo(payload);
      return info.nextCursor !== undefined
        ? { tasks, nextCursor: info.nextCursor, usage: info.usage }
        : { tasks, usage: info.usage };
    } catch (err) {
      throw reThrowRedacted(err, token);
    }
  }

  private makeOctokitGraphqlFn(token: string): GraphqlFn {
    const client = octokitGraphql.defaults({ headers: { authorization: `bearer ${token}` } });
    return async (query, variables) => (await client<GithubIssuesPayload>(query, variables)) as GithubIssuesPayload;
  }
}

function mapTransportError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err));
  const anyErr = err as Error & { status?: number; response?: { headers?: Record<string, string> } };
  const status = anyErr.status;
  const retryAfterHeader = anyErr.response?.headers?.['retry-after'];
  const retryAfterMs = retryAfterHeader !== undefined ? Number(retryAfterHeader) * 1000 : undefined;

  if (status === 429) return new RetryableError(err.message, retryAfterMs);
  if (status === 403 && retryAfterHeader !== undefined) return new RetryableError(err.message, retryAfterMs);
  if (status !== undefined && status >= 500) return new RetryableError(err.message, retryAfterMs);
  return err;
}

function reThrowRedacted(err: unknown, token: string): Error {
  if (err instanceof CredentialMissingError) return err;
  if (!(err instanceof Error)) return new Error(redactToken(String(err), token));
  const redacted = redactToken(err.message, token);
  if (redacted === err.message) return err;
  const clone = new Error(redacted);
  clone.name = err.name;
  return clone;
}
