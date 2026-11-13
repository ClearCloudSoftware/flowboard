/**
 * A project's own settings: `.flowboard.yaml` in the folder a flow runs in, committed with the repo. What a
 * step may use depends on the repo (its test suite) and the machine, not on the recipe, so no flow sets these.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Document, isMap, parseDocument } from 'yaml';
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
 * Edits the folder's `.flowboard.yaml`, keeping its other keys and comments; the file is made when there is none,
 * and goes when the edit leaves nothing in it, not even a comment. A file that does not pass is left as it is.
 */
function editProjectFile(folder: string, edit: (doc: Document) => void): { ok: true } | { ok: false; errors: string[] } {
  const now = projectSettings(folder);
  if (!now.ok) return now;
  const path = join(folder, PROJECT_FILE);
  const doc = parseDocument(isFile(path) ? readFileSync(path, 'utf8') : '');
  edit(doc);
  const text = String(doc);
  if (text.trim() !== '{}') writeFileSync(path, text);
  else if (isFile(path)) unlinkSync(path);
  return { ok: true };
}

/** Sets or, with undefined, removes `check_command`. */
export const setCheckCommand = (folder: string, command: string | undefined) =>
  editProjectFile(folder, (doc) => (command?.trim() ? doc.set('check_command', command.trim()) : doc.delete('check_command')));

const MEMORY = 'a whole number of MB, 64 or more';
const CPUS = 'more than 0; 1.5 is a CPU and a half';
const LimitsSchema = z.strictObject({
  memoryMb: z.number({ error: MEMORY }).int({ error: MEMORY }).min(64, { error: MEMORY }).optional(),
  cpus: z.number({ error: CPUS }).positive({ error: CPUS }).optional(),
});

/** Sets `sandbox.memory_mb` and `sandbox.cpus` to the limits given, removing those left out, and `sandbox:` once empty. */
/** What is wrong with the limits, in the words the pages use; undefined when nothing is. */
export const limitsError = (limits: Limits) => LimitsSchema.safeParse(limits).error?.issues[0].message;

export function setLimits(folder: string, limits: Limits): { ok: true } | { ok: false; errors: string[] } {
  const bad = limitsError(limits);
  if (bad) return { ok: false, errors: [bad] };
  return editProjectFile(folder, (doc) => {
    for (const [key, v] of [['memory_mb', limits.memoryMb], ['cpus', limits.cpus]] as const) {
      if (v !== undefined) doc.setIn(['sandbox', key], v);
      else if (doc.hasIn(['sandbox', key])) doc.deleteIn(['sandbox', key]);
    }
    const sb = doc.get('sandbox');
    if (isMap(sb) && sb.items.length === 0) doc.delete('sandbox');
  });
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

/** Whether Docker has gVisor's `runsc` runtime installed (the Untrusted isolation tier needs it). */
export function dockerHasGvisor(docker = 'docker'): boolean {
  const r = spawnSync(docker, ['info', '--format', '{{json .Runtimes}}'], { encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) return false;
  try {
    return 'runsc' in JSON.parse(r.stdout);
  } catch {
    return false;
  }
}

/** Why a step cannot run in `image` yet, or undefined when Docker is up and has the image. */
export function dockerNotReady(image: string, docker = 'docker'): string | undefined {
  const run = (...args: string[]) => spawnSync(docker, args, { stdio: 'ignore', timeout: 10_000 }).status === 0;
  if (run('image', 'inspect', image)) return undefined;
  return run('info') ? `no image ${image}; build it from code/flowboard: docker build -f docker/Dockerfile -t ${image} .` : 'Docker is not running';
}
