import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRun } from '../src/flow-start.ts';
import { registerProject } from './fixtures/flow.ts';

const project = () => {
  const base = mkdtempSync(join(tmpdir(), 'fb-start-'));
  const folder = join(base, 'proj');
  mkdirSync(folder);
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: folder, stdio: 'pipe' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  mkdirSync(join(base, 'flows'));
  writeFileSync(join(base, 'flows', 'quick.yaml'), 'budget_usd: 0\nsteps:\n  a: { shell: "true" }\n');
  registerProject(base, realpathSync(folder), 'trusted'); // in data/ where run-flow starts, as the app's
  return { base, folder, runs: join(base, 'runs'), flows: join(base, 'flows') };
};

test('a run started from the page is named as soon as run-flow makes its folder', { timeout: 30_000 }, async () => {
  const p = project();
  const r = await startRun(p.runs, p.flows, { flow: 'quick', folder: p.folder, task: 'do it' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.match(r.name, /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-quick$/);
  assert.ok(existsSync(join(p.runs, r.name, 'flow.json')));
});

test('a run run-flow refuses comes back with what it said', { timeout: 30_000 }, async () => {
  const p = project();
  const r = await startRun(p.runs, p.flows, { flow: 'quick', folder: join(p.base, 'nope'), task: 'do it' });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /nope/);
  assert.deepEqual(await startRun(p.runs, p.flows, { flow: 'quick', folder: 'rel', task: 'x' }), { ok: false, error: 'the folder must be an absolute path, or start with ~/' });
  assert.deepEqual(await startRun(p.runs, p.flows, { flow: '../x', folder: p.folder, task: 'x' }), { ok: false, error: '"../x": not a flow name' });
});
