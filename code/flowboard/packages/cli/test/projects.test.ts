import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunSummary } from '../src/flow-logs.ts';
import { projectLimits, projectSettings, setCheckCommand, setLimits } from '../src/project.ts';
import { APP_DEFAULTS } from '../src/settings.ts';
import { addApproval, createProject, projectSlug, readProjects, removeProject, repoProblems, repoRoot, seedOnce, slugify, updateProject, viewProjects } from '../src/projects.ts';

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

  const a = value(createProject(data, lib, { type: 'software', name: 'Billing', repoPath: repo() }));
  assert.deepEqual([a.slug, a.defaultFlow], ['billing', 'delivery']);
  const b = value(createProject(data, lib, { type: 'software', name: 'billing', repoPath: repo() }));
  assert.equal(b.slug, 'billing-2');
  assert.deepEqual(createProject(data, lib, { type: 'software', name: 'Again', repoPath: a.repoPath }), { ok: false, status: 409, error: `${a.repoPath} is already the project Billing` });
  assert.deepEqual(createProject(data, lib, { type: 'software', name: 'X', repoPath: repo(), slug: 'billing' }), { ok: false, status: 409, error: 'the slug billing is taken' });
  assert.deepEqual(createProject(data, lib, { type: 'software', name: 'X', repoPath: repo(), slug: 'Bad Slug' }), { ok: false, status: 400, error: 'a slug may only use lowercase letters, digits and -' });
  assert.deepEqual(createProject(data, lib, { type: 'software', name: ' ', repoPath: repo() }), { ok: false, status: 400, error: 'name the project' });
  assert.deepEqual(readProjects(data).map((p) => p.slug), ['billing', 'billing-2']);
});

test("the check command lives in the repo's .flowboard.yaml, beside what is there, and goes when emptied", () => {
  const data = temp();
  const lib = flows();
  const r = repo();
  writeFileSync(join(r, '.flowboard.yaml'), '# limits for this machine\nsandbox: { cpus: 2 }\n');
  const p = value(createProject(data, lib, { type: 'software', name: 'Api', repoPath: r, checkCommand: 'pnpm test' }));
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), '# limits for this machine\nsandbox: { cpus: 2 }\ncheck_command: pnpm test\n');
  assert.equal(viewProjects(readProjects(data), [], lib, APP_DEFAULTS)[0].checkCommand, 'pnpm test');

  const renamed = value(updateProject(data, lib, p.id, { name: 'API', defaultFlow: 'delivery', checkCommand: null }));
  assert.deepEqual([renamed.name, renamed.slug, renamed.defaultFlow], ['API', 'api', 'delivery']); // the slug stays
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), '# limits for this machine\nsandbox: { cpus: 2 }\n');
  assert.deepEqual(updateProject(data, lib, 'nope', { name: 'x' }), { ok: false, status: 404, error: 'no such project' });

  writeFileSync(join(r, '.flowboard.yaml'), 'check: oops\n');
  const bad = updateProject(data, lib, p.id, { checkCommand: 'pnpm lint' });
  assert.ok(!bad.ok && bad.status === 400 && bad.error.includes('check'), JSON.stringify(bad));
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), 'check: oops\n'); // a broken file is not written over
  assert.equal(viewProjects(readProjects(data), [], lib, APP_DEFAULTS)[0].problems.length, 1);

  const fresh = repo();
  const q = value(createProject(data, lib, { type: 'software', name: 'Web', repoPath: fresh, checkCommand: 'pnpm test' }));
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
  assert.deepEqual(p.overrides, { trust: 'trusted' }); // FlowBoard wrote it, so its sample runs work on this machine
  assert.equal(spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: p.repoPath, encoding: 'utf8' }).stdout.trim(), '1');
  assert.equal(viewProjects([p], [], lib, APP_DEFAULTS)[0].checkCommand, 'node --test');
  assert.equal(spawnSync('node', ['--test'], { cwd: p.repoPath }).status, 0);
  removeProject(data, p.id);
  seedOnce(data, lib);
  assert.deepEqual(readProjects(data), []); // removing the seed does not bring it back
});

