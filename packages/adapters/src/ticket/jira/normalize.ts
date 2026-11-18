/**
 * Jira Rovo MCP response → ParsedTask[] + pagination info. Pure.
 *
 * Trust policy: Jira issue keys match /^[A-Z][A-Z0-9]+-\d+$/ and are stable
 * across title edits and project moves. Lamproom's `importKey` becomes
 * `<slug of key>` (e.g. `acme-42`), so a renamed issue keeps its key.
 *
 * Body: Rovo MCP returns the issue description already converted to markdown
 * (its MCP has the ADF-to-markdown filter on by default). Lamproom treats
 * the string as opaque — same trust boundary as GitHub.
 *
 * Extras: Jira-specific fields the port chose not to standardise (issueKey,
 * statusName, priorityName, parentKey, issueTypeName, components,
 * fixVersions). UI code may render known keys per source.
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md.
 */

import {
  type ParsedTask,
  type SourceId,
  type SourceUsage,
  deriveImportKey,
  slugify,
  type UpstreamKeyPolicy,
} from '@lamproom/core';

const POLICY_PREFIX: UpstreamKeyPolicy = { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ };

export interface RovoJiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface RovoJiraNamedEntity {
  id: string;
  name: string;
}

export interface RovoJiraStatus {
  id: string;
  name: string;
  statusCategory: { key: string; name: string };
}

export interface RovoJiraParent {
  key: string;
  fields?: { summary?: string };
}

export interface RovoJiraIssueFields {
  summary: string;
  description: string | null;
  status: RovoJiraStatus;
  labels: string[];
  assignee: RovoJiraUser | null;
  issuetype: RovoJiraNamedEntity;
  parent: RovoJiraParent | null;
  updated: string;
  created: string;
  priority: RovoJiraNamedEntity;
  components: RovoJiraNamedEntity[];
  fixVersions: RovoJiraNamedEntity[];
}

export interface RovoJiraIssue {
  key: string;
  fields: RovoJiraIssueFields;
}

export interface RovoJiraSearchResult {
  issues: RovoJiraIssue[];
  /** Rovo v2 names it camelCase; fixture uses snake_case (legacy Rovo v1 shape). We accept both. */
  nextPageToken?: string;
  next_page_token?: string;
}

export function normalizeJiraIssue(
  issue: RovoJiraIssue,
  sourceId: SourceId,
  seen: Set<string>,
): ParsedTask {
  const f = issue.fields;
  const hint = { upstream: issue.key, titleSlug: slugify(f.summary) };
  const importKey = deriveImportKey(sourceId, hint, POLICY_PREFIX, seen);

  const assignees = f.assignee !== null ? [f.assignee.accountId] : [];
  const labels = Array.isArray(f.labels) ? [...f.labels] : [];

  const extras: Record<string, unknown> = {
    issueKey: issue.key,
    issueTypeId: f.issuetype.id,
    issueTypeName: f.issuetype.name,
    statusId: f.status.id,
    statusName: f.status.name,
    statusCategory: f.status.statusCategory.key,
    priorityName: f.priority.name,
    components: f.components.map((c) => c.name),
    fixVersions: f.fixVersions.map((v) => v.name),
    updated: f.updated,
    created: f.created,
  };
  if (f.parent !== null) extras['parentKey'] = f.parent.key;

  const task: ParsedTask = {
    importKey,
    title: f.summary,
    _hint: hint,
    labels,
    assignees,
    extras,
  };
  if (f.description !== null && f.description !== '') task.body = f.description;
  return task;
}

export interface PageInfo {
  nextCursor?: string;
  usage: SourceUsage;
}

export function extractPageInfo(payload: RovoJiraSearchResult): PageInfo {
  const result: PageInfo = { usage: { requests: 1 } };
  const cursor = payload.nextPageToken ?? payload.next_page_token;
  if (cursor !== undefined && cursor !== '') {
    result.nextCursor = cursor;
  }
  return result;
}
