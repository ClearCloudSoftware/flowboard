import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryWithBackoff, RetryableError, DEFAULT_RETRY } from '../src/retry.ts';

test('returns on first success without delay', async () => {
  const start = Date.now();
  const got = await retryWithBackoff(async () => 'ok', DEFAULT_RETRY);
  assert.equal(got, 'ok');
  assert.ok(Date.now() - start < 50, `expected near-instant, took ${Date.now() - start}ms`);
});

test('retries up to maxAttempts on RetryableError', async () => {
  let n = 0;
  const got = await retryWithBackoff(
    async () => {
      if (++n < 3) throw new RetryableError('nope');
      return n;
    },
    { ...DEFAULT_RETRY, baseMs: 1, maxMs: 1 },
  );
  assert.equal(got, 3);
});

test('throws after maxAttempts exhausted', async () => {
  let n = 0;
  await assert.rejects(
    retryWithBackoff(
      async () => {
        n++;
        throw new RetryableError('nope');
      },
      { ...DEFAULT_RETRY, maxAttempts: 2, baseMs: 1, maxMs: 1 },
    ),
    (e: Error) => e.message === 'nope',
  );
  assert.equal(n, 2);
});

test('non-RetryableError propagates immediately without a second try', async () => {
  let n = 0;
  await assert.rejects(
    retryWithBackoff(
      async () => {
        n++;
        throw new Error('fatal');
      },
      { ...DEFAULT_RETRY, baseMs: 1 },
    ),
    (e: Error) => e.message === 'fatal',
  );
  assert.equal(n, 1);
});

test('respects Retry-After hint over exponential (Review Focus #2)', async () => {
  let n = 0;
  const start = Date.now();
  await retryWithBackoff(
    async () => {
      if (n++ === 0) throw new RetryableError('429', 100);
      return true;
    },
    { maxAttempts: 2, baseMs: 10, maxMs: 10, respectRetryAfter: true },
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 90, `expected ~100ms wait, got ${elapsed}`);
  assert.ok(elapsed < 250, `wait too long: ${elapsed}`);
});

test('ignores Retry-After hint when respectRetryAfter is false', async () => {
  let n = 0;
  const start = Date.now();
  await retryWithBackoff(
    async () => {
      if (n++ === 0) throw new RetryableError('429', 500);
      return true;
    },
    { maxAttempts: 2, baseMs: 10, maxMs: 10, respectRetryAfter: false },
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `should have used exponential (10ms), got ${elapsed}ms`);
});

test('caps exponential backoff at maxMs', async () => {
  let n = 0;
  const start = Date.now();
  await retryWithBackoff(
    async () => {
      if (n++ < 3) throw new RetryableError('nope');
      return true;
    },
    { maxAttempts: 4, baseMs: 100, maxMs: 50, respectRetryAfter: true },
  );
  const elapsed = Date.now() - start;
  // Three retries, each capped at 50ms, so <= ~200ms.
  assert.ok(elapsed < 300, `cap not honoured: ${elapsed}ms`);
});

test('DEFAULT_RETRY shape is sensible', () => {
  assert.equal(DEFAULT_RETRY.maxAttempts, 3);
  assert.equal(DEFAULT_RETRY.respectRetryAfter, true);
  assert.ok(DEFAULT_RETRY.baseMs > 0);
  assert.ok(DEFAULT_RETRY.maxMs > DEFAULT_RETRY.baseMs);
});
