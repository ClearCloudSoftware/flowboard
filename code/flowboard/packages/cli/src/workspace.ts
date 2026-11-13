/**
 * Task workspaces from the command line: `run-flow --workspace <id>` works in one, and
 * `pnpm clean-workspace` removes one. Only ever removed by hand.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { worktreeWorkspace } from '@flowboard/adapters';
import { toAbs } from './config.ts';
import { removeWorkspace, repoOf } from './workspace-git.ts';
import { dataDirOf } from './run.ts';
import type { RunDeps } from './run.ts';

const USAGE = 'usage: pnpm clean-workspace --folder <dir> [--force] <task id>';

/**
 * Makes task `id`'s workspace in the repo of `folder`'s project (in `dataDir`), or picks it up again; `folder` is the
 * run's place in it.
 */
export async function openWorkspace(folder: string, id: string, dataDir: string): Promise<{ path: string; branch?: string; reused: boolean; folder: string } | { error: string }> {
  const repo = repoOf(folder, dataDir);
  if ('error' in repo) return repo;
  try {
    const ws = await worktreeWorkspace(repo.root).create({ id });
    return { ...ws, folder: join(ws.path, repo.sub) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** `pnpm clean-workspace`: removes a task's worktree, and its branch when that is merged. */
export async function cleanWorkspace(args: string[], deps: Pick<RunDeps, 'cwd' | 'print' | 'printErr' | 'dataDir'>): Promise<number> {
  const print = deps.print ?? console.log;
  const printErr = deps.printErr ?? console.error;
  let parsed;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { folder: { type: 'string' }, force: { type: 'boolean' } } });
  } catch {
    printErr(USAGE);
    return 2;
  }
  const { values: v, positionals } = parsed;
  if (v.folder === undefined || positionals.length !== 1) {
    printErr(USAGE);
    return 2;
  }
  const id = positionals[0];
  const repo = repoOf(toAbs(v.folder, deps.cwd), dataDirOf(deps));
  if ('error' in repo) {
    printErr(`clean-workspace: --folder: ${repo.error}`);
    return 2;
  }
  const r = await removeWorkspace(repo.root, repo.sub, id, !!v.force);
  if (!r.ok) {
    printErr(`clean-workspace: ${r.error}`);
    return r.code;
  }
  print(`-- removed the workspace of task ${id}`);
  if (r.branchKept) print(`-- kept branch ${r.branchKept}: it has commits not merged into HEAD; delete it with git branch -D ${r.branchKept}`);
  return 0;
}
