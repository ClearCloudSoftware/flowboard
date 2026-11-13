/**
 * What the workspace pages read and do, on the host: every task worktree in a repo and where it stands against
 * the base branch, a task branch's commits and diffs, landing it, and removing it. Agents never run git here;
 * every command is one a person could type, and the pages show it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { TASK_ID, worktreeWorkspace } from '@flowboard/adapters';
import { listRuns } from './flow-logs.ts';
import type { RunStatus } from './flow-logs.ts';
import { heldBy } from './lock.ts';

export const ID_RULE = 'use letters, digits, - and _, starting with a letter or digit';

function git(cwd: string, ...args: string[]): { ok: boolean; code: number | null; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, code: r.status, out: r.stdout ?? '', err: (r.stderr || r.error?.message || '').trim() };
}
const lines = (s: string) => s.split('\n').filter(Boolean);

/** The repository `folder` is in, and where `folder` sits inside it, so a run in a subfolder keeps its place. */
export function repoOf(folder: string): { root: string; sub: string } | { error: string } {
  if (!existsSync(folder)) return { error: `${folder}: no such folder` };
  const top = git(folder, 'rev-parse', '--show-toplevel');
  if (!top.ok) return { error: `${folder} is not in a git repository` };
  const root = realpathSync(top.out.trim());
  return { root, sub: relative(root, realpathSync(folder)) };
}

/** A repo as the pages see it: its top folder, the branch it is on (the base every task branch lands in), and that branch's tip. */
export interface Repo { root: string; sub: string; base: string; head: string }

/** `~/` and absolute paths only: the pages run in a server whose own folder means nothing to the person typing. */
export function openRepo(input: string): Repo | { error: string } {
  const folder = input.startsWith('~/') ? join(homedir(), input.slice(2)) : input;
  if (!isAbsolute(folder)) return { error: 'the folder must be an absolute path, or start with ~/' };
  const r = repoOf(folder);
  if ('error' in r) return r;
  const base = git(r.root, 'symbolic-ref', '--short', 'HEAD');
  if (!base.ok) return { error: `${r.root} is not on a branch; check out the branch tasks land in first` };
  return { ...r, base: base.out.trim(), head: git(r.root, 'rev-parse', '--short', 'HEAD').out.trim() };
}

const wtPath = (repo: Repo, id: string) => join(repo.root, '.flowboard', 'worktrees', `task-${id}`);
const branchOf = (id: string) => `fb/task-${id}`;
const hasBranch = (repo: Repo, branch: string) => git(repo.root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).ok;

/**
 * `running`: a run-flow holds it. `dirty`: uncommitted work in it. `unmerged`: commits not in the base yet.
 * `merged`: nothing the base lacks, safe to clean up. `branch-only`: the folder is gone, the branch is not.
 * `broken`: a plain folder in the way, or the worktree switched to another branch.
 */
export type WorkspaceState = 'running' | 'dirty' | 'unmerged' | 'merged' | 'branch-only' | 'broken';

export interface WorkspaceRow {
  id: string;
  path: string;
  branch: string;
  state: WorkspaceState;
  /** Commits on the branch the base lacks, and on the base the branch lacks. */
  ahead: number;
  behind: number;
  uncommitted: string[];
  pid?: number;
  /** What is wrong with a broken one, and the command that fixes it. */
  problem?: string;
  fix?: string;
  lastCommit?: { sha: string; subject: string; when: string };
  lastRun?: { name: string; flow: string; status: RunStatus };
}

