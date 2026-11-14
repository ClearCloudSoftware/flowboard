import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZERO_SOURCE_USAGE, addUsage } from '../src/ports/ticket.ts';

test('ZERO_SOURCE_USAGE has zero requests', () => {
  assert.equal(ZERO_SOURCE_USAGE.requests, 0);
});

test('addUsage sums requests and bytesRead and takes the lower rateLimitRemaining', () => {
  const sum = addUsage(
    { requests: 2, rateLimitRemaining: 4500, bytesRead: 1000 },
    { requests: 3, rateLimitRemaining: 4480, bytesRead: 2500 },
  );
  assert.equal(sum.requests, 5);
  assert.equal(sum.bytesRead, 3500);
  assert.equal(sum.rateLimitRemaining, 4480);
});

test('addUsage keeps the later rateLimitResetAt when both present', () => {
  const sum = addUsage(
    { requests: 1, rateLimitResetAt: '2026-11-14T10:00:00Z' },
    { requests: 1, rateLimitResetAt: '2026-11-14T10:05:00Z' },
  );
  assert.equal(sum.rateLimitResetAt, '2026-11-14T10:05:00Z');
});

test('addUsage handles one-sided rateLimitRemaining and rateLimitResetAt', () => {
  const sum = addUsage(
    { requests: 1, rateLimitRemaining: 4500 },
    { requests: 1 },
  );
  assert.equal(sum.rateLimitRemaining, 4500);
  assert.equal(sum.rateLimitResetAt, undefined);
});

test('addUsage sums costUsd when either side has it', () => {
  const sum = addUsage({ requests: 1 }, { requests: 1, costUsd: 0.002 });
  assert.equal(sum.costUsd, 0.002);
  const sum2 = addUsage({ requests: 1, costUsd: 0.001 }, { requests: 1, costUsd: 0.002 });
  assert.equal(sum2.costUsd, 0.003);
});
