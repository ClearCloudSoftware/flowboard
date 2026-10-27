/**
 * The flow designer's view of run-flow's run folders: `runs/<stamp>-<flow>/`, each with its pinned `flow.json`,
 * its `state.json`, and one `<NNN>-<step>.jsonl` log per step run, a line per event as the adapter emitted it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDir, isFile } from './config.ts';

export interface RunSummary { name: string; flow: string; status: string }
/** One step run's log: `lines` are its JSONL lines parsed, the unreadable ones left out. */
export interface StepLog { run: number; step: string; lines: Record<string, unknown>[] }

const RUN = /^[\w.-]+$/;
const LOG = /^(\d{3,})-([a-z0-9][a-z0-9_-]*)\.jsonl$/;
const json = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
};

/** The run folders in `runsDir`, newest first (their names start with the time they started). */
export function listRuns(runsDir: string): RunSummary[] {
  if (!isDir(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((n) => RUN.test(n) && isFile(join(runsDir, n, 'flow.json')))
    .sort()
    .reverse()
    .map((name) => {
      const pin = json(join(runsDir, name, 'flow.json')) as { config?: { name?: string } } | undefined;
      const state = json(join(runsDir, name, 'state.json')) as { status?: string } | undefined;
      return { name, flow: pin?.config?.name ?? '', status: state?.status ?? 'starting' };
    });
}

/** Every step log of the run `name`, in run order; undefined when there is no such run. */
export function readLogs(runsDir: string, name: string): StepLog[] | undefined {
  const dir = join(runsDir, name);
  if (!RUN.test(name) || name.startsWith('.') || !isDir(dir)) return undefined;
  return readdirSync(dir)
    .map((f) => LOG.exec(f))
    .filter((m) => m !== null)
    .map((m) => ({
      run: Number(m[1]),
      step: m[2],
      // ponytail: re-reads whole files on every poll; read from an offset if logs grow past a few MB
      lines: readFileSync(join(dir, m[0]), 'utf8')
        .split('\n')
        .flatMap((l) => {
          try {
            return l ? [JSON.parse(l) as Record<string, unknown>] : [];
          } catch {
            return []; // a line still being written
          }
        }),
    }))
    .sort((a, b) => a.run - b.run);
}
