import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesQuery } from '../src/ticket/github/options.ts';

test('builds a query with owner, repo and default pageSize', () => {
  const { query, variables } = buildIssuesQuery({}, { owner: 'octokit', repo: 'octokit.js' });
  assert.ok(query.includes('repository(owner: $owner, name: $repo)'));
  assert.ok(query.includes('rateLimit'));
  assert.equal(variables.owner, 'octokit');
  assert.equal(variables.repo, 'octokit.js');
  assert.equal(variables.first, 50);
  assert.equal(variables.after, null);
  assert.equal(variables.since, null);
});

test('caps pageSize at 100', () => {
  const { variables } = buildIssuesQuery({ pageSize: 500 }, { owner: 'o', repo: 'r' });
  assert.equal(variables.first, 100);
});

test('passes cursor through as after', () => {
  const { variables } = buildIssuesQuery({ cursor: 'Y3Vyc29yOjE=' }, { owner: 'o', repo: 'r' });
  assert.equal(variables.after, 'Y3Vyc29yOjE=');
});

test('passes since through for incremental sync', () => {
  const { variables } = buildIssuesQuery({ since: '2026-11-01T00:00:00Z' }, { owner: 'o', repo: 'r' });
  assert.equal(variables.since, '2026-11-01T00:00:00Z');
});

test('refuses empty owner or repo', () => {
  assert.throws(() => buildIssuesQuery({}, { owner: '', repo: 'r' }), /owner/);
  assert.throws(() => buildIssuesQuery({}, { owner: 'o', repo: '' }), /repo/);
});

test('refuses non-positive pageSize', () => {
  assert.throws(() => buildIssuesQuery({ pageSize: 0 }, { owner: 'o', repo: 'r' }), /pageSize/);
  assert.throws(() => buildIssuesQuery({ pageSize: -1 }, { owner: 'o', repo: 'r' }), /pageSize/);
});
