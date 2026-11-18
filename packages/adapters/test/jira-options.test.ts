import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesCall } from '../src/ticket/jira/options.ts';

test('uses defaultJql when input has no query', () => {
  const call = buildIssuesCall({}, 'project = ACME AND statusCategory != Done ORDER BY updated DESC', {});
  assert.equal(call.name, 'jira_search');
  assert.equal(call.arguments.jql, 'project = ACME AND statusCategory != Done ORDER BY updated DESC');
});

test('input.query overrides defaultJql', () => {
  const call = buildIssuesCall({ query: 'assignee = currentUser()' }, 'project = X', {});
  assert.equal(call.arguments.jql, 'assignee = currentUser()');
});

test('appends updated-since fragment when input.since is set', () => {
  const call = buildIssuesCall({ since: '2026-11-01T00:00:00Z' }, 'project = X', {});
  assert.match(call.arguments.jql, /^project = X AND updated >= "2026-11-01T00:00:00Z"$/);
});

test('appends updated-since to an ORDER BY jql keeping the ORDER BY at the end', () => {
  const call = buildIssuesCall(
    { since: '2026-11-01T00:00:00Z' },
    'project = X ORDER BY updated DESC',
    {},
  );
  assert.match(call.arguments.jql, /AND updated >= "2026-11-01T00:00:00Z" ORDER BY updated DESC$/);
});

test('caps limit at 50 when caller asks for more', () => {
  const call = buildIssuesCall({ pageSize: 200 }, 'project = X', {});
  assert.equal(call.arguments.limit, 50);
});

test('default limit is 50 when pageSize is not set', () => {
  const call = buildIssuesCall({}, 'project = X', {});
  assert.equal(call.arguments.limit, 50);
});

test('passes cursor as next_page_token', () => {
  const call = buildIssuesCall({ cursor: 'abc' }, 'project = X', {});
  assert.equal(call.arguments.next_page_token, 'abc');
});

test('includes a fields array', () => {
  const call = buildIssuesCall({}, 'project = X', {});
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
  assert.throws(() => buildIssuesCall({}, '', {}), /JQL/);
});

test('refuses non-positive pageSize', () => {
  assert.throws(() => buildIssuesCall({ pageSize: 0 }, 'project = X', {}), /pageSize/);
  assert.throws(() => buildIssuesCall({ pageSize: -1 }, 'project = X', {}), /pageSize/);
});
