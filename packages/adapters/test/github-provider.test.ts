import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GithubTaskSource, CredentialMissingError } from '../src/ticket/github/provider.ts';
import { RetryableError, type SourceCredentialResolver } from '@lamproom/core';
import type { GithubIssuesPayload } from '../src/ticket/github/normalize.ts';

const here = import.meta.dirname;
const payloadPath = join(here, 'fixtures/github/issues-page1.json');

async function loadPayload(): Promise<GithubIssuesPayload> {
  return JSON.parse(await readFile(payloadPath, 'utf8')) as GithubIssuesPayload;
}

function resolverReturning(credential: Parameters<SourceCredentialResolver['resolve']>[0] extends never ? never : unknown): SourceCredentialResolver {
  return { resolve: async () => credential as never };
}

test('throws CredentialMissingError before any network call when credentials are "none" (Review Focus #3)', async () => {
  let graphqlCalls = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'none' }) },
    graphqlFn: async () => {
      graphqlCalls++;
      throw new Error('should not be called');
    },
  });
  await assert.rejects(src.fetch({}), (e: Error) => e instanceof CredentialMissingError);
  assert.equal(graphqlCalls, 0);
});

test('nextCursor is undefined when GraphQL page has hasNextPage false (Review Focus #4)', async () => {
  const payload = await loadPayload();
  payload.repository.issues.pageInfo.hasNextPage = false;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => payload,
  });
  const r = await src.fetch({});
  assert.equal(r.nextCursor, undefined);
  assert.equal(r.tasks.length, 3);
  assert.equal(r.usage.requests, 1);
});

test('returns nextCursor when hasNextPage is true', async () => {
  const payload = await loadPayload();
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => payload,
  });
  const r = await src.fetch({});
  assert.equal(r.nextCursor, payload.repository.issues.pageInfo.endCursor);
});

test('retries on RetryableError thrown directly and succeeds', async () => {
  const payload = await loadPayload();
  let n = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      if (n++ === 0) throw new RetryableError('secondary rate limit', 10);
      return payload;
    },
    retryPolicy: { maxAttempts: 3, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  const r = await src.fetch({});
  assert.equal(r.tasks.length, 3);
  assert.equal(r.usage.requests, 1);
});

test('maps 429 to RetryableError with Retry-After seconds', async () => {
  const payload = await loadPayload();
  let n = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      if (n++ === 0) {
        const err = new Error('rate limited');
        (err as Error & { status?: number; response?: unknown }).status = 429;
        (err as Error & { status?: number; response?: { headers: Record<string, string> } }).response = {
          headers: { 'retry-after': '1' },
        };
        throw err;
      }
      return payload;
    },
    retryPolicy: { maxAttempts: 2, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  const r = await src.fetch({});
  assert.equal(r.tasks.length, 3);
});

test('maps 403 with retry-after header to RetryableError (secondary rate limit)', async () => {
  const payload = await loadPayload();
  let n = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      if (n++ === 0) {
        const err = new Error('secondary rate limit');
        (err as Error & { status?: number; response?: unknown }).status = 403;
        (err as Error & { status?: number; response?: { headers: Record<string, string> } }).response = {
          headers: { 'retry-after': '1' },
        };
        throw err;
      }
      return payload;
    },
    retryPolicy: { maxAttempts: 2, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  const r = await src.fetch({});
  assert.equal(r.tasks.length, 3);
});

test('maps 500 to RetryableError', async () => {
  const payload = await loadPayload();
  let n = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      if (n++ === 0) {
        const err = new Error('server error');
        (err as Error & { status?: number }).status = 500;
        throw err;
      }
      return payload;
    },
    retryPolicy: { maxAttempts: 2, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  const r = await src.fetch({});
  assert.equal(r.tasks.length, 3);
});

test('4xx other than 429 propagates immediately without retry', async () => {
  let calls = 0;
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token: 'ghp_xxx' }) },
    graphqlFn: async () => {
      calls++;
      const err = new Error('bad request');
      (err as Error & { status?: number }).status = 400;
      throw err;
    },
    retryPolicy: { maxAttempts: 3, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), /bad request/);
  assert.equal(calls, 1);
});

test('redacts the token from error messages', async () => {
  const token = 'ghp_SECRETSECRETSECRETSECRETSECRETSECR';
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'github_pat', token }) },
    graphqlFn: async () => {
      throw new Error(`Bad credentials: ${token} rejected`);
    },
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), (e: Error) => {
    return !e.message.includes(token) && e.message.includes('[redacted]');
  });
});

test('capabilities include pagination, incremental, labels, assignees, stable_upstream_key', () => {
  const src = new GithubTaskSource({
    target: { owner: 'o', repo: 'r' },
    resolver: { resolve: async () => ({ kind: 'none' }) },
    graphqlFn: async () => ({}) as GithubIssuesPayload,
  });
  assert.ok(src.capabilities.has('pull'));
  assert.ok(src.capabilities.has('pagination'));
  assert.ok(src.capabilities.has('incremental'));
  assert.ok(src.capabilities.has('labels'));
  assert.ok(src.capabilities.has('assignees'));
  assert.ok(src.capabilities.has('stable_upstream_key'));
  assert.equal(src.capabilities.has('push'), false);
});

// Silence unused in-test helper so linters don't complain.
void resolverReturning;
