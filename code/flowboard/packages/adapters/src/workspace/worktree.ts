import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TaskRef, Workspace } from '@flowboard/core';
import { hostGit, repoGitDirs } from './host-git.ts';

/** A task id that is safe as a folder name and in a branch name. */
export const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** git in `cwd`, in the repo at `repo`, through `hostGit`; a refusal is a failure with its reason. */
function git(repo: string, cwd: string, ...args: string[]): { ok: boolean; out: string; err: string } {
  const r = hostGit(repo, cwd, args);
  if ('refused' in r) return { ok: false, out: '', err: r.refused };
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

/**
 * Adds `.flowboard/` to the local exclude file of the repo at `repo`, so `git add -A` leaves FlowBoard's folder
 * alone. Linked worktrees share the repository's exclude file, so one line covers them all.
 */
export function excludeFlowboard(repo: string): void {
  const dirs = repoGitDirs(repo, repo);
  if ('error' in dirs) return;
  const file = join(dirs.gitDir, 'info', 'exclude');
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
    // best effort: run-flow's uncommitted-changes check leaves .flowboard/ out anyway
  }
}

/**
 * One git worktree per task: `<repo>/.flowboard/worktrees/task-<id>` on branch `fb/task-<id>`, cut from the
 * repo's current HEAD. `repo` is the repository's top folder. See docs/FlowBoard/Workspaces/Workspace Naming.md.
 */
export function worktreeWorkspace(repo: string): Workspace {
  const at = (task: TaskRef) => {
    if (!TASK_ID.test(task.id)) throw new Error(`task id ${JSON.stringify(task.id)}: use letters, digits, - and _, starting with a letter or digit`);
    return { path: join(repo, '.flowboard', 'worktrees', `task-${task.id}`), branch: `fb/task-${task.id}` };
  };
  const hasBranch = (branch: string) => git(repo, repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).ok;
  return {
    id: 'worktree',
    async create(task) {
      const { path, branch } = at(task);
      excludeFlowboard(repo); // before the folder appears, so the repo's `git status` never lists it
      if (existsSync(path)) {
        // A plain folder inside the repo would answer for the repo itself: it must be a worktree git made here.
        const dirs = repoGitDirs(repo, path);
        if ('error' in dirs) throw new Error(dirs.noRepo ? `${path} exists but is not a git worktree; move it away` : dirs.error);
        if (dirs.workTree !== realpathSync(path)) throw new Error(`${path} exists but is not a git worktree; move it away`);
        const head = git(repo, path, 'rev-parse', '--abbrev-ref', 'HEAD').out;
        if (head !== branch) throw new Error(`${path} is on ${head || 'no branch'}, not ${branch}; switch it back`);
        return { path, branch, reused: true };
      }
      git(repo, repo, 'worktree', 'prune'); // a worktree folder deleted by hand stays registered until pruned
      const reused = hasBranch(branch); // removed before, branch kept: pick the task's work up again
      const add = git(repo, repo, 'worktree', 'add', '--quiet', ...(reused ? [path, branch] : ['-b', branch, path]));
      if (!add.ok) throw new Error(`git worktree add: ${add.err}`);
      return { path, branch, reused };
    },
    async destroy(task, opts) {
      const { path, branch } = at(task);
      const folder = existsSync(path);
      if (!folder && !hasBranch(branch)) throw new Error(`task ${task.id} has no workspace`);
      if (folder) {
        // git checks the worktree's .git points back before it removes it, and refuses one holding submodules.
        const rm = git(repo, repo, 'worktree', 'remove', ...(opts?.force ? ['--force'] : []), path);
        if (!rm.ok) throw new Error(`git worktree remove: ${rm.err}${opts?.force ? '' : '; commit the changes, or pass --force to throw them away'}`);
      }
      // `-d`, never `-D`: a branch with commits not merged into HEAD is the task's work, and stays.
      if (hasBranch(branch) && !git(repo, repo, 'branch', '-d', branch).ok) return { branchKept: branch };
      return {};
    },
  };
}