test("a card counts the runs in the project's repo by status, and what the last seven days' runs cost", () => {
  const data = temp();
  const r = repo();
  const p = value(createProject(data, flows(), { type: 'software', name: 'Api', repoPath: r }));
  const now = new Date(2026, 10, 12, 12, 0, 0).getTime();
  const run = (name: string, folder: string, status: RunSummary['status'], spentUsd: number): RunSummary => ({ name, flow: 'delivery', folder, status, spentUsd });
  const [view] = viewProjects([p], [
    run('2026-11-12T09-00-00-delivery', r, 'running', 1.5),
    run('2026-11-10T09-00-00-delivery', join(r, 'packages/web'), 'done', 2), // a folder inside the repo is the project's
    run('2026-11-01T09-00-00-delivery', r, 'done', 40), // older than seven days: counted, not spent this week
    run('2026-11-12T10-00-00-delivery', `${r}-other`, 'failed', 9), // a sibling folder whose name starts the same is not
  ], temp(), APP_DEFAULTS, now);
  assert.deepEqual(view.runs, { running: 1, done: 2 });
  assert.equal(view.weekSpendUsd, 3.5);
});

test('registering keeps .flowboard/ out of commits and records the branch checked out as the base branch', () => {
  const data = temp();
  const lib = flows();
  const r = repo();
  const p = value(createProject(data, lib, { type: 'software', name: 'Api', repoPath: r }));
  assert.equal(p.baseBranch, 'main');
  assert.match(readFileSync(join(r, '.git', 'info', 'exclude'), 'utf8'), /^\.flowboard\/$/m);
  git(r, 'branch', 'release');
  assert.equal(value(updateProject(data, lib, p.id, { baseBranch: 'release' })).baseBranch, 'release');
  assert.deepEqual(updateProject(data, lib, p.id, { baseBranch: 'nope' }), { ok: false, status: 400, error: `${r} has no branch nope` });
  assert.equal(value(createProject(data, lib, { type: 'software', name: 'New', repoPath: repo(true) })).baseBranch, 'main'); // no commit yet, still a branch
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
  const p = value(updateProject(data, lib, value(createProject(data, lib, { type: 'software', name: 'Api', repoPath: r })).id, { defaultFlow: 'checked' }));
  assert.deepEqual(viewProjects([p], [], lib, APP_DEFAULTS)[0].problems, ["checked's lint, test run the project's check command, and none is set; set one, or a run will be refused"]);
  value(updateProject(data, lib, p.id, { checkCommand: 'make test' }));
  assert.deepEqual(viewProjects(readProjects(data), [], lib, APP_DEFAULTS)[0].problems, []); // the new .flowboard.yaml is untracked: not a change
});

const asResult = (r: { ok: true } | { ok: false; errors: string[] }) => (r.ok ? { ok: true as const, value: true } : { ok: false as const, error: r.errors.join('\n') });

test('limits go into the repo file next to the check command, and an empty one is removed', () => {
  const r = repo();
  value(asResult(setCheckCommand(r, 'node --test')));
  value(asResult(setLimits(r, { memoryMb: 2048, cpus: 1.5 })));
  assert.deepEqual(projectSettings(r), { ok: true, settings: { limits: { memoryMb: 2048, cpus: 1.5 }, checkCommand: 'node --test' } });
  value(asResult(setLimits(r, { cpus: 2 })));
  assert.match(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), /cpus: 2/);
  assert.doesNotMatch(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), /memory_mb/);
  assert.deepEqual(setLimits(r, { memoryMb: 63 }), { ok: false, errors: ['a whole number of MB, 64 or more'] });
  assert.deepEqual(setLimits(r, { cpus: 0 }), { ok: false, errors: ['more than 0; 1.5 is a CPU and a half'] });
  value(asResult(setLimits(r, {})));
  assert.doesNotMatch(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), /sandbox/);
  value(asResult(setCheckCommand(r, undefined)));
  assert.equal(existsSync(join(r, '.flowboard.yaml')), false);
});

test('a project gets its type: the type’s first flow, its source, and no overrides unless given', () => {
  const data = temp();
  const p = value(createProject(data, flows(), { name: 'api', repoPath: repo(), type: 'software', source: { kind: 'github', repo: 'flowboard/api' } }));
  assert.deepEqual([p.type, p.defaultFlow, p.source, p.overrides], ['software', 'delivery', { kind: 'github', repo: 'flowboard/api' }, {}]);
  assert.deepEqual(createProject(data, flows(), { name: 'x', repoPath: repo(), type: 'research' }), { ok: false, status: 400, error: 'Research projects are coming soon' });
  const empty = temp(); // a library without the type's flows: none to start on
  assert.equal(value(createProject(data, empty, { name: 'y', repoPath: repo(), type: 'software' })).defaultFlow, null);
});

test('the slug: the name, else owner-name, else numbered; never a 409 for a clash', () => {
  const data = temp();
  const make = () => value(createProject(data, flows(), { name: 'web', owner: 'flowboard', repoPath: repo(), type: 'software' })).slug;
  assert.deepEqual([make(), make(), make()], ['web', 'flowboard-web', 'flowboard-web-2']);
  assert.equal(projectSlug(readProjects(data), 'Café Ünïcode', 'Some.Org'), 'cafe-unicode');
});

