import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneJob, cloneTarget, recentParents, startClone, type CloneJob, type CloneInput } from '../src/clone.ts';
import type { Project } from '../src/projects.ts';
import { readProjects } from '../src/projects.ts';
import { readAppSettings } from '../src/app-settings.ts';
import { fakeGh } from './fake-gh.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-clone-')));
const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => (r.ok ? r.value : assert.fail(r.error));
/** A bare repo on `main` with one commit, as GitHub would serve it. */
const remote = () => {
  const work = temp();
  git(work, 'init', '-q', '-b', 'main');
  writeFileSync(join(work, 'README.md'), '# api\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'init');
  const bare = join(temp(), 'api.git');
  git(work, 'clone', '-q', '--bare', work, bare);
  return bare;
};
/** gh repo clone <repo> <folder> -- --progress: git's progress first, then a real clone of `bare`. */
const ghCloning = (repo: string, bare: string) =>
  fakeGh({
    [`repo clone ${repo} *`]:
      `printf 'remote: Counting objects:  50%% (1/2)\\rremote: Counting objects: 100%% (2/2), done.\\nReceiving objects:  50%% (1/2)\\rremote: Total 2 (delta 0)\\nReceiving objects: 100%% (2/2), done.\\n' >&2; git clone -q '${bare}' "$4"`,
  });
const flows = () => {
  const dir = temp();
  writeFileSync(join(dir, 'delivery.yaml'), 'budget_usd: 0\nsteps: { a: { shell: "true" } }\n');
  return dir;
};
const until = async (done: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; !done(); ) {
    if (Date.now() > end) assert.fail('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const input = (parent: string, over: Partial<CloneInput> = {}): CloneInput => ({ repo: 'flowboard/api', type: 'software', parent, makeDefault: false, overrides: {}, limits: {}, ...over });
const finished = async (job: CloneJob) => {
  await until(() => ['done', 'failed'].includes(cloneJob(job.id)!.phase));
  return cloneJob(job.id)!;
};

test('the target: the repo name in the parent, -2 when that holds something, an empty folder is used', () => {
  const parent = temp();
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web'));
  mkdirSync(join(parent, 'web'));
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web'));
  writeFileSync(join(parent, 'web', 'x'), '');
  assert.equal(cloneTarget(parent, 'web'), join(parent, 'web-2'));
  assert.equal(cloneTarget(parent, 'web', new Set([join(parent, 'web-2')])), join(parent, 'web-3')); // a clone in flight has it
});

test('folders used before: the parents of cloned repos, newest first, once each, without the default', () => {
  const p = (repoPath: string, createdAt: string, kind: 'github' | 'local' = 'github') => ({ repoPath, createdAt, source: kind === 'github' ? { kind, repo: 'o/n' } : { kind } }) as Project;
  const projects = [p('/a/code/x', '2026-11-01'), p('/b/work/y', '2026-11-03'), p('/a/code/z', '2026-11-02'), p('/h/FlowBoard/projects/q', '2026-11-04'), p('/data/scratch', '2026-11-05', 'local')];
  assert.deepEqual(recentParents(projects, '/h/FlowBoard/projects'), ['/b/work', '/a/code']);
});

test('a clone registers the project when git is done, with its overrides, and can save the parent as the default', async () => {
  const data = temp();
  const parent = temp();
  const job = value(startClone(data, flows(), input(parent, { makeDefault: true, overrides: { draft: true }, limits: { memoryMb: 2048 } }), ghCloning('flowboard/api', remote())));
  assert.equal(job.folder, join(parent, 'api'));
  const done = await finished(job);
  assert.equal(done.phase, 'done', done.error);
  assert.deepEqual([done.project!.source, done.project!.overrides, done.project!.baseBranch, done.project!.slug], [{ kind: 'github', repo: 'flowboard/api' }, { draft: true }, 'main', 'api']);
  assert.equal(done.pct, 100);
  assert.equal(readAppSettings(data).projectsFolder, parent);
  assert.equal(readProjects(data).length, 1);
  assert.ok(done.lines.includes('Receiving objects: 100% (2/2), done.'), done.lines.join('\n')); // progress replaces itself
  assert.ok(!done.lines.some((l) => l.includes(' 50%')), done.lines.join('\n')); // even with git's remote: lines between
  assert.ok(done.lines.includes('remote: Total 2 (delta 0)') && done.lines.includes('remote: Counting objects: 100% (2/2), done.'), done.lines.join('\n'));
  assert.ok(done.lines.includes('-- project api registered at /p/api: Software, Normal: container'), done.lines.join('\n'));
  assert.ok(done.lines.includes('-- wrote .flowboard.yaml: sandbox limits 2048 MB'), done.lines.join('\n'));
});

test('refused before cloning: a repo already a project, one being cloned, a bad repo name, a relative folder, bad overrides', async () => {
  const data = temp();
  const parent = temp();
  const gh = ghCloning('flowboard/api', remote());
  const first = value(startClone(data, flows(), input(parent), gh));
  assert.deepEqual(startClone(data, flows(), input(temp()), gh), { ok: false, status: 409, error: 'flowboard/api is being cloned' });
  await finished(first);
  assert.deepEqual(startClone(data, flows(), input(temp()), gh), { ok: false, status: 409, error: 'flowboard/api is already the project api' });
  assert.deepEqual(startClone(data, flows(), input(parent, { repo: 'a/--upload-pack=x' }), gh), { ok: false, status: 400, error: 'not a GitHub repository: a/--upload-pack=x' });
  assert.deepEqual(startClone(data, flows(), input('code', { repo: 'flowboard/web' }), gh), { ok: false, status: 400, error: 'a folder path: absolute, or starting with ~/' });
  assert.deepEqual(startClone(data, flows(), input(parent, { repo: 'flowboard/web', overrides: { budget: { capUsd: 0, alertAt: 80, onLimit: 'pause' } } }), gh), { ok: false, status: 400, error: 'a dollar amount above 0' });
  assert.deepEqual(startClone(data, flows(), input(parent, { repo: 'flowboard/web', limits: { memoryMb: 10 } }), gh), { ok: false, status: 400, error: 'a whole number of MB, 64 or more' });
  assert.deepEqual(startClone(data, flows(), input(parent, { repo: 'flowboard/web', type: 'data' }), gh), { ok: false, status: 400, error: 'Data projects are coming soon' });
});

test('a failed clone says why and registers nothing', async () => {
  const data = temp();
  const gh = fakeGh({ 'repo clone flowboard/gone *': "echo 'GraphQL: Could not resolve to a Repository with the name flowboard/gone.' >&2; exit 1" });
  const done = await finished(value(startClone(data, flows(), input(temp(), { repo: 'flowboard/gone' }), gh)));
  assert.deepEqual([done.phase, done.error], ['failed', 'GraphQL: Could not resolve to a Repository with the name flowboard/gone.']);
  assert.deepEqual(readProjects(data), []);
});

test('a repo whose .flowboard.yaml does not pass is still registered; the limits are not written, and the log says so', async () => {
  const work = temp();
  git(work, 'init', '-q', '-b', 'main');
  writeFileSync(join(work, '.flowboard.yaml'), 'trust: trusted\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'init');
  const bare = join(temp(), 'x.git');
  git(work, 'clone', '-q', '--bare', work, bare);
  const data = temp();
  const done = await finished(value(startClone(data, flows(), input(temp(), { repo: 'evil/x', limits: { memoryMb: 1024 } }), ghCloning('evil/x', bare))));
  assert.equal(done.phase, 'done', done.error);
  assert.ok(done.lines.includes('-- .flowboard.yaml in the repo does not pass, so the limits were not written; the project page says why'), done.lines.join('\n'));
  assert.equal(readProjects(data).length, 1);
});

test('a clone that goes quiet is stopped and fails, so the repo can be tried again', async () => {
  const data = temp();
  // not `sleep 30`: opensandbox-relay.test.ts pkills that, and the files run side by side
  const gh = fakeGh({ 'repo clone flowboard/stuck *': "echo 'Cloning into stuck...' >&2; sleep 25" });
  const started = Date.now();
  const done = await finished(value(startClone(data, flows(), input(temp(), { repo: 'flowboard/stuck' }), gh, 300)));
  assert.equal(done.phase, 'failed');
  assert.equal(done.error, 'git went quiet for 0.3 s, so the clone was stopped; check the network and the GitHub CLI’s login, then try again');
  assert.ok(Date.now() - started < 5000);
  assert.equal(startClone(data, flows(), input(temp(), { repo: 'flowboard/stuck' }), gh, 300).ok, true); // no longer "being cloned"
});

test('a clone that finished stays done after the quiet time has passed', async () => {
  const gh = fakeGh({ 'repo clone flowboard/api *': `git clone -q '${remote()}' "$4"; printf 'last words, no newline' >&2` });
  // long enough for a silent `git clone -q` on a busy machine; the last words then start a clock that must not fire
  const done = await finished(value(startClone(temp(), flows(), input(temp()), gh, 2000)));
  assert.equal(done.phase, 'done', done.error);
  await new Promise((r) => setTimeout(r, 2300));
  assert.equal(cloneJob(done.id)!.phase, 'done', cloneJob(done.id)!.error);
});
