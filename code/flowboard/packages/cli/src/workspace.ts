/**
 * Task workspaces from the command line: `run-flow --workspace <id>` works in one, and
 * `pnpm clean-workspace` removes one. Only ever removed by hand.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { TASK_ID, worktreeWorkspace } from '@flowboard/adapters';
import { toAbs } from './config.ts';
import { heldBy } from './flow-run.ts';
import type { RunDeps } from './run.ts';

const USAGE = 'usage: pnpm clean-workspace --folder <dir> [--force] <task id>';

/** The repository `folder` is in, and where `folder` sits inside it, so a run in a subfolder keeps its place. */
function repoOf(folder: string): { root: string; sub: string } | { error: string } {
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: folder, encoding: 'utf8' });
  if (git.error || git.status !== 0) return { error: `${folder} is not in a git repository` };
  const root = realpathSync(git.stdout.trim());
  return { root, sub: relative(root, realpathSync(folder)) };
}

/** Makes task `id`'s workspace in `folder`'s repository, or picks it up again; `folder` is the run's place in it. */
export async function openWorkspace(folder: string, id: string): Promise<{ path: string; branch?: string; reused: boolean; folder: string } | { error: string }> {
  const repo = repoOf(folder);
  if ('error' in repo) return repo;
  try {
    const ws = await worktreeWorkspace(repo.root).create({ id });
    return { ...ws, folder: join(ws.path, repo.sub) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** `pnpm clean-workspace`: removes a task's worktree, and its branch when that is merged. */
export async function cleanWorkspace(args: string[], deps: Pick<RunDeps, 'cwd' | 'print' | 'printErr'>): Promise<number> {
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
  if (!TASK_ID.test(id)) {
    printErr(`clean-workspace: task id ${JSON.stringify(id)}: use letters, digits, - and _, starting with a letter or digit`);
    return 2;
  }
  const repo = repoOf(toAbs(v.folder, deps.cwd));
  if ('error' in repo) {
    printErr(`clean-workspace: --folder: ${repo.error}`);
    return 2;
  }
  // ponytail: only the lock of a run started from the same --folder is seen, and a run starting after this check
  // still loses its folder; one place per task, and one person at the keyboard, keep both rare.
  const path = join(repo.root, '.flowboard', 'worktrees', `task-${id}`);
  const pid = heldBy(join(path, repo.sub, '.flowboard', 'lock'));
  if (pid !== undefined) {
    printErr(`clean-workspace: a run-flow (pid ${pid}) is working in ${path}; let it finish or stop it first`);
    return 2;
  }
  try {
    const { branchKept } = await worktreeWorkspace(repo.root).destroy({ id }, { force: v.force });
    print(`-- removed the workspace of task ${id}`);
    if (branchKept) print(`-- kept branch ${branchKept}: it has commits not merged into HEAD; delete it with git branch -D ${branchKept}`);
    return 0;
  } catch (e) {
    printErr(`clean-workspace: ${(e as Error).message}`);
    return 1;
  }
}
