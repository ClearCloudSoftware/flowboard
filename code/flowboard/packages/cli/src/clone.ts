/**
 * Cloning a GitHub repo into a project: where it goes, then a job that runs `gh repo clone`, keeps git's output for
 * the wizard to show, and registers the project once git is done. Nothing is registered for a clone that fails.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readAppSettings, updateAppSettings } from './app-settings.ts';
import { isDir, toAbs } from './config.ts';
import { type Limits, limitsError } from './project.ts';
import { createProject, type Project, readProjects, type Result } from './projects.ts';
import { FOLDER, FOLDER_RE, type Overrides, OverridesSchema, PROJECT_TYPES, type ProjectTypeId, trustText } from './settings.ts';

/** `owner/name` as GitHub allows them; anything else never reaches gh's arguments. */
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const expand = (p: string) => toAbs(p.trim().replace(/\/+$/, ''), '/');
const holdsSomething = (folder: string) => isDir(folder) && readdirSync(folder).length > 0;

/** `<parent>/<name>`, or `-2`, `-3`… past a folder that holds something or is `taken` (a clone in flight). */
export function cloneTarget(parent: string, name: string, taken: Set<string> = new Set()): string {
  const base = join(expand(parent), name);
  let folder = base;
  for (let n = 2; holdsSomething(folder) || taken.has(folder); n++) folder = `${base}-${n}`;
  return folder;
}

/** The folders projects were cloned into, newest first, once each, leaving out `exclude` (the default). */
export function recentParents(projects: Pick<Project, 'repoPath' | 'createdAt' | 'source'>[], exclude: string): string[] {
  const newest = projects.filter((p) => p.source.kind === 'github').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...new Set(newest.map((p) => dirname(p.repoPath)))].filter((d) => d !== expand(exclude));
}

/** `parent`: the folder the clone goes inside, absolute or from `~/`; `makeDefault`: save it as the projects folder. */
export interface CloneInput { repo: string; type: ProjectTypeId; parent: string; makeDefault: boolean; overrides: Overrides; limits: Limits }
/** `lines`: git's output, a progress line replaced as it moves, then FlowBoard's own `-- …` lines. */
export interface CloneJob { id: string; repo: string; folder: string; phase: 'cloning' | 'setting up' | 'done' | 'failed'; pct: number; lines: string[]; project?: Project; error?: string }

// ponytail: jobs live in this process; a restart mid-clone loses the job (the wizard says so) and may leave a partial folder
const jobs: Map<string, CloneJob> = ((globalThis as { __fbClones?: Map<string, CloneJob> }).__fbClones ??= new Map());

export const cloneJob = (id: string) => jobs.get(id);
const inFlight = () => [...jobs.values()].filter((j) => j.phase === 'cloning' || j.phase === 'setting up');
const fail = (status: 400 | 409, error: string) => ({ ok: false as const, status, error });

/** Checks everything a clone needs before it starts, then starts it; the job is returned at once and fills as git goes. */
export function startClone(dataDir: string, flowsDir: string, input: CloneInput, gh = 'gh'): Result<CloneJob> {
  if (!REPO.test(input.repo)) return fail(400, `not a GitHub repository: ${input.repo}`);
  const type = PROJECT_TYPES[input.type];
  if (!type) return fail(400, `no project type "${input.type}"`);
  if (type.soon) return fail(400, `${type.name} projects are coming soon`);
  if (!FOLDER_RE.test(input.parent.trim())) return fail(400, FOLDER);
  const ov = OverridesSchema.safeParse(input.overrides);
  if (!ov.success) return fail(400, ov.error.issues[0].message);
  const badLimits = limitsError(input.limits);
  if (badLimits) return fail(400, badLimits);
  if (inFlight().some((j) => j.repo === input.repo)) return fail(409, `${input.repo} is being cloned`);
  const twin = readProjects(dataDir).find((p) => p.source.kind === 'github' && p.source.repo === input.repo);
  if (twin) return fail(409, `${input.repo} is already the project ${twin.name}`);

  const [owner, name] = input.repo.split('/');
  const folder = cloneTarget(input.parent, name, new Set(inFlight().map((j) => j.folder)));
  const job: CloneJob = { id: randomUUID(), repo: input.repo, folder, phase: 'cloning', pct: 0, lines: [`$ gh repo clone ${input.repo} ${folder}`] };
  jobs.set(job.id, job);

  const child = spawn(gh, ['repo', 'clone', input.repo, folder, '--', '--progress'], { env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } });
  let rest = '';
  const take = (chunk: Buffer) => {
    const parts = (rest + chunk.toString()).split(/\r|\n/);
    rest = parts.pop() ?? '';
    for (const line of parts.map((l) => l.trimEnd()).filter(Boolean)) {
      // git rewrites a line per phase as it moves ("Receiving objects:  50%"), with `remote:` lines between them;
      // keep only each phase's latest
      const phase = /^(.*?:)\s+\d+%/.exec(line)?.[1];
      const at = phase ? job.lines.findLastIndex((l) => l.startsWith(phase) && /^.*?:\s+\d+%/.test(l)) : -1;
      if (at >= 0) job.lines[at] = line;
      else job.lines.push(line);
      const pct = /^Receiving objects:\s+(\d+)%/.exec(line);
      if (pct) job.pct = Number(pct[1]);
    }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', (e) => Object.assign(job, { phase: 'failed', error: e.message }));
  child.on('close', (code) => {
    if (rest.trim()) take(Buffer.from('\n'));
    if (job.phase === 'failed') return;
    if (code !== 0) return Object.assign(job, { phase: 'failed', error: job.lines.at(-1) ?? `gh exited ${code}` });
    job.phase = 'setting up';
    job.pct = 100;
    const made = createProject(dataDir, flowsDir, { name, owner, repoPath: folder, type: input.type, source: { kind: 'github', repo: input.repo }, overrides: ov.data, limits: input.limits });
    if (!made.ok) return Object.assign(job, { phase: 'failed', error: made.error });
    const p = made.value;
    const own = Object.keys(p.overrides);
    const limits = [input.limits.memoryMb && `${input.limits.memoryMb} MB`, input.limits.cpus && `${input.limits.cpus} CPUs`].filter(Boolean).join(' · ');
    const app = input.makeDefault ? updateAppSettings(dataDir, { projectsFolder: input.parent.trim() }) : undefined;
    job.lines.push(
      ...(app?.ok ? [`-- your projects folder is now ${input.parent.trim()} (app settings); new projects clone there`] : []),
      '-- added .flowboard/ to .git/info/exclude',
      `-- project ${p.name} registered at /p/${p.slug}: ${type.name}, ${trustText(p.overrides.trust ?? type.defaults.trust ?? readAppSettings(dataDir).trust)}`,
      own.length ? `-- overrides: ${own.join(', ')}` : '-- every setting inherited',
      ...(limits ? [`-- wrote .flowboard.yaml: sandbox limits ${limits}`] : []),
    );
    Object.assign(job, { phase: 'done', project: p });
  });
  return { ok: true, value: job };
}
