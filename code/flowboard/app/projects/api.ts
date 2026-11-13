/** The projects API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/projects.ts`). */
import { queryOptions } from '@tanstack/react-query';
import type { GhRepo, GhStatus } from '../../packages/cli/src/github.ts';
import type { CloneInput, CloneJob } from '../../packages/cli/src/clone.ts';
import type { NewProject, Project, ProjectEdit, ProjectView } from '../../packages/cli/src/projects.ts';
import type { AppSettings, ApprovedModel, Catalogue, Harness } from '../../packages/cli/src/settings.ts';
import type { KeyTest, KeyView } from '../../packages/cli/src/openrouter.ts';
import type { HarnessStatus } from '../../packages/cli/src/harnesses.ts';
import { ApiError, call } from '../flows/api.ts';

export type { AppSettings, CloneJob, GhRepo, GhStatus, Project, ProjectView };

/** Every project with its run counts and week's spend, polled so a run started elsewhere shows up. */
export const projectsQuery = queryOptions({ queryKey: ['projects'], queryFn: () => call<ProjectView[]>('/api/projects'), refetchInterval: 10_000 });

export const createProject = (input: NewProject) => call<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });
export const updateProject = (id: string, edit: ProjectEdit) => call<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });
export const removeProject = (id: string) => call<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE', body: '{}' });

/** The run's folder is the project's repo or inside it (`owns` on the server, which this page cannot import). */
export const inProject = (repoPath: string, folder: string) => folder === repoPath || folder.startsWith(`${repoPath}/`);

/** `/runs` with the New run sheet open on this flow and folder. */
export const newRunHref = (p: Project) => `/runs?new=${encodeURIComponent(p.defaultFlow ?? '')}&folder=${encodeURIComponent(p.repoPath)}`;

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** The app's settings and what the pages need around them (`/api/settings`). */
export interface AppView { app: AppSettings; defaultFolder: string; machine: { os: string }; github: GhStatus; recentFolders: string[] }
export const appSettingsQuery = queryOptions({ queryKey: ['settings'], queryFn: () => call<AppView>('/api/settings') });
export const updateAppSettings = (edit: Partial<AppSettings>) => call<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(edit) });

/** The `gh` login and, once connected, its owners: the account, then its organizations. */
export interface GitHubView { status: GhStatus; requestAccessUrl: string; owners?: string[]; error?: string }
export const githubQuery = queryOptions({ queryKey: ['github'], queryFn: () => call<GitHubView>('/api/github') });
export type ReposView = ({ ok: true; repos: GhRepo[] } | { ok: false; reason: 'restricted' | 'error'; error: string }) & { taken: Record<string, string> };
export const reposQuery = (owner: string) => queryOptions({ queryKey: ['github', 'repos', owner], queryFn: () => call<ReposView>(`/api/github/repos?owner=${encodeURIComponent(owner)}`), staleTime: 60_000 });
export const switchAccount = (login: string) => call<{ ok: true }>('/api/github/switch', { method: 'POST', body: JSON.stringify({ login }) });

/** Where a clone of `name` into `parent` would land, numbered past a folder that holds something. */
export const targetQuery = (parent: string, name: string) =>
  queryOptions({ queryKey: ['clone-target', parent, name], queryFn: () => call<{ folder: string }>(`/api/projects/clone?parent=${encodeURIComponent(parent)}&name=${encodeURIComponent(name)}`) });
export const startClone = (input: CloneInput) => call<CloneJob>('/api/projects/clone', { method: 'POST', body: JSON.stringify(input) });
/** The server no longer knows the clone: it restarted. Any other error is passing, and polling goes on. */
export const cloneLost = (e: Error | null) => e instanceof ApiError && e.status === 404;
/** A clone as it goes, polled until it is done or failed, or the server has forgotten it. */
export const cloneJobQuery = (id: string) =>
  queryOptions({
    queryKey: ['clone', id],
    queryFn: () => call<CloneJob>(`/api/projects/clone/${id}`),
    refetchInterval: (q) => ((q.state.data && ['done', 'failed'].includes(q.state.data.phase)) || cloneLost(q.state.error) ? false : 500),
    retry: false,
  });

/** Each agent CLI on this machine (`/api/agents`); slow-ish, as it runs each CLI. */
export const agentsQuery = queryOptions({ queryKey: ['agents'], queryFn: () => call<Record<Harness, HarnessStatus>>('/api/agents') });

/** OpenRouter for OpenCode's steps (`/api/openrouter`): the key runs would use (never the key), the model list, the approved models. */
export interface ApprovedView extends ApprovedModel { problem: string | null }
export interface OpenRouterView { key: KeyView; catalogue: Catalogue | null; error?: string; approved: ApprovedView[] }
export const openrouterQuery = queryOptions({ queryKey: ['openrouter'], queryFn: () => call<OpenRouterView>('/api/openrouter') });
export const refreshOpenRouter = () => call<OpenRouterView>('/api/openrouter?refresh=1');
export const saveOpenRouterKey = (key: string) => call<KeyView>('/api/openrouter/key', { method: 'PUT', body: JSON.stringify({ key }) });
export const removeOpenRouterKey = () => call<KeyView>('/api/openrouter/key', { method: 'DELETE', body: '{}' });
export const testOpenRouterKey = () => call<KeyTest>('/api/openrouter/key', { method: 'POST', body: '{}' });
