/**
 * A project's monthly cap against what its runs spent (`Budget` in `settings.ts`). The month is the calendar month
 * in local time, as `'2026-11'`; a run's whole cost counts in the month it started. No Node imports: the pages use
 * this too; `projectSpendUsd` in `projects.ts` adds up the runs.
 */
import type { Budget } from './settings.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** The local month of `ms`, like `'2026-11'`; `''` for no time. */
export const monthOf = (ms: number) => {
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (month: string) => month.split('-').map(Number) as [number, number];

/** `'2026-11'` as the lines say it: `November 2026`. */
export const monthName = (month: string) => {
  const [y, m] = parts(month);
  return `${NAMES[m - 1]} ${y}`;
};

/** The month after: `'2026-12'` → `January 2027`. */
export const nextMonthName = (month: string) => {
  const [y, m] = parts(month);
  return m === 12 ? monthName(`${y + 1}-01`) : monthName(`${y}-${pad(m + 1)}`);
};

/** `leftUsd`: Infinity with no cap, below 0 once overspent; `pct`: of the cap, rounded down. */
export interface BudgetState { capUsd: number | null; spentUsd: number; leftUsd: number; pct: number; alert: boolean; over: boolean }

export function budgetState(b: Budget, spentUsd: number): BudgetState {
  const cap = b.capUsd;
  if (!cap) return { capUsd: null, spentUsd, leftUsd: Infinity, pct: 0, alert: false, over: false };
  return { capUsd: cap, spentUsd, leftUsd: cap - spentUsd, pct: Math.floor((spentUsd / cap) * 100), alert: spentUsd >= (cap * b.alertAt) / 100, over: spentUsd >= cap };
}
