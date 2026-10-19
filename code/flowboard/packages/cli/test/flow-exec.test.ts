import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from '@flowboard/core';
import type { RunCommand } from '@flowboard/core';
import { artifactPath, execShell, OUTPUT_TAIL, shellEnv } from '../src/flow-exec.ts';
import type { ExecContext } from '../src/flow-exec.ts';

const RUN: RunCommand = { type: 'run', run: 7, step: 'check', attempt: 1, inputs: [] };
const tmp = (name: string) => realpathSync(mkdtempSync(join(tmpdir(), `fb-${name}-`))); // macOS's temp folder is a link

/** Temp folder, artifacts and log folders, and a context for steps. */
function stepSetup(ctx: Partial<ExecContext> = {}) {
  const folder = tmp('folder');
  const full: ExecContext = {
    artifactsDir: tmp('art'),
    logDir: tmp('log'),
    show: () => {},
    now: () => new Date(2026, 9, 19, 9, 5, 7),
    makeProvider: () => assert.fail('no agent expected'),
    answer: async () => assert.fail('no question expected'),
    onInterrupt: () => {},
    ...ctx,
  };
  return { folder, ctx: full, artifact: (type: string) => readFileSync(artifactPath(full.artifactsDir, type), 'utf8') };
}

/** Runs `command` as the check step, which writes check_output. */
function check(command: string) {
  const s = stepSetup();
  return { ...s, run: execShell(command, s.folder, RUN, ['check_output'], s.ctx) };
}

test('a check that exits 0 passes, with its output in its artifact', async () => {
  const { run, artifact } = check('echo all good');
  assert.deepEqual(await run.ended, { costUsd: 0, outcome: 'pass' });
  assert.equal(artifact('check_output'), 'all good\n');
});

test('a failing check fails with a fingerprint of its output', async () => {
  assert.deepEqual(await check('echo boom; exit 1').run.ended, { costUsd: 0, outcome: 'fail', fingerprint: fingerprint('boom\n') });
});

test('a quiet failing check has no fingerprint, so it never counts as stuck', async () => {
  assert.deepEqual(await check('exit 1').run.ended, { costUsd: 0, outcome: 'fail' });
});

test('only the last OUTPUT_TAIL characters of a long output are kept', async () => {
  const { run, artifact } = check('printf HEAD; yes a | head -c 30000; printf TAIL');
  await run.ended;
  assert.equal(artifact('check_output'), `HEAD${'a\n'.repeat(15000)}TAIL`.slice(-OUTPUT_TAIL));
});

test('a shell step finds the artifacts in FLOWBOARD_ARTIFACTS', async () => {
  const { run, artifact, ctx } = check('echo "$FLOWBOARD_ARTIFACTS"');
  await run.ended;
  assert.equal(artifact('check_output'), `${ctx.artifactsDir}\n`);
});

test("secrets are removed from a shell step's environment", async (t) => {
  process.env.FAKE_TOKEN = 'x';
  t.after(() => delete process.env.FAKE_TOKEN);
  const { run, artifact } = check('echo "${FAKE_TOKEN:-gone}"');
  await run.ended;
  assert.equal(artifact('check_output'), 'gone\n');
  assert.ok(shellEnv(process.env).removed.includes('FAKE_TOKEN'));
  assert.deepEqual(shellEnv({ PATH: '/bin', OPENAI_API_KEY: '1', gh_token: '2', DB_PASSWORD: '3', MY_SECRET: '4', KEYS: '5' }), {
    env: { PATH: '/bin', KEYS: '5' },
    removed: ['DB_PASSWORD', 'MY_SECRET', 'OPENAI_API_KEY', 'gh_token'],
  });
});

test('stop() ends a hanging check and the commands it started within 2 s', async () => {
  const { run } = check('test -n x && sleep 30');
  await new Promise((r) => setTimeout(r, 200)); // sh has started sleep
  const at = Date.now();
  run.stop();
  assert.deepEqual(await run.ended, { costUsd: 0, error: 'stopped' });
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
});

test('a check that cannot start ends with an error, not an outcome', async () => {
  const s = stepSetup();
  const end = await execShell('true', join(s.folder, 'missing'), RUN, ['check_output'], s.ctx).ended;
  assert.deepEqual([end.costUsd, end.outcome, typeof end.error], [0, undefined, 'string']);
});

test('each shell run logs a start line and a result line', async () => {
  const s = stepSetup();
  await execShell('exit 3', s.folder, RUN, ['check_output'], s.ctx).ended;
  const lines = readFileSync(join(s.ctx.logDir, '007-check.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([lines[0].kind, lines[0].command, lines.at(-1).kind, lines.at(-1).exitCode, lines.at(-1).outcome], ['start', 'exit 3', 'result', 3, 'fail']);
});
