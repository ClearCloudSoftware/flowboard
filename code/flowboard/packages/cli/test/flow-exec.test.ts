import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, NormalizedEvent, RunCommand, RunResult, RunSpec } from '@flowboard/core';
import { configFromObject } from '../src/config.ts';
import type { RunConfig } from '../src/config.ts';
import { artifactPath, execAi, execShell, OUTPUT_TAIL, shellEnv } from '../src/flow-exec.ts';
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

test('a check that deletes the artifacts folder, as git clean -fdx does, still gets its output saved', async () => {
  const { run, artifact } = check('rm -rf "$FLOWBOARD_ARTIFACTS"; echo cleaned');
  assert.deepEqual(await run.ended, { costUsd: 0, outcome: 'pass' });
  assert.equal(artifact('check_output'), 'cleaned\n');
});

test('a check ends when its shell exits, and a background command it left is stopped', async () => {
  const { run, artifact, folder } = check('sleep 5 & echo $! > bg.pid; echo started');
  const at = Date.now();
  assert.deepEqual(await run.ended, { costUsd: 0, outcome: 'pass' });
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
  assert.equal(artifact('check_output'), 'started\n');
  const pid = Number(readFileSync(join(folder, 'bg.pid'), 'utf8'));
  await new Promise((r) => setTimeout(r, 100));
  assert.throws(() => process.kill(pid, 0), 'the background sleep is still running');
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

// --- agent steps

/** What the fake agent does: write some of its outputs and the set_outcome file, then end like this. */
interface Script { write?: string[]; reported?: object; outcome?: 'pass' | 'fail'; error?: string; exitCode?: number; throws?: string }

/** A provider whose run follows `script` and costs $0.10; `specs` records each spec it was launched with. */
function agent(script: Script = {}) {
  const specs: RunSpec[] = [];
  const provider: AgentProvider = {
    id: 'fake',
    capabilities: new Set(),
    resolveModel: (m) => m,
    launch: (spec) => {
      specs.push(spec);
      for (const o of spec.prompt.outputs) if (script.write?.includes(o.type)) writeFileSync(o.path, 'done');
      const file = spec.tools?.find((x) => x.name === 'flowboard')?.env?.FLOWBOARD_OUTCOME_FILE;
      if (script.reported && file) writeFileSync(file, JSON.stringify(script.reported));
      const result: RunResult = { usage: { ...ZERO_USAGE, costUsd: 0.1 }, exitCode: script.exitCode ?? 0 };
      if (script.outcome) result.outcome = script.outcome;
      if (script.error) result.error = script.error;
      async function* events(): AsyncGenerator<NormalizedEvent> {
        yield { type: 'assistant_text', text: 'hi' };
        if (script.throws) throw new Error(script.throws);
      }
      return { sessionId: Promise.resolve('s-1'), pid: Promise.resolve(-1), events: events(), result: Promise.resolve(result), stop: () => {} };
    },
  };
  return { provider, specs };
}

/** A run config for `folder`, through run-agent's own checks. */
function aiConfig(folder: string): RunConfig {
  writeFileSync(join(folder, 'task.md'), 'Build it.');
  const r = configFromObject({ adapter: 'claude-code', model: 'sonnet', folder: '.', prompt: 'task.md' }, folder);
  assert.ok(r.ok, JSON.stringify(r));
  return { yamlPath: join(folder, 'flow.yaml'), ...r.config };
}

const PLAN: RunCommand = { type: 'run', run: 7, step: 'plan', attempt: 1, inputs: [] };

/** Runs the plan step, which produces `plan`, with a fake agent following `script`. */
async function plan(script: Script, run: RunCommand = PLAN, before: (artifactsDir: string) => void = () => {}) {
  const { provider, specs } = agent(script);
  const shown: string[] = [];
  const s = stepSetup({ makeProvider: () => provider, show: (l) => shown.push(l) });
  before(s.ctx.artifactsDir);
  const end = await execAi(aiConfig(s.folder), run, ['plan'], s.ctx).ended;
  return { end, spec: specs[0], shown, ...s };
}

test('an agent step launches with its inputs, outputs, note, write roots and outcome file', async () => {
  const run: RunCommand = { ...PLAN, attempt: 2, inputs: ['brief', 'notes'], note: 'shorter' };
  const { spec, shown, ctx } = await plan({ write: ['plan'] }, run, (dir) => writeFileSync(artifactPath(dir, 'brief'), 'the brief'));
  assert.deepEqual(spec.prompt.inputs, [{ type: 'brief', path: artifactPath(ctx.artifactsDir, 'brief') }]);
  assert.deepEqual(spec.prompt.outputs, [{ type: 'plan', path: artifactPath(ctx.artifactsDir, 'plan') }]);
  assert.equal(spec.prompt.preamble, "Build it.\n\nA person's note for this attempt: shorter\n\nMissing inputs (an earlier step did not write them): notes");
  assert.ok(shown.includes('-- plan: missing input notes; it runs without it'), JSON.stringify(shown));
  assert.equal(spec.guards?.writeRoots.at(-1), ctx.artifactsDir);
  const env = spec.tools?.find((x) => x.name === 'flowboard')?.env ?? {};
  assert.deepEqual(Object.keys(env).sort(), ['FLOWBOARD_ASK_SOCKET', 'FLOWBOARD_OUTCOME_FILE']);
  assert.equal(env.FLOWBOARD_OUTCOME_FILE, join(ctx.logDir, '007-plan.outcome.json'));
  const noted = await plan({ write: ['plan'] }, { ...PLAN, note: 'shorter' });
  assert.ok(noted.spec.prompt.preamble.endsWith("\n\nA person's note for this attempt: shorter"), noted.spec.prompt.preamble);
});

test('the set_outcome file beats the result outcome; with neither, the outcome is unset', async () => {
  assert.deepEqual((await plan({ write: ['plan'], reported: { outcome: 'fail', reason: 'r' }, outcome: 'pass' })).end, { costUsd: 0.1, outcome: 'fail', reason: 'r' });
  assert.deepEqual((await plan({ write: ['plan'], outcome: 'pass' })).end, { costUsd: 0.1, outcome: 'pass' });
  assert.deepEqual((await plan({ write: ['plan'] })).end, { costUsd: 0.1 });
});

test('an output not written by this run is missing, even when an old copy is there', async () => {
  assert.deepEqual((await plan({})).end, { costUsd: 0.1, missing: ['plan'] });
  const old = (dir: string) => {
    writeFileSync(artifactPath(dir, 'plan'), 'last attempt');
    utimesSync(artifactPath(dir, 'plan'), new Date(2020, 0, 1), new Date(2020, 0, 1));
  };
  assert.deepEqual((await plan({}, PLAN, old)).end, { costUsd: 0.1, missing: ['plan'] });
});

test('a failed run ends with its error', async () => {
  assert.deepEqual((await plan({ error: 'boom' })).end, { costUsd: 0.1, error: 'boom' });
  assert.deepEqual((await plan({ exitCode: 3 })).end, { costUsd: 0.1, error: 'exit code 3' });
  assert.equal((await plan({ throws: 'stream died' })).end.error, 'stream died');
});

test('stop() before the agent is launched ends stopped and launches nothing', async () => {
  const { provider, specs } = agent();
  const s = stepSetup({ makeProvider: () => provider });
  const run = execAi(aiConfig(s.folder), PLAN, ['plan'], s.ctx);
  run.stop();
  assert.deepEqual(await run.ended, { costUsd: 0, error: 'stopped' });
  assert.equal(specs.length, 0);
});

test('each agent run logs start, event and result lines', async () => {
  const { ctx } = await plan({ write: ['plan'] });
  const kinds = readFileSync(join(ctx.logDir, '007-plan.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind);
  assert.deepEqual(kinds, ['start', 'event', 'result']);
});

test('a step run reports its end even when its log cannot be written', async () => {
  // No log folder: the run cannot be set up, and says so instead of throwing.
  const missing = stepSetup({ logDir: '/nonexistent/fb-logs' });
  const shell = await execShell('exit 0', missing.folder, RUN, ['check_output'], missing.ctx).ended;
  assert.match(shell.error ?? '', /^cannot set up the run: /);
  const { provider, specs } = agent({ write: ['plan'] });
  const ai = await execAi(aiConfig(missing.folder), PLAN, ['plan'], { ...missing.ctx, makeProvider: () => provider }).ended;
  assert.match(ai.error ?? '', /^cannot set up the run: /);
  assert.equal(specs.length, 0);
  // A clock that fails after the first log line: the run still ends; a check keeps its verdict.
  let calls = 0;
  const failing = () => {
    if (++calls > 1) throw new Error('disk full');
    return new Date(2026, 9, 19, 9, 5, 7);
  };
  const s = stepSetup({ now: failing });
  assert.deepEqual(await execShell('exit 0', s.folder, RUN, ['check_output'], s.ctx).ended, { costUsd: 0, outcome: 'pass' });
  calls = 0;
  const a = stepSetup({ now: failing, makeProvider: () => agent({ write: ['plan'] }).provider });
  assert.equal((await execAi(aiConfig(a.folder), PLAN, ['plan'], a.ctx).ended).error, 'disk full');
});
