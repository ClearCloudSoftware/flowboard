import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetState, monthName, monthOf, nextMonthName } from '../src/budget.ts';

test('a month is the local calendar month of a time; no time is no month', () => {
  assert.equal(monthOf(new Date(2026, 10, 30, 23, 59).getTime()), '2026-11');
  assert.equal(monthOf(new Date(2026, 0, 1, 0, 0).getTime()), '2026-01');
  assert.equal(monthOf(NaN), '');
});

test('months are named the way the lines say them, and the next one rolls over the year', () => {
  assert.equal(monthName('2026-11'), 'November 2026');
  assert.equal(nextMonthName('2026-11'), 'December 2026');
  assert.equal(nextMonthName('2026-12'), 'January 2027');
});

test('the budget state: what is left, the percent, the alert and over the cap', () => {
  const b = { capUsd: 50, alertAt: 80, onLimit: 'pause' as const };
  assert.deepEqual(budgetState(b, 40), { capUsd: 50, spentUsd: 40, leftUsd: 10, pct: 80, alert: true, over: false });
  assert.deepEqual(budgetState(b, 39.99), { capUsd: 50, spentUsd: 39.99, leftUsd: 50 - 39.99, pct: 79, alert: false, over: false });
  assert.deepEqual(budgetState(b, 50), { capUsd: 50, spentUsd: 50, leftUsd: 0, pct: 100, alert: true, over: true });
  assert.equal(budgetState(b, 60).leftUsd, -10);
  assert.deepEqual(budgetState({ ...b, capUsd: null }, 1000), { capUsd: null, spentUsd: 1000, leftUsd: Infinity, pct: 0, alert: false, over: false });
});
