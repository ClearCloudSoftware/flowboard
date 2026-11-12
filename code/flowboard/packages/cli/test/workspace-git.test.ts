import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worktreeWorkspace } from '@flowboard/adapters';
import { diffOf, dryRun, land, listWorkspaces, openRepo, preview, removeWorkspace, review, updateFromBase } from '../src/workspace-git.ts';
import type { Repo } from '../src/workspace-git.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();

/** A repo on main with one commit, a runs folder, and a helper to commit a file in any checkout. */
function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-wsg-')));
  const root = join(base, 'repo');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  // git's own name and address for the commits land() makes, which run git without -c
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'a.txt'), 'one\ntwo\nthree\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'start');
  const commit = (cwd: string, file: string, text: string, msg: string) => {
    writeFileSync(join(cwd, file), text);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-qm', msg);
    return git(cwd, 'rev-parse', '--short', 'HEAD');
  };
  const repo = () => openRepo(root) as Repo;
  return { base, root, runs: join(base, 'runs'), commit, repo };
}

test('the list names each workspace by where it stands against main', async () => {
  const s = setup();
  const ws = worktreeWorkspace(s.root);
  for (const id of ['merged', 'ahead', 'dirty', 'gone', 'plain', 'switched']) await ws.create({ id });
  const at = (id: string) => join(s.root, '.flowboard', 'worktrees', `task-${id}`);
  s.commit(at('ahead'), 'b.txt', 'b\n', 'add b');
  writeFileSync(join(at('dirty'), 'a.txt'), 'edited\n');
  execFileSync('rm', ['-rf', at('gone')]);
  git(s.root, 'worktree', 'prune');
  execFileSync('rm', ['-rf', at('plain')]);
  git(s.root, 'worktree', 'prune');
  mkdirSync(at('plain'));
  git(at('switched'), 'switch', '-q', '-c', 'other');
  const rows = Object.fromEntries(listWorkspaces(s.repo(), s.runs).map((r) => [r.id, r]));
  assert.deepEqual(Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.state])), {
    ahead: 'unmerged', dirty: 'dirty', gone: 'branch-only', merged: 'merged', plain: 'broken', switched: 'broken',
  });
  assert.equal(rows.ahead.ahead, 1);
  assert.deepEqual(rows.dirty.uncommitted, ['a.txt']);
  assert.match(rows.plain.problem!, /is not a git worktree$/);
  assert.equal(rows.switched.fix, `git -C ${at('switched')} switch fb/task-switched`);
  // a live lock makes it running
  mkdirSync(join(at('merged'), '.flowboard'), { recursive: true });
  writeFileSync(join(at('merged'), '.flowboard', 'lock'), JSON.stringify({ pid: process.pid }));
  assert.equal(listWorkspaces(s.repo(), s.runs).find((r) => r.id === 'merged')!.state, 'running');
});

test('the preview says what Start would do, and why it is refused', async () => {
  const s = setup();
  assert.deepEqual(preview(s.root, '', s.runs), { mode: 'folder', folder: s.root });
  mkdirSync(join(s.root, '.flowboard'));
  writeFileSync(join(s.root, '.flowboard', 'lock'), JSON.stringify({ pid: process.pid }));
  assert.match(preview(s.root, '', s.runs).refused!, /give this run a task workspace instead$/);
  const p = preview(s.root, 't1', s.runs);
  assert.equal(p.outcome, 'new');
  assert.equal(p.branch, 'fb/task-t1');
  assert.match(p.from!, /^main @ [0-9a-f]{7}$/);
  assert.match(preview(s.root, '../x', s.runs).refused!, /^task id "\.\.\/x": use letters/);
  await worktreeWorkspace(s.root).create({ id: 't1' });
  assert.equal(preview(s.root, 't1', s.runs).outcome, 'reused');
  writeFileSync(join(s.root, '.flowboard', 'worktrees', 'task-t1', 'new.txt'), 'x');
  assert.deepEqual([preview(s.root, 't1', s.runs).outcome, preview(s.root, 't1', s.runs).uncommitted], ['dirty', 1]);
  assert.match(preview('relative/path', 't1', s.runs).refused!, /absolute path/);
});

test('review lists both sides since the cut; a diff is the whole branch or one commit of it', async () => {
  const s = setup();
  await worktreeWorkspace(s.root).create({ id: 't1' });
  const wt = join(s.root, '.flowboard', 'worktrees', 'task-t1');
  const first = s.commit(wt, 'b.txt', 'b1\nb2\n', 'add b');
  s.commit(wt, 'a.txt', 'one\nTWO\nthree\n', 'shout two');
  const onMain = s.commit(s.root, 'a.txt', 'zero\none\ntwo\nthree\n', 'prepend zero');
  const r = review(s.root, 't1', s.runs);
  assert.ok(!('error' in r));
  assert.deepEqual(r.commits.map((c) => [c.subject, c.a, c.d, c.files]), [['shout two', 1, 1, 1], ['add b', 2, 0, 1]]);
  assert.deepEqual(r.baseCommits.map((c) => c.sha), [onMain]);
  assert.deepEqual(r.overlap, ['a.txt']);
  const all = diffOf(s.root, 't1');
  assert.ok(Array.isArray(all));
  assert.deepEqual(all.map((f) => [f.path, f.a, f.d]), [['a.txt', 1, 1], ['b.txt', 2, 0]]);
  assert.match(all[0].patch, /^@@ -1,3 \+1,3 @@\n one\n-two\n\+TWO\n three/);
  const one = diffOf(s.root, 't1', first);
  assert.ok(Array.isArray(one));
  assert.deepEqual(one.map((f) => f.path), ['b.txt']);
  assert.ok(Array.isArray(diffOf(s.root, 't1', onMain)), 'a commit main gained is part of the comparison');
  const start = git(s.root, 'rev-list', '--max-parents=0', 'HEAD').slice(0, 7);
  assert.match((diffOf(s.root, 't1', start) as { error: string }).error, /is not a commit of fb\/task-t1/);
});

