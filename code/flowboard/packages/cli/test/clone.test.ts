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
  fakeGh({ [`repo clone ${repo} *`]: `printf 'Receiving objects:  50%% (1/2)\\rReceiving objects: 100%% (2/2), done.\\n' >&2; git clone -q '${bare}' "$4"` });
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

test('folders used before: the parents of projects’ repos, newest first, once each, without the default', () => {
  const p = (repoPath: string, createdAt: string) => ({ repoPath, createdAt }) as Project;
  const projects = [p('/a/code/x', '2026-11-01'), p('/b/work/y', '2026-11-03'), p('/a/code/z', '2026-11-02'), p('/h/FlowBoard/projects/q', '2026-11-04')];
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
  assert.ok(!done.lines.some((l) => l.includes(' 50%')), done.lines.join('\n'));
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
