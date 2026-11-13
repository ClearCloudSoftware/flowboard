/**
 * The projects FlowBoard knows: `projects.json` in its data folder, one record per codebase. A record is thin, a
 * name, a slug for page URLs, the repo's top folder and the flow new runs start on; the repo's own settings, such
 * as its check command, stay in the repo's `.flowboard.yaml` (`project.ts`). Runs belong to the project whose
 * repo holds their folder.
 */
import { spawnSync } from 'node:child_process';
import { excludeFlowboard } from '@flowboard/adapters';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { type ApprovalRule, ApprovalRuleSchema } from './approvals.ts';
import { isDir, isFile, writeJsonFile } from './config.ts';
import { FLOW_NAME } from './flow-files.ts';
import { projectSlug } from './slug.ts';
import type { RunStatus, RunSummary } from './flow-logs.ts';
import { type Limits, PROJECT_FILE, projectSettings, setCheckCommand, setLimits } from './project.ts';
import { type AppSettings, type Overrides, OverridesSchema, PROJECT_TYPES, type ProjectTypeId, type Resolved, resolveSettings } from './settings.ts';

/** Where the repo came from: cloned from GitHub as `owner/name`, or a folder already on this machine. */
export type Source = { kind: 'github'; repo: string } | { kind: 'local' };

/**
 * `repoPath`: the repo's top folder, real path; `defaultFlow`: the flow new runs start on, the type's first in the
 * library at registration, or null to pick one each run; `baseBranch`: the branch work starts from and lands on, the
 * one checked out at registration (null: HEAD was detached); `type`: decides its flows and the defaults its settings
 * start from; `overrides`: the settings it sets over those (`settings.ts`); `approvals`: what its owner chose to
 * allow from now on (`approvals.ts`), absent on a record from before them.
 */
export interface Project {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
  defaultFlow: string | null;
  baseBranch: string | null;
  createdAt: string;
  type: ProjectTypeId;
  source: Source;
  overrides: Overrides;
  approvals?: ApprovalRule[];
}
export type Result<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string };

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
export { projectSlug, slugify } from './slug.ts';
const fileOf = (dataDir: string) => join(dataDir, 'projects.json');
const BAD_APPROVAL = "an approval is { kind: 'edit' } or { kind: 'shell', prefix }";
const fail = (status: 400 | 404 | 409, error: string) => ({ ok: false as const, status, error });

export function readProjects(dataDir: string): Project[] {
  const file = fileOf(dataDir);
  const projects = isFile(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<Project>[]) : [];
  // A record from before types, sources and overrides: a local software project with nothing overridden.
  return projects.map((p) => ({ ...p, type: p.type ?? 'software', source: p.source ?? { kind: 'local' }, overrides: p.overrides ?? {} }) as Project);
}

// ponytail: read, change, write with no lock; one person's browser is the only writer
const writeProjects = (dataDir: string, projects: Project[]) => writeJsonFile(fileOf(dataDir), projects);

/** The git repo holding `path` (absolute, or from `~/`): its top folder, as a real path. */
export function repoRoot(path: string): Result<string> {
  const p = path.trim().startsWith('~/') ? join(homedir(), path.trim().slice(2)) : path.trim();
  if (!isAbsolute(p)) return fail(400, 'the repo folder must be an absolute path, or start with ~/');
  if (!isDir(p)) return fail(400, `${p}: no such folder`);
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: p, encoding: 'utf8' });
  if (git.error || git.status !== 0) return fail(400, `${p}: not in a git repository; run git init there first`);
  return { ok: true, value: realpathSync(git.stdout.trim()) };
}

/** True when the run's folder is the project's repo or a folder inside it. */
export const owns = (p: Project, folder: string) => folder === p.repoPath || folder.startsWith(p.repoPath + sep);

const flowCheck = (flowsDir: string, flow: string | null | undefined) =>
  flow && (!FLOW_NAME.test(flow) || !isFile(join(flowsDir, `${flow}.yaml`))) ? `no flow "${flow}" in the library` : undefined;

/**
 * `owner`: the repo's owner, for the slug when the name's is taken; `limits` and `checkCommand` go into the repo's
 * `.flowboard.yaml`, the rest onto the record.
 */
export interface NewProject {
  name: string;
  repoPath: string;
  type: ProjectTypeId;
  source?: Source;
  slug?: string;
  owner?: string;
  overrides?: Overrides;
  limits?: Limits;
  checkCommand?: string;
}

