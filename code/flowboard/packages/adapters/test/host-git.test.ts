import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostGit, repoGitDirs } from '../src/workspace/host-git.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=always', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

/** A repo `r` on main with one commit and the worktree task-t1, in a temp folder removed after the test. */
function setup(t: TestContext) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-hostgit-'))); // macOS's temp folder is a link
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const r = join(base, 'r');
  mkdirSync(r);
  git(r, 'init', '-q', '-b', 'main');
  writeFileSync(join(r, 'a.txt'), 'a\n');
  git(r, 'add', '.');
  git(r, 'commit', '-qm', 'one');
  const wt = join(r, '.flowboard', 'worktrees', 'task-t1');
  git(r, 'worktree', 'add', '-q', '-b', 'fb/task-t1', wt);
  return { base, r, wt, common: join(r, '.git'), marker: join(base, 'PWNED') };
}

/** A git dir at `dir`, as a box could write one: `git status` with it runs core.fsmonitor, which writes `marker`. */
function evilGitDir(dir: string, marker: string) {
  git(tmpdir(), 'init', '-q', '--bare', dir);
  git(tmpdir(), '--git-dir', dir, 'config', 'core.bare', 'false');
  git(tmpdir(), '--git-dir', dir, 'config', 'core.fsmonitor', `touch '${marker}'; false`);
}

/** Plain host git, as FlowBoard ran it before: the payload goes off, so each test's payload is shown to be live. */
function plainStatus(cwd: string, marker: string) {
  spawnSync('git', ['status', '--porcelain'], { cwd });
  const fired = existsSync(marker);
  rmSync(marker, { force: true });
  return fired;
}

const planted = (at: string, r: string) => `${join(at, '.git')} was not made by git for ${r}; a sandboxed step may have written it. Remove it and check the repo.`;

test("the repo's own git dir and a worktree git made are used, from their top folders and below", (t) => {
  const s = setup(t);
  mkdirSync(join(s.r, 'src'));
  mkdirSync(join(s.wt, 'src'));
  assert.deepEqual(repoGitDirs(s.r, s.r), { gitDir: s.common, workTree: s.r });
  assert.deepEqual(repoGitDirs(s.r, join(s.r, 'src')), { gitDir: s.common, workTree: s.r });
  const wt = { gitDir: join(s.common, 'worktrees', 'task-t1'), workTree: s.wt };
  assert.deepEqual(repoGitDirs(s.r, s.wt), wt);
  assert.deepEqual(repoGitDirs(s.r, join(s.wt, 'src')), wt);
  const head = hostGit(s.r, join(s.wt, 'src'), ['rev-parse', '--abbrev-ref', 'HEAD']);
  assert.ok(!('refused' in head) && head.status === 0, JSON.stringify(head));
  assert.equal(head.stdout.trim(), 'fb/task-t1');
});

test("a worktree's .git rewritten to a git dir the box wrote is refused, and git never runs with it", (t) => {
  const s = setup(t);
  evilGitDir(join(s.wt, 'evil'), s.marker);
  writeFileSync(join(s.wt, '.git'), 'gitdir: evil\n');
  assert.ok(plainStatus(s.wt, s.marker), 'the payload is live');
  assert.deepEqual(repoGitDirs(s.r, s.wt), { error: planted(s.wt, s.r) });
  assert.deepEqual(hostGit(s.r, s.wt, ['status', '--porcelain']), { refused: planted(s.wt, s.r) });
  assert.equal(existsSync(s.marker), false);
});

test("a worktree's .git pointed at another worktree's git dir is refused: git's own back-pointer does not match", (t) => {
  const s = setup(t);
  git(s.r, 'worktree', 'add', '-q', '-b', 'fb/task-t2', join(s.r, '.flowboard', 'worktrees', 'task-t2'));
  writeFileSync(join(s.wt, '.git'), `gitdir: ${join(s.common, 'worktrees', 'task-t2')}\n`);
  assert.deepEqual(repoGitDirs(s.r, s.wt), { error: planted(s.wt, s.r) });
});

test('a .git planted in a subfolder is refused from inside it, whether it brings core.fsmonitor or a clean filter', (t) => {
  const s = setup(t);
  const sub = join(s.r, 'sub');
  mkdirSync(sub);
  git(sub, 'init', '-q');
  git(sub, 'config', 'core.fsmonitor', `touch '${s.marker}'; false`);
  assert.ok(plainStatus(sub, s.marker), 'the payload is live');
  assert.deepEqual(repoGitDirs(s.r, sub), { error: planted(sub, s.r) });
  assert.deepEqual(hostGit(s.r, sub, ['status', '--porcelain']), { refused: planted(sub, s.r) });
  assert.equal(existsSync(s.marker), false);
  assert.deepEqual(repoGitDirs(s.r, s.r), { gitDir: s.common, workTree: s.r }, 'the repo itself is still fine');

  // The filter variant: a tracked file whose stat changed makes `git status` run the clean filter.
  const sub2 = join(s.r, 'sub2');
  mkdirSync(sub2);
  git(sub2, 'init', '-q');
  writeFileSync(join(sub2, 'f.txt'), 'f\n');
  git(sub2, 'add', 'f.txt');
  git(sub2, 'commit', '-qm', 'f');
  git(sub2, 'config', 'filter.x.clean', `sh -c "touch '${s.marker}'; cat"`);
  writeFileSync(join(sub2, '.gitattributes'), '* filter=x\n');
  const touch = () => utimesSync(join(sub2, 'f.txt'), new Date(2020, 0, 1), new Date(2020, 0, 1));
  touch();
  assert.ok(plainStatus(sub2, s.marker), 'the payload is live');
  touch();
  assert.deepEqual(hostGit(s.r, sub2, ['status', '--porcelain']), { refused: planted(sub2, s.r) });
  assert.equal(existsSync(s.marker), false);
});

