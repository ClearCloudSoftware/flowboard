/**
 * A project's own settings: `.flowboard.yaml` in the folder a flow runs in, committed with the repo. What a
 * step may use depends on the repo (its test suite) and the machine, not on the recipe, so no flow sets these.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { isFile, issueLines, readYaml } from './config.ts';

export const PROJECT_FILE = '.flowboard.yaml';

/** What every container of a run may use: memory in MB, CPUs as a count (1.5 is a CPU and a half). */
export interface Limits { memoryMb?: number; cpus?: number }

const Schema = z
  .object({ sandbox: z.object({ memory_mb: z.number().int().min(64).optional(), cpus: z.number().positive().optional() }).strict().optional() })
  .strict();

/** The folder's limits; none when it has no `.flowboard.yaml`. */
export function projectLimits(folder: string): { ok: true; limits: Limits } | { ok: false; errors: string[] } {
  if (!isFile(join(folder, PROJECT_FILE))) return { ok: true, limits: {} };
  const read = readYaml(PROJECT_FILE, folder);
  if (!read.ok) return { ok: false, errors: read.errors.map((l) => `${join(folder, l)}`) };
  const r = Schema.safeParse(read.raw);
  if (!r.success) return { ok: false, errors: r.error.issues.flatMap((i) => issueLines(i, read.raw)).map((l) => `${read.abs}: ${l}`) };
  const sb = r.data.sandbox ?? {};
  return { ok: true, limits: { ...(sb.memory_mb !== undefined && { memoryMb: sb.memory_mb }), ...(sb.cpus !== undefined && { cpus: sb.cpus }) } };
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
