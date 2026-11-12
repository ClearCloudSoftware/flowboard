import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunSummary } from '../src/flow-logs.ts';
import { createProject, readProjects, removeProject, repoProblems, repoRoot, seedOnce, slugify, updateProject, viewProjects } from '../src/projects.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-projects-'))); // macOS's temp folder is a link
const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
/** A repo on `main` with one commit, or none when `bare`. */
const repo = (bare = false) => {
  const dir = temp();
  git(dir, 'init', '-q', '-b', 'main');
  if (!bare) git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
};
const flows = () => {
  const dir = temp();
  writeFileSync(join(dir, 'delivery.yaml'), 'budget_usd: 0\nsteps: { a: { shell: "true" } }\n');
  return dir;
};
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => (r.ok ? r.value : assert.fail(r.error));

test('a project is a git repo: its top folder is stored, and a path that is not one is refused with why', () => {
  const r = repo();
  mkdirSync(join(r, 'src'));
  assert.equal(value(repoRoot(join(r, 'src'))), r);
  assert.deepEqual(repoRoot('code/x'), { ok: false, status: 400, error: 'the repo folder must be an absolute path, or start with ~/' });
  assert.deepEqual(repoRoot(join(r, 'nope')), { ok: false, status: 400, error: `${join(r, 'nope')}: no such folder` });
  const plain = temp();
  assert.deepEqual(repoRoot(plain), { ok: false, status: 400, error: `${plain}: not in a git repository; run git init there first` });
});

test('creating: the slug comes from the name, numbered past one in use; a repo or a slug already taken is a 409', () => {
  const data = temp();
  const lib = flows();
  assert.equal(slugify('  Billing Service (v2)! '), 'billing-service-v2');
  assert.equal(slugify('Café'), 'cafe');
  assert.equal(slugify('!!!'), 'project');

  const a = value(createProject(data, lib, { name: 'Billing', repoPath: repo(), defaultFlow: 'delivery' }));
  assert.deepEqual([a.slug, a.defaultFlow], ['billing', 'delivery']);
  const b = value(createProject(data, lib, { name: 'billing', repoPath: repo() }));
  assert.deepEqual([b.slug, b.defaultFlow], ['billing-2', null]);
  assert.deepEqual(createProject(data, lib, { name: 'Again', repoPath: a.repoPath }), { ok: false, status: 409, error: `${a.repoPath} is already the project Billing` });
  assert.deepEqual(createProject(data, lib, { name: 'X', repoPath: repo(), slug: 'billing' }), { ok: false, status: 409, error: 'the slug billing is taken' });
  assert.deepEqual(createProject(data, lib, { name: 'X', repoPath: repo(), slug: 'Bad Slug' }), { ok: false, status: 400, error: 'a slug may only use lowercase letters, digits and -' });
  assert.deepEqual(createProject(data, lib, { name: 'X', repoPath: repo(), defaultFlow: 'gone' }), { ok: false, status: 400, error: 'no flow "gone" in the library' });
  assert.deepEqual(createProject(data, lib, { name: ' ', repoPath: repo() }), { ok: false, status: 400, error: 'name the project' });
  assert.deepEqual(readProjects(data).map((p) => p.slug), ['billing', 'billing-2']);
});

test("the check command lives in the repo's .flowboard.yaml, beside what is there, and goes when emptied", () => {
  const data = temp();
  const lib = flows();
  const r = repo();
  writeFileSync(join(r, '.flowboard.yaml'), '# limits for this machine\nsandbox: { cpus: 2 }\n');
  const p = value(createProject(data, lib, { name: 'Api', repoPath: r, checkCommand: 'pnpm test' }));
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), '# limits for this machine\nsandbox: { cpus: 2 }\ncheck_command: pnpm test\n');
  assert.equal(viewProjects(readProjects(data), [], lib)[0].checkCommand, 'pnpm test');

  const renamed = value(updateProject(data, lib, p.id, { name: 'API', defaultFlow: 'delivery', checkCommand: null }));
  assert.deepEqual([renamed.name, renamed.slug, renamed.defaultFlow], ['API', 'api', 'delivery']); // the slug stays
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), '# limits for this machine\nsandbox: { cpus: 2 }\n');
  assert.deepEqual(updateProject(data, lib, 'nope', { name: 'x' }), { ok: false, status: 404, error: 'no such project' });

  writeFileSync(join(r, '.flowboard.yaml'), 'check: oops\n');
  const bad = updateProject(data, lib, p.id, { checkCommand: 'pnpm lint' });
  assert.ok(!bad.ok && bad.status === 400 && bad.error.includes('check'), JSON.stringify(bad));
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), 'check: oops\n'); // a broken file is not written over
  assert.equal(viewProjects(readProjects(data), [], lib)[0].problems.length, 1);

  const fresh = repo();
  const q = value(createProject(data, lib, { name: 'Web', repoPath: fresh, checkCommand: 'pnpm test' }));
  assert.equal(readFileSync(join(fresh, '.flowboard.yaml'), 'utf8'), 'check_command: pnpm test\n');
  value(updateProject(data, lib, q.id, { checkCommand: '' }));
  assert.equal(existsSync(join(fresh, '.flowboard.yaml')), false); // made for the command, gone with it

  assert.equal(removeProject(data, p.id), true);
  assert.equal(removeProject(data, p.id), false);
});

