import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubTaskSource } from '../src/ticket/github/provider.ts';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';

const live = process.env.FLOWBOARD_LIVE === '1' && process.env.FLOWBOARD_LIVE_GITHUB_REPO !== undefined;

test('live GitHub fetch returns real issues', { skip: !live }, async () => {
  const [owner, repo] = (process.env.FLOWBOARD_LIVE_GITHUB_REPO ?? '').split('/');
  assert.ok(owner !== undefined && owner !== '', 'FLOWBOARD_LIVE_GITHUB_REPO must be "owner/repo"');
  assert.ok(repo !== undefined && repo !== '', 'FLOWBOARD_LIVE_GITHUB_REPO must be "owner/repo"');

  const src = new GithubTaskSource({
    target: { owner, repo },
    resolver: new EnvFileCredentialResolver({ root: process.env.FLOWBOARD_LIVE_ROOT ?? process.cwd() }),
    projectId: 'live',
  });

  const r = await src.fetch({ pageSize: 5 });

  assert.ok(Array.isArray(r.tasks));
  assert.ok(r.usage.requests >= 1, 'usage.requests should count at least one network-successful call');
  assert.ok(
    typeof r.usage.rateLimitRemaining === 'number' && r.usage.rateLimitRemaining > 0,
    'rateLimitRemaining must be present and positive — a 0 means a leaked PAT ran out of quota',
  );
  if (r.tasks.length > 0) {
    const first = r.tasks[0]!;
    assert.match(first.importKey, /^github-\d+$/, 'importKey must use the numeric-upstream pattern');
    assert.ok(first._hint.upstream?.match(/^\d+$/), '_hint.upstream must be the issue number');
    assert.ok(Array.isArray(first.labels), 'labels must be present (possibly empty)');
    assert.ok(Array.isArray(first.assignees), 'assignees must be present (possibly empty)');
  }
});

test('live GitHub paginates through a second page when hasNextPage is true', { skip: !live }, async () => {
  const [owner, repo] = (process.env.FLOWBOARD_LIVE_GITHUB_REPO ?? '').split('/');
  const src = new GithubTaskSource({
    target: { owner: owner!, repo: repo! },
    resolver: new EnvFileCredentialResolver({ root: process.env.FLOWBOARD_LIVE_ROOT ?? process.cwd() }),
    projectId: 'live',
  });

  const r1 = await src.fetch({ pageSize: 2 });
  if (r1.nextCursor === undefined) {
    // Repo has fewer than 3 issues; nothing to verify about pagination.
    return;
  }
  const r2 = await src.fetch({ cursor: r1.nextCursor, pageSize: 2 });
  assert.ok(r2.tasks.length <= 2);
  if (r2.tasks.length > 0) {
    const keys1 = new Set(r1.tasks.map((t) => t.importKey));
    const keys2 = new Set(r2.tasks.map((t) => t.importKey));
    for (const k of keys2) assert.equal(keys1.has(k), false, `page 2 should not repeat page 1 issue ${k}`);
  }
});