test('overrides and limits: kept on create, changed on edit, refused when invalid', () => {
  const data = temp();
  const r = repo();
  const p = value(createProject(data, flows(), { name: 'a', repoPath: r, type: 'software', overrides: { trust: 'untrusted' }, limits: { memoryMb: 1024 } }));
  assert.deepEqual(p.overrides, { trust: 'untrusted' });
  assert.deepEqual(projectLimits(r), { ok: true, limits: { memoryMb: 1024 } });
  assert.deepEqual(value(updateProject(data, flows(), p.id, { overrides: {} })).overrides, {});
  assert.deepEqual(updateProject(data, flows(), p.id, { overrides: { budget: { capUsd: -1, alertAt: 80, onLimit: 'pause' } } }), { ok: false, status: 400, error: 'a dollar amount above 0' });
  value(updateProject(data, flows(), p.id, { limits: { cpus: 2 } }));
  assert.deepEqual(projectLimits(r), { ok: true, limits: { cpus: 2 } });
  assert.deepEqual(createProject(data, flows(), { name: 'b', repoPath: repo(), type: 'software', overrides: { network: ['x'] } as never }).ok, false);
  const [view] = viewProjects(readProjects(data), [], flows(), APP_DEFAULTS);
  assert.deepEqual(view.settings.trust, { value: 'normal', from: 'type' });
  assert.deepEqual(view.limits, { cpus: 2 });
});

test('a repo cannot grant itself trust, network or budget: its file is refused, the record is not touched', () => {
  const r = repo();
  writeFileSync(join(r, '.flowboard.yaml'), 'trust: trusted\nnetwork: [evil.example]\nbudget_usd: 1000\n');
  assert.equal(projectSettings(r).ok, false);
  const data = temp();
  const p = value(createProject(data, flows(), { name: 'R', repoPath: r, type: 'software', limits: { memoryMb: 1024 }, checkCommand: 'make' }));
  assert.deepEqual(p.overrides, {});
  assert.equal(readFileSync(join(r, '.flowboard.yaml'), 'utf8'), 'trust: trusted\nnetwork: [evil.example]\nbudget_usd: 1000\n'); // registered, its file not written
  const [view] = viewProjects(readProjects(data), [], flows(), APP_DEFAULTS);
  assert.deepEqual([view.settings.trust.value, view.settings.budget.value.capUsd], ['normal', null]);
  assert.ok(view.problems.some((x) => x.includes('.flowboard.yaml')), view.problems.join('\n'));
});

test('a record from before types reads as a local software project with nothing overridden', () => {
  const data = temp();
  writeFileSync(join(data, 'projects.json'), JSON.stringify([{ id: '1', name: 'Old', slug: 'old', repoPath: repo(), defaultFlow: null, baseBranch: 'main', createdAt: '2026-11-01T00:00:00.000Z' }]));
  const [p] = readProjects(data);
  assert.deepEqual([p.type, p.source, p.overrides], ['software', { kind: 'local' }, {}]);
});

test('approvals: saved on the record without repeats, replaced by an edit, and a rule that does not pass is a 400', () => {
  const data = temp();
  const lib = flows();
  const p = value(createProject(data, lib, { type: 'software', name: 'A', repoPath: repo() }));
  assert.equal(p.approvals, undefined); // a record from before approvals has none
  const rule = { kind: 'shell', prefix: 'pnpm test' } as const;
  value(addApproval(data, p.id, rule));
  value(addApproval(data, p.id, { ...rule }));
  value(addApproval(data, p.id, { kind: 'edit' }));
  assert.deepEqual(readProjects(data)[0].approvals, [rule, { kind: 'edit' }]);
  assert.deepEqual(value(updateProject(data, lib, p.id, { approvals: [] })).approvals, []);
  assert.deepEqual(readProjects(data)[0].approvals, []);
  assert.deepEqual(value(updateProject(data, lib, p.id, { approvals: [{ kind: 'shell', prefix: ' pnpm test ' }] })).approvals, [rule]); // saved as parsed: trimmed
  const bad = { ok: false, status: 400, error: "an approval is { kind: 'edit' } or { kind: 'shell', prefix }" };
  assert.deepEqual(updateProject(data, lib, p.id, { approvals: [{ kind: 'shell', prefix: '' }] as never }), bad);
  assert.deepEqual(addApproval(data, p.id, { kind: 'shell', prefix: 'ls; rm' }), bad);
  assert.deepEqual(addApproval(data, 'nope', rule), { ok: false, status: 404, error: 'no such project' });
});

