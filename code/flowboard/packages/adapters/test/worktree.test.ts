import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worktreeWorkspace } from '../src/workspace/worktree.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();

/** A repo with one commit. */
function repo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fb-ws-'))); // macOS's temp folder is a link
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'f.txt'), 'one');
  git(dir, 'add', 'f.txt');
  git(dir, 'commit', '-qm', 'one');
  return dir;
}

test('create cuts a worktree on fb/task-<id> from HEAD and keeps the repo clean; a second create picks it up', async () => {
  const r = repo();
  const ws = worktreeWorkspace(r);
  const h = await ws.create({ id: 't1' });
  assert.deepEqual(h, { path: join(r, '.flowboard', 'worktrees', 'task-t1'), branch: 'fb/task-t1', reused: false });
  assert.equal(git(h.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'fb/task-t1');
  assert.equal(readFileSync(join(h.path, 'f.txt'), 'utf8'), 'one');
  assert.equal(git(r, 'status', '--porcelain'), '');
  assert.equal((readFileSync(join(r, '.git', 'info', 'exclude'), 'utf8').match(/^\.flowboard\/$/gm) ?? []).length, 1);
  assert.deepEqual(await ws.create({ id: 't1' }), { ...h, reused: true });
  assert.equal((readFileSync(join(r, '.git', 'info', 'exclude'), 'utf8').match(/^\.flowboard\/$/gm) ?? []).length, 1);
});

test('destroy refuses uncommitted work without force, and removes the folder and a merged branch', async () => {
  const r = repo();
  const ws = worktreeWorkspace(r);
  const { path } = await ws.create({ id: 't1' });
  writeFileSync(join(path, 'f.txt'), 'edited');
  await assert.rejects(ws.destroy({ id: 't1' }), /pass --force/);
  assert.ok(existsSync(path));
  assert.deepEqual(await ws.destroy({ id: 't1' }, { force: true }), {});
  assert.equal(existsSync(path), false);
  assert.equal(git(r, 'branch', '--list', 'fb/task-t1'), '');
  await assert.rejects(ws.destroy({ id: 't1' }), /task t1 has no workspace/);
});

test("destroy keeps a branch with unmerged commits, and the next create picks the task's work up again", async () => {
  const r = repo();
  const ws = worktreeWorkspace(r);
  const { path } = await ws.create({ id: 't1' });
  writeFileSync(join(path, 'g.txt'), 'work');
  git(path, 'add', 'g.txt');
  git(path, 'commit', '-qm', 'work');
  assert.deepEqual(await ws.destroy({ id: 't1' }), { branchKept: 'fb/task-t1' });
  assert.equal(existsSync(path), false);
  const again = await ws.create({ id: 't1' });
  assert.equal(again.reused, true);
  assert.equal(readFileSync(join(again.path, 'g.txt'), 'utf8'), 'work');
});

test('a worktree folder deleted by hand is made again', async () => {
  const r = repo();
  const ws = worktreeWorkspace(r);
  const { path } = await ws.create({ id: 't1' });
  execFileSync('rm', ['-rf', path]);
  assert.equal((await ws.create({ id: 't1' })).reused, true); // the branch was still there
  assert.ok(existsSync(join(path, 'f.txt')));
});

test('bad ids, a plain folder in the way, and a switched branch are refused', async () => {
  const r = repo();
  const ws = worktreeWorkspace(r);
  for (const id of ['', '-x', '../x', 'a/b', 'a b', '.x']) await assert.rejects(ws.create({ id }), /task id/, id);
  mkdirSync(join(r, '.flowboard', 'worktrees', 'task-plain'), { recursive: true });
  await assert.rejects(ws.create({ id: 'plain' }), /is not a git worktree/);
  const { path } = await ws.create({ id: 't1' });
  git(path, 'switch', '-q', '-c', 'other');
  await assert.rejects(ws.create({ id: 't1' }), /is on other, not fb\/task-t1/);
});

test("a worktree whose .git a box rewrote is refused, not picked up or cleaned with the box's git dir", async (t) => {
  const r = repo();
  t.after(() => rmSync(r, { recursive: true, force: true }));
  const ws = worktreeWorkspace(r);
  const { path } = await ws.create({ id: 't1' });
  git(path, 'init', '-q', '--bare', 'evil');
  git(path, '--git-dir', 'evil', 'config', 'core.bare', 'false');
  writeFileSync(join(path, '.git'), 'gitdir: evil\n');
  const planted = `${join(path, '.git')} was not made by git for ${r}; a sandboxed step may have written it. Remove it and check the repo.`;
  await assert.rejects(ws.create({ id: 't1' }), { message: planted });
  await assert.rejects(ws.destroy({ id: 't1' }), /does not point back/); // git's own check
});
