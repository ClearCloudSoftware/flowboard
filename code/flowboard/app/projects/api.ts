/** The projects API, as TanStack Query options and calls. Types are the server's own (`packages/cli/src/projects.ts`). */
import { queryOptions } from '@tanstack/react-query';
import type { NewProject, Project, ProjectEdit, ProjectView } from '../../packages/cli/src/projects.ts';
import { call } from '../flows/api.ts';

export type { Project, ProjectView };

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
