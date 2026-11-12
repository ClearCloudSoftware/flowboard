import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../flows/api.ts';
import { cloneJobQuery, cloneLost } from './api.ts';

test('a clone is polled until it ends, through a passing error; only a 404 means FlowBoard forgot it', () => {
  const q = cloneJobQuery('j');
  const every = q.refetchInterval as (query: { state: { data?: { phase: string }; error: Error | null } }) => number | false;
  assert.equal(every({ state: { data: { phase: 'cloning' }, error: null } }), 500);
  assert.equal(every({ state: { data: { phase: 'done' }, error: null } }), false);
  assert.equal(every({ state: { data: { phase: 'cloning' }, error: new ApiError(500, {}) } }), 500); // a recompile, a blip
  assert.equal(every({ state: { error: new ApiError(404, {}) } }), false);
  assert.equal(cloneLost(new ApiError(404, {})), true);
  assert.equal(cloneLost(new ApiError(500, {})), false);
  assert.equal(cloneLost(null), false);
});
