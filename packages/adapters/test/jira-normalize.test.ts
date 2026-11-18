import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  normalizeJiraIssue,
  extractPageInfo,
  type RovoJiraIssue,
  type RovoJiraSearchResult,
} from '../src/ticket/jira/normalize.ts';

const here = import.meta.dirname;

async function fixture(): Promise<RovoJiraSearchResult> {
  const text = await readFile(join(here, 'fixtures/jira/search-page1.json'), 'utf8');
  return JSON.parse(text) as RovoJiraSearchResult;
}

test('normalizes a Jira issue into a ParsedTask with key-based importKey', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const first = payload.issues[0]!;
  const t = normalizeJiraIssue(first, 'jira', seen);
  assert.match(t.importKey, /^[a-z][a-z0-9]+-\d+$/);
  assert.equal(t.title, first.fields.summary);
  assert.equal(t._hint.upstream, first.key);
});

test('upstream key survives through slugify', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const t = normalizeJiraIssue(payload.issues[0]!, 'jira', seen);
  assert.equal(t.importKey, 'acme-42');
});

test('carries labels and assignee into the result', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const t = normalizeJiraIssue(payload.issues[0]!, 'jira', seen);
  assert.deepEqual(t.labels, ['bug', 'sso', 'priority-high']);
  assert.deepEqual(t.assignees, ['5f1234567890abcdef123456']);
});

test('leaves body undefined when description is null', async () => {
  const payload = await fixture();
  const nullBody = payload.issues.find((i) => i.fields.description === null);
  assert.ok(nullBody, 'fixture must include an issue with null description');
  const seen = new Set<string>();
  const t = normalizeJiraIssue(nullBody, 'jira', seen);
  assert.equal(t.body, undefined);
});

test('maps unassigned to empty assignees array', async () => {
  const payload = await fixture();
  const unassigned = payload.issues.find((i) => i.fields.assignee === null);
  assert.ok(unassigned, 'fixture must include an unassigned issue');
  const seen = new Set<string>();
  const t = normalizeJiraIssue(unassigned, 'jira', seen);
  assert.deepEqual(t.assignees, []);
});

test('carries components and fixVersions into extras', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const t = normalizeJiraIssue(payload.issues[0]!, 'jira', seen);
  assert.deepEqual(t.extras?.components, ['Auth']);
  assert.deepEqual(t.extras?.fixVersions, ['v4.2']);
});

test('carries issueKey, status, priority, parentKey into extras', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const subtask = payload.issues[1]!;
  const t = normalizeJiraIssue(subtask, 'jira', seen);
  assert.equal(t.extras?.issueKey, 'ACME-43');
  assert.equal(t.extras?.statusName, 'To Do');
  assert.equal(t.extras?.statusCategory, 'new');
  assert.equal(t.extras?.priorityName, 'Medium');
  assert.equal(t.extras?.parentKey, 'ACME-42');
  assert.equal(t.extras?.issueTypeName, 'Task');
});

test('parent is undefined when issue has no parent', async () => {
  const payload = await fixture();
  const seen = new Set<string>();
  const parentless = payload.issues.find((i) => i.fields.parent === null);
  assert.ok(parentless);
  const t = normalizeJiraIssue(parentless, 'jira', seen);
  assert.equal(t.extras?.parentKey, undefined);
});

test('within-batch duplicate keys get -2 suffix', () => {
  const seen = new Set<string>();
  const node: RovoJiraIssue = {
    key: 'DUP-1',
    fields: {
      summary: 'dup',
      description: null,
      status: { id: '1', name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
      labels: [],
      assignee: null,
      issuetype: { id: '1', name: 'Task' },
      parent: null,
      updated: '2026-11-17T00:00:00.000+0000',
      created: '2026-11-17T00:00:00.000+0000',
      priority: { id: '3', name: 'Medium' },
      components: [],
      fixVersions: [],
    },
  };
  const a = normalizeJiraIssue(node, 'jira', seen);
  const b = normalizeJiraIssue(node, 'jira', seen);
  assert.equal(a.importKey, 'dup-1');
  assert.equal(b.importKey, 'dup-1-2');
});

test('extractPageInfo returns next_page_token as nextCursor', async () => {
  const payload = await fixture();
  const info = extractPageInfo(payload);
  assert.equal(info.nextCursor, payload.next_page_token);
  assert.equal(info.usage.requests, 1);
});

test('extractPageInfo returns undefined nextCursor when next_page_token is absent', () => {
  const info = extractPageInfo({ issues: [] });
  assert.equal(info.nextCursor, undefined);
  assert.equal(info.usage.requests, 1);
});