test('a dry run finds the conflict; update from main undoes itself on one; landing merges and clean up then deletes the branch', async () => {
  const s = setup();
  await worktreeWorkspace(s.root).create({ id: 't1' });
  const wt = join(s.root, '.flowboard', 'worktrees', 'task-t1');
  s.commit(wt, 'a.txt', 'one\nBRANCH\nthree\n', 'branch edit');
  s.commit(s.root, 'a.txt', 'one\nMAIN\nthree\n', 'main edit');
  const d = dryRun(s.root, 't1', s.runs);
  assert.deepEqual([d.ok, !d.ok && d.conflicts], [false, ['a.txt']]);
  const before = git(wt, 'rev-parse', 'HEAD');
  const u = updateFromBase(s.root, 't1', s.runs);
  assert.deepEqual([u.ok, !u.ok && u.conflicts], [false, ['a.txt']]);
  assert.equal(git(wt, 'rev-parse', 'HEAD'), before, 'the failed rebase was undone');
  assert.equal(git(wt, 'status', '--porcelain'), '');
  const m = land(s.root, 't1', 'merge', 'Land t1', s.runs);
  assert.equal(m.ok, false, 'a conflicting merge is refused');
  assert.equal(git(s.root, 'status', '--porcelain', '--untracked-files=no'), '', 'and undone');
  // resolve on the branch, then it lands
  git(wt, 'merge', '-q', '-X', 'theirs', 'main', '-m', 'take main');
  assert.equal(dryRun(s.root, 't1', s.runs).ok, true);
  const ok = land(s.root, 't1', 'merge', 'Land t1\n\nFlowBoard-Task: t1', s.runs);
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(git(s.root, 'log', '-1', '--format=%s'), 'Land t1');
  assert.deepEqual(await removeWorkspace(s.root, '', 't1', false), { ok: true });
  assert.equal(git(s.root, 'branch', '--list', 'fb/task-t1'), '');
});

test('squash lands one commit and clean up keeps the branch; rebase-then-fast-forward moves main to the replayed commits', async () => {
  const s = setup();
  const ws = worktreeWorkspace(s.root);
  await ws.create({ id: 'sq' });
  await ws.create({ id: 'ff' });
  const at = (id: string) => join(s.root, '.flowboard', 'worktrees', `task-${id}`);
  s.commit(at('sq'), 's.txt', 's\n', 'sq one');
  s.commit(at('sq'), 's2.txt', 's\n', 'sq two');
  s.commit(at('ff'), 'f.txt', 'f\n', 'ff one');
  s.commit(s.root, 'm.txt', 'm\n', 'main moves');
  const sq = land(s.root, 'sq', 'squash', 'Squash sq', s.runs);
  assert.ok(sq.ok && sq.note?.includes('keeps fb/task-sq'), JSON.stringify(sq));
  assert.equal(git(s.root, 'log', '-1', '--format=%s'), 'Squash sq');
  assert.deepEqual(await removeWorkspace(s.root, '', 'sq', false), { ok: true, branchKept: 'fb/task-sq' });
  const ff = land(s.root, 'ff', 'ff', '', s.runs);
  assert.ok(ff.ok, JSON.stringify(ff));
  assert.equal(git(s.root, 'log', '-1', '--format=%s'), 'ff one');
  assert.equal(git(s.root, 'rev-parse', 'HEAD'), git(at('ff'), 'rev-parse', 'HEAD'));
  assert.ok(existsSync(join(s.root, 'f.txt')));
  assert.equal(readFileSync(join(s.root, 'm.txt'), 'utf8'), 'm\n');
});

test('landing refuses a dirty repo checkout, uncommitted work in the workspace, and an empty branch', async () => {
  const s = setup();
  await worktreeWorkspace(s.root).create({ id: 't1' });
  const empty = land(s.root, 't1', 'merge', 'x', s.runs);
  assert.ok(!empty.ok && /nothing to land/.test(empty.error));
  const wt = join(s.root, '.flowboard', 'worktrees', 'task-t1');
  s.commit(wt, 'b.txt', 'b\n', 'add b');
  writeFileSync(join(wt, 'b.txt'), 'changed\n');
  const dirtyWs = land(s.root, 't1', 'merge', 'x', s.runs);
  assert.ok(!dirtyWs.ok && /uncommitted file\(s\) in the workspace/.test(dirtyWs.error));
  git(wt, 'checkout', '--', 'b.txt');
  writeFileSync(join(s.root, 'a.txt'), 'dirty\n');
  const dirtyRepo = land(s.root, 't1', 'merge', 'x', s.runs);
  assert.ok(!dirtyRepo.ok && /uncommitted change\(s\) on main/.test(dirtyRepo.error));
});
