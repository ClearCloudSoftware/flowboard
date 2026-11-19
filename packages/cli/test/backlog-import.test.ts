import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentImport, agentTasks, importBacklog, type RunLook } from '../src/backlog-import.ts';
import type { StartInput } from '../src/flow-start.ts';
import type { Project } from '../src/projects.ts';
import { db } from '../src/db.ts';
import { readTasks } from '../src/tasks.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'lr-import-')));
const project = (repoPath: string, id = 'p1'): Project => ({ id, name: 'P', slug: 'p', repoPath, defaultFlow: null, baseBranch: null, createdAt: '', type: 'software', source: { kind: 'local' }, overrides: {} });

/** A `startRun` that names runs `run-1`, `run-2`, … and keeps what it was asked. */
function starter() {
  const asked: StartInput[] = [];
  const start = async (_runs: string, _dir: string, input: StartInput) => {
    asked.push(input);
    return { ok: true as const, name: `run-${asked.length}` };
  };
  return { asked, start };
}
const refuses = async () => ({ ok: false as const, error: 'another run holds the folder' });
const ran = (status: 'done' | 'failed' | 'paused' | 'running', output?: string): RunLook => () => ({ status, output });

const BACKLOG = 'Sprint notes\n\n* AUTH-12: log out everywhere\n* fix login\n  AC: works on Safari';
const AGENT_OUT = JSON.stringify([
  { title: 'Log out everywhere', import_key: 'AUTH-12', body: '' },
  { title: 'Fix login', import_key: 'fix-the-login', body: '', acceptance_criteria: ['works on Safari'], non_goals: ['src/legacy/**'] },
]);

test('import: every backlog goes to the importer agent, as a run of the project on the backlog’s text', async () => {
  const data = temp();
  const p = project(temp());
  const { asked, start } = starter();
  assert.deepEqual(await importBacklog(data, temp(), p, { content: '## Even a tidy one' }, start), { ok: true, run: 'run-1' });
  assert.equal(asked[0].flow, 'backlog-importer');
  assert.equal(asked[0].folder, p.repoPath);
  assert.equal(asked[0].task, '## Even a tidy one');
  assert.ok(readFileSync(join(data, 'internal', 'backlog-importer.yaml'), 'utf8').includes('budget_usd'));
  assert.deepEqual(await agentImport(data, '', p.id, 'run-1', ran('running')), { status: 'running' });
  assert.deepEqual(await readTasks(data, p.id), [], 'nothing is imported while the agent reads');
});

test('import: the agent’s tasks map to task records; twice = 0 created, N updated; imported once per run', async () => {
  const data = temp();
  const p = project(temp());
  const { start } = starter();
  for (const [run, created, updated] of [['run-1', 2, 0], ['run-2', 0, 2]] as const) {
    await importBacklog(data, '', p, { content: BACKLOG }, start);
    const done = await agentImport(data, '', p.id, run, ran('done', `here:\n${AGENT_OUT}`));
    assert.deepEqual(done, { status: 'done', imported: { created, updated, skipped: 0, by: 'agent' } });
    // A second poll repeats the result; it does not import again.
    assert.deepEqual(await agentImport(data, '', p.id, run, ran('done', '[]')), done);
  }
  const tasks = await readTasks(data, p.id);
  assert.deepEqual(tasks.map((t) => [t.importKey, t.title, t.status]), [['auth-12', 'Log out everywhere', 'backlog'], ['fix-login', 'Fix login', 'backlog']]);
  assert.deepEqual(tasks[1].acceptanceCriteria, ['works on Safari']);
  assert.deepEqual(tasks[1].nonGoals, ['src/legacy/**']);
  assert.equal(await agentImport(data, '', 'other-project', 'run-1'), undefined);
  assert.equal(await agentImport(data, '', p.id, 'nope'), undefined);
});

