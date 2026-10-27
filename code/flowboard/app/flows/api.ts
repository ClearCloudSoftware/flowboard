/** The flows API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/flow-files.ts`). */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { FlowCheck, FlowFile, FlowSummary, PromptFile } from '../../packages/cli/src/flow-files.ts';
import type { RunSummary, StepLog } from '../../packages/cli/src/flow-logs.ts';

export type { FlowCheck, FlowFile, FlowSummary, PromptFile, RunSummary, StepLog };
/** `dir`: where the recipes are, as `pnpm run-flow` in the app's folder would name it: relative when inside it. */
export interface Library { dir: string; flows: FlowSummary[] }
export interface Draft { text: string; check: FlowCheck }

/** A refusal from the API: `error` says why, `check` comes with a save the check refused. */
export class ApiError extends Error {
  status: number;
  check?: FlowCheck;
  constructor(status: number, body: { error?: string; check?: FlowCheck }) {
    super(body.error ?? `HTTP ${status}`);
    this.status = status;
    this.check = body.check;
  }
}

async function call<T>(url: string, init?: { method: string; body: string }): Promise<T> {
  const res = await fetch(url, init && { ...init, headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const libraryQuery = queryOptions({ queryKey: ['flows'], queryFn: () => call<Library>('/api/flows') });

export const flowQuery = (name: string) =>
  queryOptions({ queryKey: ['flow', name], queryFn: () => call<FlowFile>(`/api/flows/${name}`) });

/** The check of a draft, keyed by its JSON; refetched when the window regains focus, as a prompt file may have changed. */
export const checkQuery = (name: string, draft: string) =>
  queryOptions({
    queryKey: ['check', name, draft],
    queryFn: () => call<Draft>(`/api/flows/${name}/check`, { method: 'POST', body: draft }),
    placeholderData: keepPreviousData,
  });

export const saveFlow = (name: string, draft: unknown, version: string) =>
  call<FlowFile>(`/api/flows/${name}`, { method: 'PUT', body: JSON.stringify({ draft, version }) });

export const createFlow = (name: string) => call<FlowFile>('/api/flows', { method: 'POST', body: JSON.stringify({ name }) });

export const promptQuery = (path: string) =>
  queryOptions({ queryKey: ['prompt', path], queryFn: () => call<PromptFile>(`/api/prompts?path=${encodeURIComponent(path)}`) });

export const savePrompt = (path: string, text: string, version: string | null) =>
  call<PromptFile>('/api/prompts', { method: 'PUT', body: JSON.stringify({ path, text, version }) });

/** A flow's runs, newest first; polled while the newest is still going. */
export const runsQuery = (flow: string) =>
  queryOptions({
    queryKey: ['runs', flow],
    queryFn: () => call<RunSummary[]>(`/api/runs?flow=${encodeURIComponent(flow)}`),
    refetchInterval: 5000,
  });

/** One run's step logs; `live` polls them while it runs. */
export const logsQuery = (run: string, live: boolean) =>
  queryOptions({
    queryKey: ['logs', run],
    queryFn: () => call<StepLog[]>(`/api/runs/${encodeURIComponent(run)}`),
    refetchInterval: live ? 1500 : false,
  });
