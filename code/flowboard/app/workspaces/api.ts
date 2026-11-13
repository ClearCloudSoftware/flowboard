/** The workspaces API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/workspace-git.ts`). */
import { queryOptions } from '@tanstack/react-query';
import type { Commit, FileDiff, Preview, Repo, Review, Strategy, WorkspaceRow, WorkspaceState } from '../../packages/cli/src/workspace-git.ts';
import { call } from '../flows/api.ts';

export type { Commit, FileDiff, Preview, Repo, Review, Strategy, WorkspaceRow, WorkspaceState };

/** The folder the New run sheet remembers: the repo the pages open on until you name another. */
export const FOLDER_KEY = 'flowboard.newRun.folder';
export const rememberedFolder = () => {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
};

const q = (folder: string) => `folder=${encodeURIComponent(folder)}`;
const at = (id: string) => `/api/workspaces/${encodeURIComponent(id)}`;

/** Polled, so a run finishing frees its row without a reload. */
export const workspacesQuery = (folder: string) =>
  queryOptions({ queryKey: ['workspaces', folder], queryFn: () => call<{ repo: Repo; rows: WorkspaceRow[] }>(`/api/workspaces?${q(folder)}`), refetchInterval: 4000, enabled: folder !== '' });

export const previewQuery = (folder: string, id: string) =>
  queryOptions({ queryKey: ['workspace-preview', folder, id], queryFn: () => call<Preview>(`/api/workspace-preview?${q(folder)}&id=${encodeURIComponent(id)}`), enabled: folder !== '' });

export const reviewQuery = (folder: string, id: string) =>
  queryOptions({ queryKey: ['workspace', folder, id], queryFn: () => call<Review>(`${at(id)}?${q(folder)}`), enabled: folder !== '' && id !== '' });

/** `commit` '' is the whole branch against the base. */
export const diffQuery = (folder: string, id: string, commit: string) =>
  queryOptions({
    queryKey: ['workspace-diff', folder, id, commit],
    queryFn: () => call<FileDiff[]>(`${at(id)}/diff?${q(folder)}${commit ? `&commit=${encodeURIComponent(commit)}` : ''}`),
    enabled: folder !== '' && id !== '',
  });

export type ActResult = { ok: true; head?: string; note?: string; branchKept?: string } | { ok: false; error: string; conflicts?: string[] };
export type DryRun = ActResult & { checks?: Array<{ ok: boolean; text: string }> };

/** A refusal comes back as a result, not a throw: the page shows git's words where the button was. */
async function act<T>(id: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(at(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as T;
}
export const dryRun = (folder: string, id: string) => act<DryRun>(id, { action: 'dry-run', folder });
export const updateFromBase = (folder: string, id: string) => act<ActResult>(id, { action: 'update', folder });
export const landBranch = (folder: string, id: string, strategy: Strategy, message: string) => act<ActResult>(id, { action: 'land', folder, strategy, message });
export const cleanUp = (folder: string, id: string, force: boolean) => act<ActResult>(id, { action: 'clean', folder, force });

/** The command a person would type for the same thing; every action on these pages shows its own. */
export const cli = {
  clean: (folder: string, id: string, force: boolean) => `pnpm clean-workspace --folder ${folder}${force ? ' --force' : ''} ${id}`,
  run: (folder: string, id: string) => `pnpm run-flow --folder ${folder} --task <file> --workspace ${id} <flow.yaml>`,
};