test("a submodule's .git replaced by a box is never read, even when a .gitmodules the box wrote asks for it", (t) => {
  const s = setup(t);
  const lib = join(s.base, 'lib');
  mkdirSync(lib);
  git(lib, 'init', '-q', '-b', 'main');
  writeFileSync(join(lib, 'f.txt'), 'f\n');
  git(lib, 'add', 'f.txt');
  git(lib, 'commit', '-qm', 'lib');
  git(s.r, 'submodule', 'add', '-q', lib, 'lib');
  git(s.r, 'commit', '-qm', 'lib');
  // The box's own repo in lib/: a clean filter that `git status` and `git diff` run on a tracked file whose stat changed.
  const sub = join(s.r, 'lib');
  rmSync(join(sub, '.git'));
  git(sub, 'init', '-q');
  git(sub, 'add', 'f.txt');
  git(sub, 'commit', '-qm', 'box');
  git(sub, 'config', 'core.fsmonitor', `touch '${s.marker}'; false`);
  git(sub, 'config', 'filter.x.clean', `sh -c "touch '${s.marker}'; cat"`);
  writeFileSync(join(sub, '.gitattributes'), '* filter=x\n');
  let day = 0;
  const touch = () => utimesSync(join(sub, 'f.txt'), new Date(2020, 0, ++day), new Date(2020, 0, day)); // a new stat every time
  for (const ignore of ['', 'none']) {
    if (ignore) git(s.r, 'config', '-f', '.gitmodules', 'submodule.lib.ignore', ignore); // the command line still wins
    touch();
    assert.ok(plainStatus(s.r, s.marker), 'the payload is live');
    for (const args of [['status', '--porcelain=v1', '--branch', '--untracked-files=no', '--', '.', ':(exclude).flowboard'], ['diff', '--no-color', 'HEAD']]) {
      touch();
      const r = hostGit(s.r, s.r, args);
      assert.ok(!('refused' in r) && r.status === 0, JSON.stringify(r));
      assert.equal(existsSync(s.marker), false, `${args[0]} with .gitmodules ignore=${ignore || 'unset'}`);
    }
  }
  assert.deepEqual(repoGitDirs(s.r, sub), { error: planted(sub, s.r) });
});

test('a folder outside the repo, a repo whose .git is a file, and a folder in no repo are refused', (t) => {
  const s = setup(t);
  assert.deepEqual(repoGitDirs(s.r, s.base), { error: `${s.base} is not inside ${s.r}` });
  const sep = join(s.base, 'sep');
  git(s.base, 'init', '-q', '--separate-git-dir', join(s.base, 'sep.git'), sep);
  assert.deepEqual(repoGitDirs(sep, sep), { error: `${join(sep, '.git')} is a file; FlowBoard needs the repo's git dir at ${join(sep, '.git')}` });
  // A link sits in the folder a box writes, so the box could point it at a git dir of its own.
  const linked = join(s.base, 'linked');
  mkdirSync(linked);
  symlinkSync(s.common, join(linked, '.git'));
  assert.deepEqual(repoGitDirs(linked, linked), { error: `${join(linked, '.git')} is a link; FlowBoard needs the repo's git dir itself at ${join(linked, '.git')}` });
  // The git dir is not a folder to run git in: its hooks and config are what a box must not reach.
  assert.deepEqual(repoGitDirs(s.r, join(s.common, 'hooks')), { error: `${join(s.common, 'hooks')} is inside the repo's git dir` });
  assert.deepEqual(repoGitDirs(s.r, s.common), { error: `${s.common} is inside the repo's git dir` });
  const plain = join(s.base, 'plain');
  mkdirSync(plain);
  assert.deepEqual(repoGitDirs(plain, plain), { error: `${plain} is not a git repository`, noRepo: true });
  // A .git below a folder that is not a repo is a planted one, not "no repo".
  mkdirSync(join(plain, 'sub'));
  git(join(plain, 'sub'), 'init', '-q');
  assert.deepEqual(repoGitDirs(plain, join(plain, 'sub')), { error: planted(join(plain, 'sub'), plain) });
});