/** Every task workspace in the repo: a folder under .flowboard/worktrees/, a branch fb/task-*, or both. */
export function listWorkspaces(repo: Repo, runsDir: string): WorkspaceRow[] {
  const dir = join(repo.root, '.flowboard', 'worktrees');
  const ids = new Set<string>();
  if (existsSync(dir)) for (const n of readdirSync(dir)) if (n.startsWith('task-')) ids.add(n.slice(5));
  for (const b of lines(git(repo.root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/fb/').out)) if (b.startsWith('fb/task-')) ids.add(b.slice(8));
  const runs = runFolders(runsDir);
  const registered = worktrees(repo);
  return [...ids].filter((id) => TASK_ID.test(id)).sort().map((id) => inspect(repo, id, registered, runs));
}

/** One task's workspace, whether or not it exists yet; undefined state fields mean "no such workspace". */
export function inspectOne(repo: Repo, id: string, runsDir: string): WorkspaceRow & { exists: boolean } {
  const row = inspect(repo, id, worktrees(repo), runFolders(runsDir));
  return { ...row, exists: existsSync(row.path) || hasBranch(repo, row.branch) };
}

/** Registered worktrees, real path → branch ('' when detached). */
function worktrees(repo: Repo): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of git(repo.root, 'worktree', 'list', '--porcelain').out.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (path && existsSync(path)) map.set(realpathSync(path), /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '');
  }
  return map;
}

/** Each run folder's working folder, newest run first. */
function runFolders(runsDir: string): Array<{ name: string; flow: string; status: RunStatus; folder: string }> {
  return listRuns(runsDir).flatMap((r) => {
    try {
      const pin = JSON.parse(readFileSync(join(runsDir, r.name, 'flow.json'), 'utf8')) as { config?: { folder?: unknown } };
      return typeof pin.config?.folder === 'string' ? [{ ...r, folder: pin.config.folder }] : [];
    } catch {
      return [];
    }
  });
}

const LIVE: ReadonlySet<RunStatus> = new Set(['starting', 'running', 'waiting']);

function inspect(repo: Repo, id: string, registered: Map<string, string>, runs: ReturnType<typeof runFolders>): WorkspaceRow {
  const path = wtPath(repo, id), branch = branchOf(id);
  const row: WorkspaceRow = { id, path, branch, state: 'merged', ahead: 0, behind: 0, uncommitted: [] };
  const folder = existsSync(path);
  if (folder) {
    const on = registered.get(realpathSync(path));
    if (on === undefined) {
      row.problem = `${path} exists but is not a git worktree`;
      row.fix = `mv ${path} ${path}.old`;
    } else if (on !== branch) {
      row.problem = `the worktree is on ${on || 'no branch'}, not ${branch}`;
      row.fix = `git -C ${path} switch ${branch}`;
    } else {
      row.uncommitted = lines(git(path, 'status', '--porcelain').out).map((l) => l.slice(3));
      row.pid = heldBy(join(path, '.flowboard', 'lock'));
    }
  }
  if (hasBranch(repo, branch)) {
    const [behind, ahead] = git(repo.root, 'rev-list', '--left-right', '--count', `${repo.base}...${branch}`).out.trim().split(/\s+/).map(Number);
    row.ahead = ahead || 0;
    row.behind = behind || 0;
    const [sha, subject, when] = git(repo.root, 'log', '-1', '--format=%h%x1f%s%x1f%cr', branch).out.trim().split('\x1f');
    if (sha) row.lastCommit = { sha, subject, when };
  }
  const last = runs.find((r) => r.folder === path || r.folder.startsWith(path + '/'));
  if (last) row.lastRun = { name: last.name, flow: last.flow, status: last.status };
  row.state = row.problem ? 'broken'
    : row.pid !== undefined || (last && LIVE.has(last.status)) ? 'running'
    : !folder ? 'branch-only'
    : row.uncommitted.length ? 'dirty'
    : row.ahead ? 'unmerged'
    : 'merged';
  return row;
}

/** What starting a run would do: the New run sheet's preview. `refused` says why Start is off. */
export interface Preview {
  mode: 'folder' | 'workspace';
  /** The run's folder: the repo folder, or its place inside the task's worktree. */
  folder?: string;
  path?: string;
  branch?: string;
  outcome?: 'new' | 'reused' | 'branch-only' | 'dirty';
  from?: string;
  ahead?: number;
  uncommitted?: number;
  lastCommit?: WorkspaceRow['lastCommit'];
  refused?: string;
}

export function preview(input: string, id: string, runsDir: string): Preview {
  const repo = openRepo(input);
  const mode = id ? 'workspace' : 'folder';
  if ('error' in repo) return { mode, refused: repo.error };
  if (!id) {
    const here = join(repo.root, repo.sub);
    const pid = heldBy(join(here, '.flowboard', 'lock'));
    return pid === undefined ? { mode, folder: here } : { mode, folder: here, refused: `another run-flow (pid ${pid}) is working in ${here}; give this run a task workspace instead` };
  }
  if (!TASK_ID.test(id)) return { mode, refused: `task id ${JSON.stringify(id)}: ${ID_RULE}` };
  const row = inspectOne(repo, id, runsDir);
  const base = { mode, path: row.path, branch: row.branch, folder: join(row.path, repo.sub), ahead: row.ahead, lastCommit: row.lastCommit } as const;
  if (!row.exists) return { ...base, outcome: 'new', from: `${repo.base} @ ${repo.head}` };
  if (row.state === 'broken') return { ...base, refused: `${row.problem}; fix it with: ${row.fix}` };
  if (row.state === 'running') return { ...base, refused: `a run is working in this workspace${row.pid ? ` (pid ${row.pid})` : ''}; let it finish or stop it first` };
  if (row.state === 'branch-only') return { ...base, outcome: 'branch-only' };
  if (row.state === 'dirty') return { ...base, outcome: 'dirty', uncommitted: row.uncommitted.length };
  return { ...base, outcome: 'reused' };
}

export interface Commit { sha: string; subject: string; author: string; when: string; a: number; d: number; files: number }
export interface FileDiff { path: string; a: number; d: number; binary: boolean; patch: string }
export interface Review {
  repo: Repo;
  row: WorkspaceRow;
  /** The commit the branch was cut from (their merge base). */
  cut: string;
  /** On the branch, not on the base: what landing brings in. Newest first. */
  commits: Commit[];
  /** On the base since the cut. */
  baseCommits: Commit[];
  /** Files changed on both sides: where landing may conflict. */
  overlap: string[];
}

function commits(repo: Repo, range: string): Commit[] {
  return git(repo.root, 'log', '--format=\x1e%h\x1f%s\x1f%an\x1f%cr', '--numstat', range).out.split('\x1e').filter(Boolean).map((rec) => {
    const [head, ...rest] = rec.split('\n');
    const [sha, subject, author, when] = head.split('\x1f');
    const stats = rest.filter(Boolean).map((l) => l.split('\t'));
    const n = (k: 0 | 1) => stats.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    return { sha, subject, author, when, a: n(0), d: n(1), files: stats.length };
  });
}

export function review(input: string, id: string, runsDir: string): Review | { error: string } {
  const repo = openRepo(input);
  if ('error' in repo) return repo;
  if (!TASK_ID.test(id)) return { error: `task id ${JSON.stringify(id)}: ${ID_RULE}` };
  const row = inspectOne(repo, id, runsDir);
  if (!hasBranch(repo, row.branch)) return { error: `task ${id} has no branch ${row.branch}` };
  const cut = git(repo.root, 'merge-base', repo.base, row.branch).out.trim().slice(0, 7);
  const names = (range: string) => new Set(lines(git(repo.root, 'diff', '--name-only', range).out));
  const ours = names(`${repo.base}...${row.branch}`);
  const overlap = [...names(`${row.branch}...${repo.base}`)].filter((f) => ours.has(f));
  return { repo, row, cut, commits: commits(repo, `${repo.base}..${row.branch}`), baseCommits: commits(repo, `${row.branch}..${repo.base}`), overlap };
}

/** The diff of the whole branch against the base (`commit` absent), or of one commit on either side. */
export function diffOf(input: string, id: string, commit?: string): FileDiff[] | { error: string } {
  const repo = openRepo(input);
  if ('error' in repo) return repo;
  if (!TASK_ID.test(id)) return { error: `task id ${JSON.stringify(id)}: ${ID_RULE}` };
  const branch = branchOf(id);
  if (!hasBranch(repo, branch)) return { error: `task ${id} has no branch ${branch}` };
  let args: string[];
  if (commit === undefined) args = ['diff', `${repo.base}...${branch}`];
  else {
    // Only a commit of this comparison: the page asks for a diff, not for any object in the repo.
    const known = lines(git(repo.root, 'rev-list', `${repo.base}...${branch}`).out);
    const full = /^[0-9a-f]{4,40}$/.test(commit) ? known.find((s) => s.startsWith(commit)) : undefined;
    if (!full) return { error: `${commit} is not a commit of ${branch} or of ${repo.base} since the branch was cut` };
    args = ['show', '--format=', full];
  }
  const stat = lines(git(repo.root, ...args, '--numstat').out).map((l) => l.split('\t'));
  const patches = git(repo.root, ...args, '--no-color', '--no-ext-diff', '-p').out.split(/^(?=diff --git )/m).filter((p) => p.startsWith('diff --git '));
  return stat.map(([a, d, path], k) => {
    const patch = patches[k] ?? '';
    const at = patch.indexOf('\n@@');
    // ponytail: a huge file's patch is cut at 3000 lines; the page says so and names the command for the rest
    const body = at < 0 ? '' : patch.slice(at + 1).split('\n').slice(0, 3000).join('\n');
    return { path: path.replace(/^.*\{(.*) => (.*)\}(.*)$/, (_m, _o, n, rest) => n + rest), a: Number(a) || 0, d: Number(d) || 0, binary: a === '-', patch: body };
  });
}

/** What must hold before landing; each says how to make it hold. */
export function preflight(repo: Repo, row: WorkspaceRow): Array<{ ok: boolean; text: string }> {
  const changed = lines(git(repo.root, 'status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude).flowboard').out).length;
  return [
    { ok: changed === 0, text: changed ? `${repo.root} has ${changed} uncommitted change(s) on ${repo.base}; commit or stash them first` : `${repo.root} is on ${repo.base}, nothing uncommitted` },
    { ok: row.state !== 'running', text: row.state === 'running' ? 'a run is working in the workspace; let it finish first' : 'no run-flow holds the workspace' },
    { ok: row.state !== 'dirty', text: row.state === 'dirty' ? `${row.uncommitted.length} uncommitted file(s) in the workspace would not land; commit them in the workspace first` : 'nothing uncommitted in the workspace' },
    { ok: row.ahead > 0, text: row.ahead ? `${row.ahead} commit(s) to land` : `nothing to land: ${row.branch} has no commits ${repo.base} lacks` },
  ];
}

export type Strategy = 'merge' | 'squash' | 'ff';
type Act = { ok: true; head?: string; note?: string } | { ok: false; error: string; conflicts?: string[] };

function ready(input: string, id: string, runsDir: string): { repo: Repo; row: WorkspaceRow } | { error: string } {
  const repo = openRepo(input);
  if ('error' in repo) return repo;
  if (!TASK_ID.test(id)) return { error: `task id ${JSON.stringify(id)}: ${ID_RULE}` };
  const row = inspectOne(repo, id, runsDir);
  if (!row.exists) return { error: `task ${id} has no workspace` };
  return { repo, row };
}

/** Merges in memory, touching no checkout: whether landing would conflict, and where. */
export function dryRun(input: string, id: string, runsDir: string): (Act & { checks?: ReturnType<typeof preflight> }) {
  const r = ready(input, id, runsDir);
  if ('error' in r) return { ok: false, error: r.error };
  const checks = preflight(r.repo, r.row);
  const m = git(r.repo.root, 'merge-tree', '--write-tree', '--name-only', '--no-messages', r.repo.base, r.row.branch);
  if (m.code === 0) return { ok: true, checks };
  if (m.code === 1) return { ok: false, error: 'landing would conflict', conflicts: lines(m.out).slice(1), checks };
  return { ok: false, error: `git merge-tree: ${m.err}`, checks };
}

/** Lands the task branch in the base, in the repo's own checkout; undone in full when git stops half-way. */
export function land(input: string, id: string, strategy: Strategy, message: string, runsDir: string): Act {
  const r = ready(input, id, runsDir);
  if ('error' in r) return { ok: false, error: r.error };
  const { repo, row } = r;
  const failed = preflight(repo, row).filter((c) => !c.ok);
  if (failed.length) return { ok: false, error: failed.map((c) => c.text).join('; ') };
  if (strategy !== 'ff' && !message.trim()) return { ok: false, error: 'the commit message is empty' };
  const conflicts = (cwd: string) => lines(git(cwd, 'diff', '--name-only', '--diff-filter=U').out);
  if (strategy === 'merge') {
    const m = git(repo.root, 'merge', '--no-ff', '-m', message, row.branch);
    if (!m.ok) {
      const c = conflicts(repo.root);
      git(repo.root, 'merge', '--abort');
      return { ok: false, error: `git merge: ${m.err || m.out.trim()}`, conflicts: c };
    }
  } else if (strategy === 'squash') {
    const m = git(repo.root, 'merge', '--squash', row.branch);
    if (!m.ok) {
      const c = conflicts(repo.root);
      git(repo.root, 'reset', '--merge');
      return { ok: false, error: `git merge --squash: ${m.err || m.out.trim()}`, conflicts: c };
    }
    const c = git(repo.root, 'commit', '-m', message);
    if (!c.ok) {
      git(repo.root, 'reset', '--merge');
      return { ok: false, error: `git commit: ${c.err || c.out.trim()}` };
    }
  } else {
    if (row.state === 'branch-only') return { ok: false, error: 'rebase needs the workspace folder; run the task again to bring it back, or pick another strategy' };
    const u = rebase(repo, row);
    if (!u.ok) return u;
    const f = git(repo.root, 'merge', '--ff-only', row.branch);
    if (!f.ok) return { ok: false, error: `git merge --ff-only: ${f.err}` };
  }
  const head = git(repo.root, 'rev-parse', '--short', 'HEAD').out.trim();
  return { ok: true, head, ...(strategy === 'squash' && { note: `git cannot tell a squashed branch was merged, so clean up keeps ${row.branch}` }) };
}

function rebase(repo: Repo, row: WorkspaceRow): Act {
  const b = git(row.path, 'rebase', repo.base);
  if (b.ok) return { ok: true };
  const c = lines(git(row.path, 'diff', '--name-only', '--diff-filter=U').out);
  git(row.path, 'rebase', '--abort');
  return { ok: false, error: `the branch does not replay cleanly on ${repo.base}; nothing was changed`, conflicts: c };
}

/** Replays the task branch on the base's tip, in the workspace; a conflict is undone in full and named. */
export function updateFromBase(input: string, id: string, runsDir: string): Act {
  const r = ready(input, id, runsDir);
  if ('error' in r) return { ok: false, error: r.error };
  const { repo, row } = r;
  if (row.state === 'running' || row.state === 'dirty' || row.state === 'broken' || row.state === 'branch-only') {
    return { ok: false, error: `the workspace is ${row.state === 'dirty' ? 'holding uncommitted work' : row.state}; it can be updated only when it is idle and clean` };
  }
  const u = rebase(repo, row);
  return u.ok ? { ok: true, head: git(row.path, 'rev-parse', '--short', 'HEAD').out.trim() } : u;
}

/**
 * Removes a task's worktree, and its branch when that is merged. Refuses while a run holds it, and uncommitted
 * work unless `force`. `lockSub`: where the run's folder sits in the repo, for the lock of a run in a subfolder.
 */
// ponytail: only the lock of a run in `lockSub` is seen, and a run starting after this check still loses its folder.
export async function removeWorkspace(root: string, lockSub: string, id: string, force: boolean): Promise<{ ok: true; branchKept?: string } | { ok: false; error: string; code: 1 | 2 }> {
  if (!TASK_ID.test(id)) return { ok: false, code: 2, error: `task id ${JSON.stringify(id)}: ${ID_RULE}` };
  const path = join(root, '.flowboard', 'worktrees', `task-${id}`);
  const pid = heldBy(join(path, lockSub, '.flowboard', 'lock')) ?? heldBy(join(path, '.flowboard', 'lock'));
  if (pid !== undefined) return { ok: false, code: 2, error: `a run-flow (pid ${pid}) is working in ${path}; let it finish or stop it first` };
  try {
    const { branchKept } = await worktreeWorkspace(root).destroy({ id }, { force });
    return { ok: true, ...(branchKept && { branchKept }) };
  } catch (e) {
    return { ok: false, code: 1, error: (e as Error).message };
  }
}
