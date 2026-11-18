/**
 * Jira — SourceInput → Rovo MCP tool call. Pure.
 *
 * One tool, one shape: `jira_search` with JQL, next_page_token for pagination,
 * limit (capped at 50 — Rovo's cap for this tool), and a fields allowlist so
 * normalize.ts gets exactly what it needs and no more.
 *
 * Defaults:
 *   limit     = 50
 *   cursor    = undefined → first page
 *   since     = undefined → no incremental filter
 *
 * Validation:
 *   - defaultJql or input.query must be non-empty (one of the two).
 *   - pageSize, if given, must be a positive integer.
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md.
 */

import type { SourceInput } from '@lamproom/core';

export interface JiraTarget {
  /** Required for OAuth: the Atlassian cloudId picked at sign-in. */
  cloudId?: string;
  /** Required for API-token auth: the full base URL (e.g. "https://acme.atlassian.net"). */
  baseUrl?: string;
}

export interface JiraMcpToolCall {
  name: 'searchJiraIssuesUsingJql';
  arguments: {
    cloudId: string;
    jql: string;
    nextPageToken?: string;
    maxResults?: number;
    fields?: string[];
    view?: 'compact' | 'evidence' | 'full';
  };
}

const FIELDS: readonly string[] = [
  'summary',
  'description',
  'status',
  'labels',
  'assignee',
  'issuetype',
  'parent',
  'updated',
  'created',
  'priority',
  'components',
  'fixVersions',
];

export function buildIssuesCall(
  input: SourceInput,
  defaultJql: string,
  target: JiraTarget,
): JiraMcpToolCall {
  const base = input.query ?? defaultJql;
  if (base.trim() === '') {
    throw new Error('jira source: JQL is required (via input.query or defaultJql)');
  }

  if (input.pageSize !== undefined && (!Number.isFinite(input.pageSize) || input.pageSize <= 0)) {
    throw new Error(`jira source: pageSize must be a positive integer, got ${input.pageSize}`);
  }

  const cloudId = resolveCloudId(target);
  if (cloudId === undefined) {
    throw new Error('jira source: cloudId or baseUrl is required on the JiraTarget');
  }

  const jql = input.since !== undefined ? injectUpdatedSince(base, input.since) : base;

  return {
    name: 'searchJiraIssuesUsingJql',
    arguments: {
      cloudId,
      jql,
      ...(input.cursor !== undefined ? { nextPageToken: input.cursor } : {}),
      maxResults: Math.min(input.pageSize ?? 50, 100),
      fields: [...FIELDS],
      view: 'full',
    },
  };
}

/**
 * The cloudId Rovo accepts: an Atlassian UUID, a site hostname, or a URL.
 * For OAuth we store the UUID from accessible-resources. For API token we
 * extract the hostname from baseUrl (Rovo's schema accepts "hostname" per
 * its description).
 */
function resolveCloudId(target: JiraTarget): string | undefined {
  if (target.cloudId !== undefined && target.cloudId !== '') return target.cloudId;
  if (target.baseUrl !== undefined && target.baseUrl !== '') {
    try {
      return new URL(target.baseUrl).hostname;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Inject `updated >= "<iso>"` as an AND clause while preserving any ORDER BY at
 * the end of the JQL string. JQL requires ORDER BY to be the last clause.
 */
function injectUpdatedSince(jql: string, since: string): string {
  const match = jql.match(/^(.*?)(\s+ORDER\s+BY\s+.+)$/i);
  const fragment = `updated >= "${since}"`;
  if (match) {
    const [, where, order] = match;
    return `${where} AND ${fragment}${order}`;
  }
  return `${jql} AND ${fragment}`;
}
