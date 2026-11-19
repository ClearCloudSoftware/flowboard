/** The projects API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/projects.ts`). */
import { queryOptions } from '@tanstack/react-query';
import type { GhRepo, GhStatus } from '../../packages/cli/src/github.ts';
import type { CloneInput, CloneJob } from '../../packages/cli/src/clone.ts';
import type { NewProject, Project, ProjectEdit, ProjectView } from '../../packages/cli/src/projects.ts';
import type { AppSettings, ApprovedModel, Catalogue, Harness } from '../../packages/cli/src/settings.ts';
import type { KeyTest, KeyView } from '../../packages/cli/src/openrouter.ts';
import type { OllamaState } from '../../packages/cli/src/ollama.ts';
import type { HarnessStatus } from '../../packages/cli/src/harnesses.ts';
import type { DoctorReport } from '../../packages/cli/src/doctor.ts';
import type { SocketState } from '../../packages/cli/src/slack.ts';
import type { Memory } from '../../packages/cli/src/memory.ts';
import { ApiError, call } from '../flows/api.ts';

/**
 * Mirrors `JiraStatus` and `ImportRow` from `packages/cli/src/{jira,schema}.ts`.
 * Inlined here because a bare `import type` from those files drags server-only
 * modules (`node:fs`, drizzle-orm's SQLite core) into the client build and
 * sends Next.js HMR into a reload loop.
 */
export interface JiraStatus {
  connected: boolean;
  kind?: 'atlassian_oauth' | 'atlassian_api_token';
  siteName?: string;
  baseUrl?: string;
  email?: string;
  expiresAt?: string;
  defaultJql?: string;
}

export type ImportState = 'running' | 'done' | 'failed' | 'cancelled';
export interface ImportRow {
  id: string;
  projectId: string;
  sourceId: string;
  startedAt: string;
  endedAt: string | null;
  state: ImportState;
  created: number;
  updated: number;
  skipped: number;
  pages: number;
  error: string | null;
}

export type { AppSettings, CloneJob, GhRepo, GhStatus, Project, ProjectView };

/** Every project with its run counts and week's spend, polled so a run started elsewhere shows up. */
export const projectsQuery = queryOptions({ queryKey: ['projects'], queryFn: () => call<ProjectView[]>('/api/projects'), refetchInterval: 10_000 });

export const createProject = (input: NewProject) => call<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });
export const updateProject = (id: string, edit: ProjectEdit) => call<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });
/** Starts the repo analyst on the project; 422 with lr-run-flow's words when it refuses. */
export const startAnalysis = (id: string) => call<{ run: string }>(`/api/projects/${id}/analysis`, { method: 'POST', body: '{}' });
/** Builds the project's knowledge assets now; 422 with lr-run-flow's words when it refuses. */
export const startKnowledgeBuild = (id: string) => call<{ run: string }>(`/api/projects/${id}/knowledge`, { method: 'POST', body: '{}' });
/** A project's memories, newest first (Memory); what each run saved, to forget one or all. */
export const memoryQuery = (id: string) => queryOptions({ queryKey: ['memory', id], queryFn: () => call<Memory[]>(`/api/projects/${id}/memory`), refetchInterval: 10_000 });
export const forgetMemory = (id: string, memoryId: string) => call<{ ok: true }>(`/api/projects/${id}/memory/${encodeURIComponent(memoryId)}`, { method: 'DELETE', body: '{}' });
export const forgetAllMemory = (id: string) => call<{ ok: true }>(`/api/projects/${id}/memory`, { method: 'DELETE', body: '{}' });
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

/** The doctor's report on this machine (`/api/doctor`): a couple of seconds and a few network calls, so it runs each time the page opens (showing the last report meanwhile) and on request, never on focus. */
export const doctorQuery = queryOptions({ queryKey: ['doctor'], queryFn: () => call<DoctorReport>('/api/doctor'), staleTime: Infinity, refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false });

/**
 * OpenCode's models (`/api/models`): the OpenRouter key runs would use (never the key) and OpenRouter's list, Ollama
 * on this machine and its list, and the approved models with what refuses or warns of each.
 */
export interface ApprovedView extends ApprovedModel { problem: string | null; warning: string | null }
export interface ModelsView { key: KeyView; catalogue: Catalogue | null; error?: string; ollama: OllamaState; approved: ApprovedView[] }
export const modelsQuery = queryOptions({ queryKey: ['models'], queryFn: () => call<ModelsView>('/api/models') });
export const refreshModels = () => call<ModelsView>('/api/models?refresh=1');
export const saveOpenRouterKey = (key: string) => call<KeyView>('/api/openrouter/key', { method: 'PUT', body: JSON.stringify({ key }) });
export const removeOpenRouterKey = () => call<KeyView>('/api/openrouter/key', { method: 'DELETE', body: '{}' });
export const testOpenRouterKey = () => call<KeyTest>('/api/openrouter/key', { method: 'POST', body: '{}' });

/** Whether a Jira credential is configured (used to decide if the "Import from Jira" button is enabled). */
export const jiraStatusQuery = queryOptions({ queryKey: ['jira', 'auth-status'], queryFn: () => call<JiraStatus>('/api/jira/auth/status'), refetchInterval: 30_000 });

/** Kick off a Jira import for a project; returns the id so the UI can poll `importQuery`. */
export const startJiraImport = (projectId: string, jql?: string) => {
  const params = new URLSearchParams({ project: projectId });
  if (jql !== undefined && jql.trim() !== '') params.set('jql', jql.trim());
  return call<{ importId: string; reused: boolean }>(`/api/import/jira?${params.toString()}`, { method: 'POST', body: '{}' });
};

/** One import row, polled every 1.5s while running; the poll stops once state leaves 'running'. */
export const importQuery = (importId: string) =>
  queryOptions({
    queryKey: ['import', importId],
    queryFn: () => call<ImportRow>(`/api/imports/${importId}`),
    refetchInterval: (q) => (q.state.data && q.state.data.state !== 'running' ? false : 1500),
  });

/** Slack for escalation (`/api/slack`): which tokens are saved (never the tokens), the socket, the refused channels. */
export interface SlackView { bot: boolean; app: boolean; socket: SocketState | { state: 'off' }; problems: string[]; address: string }
export type SlackTest = { ok: true; team: string; teamId: string; bot: string } | { ok: false; error: string };
export const slackQuery = queryOptions({ queryKey: ['slack'], queryFn: () => call<SlackView>('/api/slack'), refetchInterval: 5000 });
export const saveSlackTokens = (t: { bot?: string; app?: string }) => call<SlackView>('/api/slack', { method: 'PUT', body: JSON.stringify(t) });
export const removeSlackTokens = () => call<SlackView>('/api/slack', { method: 'DELETE', body: '{}' });
export const testSlackTokens = () => call<SlackTest>('/api/slack', { method: 'POST', body: '{}' });