test('import: on any agent failure the parser reads the backlog, and says why', async () => {
  const md = '## Backlog\n- **Filter list by status** — add a dropdown\n- **Export CSV**: from the table';
  const cases: [string, RunLook, string][] = [
    ['failed', ran('failed'), 'the importer agent failed'],
    ['paused', ran('paused'), 'the importer’s run paused'],
    ['gone', () => undefined, 'the importer’s run is gone'],
    ['unreadable', ran('done', 'sorry, no JSON'), 'the importer agent wrote no task list Lamproom can read'],
    ['empty', ran('done', '[]'), 'the importer agent found no task'],
  ];
  for (const [name, look, why] of cases) {
    const data = temp();
    const p = project(temp());
    await importBacklog(data, '', p, { content: md }, starter().start);
    assert.deepEqual(await agentImport(data, '', p.id, 'run-1', look), { status: 'done', imported: { created: 2, updated: 0, skipped: 0, by: 'parser', fallback: why } }, name);
  }
  // The run cannot start: the parser reads it in the request.
  const data = temp();
  const p = project(temp());
  assert.deepEqual(await importBacklog(data, '', p, { content: md }, refuses), {
    ok: true,
    imported: { created: 2, updated: 0, skipped: 0, by: 'parser', fallback: 'the importer agent did not start: another run holds the folder' },
  });
  // Neither path finds a task: the import fails.
  assert.deepEqual(await importBacklog(data, '', p, { content: 'just prose' }, refuses), { ok: false, status: 422, error: 'the importer agent did not start: another run holds the folder, and the parser found no task in the backlog either' });
  await importBacklog(data, '', p, { content: 'just prose' }, starter().start);
  assert.equal((await agentImport(data, '', p.id, 'run-1', ran('failed')))?.status, 'failed');
});

test('import: a task past the backlog is skipped; another project’s same key is its own task', async () => {
  const data = temp();
  const p = project(temp());
  await importBacklog(data, '', p, { content: '## One\nfirst' }, refuses);
  await db(data).task.updateMany({ data: { status: 'running' } });
  const again = await importBacklog(data, '', p, { content: '## One\nchanged' }, refuses);
  assert.ok(again.ok && 'imported' in again && again.imported.skipped === 1 && again.imported.updated === 0);
  assert.equal((await readTasks(data, p.id))[0].body, 'first');
  const other = await importBacklog(data, '', project(temp(), 'p2'), { content: '## One' }, refuses);
  assert.ok(other.ok && 'imported' in other && other.imported.created === 1);
});

test('import: a path must be a file in the repo, real path included; one input only', async () => {
  const data = temp();
  const repo = temp();
  const outside = join(temp(), 'secret.md');
  writeFileSync(outside, '## Secret');
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs', 'backlog.md'), '## In repo');
  symlinkSync(outside, join(repo, 'link.md'));
  const p = project(repo);
  const { asked, start } = starter();
  assert.deepEqual(await importBacklog(data, '', p, { path: 'docs/backlog.md' }, start), { ok: true, run: 'run-1' });
  assert.equal(asked[0].task, '## In repo');
  for (const path of [outside, 'link.md', 'nope.md', 'docs']) assert.equal((await importBacklog(data, '', p, { path }, start)).ok, false, path);
  assert.equal((await importBacklog(data, '', p, {}, start)).ok, false);
  assert.equal((await importBacklog(data, '', p, { content: '## A', path: 'docs/backlog.md' }, start)).ok, false);
  assert.equal((await importBacklog(data, '', p, { content: '  \n' }, start)).ok, false);
  assert.equal(asked.length, 1, 'a refused input starts no run');
});

test('agent output: keys are derived here; only an id found in the backlog is kept', () => {
  assert.deepEqual(agentTasks(`Here you go:\n${AGENT_OUT}\nDone.`, BACKLOG), {
    ok: true,
    tasks: [
      { title: 'Log out everywhere', body: undefined, import_key: 'auth-12' },
      { title: 'Fix login', body: undefined, acceptance_criteria: ['works on Safari'], non_goals: ['src/legacy/**'], import_key: 'fix-login' },
    ],
  });
  assert.equal(agentTasks('no list here', BACKLOG).ok, false);
  assert.equal(agentTasks('[{"name":"x"}]', BACKLOG).ok, false);
});

test('import: two polls of a finished run save its tasks once', async () => {
  const data = temp();
  const p = project(temp());
  await importBacklog(data, '', p, { content: BACKLOG }, starter().start);
  const [a, b] = await Promise.all([agentImport(data, '', p.id, 'run-1', ran('done', AGENT_OUT)), agentImport(data, '', p.id, 'run-1', ran('done', AGENT_OUT))]);
  assert.deepEqual([a?.status, b?.status].sort(), ['done', 'running']);
  assert.equal((await readTasks(data, p.id)).length, 2);
  assert.deepEqual(await agentImport(data, '', p.id, 'run-1', ran('done', '[]')), a?.status === 'done' ? a : b);
});