const gitOut = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
};
/** The branch checked out, even in a repo with no commits yet; undefined when HEAD is detached. */
const currentBranch = (repo: string) => gitOut(repo, 'symbolic-ref', '--short', '-q', 'HEAD');

/** The first issue's message, as a 400. */
const overridesError = (ov: unknown) => {
  const r = OverridesSchema.safeParse(ov);
  return r.success ? undefined : fail(400, r.error.issues[0].message);
};
const hasLimits = (l: Limits | undefined): l is Limits => !!l && (l.memoryMb !== undefined || l.cpus !== undefined);

/**
 * Registers a repo. 400 for a folder that is not a git repo, a type not offered yet or overrides that do not pass;
 * 409 when the repo or the slug given already has a project. A slug left out comes from `projectSlug`. Limits and a
 * check command given are written to the repo's `.flowboard.yaml`, unless that file does not pass.
 */
export function createProject(dataDir: string, flowsDir: string, input: NewProject, now = new Date()): Result<Project> {
  const name = input.name.trim();
  if (!name) return fail(400, 'name the project');
  const type = PROJECT_TYPES[input.type];
  if (!type) return fail(400, `no project type "${input.type}"`);
  if (type.soon) return fail(400, `${type.name} projects are coming soon`);
  const badOverrides = overridesError(input.overrides ?? {});
  if (badOverrides) return badOverrides;
  const root = repoRoot(input.repoPath);
  if (!root.ok) return root;
  const projects = readProjects(dataDir);
  const twin = projects.find((p) => p.repoPath === root.value);
  if (twin) return fail(409, `${root.value} is already the project ${twin.name}`);
  let slug = input.slug?.trim();
  if (slug) {
    if (!SLUG.test(slug)) return fail(400, 'a slug may only use lowercase letters, digits and -');
    if (projects.some((p) => p.slug === slug)) return fail(409, `the slug ${slug} is taken`);
  } else slug = projectSlug(projects, name, input.owner);
  // A repo whose .flowboard.yaml does not pass is registered without writing to it; its page says what is wrong.
  const fileOk = projectSettings(root.value).ok;
  if (fileOk && input.checkCommand?.trim()) {
    const set = setCheckCommand(root.value, input.checkCommand);
    if (!set.ok) return fail(400, set.errors.join('\n'));
  }
  if (fileOk && hasLimits(input.limits)) {
    const set = setLimits(root.value, input.limits);
    if (!set.ok) return fail(400, set.errors.join('\n'));
  }
  const defaultFlow = type.flows.find((f) => isFile(join(flowsDir, `${f}.yaml`))) ?? null;
  excludeFlowboard(root.value); // .flowboard/, where FlowBoard keeps its own files in the repo, stays out of commits
  const project: Project = {
    id: randomUUID(),
    name,
    slug,
    repoPath: root.value,
    defaultFlow,
    baseBranch: currentBranch(root.value) ?? null,
    createdAt: now.toISOString(),
    type: type.id,
    source: input.source ?? { kind: 'local' },
    overrides: input.overrides ?? {},
  };
  writeProjects(dataDir, [...projects, project]);
  return { ok: true, value: project };
}

/** `overrides` replaces the project's whole set; `limits` replaces the repo's (an empty one removes them); `approvals` replaces the list. */
export interface ProjectEdit { name?: string; defaultFlow?: string | null; checkCommand?: string | null; baseBranch?: string | null; overrides?: Overrides; limits?: Limits; approvals?: ApprovalRule[] }

/**
 * Renames, moves the default flow, sets the check command (null or empty removes it), the base branch (a branch of
 * the repo, or the one checked out before its first commit), the overrides, the limits or the approvals. The slug and
 * repo stay.
 */
