/** The runs API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/flow-logs.ts`). */
import { queryOptions } from '@tanstack/react-query';
import type { RunDetail, RunStatus, RunSummary, StepLog } from '../../packages/cli/src/flow-logs.ts';
import { call } from '../flows/api.ts';

export type { RunDetail, RunStatus, RunSummary, StepLog };
export const LIVE: ReadonlySet<RunStatus> = new Set(['starting', 'running', 'waiting']);

const at = (run: string) => `/api/runs/${encodeURIComponent(run)}`;

/** Every run, newest first, polled so a new one shows up. */
export const runsQuery = queryOptions({ queryKey: ['runs'], queryFn: () => call<RunSummary[]>('/api/runs'), refetchInterval: 5000 });

/** One run's steps, spend, artifacts and open questions; polled while it is live. */
export const runQuery = (run: string, live: boolean) =>
  queryOptions({ queryKey: ['run', run], queryFn: () => call<RunDetail>(at(run)), refetchInterval: live ? 1500 : 10_000 });

/** One run's step logs; polled while it is live. */
export const logsQuery = (run: string, live: boolean) =>
  queryOptions({ queryKey: ['logs', run], queryFn: () => call<StepLog[]>(`${at(run)}/logs`), refetchInterval: live ? 1500 : false });

export const artifactQuery = (run: string, type: string) =>
  queryOptions({ queryKey: ['artifact', run, type], queryFn: () => call<{ text: string }>(`${at(run)}/artifact?type=${encodeURIComponent(type)}`) });

const post = (url: string, body: unknown = {}) => call<{ ok: true }>(url, { method: 'POST', body: JSON.stringify(body) });
export const answerRun = (run: string, id: string, answers: Record<string, unknown>) => post(`${at(run)}/answer`, { id, answers });
export const stopRun = (run: string) => post(`${at(run)}/stop`);
export const resumeRun = (run: string, budgetUsd?: number) => post(`${at(run)}/resume`, budgetUsd === undefined ? {} : { budgetUsd });