test("a submodule's .git a box replaced is never read by the checkout check; a repo whose .git is a file is a problem", (t) => {
  const base = temp();
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const r = repo();
  t.after(() => rmSync(r, { recursive: true, force: true }));
  const lib = join(base, 'lib');
  mkdirSync(lib);
  git(lib, 'init', '-q', '-b', 'main');
  writeFileSync(join(lib, 'f.txt'), 'f\n');
  git(lib, 'add', 'f.txt');
  git(lib, 'commit', '-qm', 'lib');
  git(r, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'lib');
  git(r, 'commit', '-qm', 'lib');
  const marker = join(base, 'PWNED');
  const sub = join(r, 'lib');
  rmSync(join(sub, '.git'));
  git(sub, 'init', '-q');
  git(sub, 'add', 'f.txt');
  git(sub, 'commit', '-qm', 'box');
  git(sub, 'config', 'core.fsmonitor', `touch '${marker}'; false`);
  git(sub, 'config', 'filter.x.clean', `sh -c "touch '${marker}'; cat"`);
  writeFileSync(join(sub, '.gitattributes'), '* filter=x\n');
  for (const ignore of ['', 'none']) {
    if (ignore) git(r, 'config', '-f', '.gitmodules', 'submodule.lib.ignore', ignore); // a box can write .gitmodules too
    utimesSync(join(sub, 'f.txt'), new Date(2020, 0, ignore ? 2 : 1), new Date(2020, 0, ignore ? 2 : 1));
    repoProblems({ repoPath: r, baseBranch: 'main' });
    assert.equal(existsSync(marker), false, `.gitmodules ignore=${ignore || 'unset'}`);
  }
  const sep = join(base, 'sep');
  git(base, 'init', '-q', '-b', 'main', '--separate-git-dir', join(base, 'sep.git'), sep);
  assert.deepEqual(repoProblems({ repoPath: sep, baseBranch: 'main' }), [`${join(sep, '.git')} is a file; FlowBoard needs the repo's git dir at ${join(sep, '.git')}`]);
});

test('a repo inside another project\'s repo is not registered: a sandboxed run may have made its .git', () => {
  const data = temp();
  const lib = flows();
  const outer = repo();
  const inner = join(outer, 'inner');
  mkdirSync(inner);
  git(inner, 'init', '-q', '-b', 'main');
  const p = value(createProject(data, lib, { type: 'software', name: 'Outer', repoPath: outer }));
  assert.deepEqual(createProject(data, lib, { type: 'software', name: 'Inner', repoPath: inner }), {
    ok: false,
    status: 409,
    error: `${inner} is inside project ${p.name}'s repo; a sandboxed run may have made its .git. Register the outer repo, or remove ${join(inner, '.git')} if FlowBoard's runs made it`,
  });
  assert.equal(readProjects(data).length, 1);
  [data, lib, outer].forEach((d) => rmSync(d, { recursive: true, force: true }));
});

test("a folder whose .git points git's work tree elsewhere is not registered: a sandboxed run may have made it", () => {
  const data = temp();
  const lib = flows();
  const outer = repo();
  const other = repo(); // a repo of the person's, nowhere near
  value(createProject(data, lib, { type: 'software', name: 'Outer', repoPath: outer }));
  const sub = join(outer, 'sub');
  mkdirSync(sub);
  git(sub, 'init', '-q');
  git(sub, 'config', 'core.worktree', other);
  const before = readFileSync(join(other, '.git', 'info', 'exclude'), 'utf8');
  const r = createProject(data, lib, { type: 'software', name: 'Sub', repoPath: sub });
  assert.deepEqual(r, { ok: false, status: 400, error: `${sub} is not inside ${other}, the repo git names for it; a sandboxed run may have made its .git` });
  assert.equal(readProjects(data).length, 1);
  assert.equal(readFileSync(join(other, '.git', 'info', 'exclude'), 'utf8'), before);
  // A linked worktree is not a repo's own folder either: its git dir is elsewhere.
  git(other, 'worktree', 'add', '-q', '-b', 'w', join(data, 'w'));
  assert.deepEqual(repoRoot(join(data, 'w')), { ok: false, status: 400, error: `${join(data, 'w')}'s git dir is ${join(other, '.git', 'worktrees', 'w')}, not ${join(data, 'w', '.git')}; register the repo's own folder` });
  [data, lib, outer, other].forEach((d) => rmSync(d, { recursive: true, force: true }));
});
