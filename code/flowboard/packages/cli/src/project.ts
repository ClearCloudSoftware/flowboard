/**
 * A project's own settings: `.flowboard.yaml` in the folder a flow runs in, committed with the repo. What a
 * step may use depends on the repo (its test suite) and the machine, not on the recipe, so no flow sets these.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { isFile, issueLines, readYaml } from './config.ts';

export const PROJECT_FILE = '.flowboard.yaml';

/** What every container of a run may use: memory in MB, CPUs as a count (1.5 is a CPU and a half). */
export interface Limits { memoryMb?: number; cpus?: number }
/** `checkCommand`: what a shell step with an empty `shell:` runs, such as `pnpm lint && pnpm test`. */
export interface ProjectSettings { limits: Limits; checkCommand?: string }

const Schema = z
  .object({
    check_command: z.string().trim().min(1).optional(),
    sandbox: z.object({ memory_mb: z.number().int().min(64).optional(), cpus: z.number().positive().optional() }).strict().optional(),
  })
  .strict();

/** The folder's settings; none when it has no `.flowboard.yaml`. */
export function projectSettings(folder: string): { ok: true; settings: ProjectSettings } | { ok: false; errors: string[] } {
  if (!isFile(join(folder, PROJECT_FILE))) return { ok: true, settings: { limits: {} } };
  const read = readYaml(PROJECT_FILE, folder);
  if (!read.ok) return { ok: false, errors: read.errors.map((l) => `${join(folder, l)}`) };
  const r = Schema.safeParse(read.raw);
  if (!r.success) return { ok: false, errors: r.error.issues.flatMap((i) => issueLines(i, read.raw)).map((l) => `${read.abs}: ${l}`) };
  const sb = r.data.sandbox ?? {};
  const limits = { ...(sb.memory_mb !== undefined && { memoryMb: sb.memory_mb }), ...(sb.cpus !== undefined && { cpus: sb.cpus }) };
  return { ok: true, settings: { limits, ...(r.data.check_command && { checkCommand: r.data.check_command }) } };
}

/** The folder's limits; none when it has no `.flowboard.yaml`. */
export function projectLimits(folder: string): { ok: true; limits: Limits } | { ok: false; errors: string[] } {
  const r = projectSettings(folder);
  return r.ok ? { ok: true, limits: r.settings.limits } : r;
}

/**
 * Sets or, with undefined, removes `check_command` in the folder's `.flowboard.yaml`, keeping its other keys and
 * comments; the file is made when there is none. A file that does not pass the check is left as it is.
 */
export function setCheckCommand(folder: string, command: string | undefined): { ok: true } | { ok: false; errors: string[] } {
  const now = projectSettings(folder);
  if (!now.ok) return now;
  const path = join(folder, PROJECT_FILE);
  if (!command?.trim() && !isFile(path)) return { ok: true };
  const doc = parseDocument(isFile(path) ? readFileSync(path, 'utf8') : '');
  if (command?.trim()) doc.set('check_command', command.trim());
  else doc.delete('check_command');
  // A file left with nothing in it, not even a comment, goes rather than sit in the repo as `{}`.
  const text = String(doc);
  if (text.trim() === '{}') unlinkSync(path);
  else writeFileSync(path, text);
  return { ok: true };
}

/** Adds `.flowboard/` to the local exclude file of `folder`'s git repository, so `git add -A` leaves it alone. */
export function excludeFromGit(folder: string): void {
  const git = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: folder, encoding: 'utf8' });
  if (git.error || git.status !== 0) return;
  const file = resolve(folder, git.stdout.trim());
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    // no exclude file yet
  }
  if (text.split('\n').some((l) => l.trim() === '.flowboard/')) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}.flowboard/\n`);
  } catch {
    // best effort: the uncommitted-changes check leaves .flowboard/ out anyway
  }
}

/**
 * Without a project limit, a Docker container gets a quarter of Docker's memory, so a runaway step is killed
 * before it starves the rest (parallel steps, other containers); undefined when Docker does not say.
 */
// ponytail: a quarter, whatever the fan-out; four parallel steps at their limit can still fill Docker's memory
export function dockerDefaultMemoryMb(docker = 'docker'): number | undefined {
  const r = spawnSync(docker, ['info', '--format', '{{.MemTotal}}'], { encoding: 'utf8', timeout: 10_000 });
  const total = Number(r.stdout?.trim());
  return r.status === 0 && total > 0 ? Math.floor(total / 4 / 2 ** 20) : undefined;
}
