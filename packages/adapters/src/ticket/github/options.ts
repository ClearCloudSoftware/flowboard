/**
 * GitHub Issues — SourceInput → GraphQL query + variables. Pure.
 *
 * One query, one shape: `repository.issues` with filterBy.since, orderBy
 * updatedAt desc, first/after for pagination. Free-text search (via GitHub's
 * `search` connection) is deferred — the current adapter does not honour
 * `input.query`. Add that in a later plan if the operator needs it.
 *
 * Defaults:
 *   pageSize = 50 (capped at 100 — GitHub's hard limit on first/after)
 *   cursor   = null → first page
 *   since    = null → no incremental filter
 *
 * Validation rules (thrown as plain Errors; provider wraps context):
 *   - owner and repo must be non-empty.
 *   - pageSize, if given, must be a positive integer.
 *
 * See docs/Lamproom/Agent Providers/Provider Boundary Rules.md — the test
 * boundary this file protects: provider.ts never shapes GraphQL; options.ts
 * never touches the network.
 */

import type { SourceInput } from '@lamproom/core';

export interface GithubTarget {
  owner: string;
  repo: string;
}

export interface GithubQueryVariables {
  owner: string;
  repo: string;
  first: number;
  after: string | null;
  since: string | null;
}

export interface GithubQuery {
  query: string;
  variables: GithubQueryVariables;
}

const ISSUES_QUERY = `query ($owner: String!, $repo: String!, $first: Int!, $after: String, $since: DateTime) {
  repository(owner: $owner, name: $repo) {
    issues(
      first: $first,
      after: $after,
      filterBy: { since: $since, states: OPEN },
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        body
        url
        createdAt
        updatedAt
        labels(first: 20) { nodes { name } }
        assignees(first: 10) { nodes { login } }
      }
    }
  }
  rateLimit { remaining resetAt }
}`;

export function buildIssuesQuery(input: SourceInput, target: GithubTarget): GithubQuery {
  if (target.owner.trim() === '') throw new Error('github source: owner is required');
  if (target.repo.trim() === '') throw new Error('github source: repo is required');

  if (input.pageSize !== undefined && (!Number.isFinite(input.pageSize) || input.pageSize <= 0)) {
    throw new Error(`github source: pageSize must be a positive integer, got ${input.pageSize}`);
  }

  const first = Math.min(input.pageSize ?? 50, 100);

  return {
    query: ISSUES_QUERY,
    variables: {
      owner: target.owner,
      repo: target.repo,
      first,
      after: input.cursor ?? null,
      since: input.since ?? null,
    },
  };
}
