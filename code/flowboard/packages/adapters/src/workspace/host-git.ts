/**
 * FlowBoard's own git calls on this machine, in a project's repo. A box writes the run's folder, so it can plant a
 * `.git` there or rewrite a worktree's; git run from that folder would use it, and its config runs commands
 * (core.fsmonitor, hooks, filters, diff.external…). So the git dir is found here without running git, only the
 * repo's own (mounted read-only in a box) or a worktree git made in it is accepted, and git is told which.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export type GitDirs = { gitDir: string; workTree: string } | { error: string; noRepo?: true };

const exists = (p: string) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * The git dir and work tree of `cwd` in the repo at `repoRoot`, or why FlowBoard will not run git there. `noRepo`:
 * there is no `.git` at all, from `cwd` up to `repoRoot`.
 */
export function repoGitDirs(repoRoot: string, cwd: string): GitDirs {
  let root: string, here: string;
  try {
    root = realpathSync(repoRoot);
    here = realpathSync(cwd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (here !== root && !here.startsWith(root + sep)) return { error: `${cwd} is not inside ${repoRoot}` };
  // The first .git up from cwd, as git would find it.
  let w = here;
  while (w !== root && !exists(join(w, '.git'))) w = dirname(w);
  const planted = { error: `${join(w, '.git')} was not made by git for ${root}; a sandboxed step may have written it. Remove it and check the repo.` };
  const top = join(root, '.git');
  if (!exists(join(w, '.git'))) return { error: `${root} is not a git repository`, noRepo: true };
  if (!exists(top)) return planted;
  // A link sits in the folder a box writes: the box could point it at a git dir of its own.
  const kind = lstatSync(top);
  if (kind.isSymbolicLink()) return { error: `${top} is a link; FlowBoard needs the repo's git dir itself at ${top}` };
  if (!kind.isDirectory()) return { error: `${top} is a file; FlowBoard needs the repo's git dir at ${top}` };
  const common = top; // root is a real path and top no link, so this is the git dir's real path
  if (here === common || here.startsWith(common + sep)) return { error: `${cwd} is inside the repo's git dir` };
  if (w === root) return { gitDir: common, workTree: root };
  // A linked worktree's gitfile names its git dir in <common>/worktrees/, whose `gitdir` file, git's, names it back.
  try {
    const to = /^gitdir: (.+?)\s*$/.exec(readFileSync(join(w, '.git'), 'utf8'))?.[1];
    if (!to) return planted;
    const gitDir = realpathSync(resolve(w, to));
    if (dirname(gitDir) !== join(common, 'worktrees')) return planted;
    const back = resolve(gitDir, readFileSync(join(gitDir, 'gitdir'), 'utf8').trim());
    if (basename(back) !== '.git' || realpathSync(dirname(back)) !== w) return planted;
    return { gitDir, workTree: w };
  } catch {
    return planted; // a .git folder below the repo's, a gitfile pointing nowhere, or a back-pointer gone
  }
}

/**
 * `git <args>` in `cwd`, in the repo at `repoRoot`, with the git dir `repoGitDirs` found, never one git discovers;
 * `refused` without running git when there is none it may use. Submodules are left alone: a box can replace theirs.
 * The repo's own hooks still run, from its read-only git dir. `args` start with the subcommand; `buffer`: stdout as bytes.
 * `commit` with nothing staged prints a full status, which goes into submodules whatever the command line says (a
 * committed `.gitmodules` `ignore = none` wins, `--no-status` does not stop it): check something is staged first.
 */
// ponytail: GIT_WORK_TREE is a path; a box swapping a folder for a link while git runs makes git read files elsewhere, never run config from there.
export function hostGit(repoRoot: string, cwd: string, args: string[], opts?: { maxBuffer?: number }): SpawnSyncReturns<string> | { refused: string };
export function hostGit(repoRoot: string, cwd: string, args: string[], opts: { maxBuffer?: number; buffer: true }): SpawnSyncReturns<Buffer> | { refused: string };
export function hostGit(repoRoot: string, cwd: string, args: string[], opts: { maxBuffer?: number; buffer?: true } = {}): SpawnSyncReturns<string | Buffer> | { refused: string } {
  if (args[0]?.startsWith('-')) throw new Error(`hostGit: start with the subcommand, not ${args[0]}`); // so the submodule option lands after it
  const dirs = repoGitDirs(repoRoot, cwd);
  if ('error' in dirs) return { refused: dirs.error };
  // The config only sets a default, which a .gitmodules the box wrote overrides (`ignore = none`); the option does not.
  const [sub, ...rest] = args;
  const subArgs = sub === 'status' || sub === 'diff' ? [sub, '--ignore-submodules=all', ...rest] : args;
  return spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'diff.ignoreSubmodules=all', '-c', 'status.submoduleSummary=false', ...subArgs], {
    cwd,
    env: { ...process.env, GIT_DIR: dirs.gitDir, GIT_WORK_TREE: dirs.workTree },
    encoding: opts.buffer ? 'buffer' : 'utf8',
    ...(opts.maxBuffer && { maxBuffer: opts.maxBuffer }),
  });
}