export function updateProject(dataDir: string, flowsDir: string, id: string, edit: ProjectEdit): Result<Project> {
  const projects = readProjects(dataDir);
  const at = projects.findIndex((p) => p.id === id);
  if (at === -1) return fail(404, 'no such project');
  if (edit.name !== undefined && !edit.name.trim()) return fail(400, 'name the project');
  const badFlow = flowCheck(flowsDir, edit.defaultFlow);
  if (badFlow) return fail(400, badFlow);
  const badOverrides = edit.overrides !== undefined ? overridesError(edit.overrides) : undefined;
  if (badOverrides) return badOverrides;
  const approvals = edit.approvals !== undefined ? z.array(ApprovalRuleSchema).safeParse(edit.approvals) : undefined;
  if (approvals && !approvals.success) return fail(400, BAD_APPROVAL);
  const branch = edit.baseBranch?.trim();
  if (branch && gitOut(projects[at].repoPath, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`) === undefined && branch !== currentBranch(projects[at].repoPath)) {
    return fail(400, `${projects[at].repoPath} has no branch ${branch}`);
  }
  if (edit.checkCommand !== undefined) {
    const set = setCheckCommand(projects[at].repoPath, edit.checkCommand ?? undefined);
    if (!set.ok) return fail(400, set.errors.join('\n'));
  }
  if (edit.limits !== undefined) {
    const set = setLimits(projects[at].repoPath, edit.limits);
    if (!set.ok) return fail(400, set.errors.join('\n'));
  }
  const p = {
    ...projects[at],
    ...(edit.name !== undefined && { name: edit.name.trim() }),
    ...(edit.defaultFlow !== undefined && { defaultFlow: edit.defaultFlow || null }),
    ...(edit.baseBranch !== undefined && { baseBranch: branch || null }),
    ...(edit.overrides !== undefined && { overrides: edit.overrides }),
    ...(approvals?.success && { approvals: approvals.data }),
  };
  projects[at] = p;
  writeProjects(dataDir, projects);
  return { ok: true, value: p };
}

/** Saves a rule for the project's runs from now on; a rule it already has is not saved twice. */
export function addApproval(dataDir: string, id: string, rule: ApprovalRule): Result<Project> {
  const parsed = ApprovalRuleSchema.safeParse(rule);
  if (!parsed.success) return fail(400, BAD_APPROVAL);
  const projects = readProjects(dataDir);
  const at = projects.findIndex((x) => x.id === id);
  if (at === -1) return fail(404, 'no such project');
  const have = projects[at].approvals ?? [];
  if (have.some((r) => JSON.stringify(r) === JSON.stringify(parsed.data))) return { ok: true, value: projects[at] };
  projects[at] = { ...projects[at], approvals: [...have, parsed.data] };
  writeProjects(dataDir, projects);
  return { ok: true, value: projects[at] };
}

/** Forgets the project; its repo, runs and `.flowboard.yaml` stay where they are. */
export function removeProject(dataDir: string, id: string): boolean {
  const projects = readProjects(dataDir);
  const kept = projects.filter((p) => p.id !== id);
  if (kept.length === projects.length) return false;
  writeProjects(dataDir, kept);
  return true;
}

const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.name=FlowBoard', '-c', 'user.email=flowboard@localhost', ...args], { cwd, encoding: 'utf8' });

/**
 * The first time FlowBoard looks for projects, it makes one so there is something to run: a scratch repo in the
 * data folder, committed once so worktrees can branch from it, with a test its check command runs. Never again,
 * even once every project is removed.
 */
export function seedOnce(dataDir: string, flowsDir: string) {
  if (isFile(fileOf(dataDir))) return;
  writeProjects(dataDir, []);
  const repo = join(dataDir, 'scratch');
  if (isDir(join(repo, '.git'))) return; // a seed left from before projects.json was deleted: not made twice
  mkdirSync(repo, { recursive: true });
  const files: Record<string, string> = {
    'README.md': '# Scratch\n\nFlowBoard made this repo so a flow has somewhere to run. Break the test to watch a check fail.\n',
    'package.json': '{ "type": "module" }\n',
    'sum.js': 'export const sum = (a, b) => a + b;\n',
    'sum.test.js': "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { sum } from './sum.js';\n\ntest('sum adds', () => assert.equal(sum(2, 3), 5));\n",
    [PROJECT_FILE]: '# What a shell step with an empty `shell:` runs.\ncheck_command: node --test\n',
  };
  for (const [f, text] of Object.entries(files)) writeFileSync(join(repo, f), text);
  if (git(repo, 'init', '-q', '-b', 'main').status !== 0 || git(repo, 'add', '.').status !== 0 || git(repo, 'commit', '-q', '-m', 'Scratch repo for FlowBoard').status !== 0) return;
  createProject(dataDir, flowsDir, { name: 'Scratch', repoPath: repo, type: 'software' });
}

/** A project as the projects page shows it: its runs counted by status and what they cost in the last seven days. */
export interface ProjectView extends Project {
  checkCommand: string | null;
  /** The repo's sandbox limits; none when its `.flowboard.yaml` sets none or does not pass. */
  limits: Limits;
  /** Every setting's value for this project, and where it came from. */
  settings: Resolved;
  /** What needs a look: the repo is gone, its `.flowboard.yaml` does not pass, or its checkout is not where work starts. */
  problems: string[];
  runs: Partial<Record<RunStatus, number>>;
  weekSpendUsd: number;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** A run folder's name starts with its local start time, `2026-11-12T13-32-04`. */
const startOf = (run: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d)-(\d\d)-(\d\d)/.exec(run);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN;
};

/**
 * What in the repo's checkout stops or misleads a run: run-flow refuses uncommitted changes, a worktree needs a commit
 * to branch from, and work should start from the base branch. `.flowboard/` is FlowBoard's own, so it is left out.
 */
// ponytail: one git status per project per poll of the list; cache by the index's mtime if many repos make it slow
export function repoProblems(p: Pick<Project, 'repoPath' | 'baseBranch'>): string[] {
  const out = gitOut(p.repoPath, 'status', '--porcelain=v1', '--branch', '--untracked-files=no', '--', '.', ':(exclude).flowboard');
  if (out === undefined) return [`${p.repoPath}: git cannot read this repo`];
  const [head, ...changed] = out.split('\n');
  const problems: string[] = [];
  const branch = currentBranch(p.repoPath);
  if (head.startsWith('## No commits yet')) problems.push('the repo has no commits yet; commit once so work has something to branch from');
  if (!branch) problems.push(`HEAD is detached${p.baseBranch ? `; check out ${p.baseBranch}` : ''}`);
  else if (p.baseBranch && branch !== p.baseBranch) problems.push(`${branch} is checked out, not the base branch ${p.baseBranch}`);
  if (changed.length) problems.push(`${changed.length} uncommitted change${changed.length === 1 ? '' : 's'}; a run will not start until they are committed or stashed`);
  return problems;
}

/** The steps of the flow whose `shell:` is empty, so they run the project's check_command; none when it cannot be read. */
function projectCheckSteps(flowsDir: string, flow: string): string[] {
  try {
    const y = parse(readFileSync(join(flowsDir, `${flow}.yaml`), 'utf8')) as { steps?: Record<string, { shell?: unknown }> };
    return Object.entries(y?.steps ?? {}).filter(([, st]) => st && typeof st === 'object' && 'shell' in st && st.shell === null).map(([n]) => n);
  } catch {
    return []; // a flow that does not parse says so in the designer and when a run starts
  }
}

// ponytail: "this week" is the last seven days, and a run's whole cost counts on the day it started (Projects OQ 11)
export function viewProjects(projects: Project[], runs: RunSummary[], flowsDir: string, app: AppSettings, now = Date.now()): ProjectView[] {
  return projects.map((p) => {
    const mine = runs.filter((r) => owns(p, r.folder));
    const counts: ProjectView['runs'] = {};
    for (const r of mine) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const weekSpendUsd = mine.filter((r) => now - startOf(r.name) < WEEK_MS).reduce((n, r) => n + r.spentUsd, 0);
    const settings = isDir(p.repoPath) ? projectSettings(p.repoPath) : { ok: false as const, errors: [`${p.repoPath}: the repo is gone; it moved or was deleted`] };
    const checkCommand = settings.ok ? (settings.settings.checkCommand ?? null) : null;
    // Projects OQ 6: a default flow that needs the check command, in a repo that sets none, is said here, before a run.
    const needsCheck = settings.ok && !checkCommand && p.defaultFlow ? projectCheckSteps(flowsDir, p.defaultFlow) : [];
    const problems = needsCheck.length
      ? [`${p.defaultFlow}'s ${needsCheck.join(', ')} run${needsCheck.length === 1 ? 's' : ''} the project's check command, and none is set; set one, or a run will be refused`]
      : [];
    return {
      ...p,
      baseBranch: p.baseBranch ?? null, // a record from before base branches has none
      checkCommand,
      limits: settings.ok ? settings.settings.limits : {},
      settings: resolveSettings(app, p.type, p.overrides),
      problems: [...(settings.ok ? [] : settings.errors), ...problems, ...(isDir(p.repoPath) ? repoProblems(p) : [])],
      runs: counts,
      weekSpendUsd,
    };
  });
}