test('the first look seeds a scratch project with a commit and a passing check, once', () => {
  const data = temp();
  const lib = flows();
  seedOnce(data, lib);
  const [p] = readProjects(data);
  assert.deepEqual([p.name, p.slug, p.repoPath, p.defaultFlow], ['Scratch', 'scratch', join(data, 'scratch'), 'delivery']);
  assert.equal(spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: p.repoPath, encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(viewProjects([p], [], lib)[0].checkCommand, 'node --test');
  assert.equal(spawnSync('node', ['--test'], { cwd: p.repoPath }).status, 0);
  removeProject(data, p.id);
  seedOnce(data, lib);
  assert.deepEqual(readProjects(data), []); // removing the seed does not bring it back
});

test("a card counts the runs in the project's repo by status, and what the last seven days' runs cost", () => {
  const data = temp();
  const r = repo();
  const p = value(createProject(data, flows(), { name: 'Api', repoPath: r }));
  const now = new Date(2026, 10, 12, 12, 0, 0).getTime();
  const run = (name: string, folder: string, status: RunSummary['status'], spentUsd: number): RunSummary => ({ name, flow: 'delivery', folder, status, spentUsd });
  const [view] = viewProjects([p], [
    run('2026-11-12T09-00-00-delivery', r, 'running', 1.5),
    run('2026-11-10T09-00-00-delivery', join(r, 'packages/web'), 'done', 2), // a folder inside the repo is the project's
    run('2026-11-01T09-00-00-delivery', r, 'done', 40), // older than seven days: counted, not spent this week
    run('2026-11-12T10-00-00-delivery', `${r}-other`, 'failed', 9), // a sibling folder whose name starts the same is not
  ], temp(), now);
  assert.deepEqual(view.runs, { running: 1, done: 2 });
  assert.equal(view.weekSpendUsd, 3.5);
});

test("a flow type starts the project's own flow, named after it, and Empty starts an empty one", () => {
  const data = temp();
  const lib = flows();
  writeFileSync(join(lib, 'web.yaml'), 'budget_usd: 1\n'); // a flow already has the name: numbered past it
  const web = value(createProject(data, lib, { name: 'Web', repoPath: repo(), flowType: 'delivery' }));
  assert.equal(web.defaultFlow, 'web-2');
  assert.equal(readFileSync(join(lib, 'web-2.yaml'), 'utf8'), "# web's own flow, started from delivery.\n" + readFileSync(join(lib, 'delivery.yaml'), 'utf8'));
  const api = value(createProject(data, lib, { name: 'Api', repoPath: repo(), flowType: null }));
  assert.equal(api.defaultFlow, 'api');
  assert.match(readFileSync(join(lib, 'api.yaml'), 'utf8'), /^budget_usd: 0/);
  assert.deepEqual(createProject(data, lib, { name: 'X', repoPath: repo(), flowType: 'gone' }), { ok: false, status: 400, error: 'no flow "gone" in the library' });
});

test('registering keeps .flowboard/ out of commits and records the branch checked out as the base branch', () => {
  const data = temp();
  const lib = flows();
  const r = repo();
  const p = value(createProject(data, lib, { name: 'Api', repoPath: r }));
  assert.equal(p.baseBranch, 'main');
  assert.match(readFileSync(join(r, '.git', 'info', 'exclude'), 'utf8'), /^\.flowboard\/$/m);
  git(r, 'branch', 'release');
  assert.equal(value(updateProject(data, lib, p.id, { baseBranch: 'release' })).baseBranch, 'release');
  assert.deepEqual(updateProject(data, lib, p.id, { baseBranch: 'nope' }), { ok: false, status: 400, error: `${r} has no branch nope` });
  assert.equal(value(createProject(data, lib, { name: 'New', repoPath: repo(true) })).baseBranch, 'main'); // no commit yet, still a branch
});

test("a repo's checkout is checked against what a run needs", () => {
  const r = repo();
  assert.deepEqual(repoProblems({ repoPath: r, baseBranch: 'main' }), []);
  writeFileSync(join(r, 'a.txt'), 'a');
  git(r, 'add', 'a.txt');
  mkdirSync(join(r, '.flowboard'));
  writeFileSync(join(r, '.flowboard', 'lock'), ''); // FlowBoard's own, never counted
  git(r, 'checkout', '-q', '-b', 'topic');
  assert.deepEqual(repoProblems({ repoPath: r, baseBranch: 'main' }), [
    'topic is checked out, not the base branch main',
    '1 uncommitted change; a run will not start until they are committed or stashed',
  ]);
  git(r, 'commit', '-q', '-m', 'a');
  git(r, 'checkout', '-q', '--detach');
  assert.deepEqual(repoProblems({ repoPath: r, baseBranch: 'main' }), ['HEAD is detached; check out main']);
  assert.deepEqual(repoProblems({ repoPath: repo(true), baseBranch: 'main' }), ['the repo has no commits yet; commit once so work has something to branch from']);
});

test("a project whose default flow runs the check command, in a repo that sets none, is told so before a run", () => {
  const data = temp();
  const lib = flows();
  writeFileSync(join(lib, 'checked.yaml'), 'budget_usd: 0\nsteps:\n  lint: { shell: }\n  test: { shell: null }\n  build: { shell: make }\n');
  const r = repo();
  const p = value(createProject(data, lib, { name: 'Api', repoPath: r, defaultFlow: 'checked' }));
  assert.deepEqual(viewProjects([p], [], lib)[0].problems, ["checked's lint, test run the project's check command, and none is set; set one, or a run will be refused"]);
  value(updateProject(data, lib, p.id, { checkCommand: 'make test' }));
  assert.deepEqual(viewProjects(readProjects(data), [], lib)[0].problems, []); // the new .flowboard.yaml is untracked: not a change
});
