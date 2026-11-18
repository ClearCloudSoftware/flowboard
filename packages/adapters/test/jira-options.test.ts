import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesCall } from '../src/ticket/jira/options.ts';

test('uses defaultJql when input has no query', () => {
  const call = buildIssuesCall({}, 'project = ACME AND statusCategory != Done ORDER BY updated DESC', { cloudId: 'cid' });
  assert.equal(call.name, 'searchJiraIssuesUsingJql');
  assert.equal(call.arguments.jql, 'project = ACME AND statusCategory != Done ORDER BY updated DESC');
  assert.equal(call.arguments.cloudId, 'cid');
});

test('derives cloudId as hostname when only baseUrl is given', () => {
  const call = buildIssuesCall({}, 'project = X', { baseUrl: 'https://acme.atlassian.net' });
  assert.equal(call.arguments.cloudId, 'acme.atlassian.net');
});

test('throws when target has neither cloudId nor baseUrl', () => {
  assert.throws(() => buildIssuesCall({}, 'project = X', {}), /cloudId or baseUrl/);
});

test('input.query overrides defaultJql', () => {
  const call = buildIssuesCall({ query: 'assignee = currentUser()' }, 'project = X', { cloudId: 'c' });
  assert.equal(call.arguments.jql, 'assignee = currentUser()');
});

test('appends updated-since fragment when input.since is set', () => {
  const call = buildIssuesCall({ since: '2026-11-01T00:00:00Z' }, 'project = X', { cloudId: 'c' });
  assert.match(call.arguments.jql, /^project = X AND updated >= "2026-11-01T00:00:00Z"$/);
});

test('appends updated-since to an ORDER BY jql keeping the ORDER BY at the end', () => {
  const call = buildIssuesCall(
    { since: '2026-11-01T00:00:00Z' },
    'project = X ORDER BY updated DESC',
    { cloudId: 'c' },
  );
  assert.match(call.arguments.jql, /AND updated >= "2026-11-01T00:00:00Z" ORDER BY updated DESC$/);
});

test('caps maxResults at 100 when caller asks for more', () => {
  const call = buildIssuesCall({ pageSize: 200 }, 'project = X', { cloudId: 'c' });
  assert.equal(call.arguments.maxResults, 100);
});

test('default maxResults is 50 when pageSize is not set', () => {
  const call = buildIssuesCall({}, 'project = X', { cloudId: 'c' });
  assert.equal(call.arguments.maxResults, 50);
});

test('passes cursor as nextPageToken', () => {
  const call = buildIssuesCall({ cursor: 'abc' }, 'project = X', { cloudId: 'c' });
  assert.equal(call.arguments.nextPageToken, 'abc');
});

test('includes a fields array', () => {
  const call = buildIssuesCall({}, 'project = X', { cloudId: 'c' });
  assert.ok(Array.isArray(call.arguments.fields));
  assert.ok(call.arguments.fields!.includes('summary'));
  assert.ok(call.arguments.fields!.includes('description'));
  assert.ok(call.arguments.fields!.includes('labels'));
  assert.ok(call.arguments.fields!.includes('assignee'));
  assert.ok(call.arguments.fields!.includes('status'));
  assert.ok(call.arguments.fields!.includes('priority'));
  assert.ok(call.arguments.fields!.includes('components'));
  assert.ok(call.arguments.fields!.includes('fixVersions'));
  assert.ok(call.arguments.fields!.includes('parent'));
});

test('throws when neither query nor defaultJql is set', () => {
  assert.throws(() => buildIssuesCall({}, '', { cloudId: 'c' }), /JQL/);
});

test('refuses non-positive pageSize', () => {
  assert.throws(() => buildIssuesCall({ pageSize: 0 }, 'project = X', { cloudId: 'c' }), /pageSize/);
  assert.throws(() => buildIssuesCall({ pageSize: -1 }, 'project = X', { cloudId: 'c' }), /pageSize/);
});
