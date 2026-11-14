import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPageInfo, normalizeIssueNode, type GithubIssuesPayload } from '../src/ticket/github/normalize.ts';

const here = import.meta.dirname;

async function loadFixture(): Promise<GithubIssuesPayload> {
  const text = await readFile(join(here, 'fixtures/github/issues-page1.json'), 'utf8');
  return JSON.parse(text) as GithubIssuesPayload;
}

test('normalizes a GitHub Issue into a ParsedTask with stable key', async () => {
  const payload = await loadFixture();
  const seen = new Set<string>();
  const t = normalizeIssueNode(payload.repository.issues.nodes[0]!, 'github', seen);
  assert.equal(t.importKey, 'github-42');
  assert.equal(t.title, 'Fix the login bug');
  assert.match(t.body ?? '', /^Users are redirected/);
  assert.deepEqual(t.labels, ['bug', 'priority:high']);
  assert.deepEqual(t.assignees, ['alice']);
  assert.equal(t._hint.upstream, '42');
  assert.equal(t._hint.titleSlug, 'fix-the-login-bug');
});

test('leaves body undefined when GitHub returns null', async () => {
  const payload = await loadFixture();
  const seen = new Set<string>();
  const t = normalizeIssueNode(payload.repository.issues.nodes[2]!, 'github', seen);
  assert.equal(t.importKey, 'github-44');
  assert.equal(t.body, undefined);
  assert.deepEqual(t.labels, []);
  assert.deepEqual(t.assignees, ['bob', 'carol']);
});

test('carries number, url, createdAt, updatedAt into extras', async () => {
  const payload = await loadFixture();
  const seen = new Set<string>();
  const t = normalizeIssueNode(payload.repository.issues.nodes[0]!, 'github', seen);
  assert.equal(t.extras?.number, 42);
  assert.equal(t.extras?.url, 'https://github.com/octokit/octokit.js/issues/42');
  assert.equal(t.extras?.createdAt, '2026-10-01T12:34:56Z');
  assert.equal(t.extras?.updatedAt, '2026-11-01T09:12:34Z');
});

test('within-batch duplicate upstream numbers would get -2 suffix', () => {
  // Shouldn't happen in practice (GitHub never returns the same issue twice in one page),
  // but the port's contract says the normalizer MUST pass seenInBatch through.
  const seen = new Set<string>();
  const node = {
    number: 7,
    title: 'x',
    body: null,
    url: 'u',
    createdAt: '',
    updatedAt: '',
    labels: { nodes: [] },
    assignees: { nodes: [] },
  };
  const a = normalizeIssueNode(node, 'github', seen);
  const b = normalizeIssueNode(node, 'github', seen);
  assert.equal(a.importKey, 'github-7');
  assert.equal(b.importKey, 'github-7-2');
});

test('extractPageInfo returns nextCursor when hasNextPage is true', async () => {
  const payload = await loadFixture();
  const info = extractPageInfo(payload);
  assert.equal(info.nextCursor, payload.repository.issues.pageInfo.endCursor);
  assert.equal(info.usage.requests, 1);
  assert.equal(info.usage.rateLimitRemaining, 4987);
  assert.equal(info.usage.rateLimitResetAt, '2026-11-14T15:00:00Z');
});

test('extractPageInfo returns undefined nextCursor when hasNextPage is false', async () => {
  const payload = await loadFixture();
  payload.repository.issues.pageInfo.hasNextPage = false;
  const info = extractPageInfo(payload);
  assert.equal(info.nextCursor, undefined);
});
