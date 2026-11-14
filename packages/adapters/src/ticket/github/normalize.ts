/**
 * GitHub Issues GraphQL response → ParsedTask[] + pagination info. Pure.
 *
 * Trust policy: GitHub issue numbers are numeric and scoped to a repo, so the
 * adapter uses { trust: 'numeric' }. Keys look like `github-42` and are
 * stable across title edits — the user can rename "fix login" to "fix the
 * login bug" and the same issue keeps the same key, so re-import updates
 * instead of duplicating (Review Focus #1).
 *
 * The body comes back as GitHub-flavoured markdown and lands on
 * ParsedTask.body verbatim. GitHub-specific fields (number, url, createdAt,
 * updatedAt) land in `extras` for later rendering.
 *
 * See docs/superpowers/specs/2026-11-14-task-source-port-design.md,
 *     section "Import-key policy".
 */

import {
  type ParsedTask,
  type SourceId,
  type SourceUsage,
  deriveImportKey,
  slugify,
  type UpstreamKeyPolicy,
} from '@lamproom/core';

const POLICY_NUMERIC: UpstreamKeyPolicy = { trust: 'numeric' };

export interface GithubLabelNode {
  name: string;
}

export interface GithubUserNode {
  login: string;
}

export interface GithubIssueNode {
  number: number;
  title: string;
  body: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: { nodes: GithubLabelNode[] };
  assignees: { nodes: GithubUserNode[] };
}

export interface GithubIssuesPayload {
  repository: {
    issues: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GithubIssueNode[];
    };
  };
  rateLimit: { remaining: number; resetAt: string };
}

export function normalizeIssueNode(node: GithubIssueNode, sourceId: SourceId, seen: Set<string>): ParsedTask {
  const hint = { upstream: String(node.number), titleSlug: slugify(node.title) };
  const importKey = deriveImportKey(sourceId, hint, POLICY_NUMERIC, seen);
  const labels = node.labels.nodes.map((n) => n.name);
  const assignees = node.assignees.nodes.map((n) => n.login);

  const task: ParsedTask = {
    importKey,
    title: node.title,
    _hint: hint,
    labels,
    assignees,
    extras: {
      number: node.number,
      url: node.url,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
  };
  if (node.body !== null && node.body !== '') task.body = node.body;
  return task;
}

export interface PageInfo {
  nextCursor?: string;
  usage: SourceUsage;
}

export function extractPageInfo(payload: GithubIssuesPayload): PageInfo {
  const info = payload.repository.issues.pageInfo;
  const usage: SourceUsage = {
    requests: 1,
    rateLimitRemaining: payload.rateLimit.remaining,
    rateLimitResetAt: payload.rateLimit.resetAt,
  };
  const result: PageInfo = { usage };
  if (info.hasNextPage && info.endCursor !== null) result.nextCursor = info.endCursor;
  return result;
}
