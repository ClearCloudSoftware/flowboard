import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, FlowState, NormalizedEvent, Question, RunResult, RunSpec } from '@flowboard/core';
import { askBroker } from '@flowboard/ask-user';
import { runFlow } from '../src/flow-run.ts';
import type { RunDeps } from '../src/run.ts';
import { DELIVERY, flowProject } from './fixtures/flow.ts';

const USAGE = [
  'usage: pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--max-runs <n>]',
];

type Play = 'pass' | 'fail' | 'none' | 'no-output' | 'error' | 'hang' | 'ask';
const COLOUR: Question = { id: 'colour', prompt: 'Colour?', kind: 'text' };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A provider whose n-th run of step S plays plays[S][n] (default `pass`); S is the step's prompt text. Every run
 * costs $0.10 and ends early, stopped, when stopped. `timeline` records start:S and end:S.
 */
function scripted(plays: Record<string, Play[]>) {
  const timeline: string[] = [];
  const specs: RunSpec[] = [];
  const counts: Record<string, number> = {};
  let live = 0;
  let maxLive = 0;
  const provider: AgentProvider = {
    id: 'scripted',
    capabilities: new Set(),
    resolveModel: (m) => m,
    launch: (spec) => {
      const step = (spec.prompt.template ?? '').trim();
      const n = counts[step] ?? 0;
      counts[step] = n + 1;
      const play = plays[step]?.[n] ?? 'pass';
      specs.push(spec);
      timeline.push(`start:${step}`);
      maxLive = Math.max(maxLive, ++live);
      const env = spec.tools?.find((t) => t.name === 'flowboard')?.env ?? {};
      let stop = () => {};
      let halted = false;
      const stopped = new Promise<void>((r) => (stop = r)).then(() => (halted = true));
      const result = (async (): Promise<RunResult> => {
        const usage = { ...ZERO_USAGE, costUsd: 0.1 };
        await delay(20); // long enough for parallel runs to overlap
        if (play === 'hang') await stopped;
        if (play === 'ask' && !halted) await askBroker(env.FLOWBOARD_ASK_SOCKET, { questions: [COLOUR] });
        timeline.push(`end:${step}`);
        live -= 1;
        if (halted) return { usage, exitCode: 1, error: 'stopped' };
        if (play === 'error') return { usage, exitCode: 1, error: 'boom' };
        if (['pass', 'fail', 'none', 'ask'].includes(play)) for (const o of spec.prompt.outputs) writeFileSync(o.path, step);
        if (play !== 'none') writeFileSync(env.FLOWBOARD_OUTCOME_FILE, JSON.stringify({ outcome: play === 'fail' ? 'fail' : 'pass' }));
        return { usage, exitCode: 0 };
      })();
      async function* events(): AsyncGenerator<NormalizedEvent> {
        await result;
      }
      return { sessionId: Promise.resolve('s-1'), pid: Promise.resolve(-1), events: events(), result, stop: () => stop() };
    },
  };
  return {
    makeProvider: () => provider,
    timeline,
    specs,
    get maxLive() {
      return maxLive;
    },
  };
}

const STAMPED = '2026-10-18T09-05-07-flow';

/** A temp flow project, deps that capture output, and a scripted provider. */
function setup(yaml = DELIVERY, plays: Record<string, Play[]> = {}) {
  const base = flowProject(yaml, Object.fromEntries(['build', 'b', 'join', 'lint', 'ship'].map((n) => [`prompts/${n}.md`, n])));
  const script = scripted(plays);
  const out: string[] = [];
  const err: string[] = [];
  const signals = new EventEmitter();
  const exits: number[] = [];
  const deps: RunDeps = {
    cwd: base,
    makeProvider: script.makeProvider,
    print: (l) => out.push(l),
    printErr: (l) => err.push(l),
    signals,
    exit: (c) => exits.push(c),
    now: () => new Date(2026, 9, 18, 9, 5, 7),
  };
  const runDir = join(base, 'runs', STAMPED);
  const state = () => JSON.parse(readFileSync(join(runDir, 'state.json'), 'utf8')) as FlowState;
  return { base, out, err, deps, script, runDir, state, signals, exits };
}

test('--check validates the flow and prints its size', async () => {
  const { out, err, deps } = setup();
  assert.equal(await runFlow(['--check', 'flow.yaml'], deps), 0);
  assert.deepEqual([out, err], [['-- flow ok: 5 steps'], []]);
});

test('a bad flow exits 2 with its errors on stderr and creates nothing', async () => {
  const { base, out, err, deps } = setup(DELIVERY.replace('folder: proj', 'folder: nope'));
  assert.equal(await runFlow(['flow.yaml'], deps), 2);
  assert.deepEqual([out, err], [[], [`flow.yaml: folder: not a directory: ${join(base, 'nope')}`]]);
  assert.equal(existsSync(join(base, 'runs')), false);
});

test('--mermaid prints the diagram', async () => {
  const { out, deps } = setup();
  assert.equal(await runFlow(['--mermaid', 'flow.yaml'], deps), 0);
  assert.equal(out[0], 'flowchart LR');
});

test('bad arguments print the usage and exit 2', async () => {
  const cases = [[], ['--nope', 'flow.yaml'], ['--check', '--mermaid', 'flow.yaml'], ['--allow-dirty', '--check', 'flow.yaml'], ['--resume', 'runs/x', 'flow.yaml'], ['a.yaml', 'b.yaml']];
  for (const args of cases) {
    const { err, deps } = setup();
    assert.equal(await runFlow(args, deps), 2, args.join(' '));
    assert.deepEqual(err, USAGE, args.join(' '));
  }
  for (const n of ['0', '1.5', 'x']) {
    const { err, deps } = setup();
    assert.equal(await runFlow(['--max-runs', n, 'flow.yaml'], deps), 2, n);
    assert.deepEqual(err, ['--max-runs: must be a whole number above 0'], n);
  }
});

// --- running flows

const HEAD = 'folder: proj\ntask: task.md\ndefaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }\n';
const FAILS_ONCE = `'test -f done.flag || { touch done.flag; echo "FAIL first"; exit 1; }'`;
const LINEAR = `${HEAD}steps:
  plan: { prompt: prompts/plan.md, produces: [plan] }
  build: { prompt: prompts/build.md, requires: [plan], produces: [notes] }
  check: { shell: 'test -s "$FLOWBOARD_ARTIFACTS/notes.md"', produces: [check_output] }
edges:
  - { from: plan, to: build }
  - { from: build, to: check }
`;
const FAN = `${HEAD}steps:
  plan: { prompt: prompts/plan.md }
  a: { prompt: prompts/a.md }
  b: { prompt: prompts/b.md }
  join: { prompt: prompts/join.md }
edges:
  - { from: plan, to: a }
  - { from: plan, to: b }
  - { from: a, to: join }
  - { from: b, to: join }
`;
const REWORK = `${HEAD}steps:
  build: { prompt: prompts/build.md, produces: [notes] }
  check: { shell: ${FAILS_ONCE}, produces: [check_output] }
edges:
  - { from: build, to: check }
  - { from: check, to: build, condition: on_fail }
`;
const SIBLING = `${HEAD}steps:
  build: { prompt: prompts/build.md, produces: [notes] }
  check: { shell: ${FAILS_ONCE}, produces: [check_output] }
  lint: { prompt: prompts/lint.md }
edges:
  - { from: build, to: check }
  - { from: build, to: lint }
  - { from: check, to: build, condition: on_fail }
`;
const GATE = `${HEAD}steps:
  review: { prompt: prompts/review.md }
  ship: { prompt: prompts/ship.md }
edges:
  - { from: review, to: ship, condition: on_pass }
`;
const TIMEOUT = `${HEAD}steps:\n  check: { shell: sleep 30, timeout_minutes: 0.005 }\n`;
const SHELL_ONLY = `${HEAD}steps:\n  check: { shell: 'exit 0' }\n`;
const SPLIT = `${HEAD}steps:
  plan: { prompt: prompts/plan.md }
  a: { prompt: prompts/a.md }
  b: { prompt: prompts/b.md }
edges:
  - { from: plan, to: a }
  - { from: plan, to: b }
`;

test('a linear flow runs each step once and ends done', async (t) => {
  process.env.FAKE_TOKEN = 'x';
  t.after(() => delete process.env.FAKE_TOKEN);
  const { base, out, deps, runDir, state } = setup(LINEAR);
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(state().status, 'done');
  for (const log of ['001-plan.jsonl', '002-build.jsonl', '003-check.jsonl']) assert.ok(existsSync(join(runDir, log)), log);
  const transitions = readFileSync(join(runDir, 'flow.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([transitions.length, transitions[0].event], [4, { type: 'start' }]);
  assert.ok(existsSync(join(base, 'proj', '.flowboard', STAMPED, 'plan.md')));
  assert.equal(existsSync(join(base, 'proj', '.flowboard', 'lock')), false);
  assert.ok(out.includes(`-- warning: ${join(base, 'proj')} is not in a git repository; nothing can undo the flow's edits`), out.join('\n'));
  const without = out.find((l) => l.startsWith('-- shell steps run without: '));
  assert.ok(without?.slice('-- shell steps run without: '.length).split(', ').includes('FAKE_TOKEN'), without);
  assert.equal(out.at(-1), '-- flow done: 3 runs, $0.20 spent, $0.00 wasted');
});

test('fan-out runs both branches at once, and the join waits for both', async () => {
  const { deps, script } = setup(FAN);
  assert.equal(await runFlow(['flow.yaml'], deps), 0);
  const at = (e: string) => script.timeline.indexOf(e);
  assert.ok(at('start:join') > at('end:a') && at('start:join') > at('end:b'), script.timeline.join(' '));
  assert.equal(script.maxLive, 2);
  const one = setup(FAN);
  assert.equal(await runFlow(['--max-runs', '1', 'flow.yaml'], one.deps), 0);
  assert.equal(one.script.maxLive, 1);
});

test('a failed check reworks its target, which reads the failing output', async () => {
  const { out, deps, script } = setup(REWORK);
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  const builds = script.specs.filter((s) => s.prompt.template === 'build');
  assert.ok(builds[1]?.prompt.inputs.some((i) => i.type === 'check_output'), JSON.stringify(builds[1]?.prompt.inputs));
  assert.equal(out.at(-1), '-- flow done: 4 runs, $0.20 spent, $0.10 wasted');
});

test('a rework stops a sibling run that is still going', async () => {
  const { out, deps, state } = setup(SIBLING, { lint: ['hang', 'pass'] });
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.deepEqual(state().runs.filter((r) => r.step === 'lint').map((r) => [r.wasted, r.error]), [[true, 'superseded'], [false, undefined]]);
});

test('a gate with no one to answer it pauses the flow', async () => {
  const { out, deps } = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow(['flow.yaml'], deps), 3);
  assert.ok(out.includes('-- review needs a decision'), out.join('\n'));
  assert.ok(out.some((l) => l.startsWith('-- flow paused: ')));
  assert.deepEqual(out.slice(-2), ['-- waiting for a decision: review', `-- continue with: pnpm run-flow --resume ${join('runs', STAMPED)}`]);
});

test('a step that runs past timeout_minutes is stopped and waits at a run_failed gate', async () => {
  const { out, deps, state } = setup(TIMEOUT);
  const at = Date.now();
  assert.equal(await runFlow(['flow.yaml'], deps), 3);
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
  assert.ok(out.includes('-- check attempt 1: failed: timed out after 0.005 minutes, $0.00'), out.join('\n'));
  assert.equal(state().steps.check.gate?.kind, 'run_failed');
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' });

test('uncommitted changes refuse a run unless --allow-dirty; untracked files do not count', async () => {
  const { base, err, deps } = setup(SHELL_ONLY);
  const proj = join(base, 'proj');
  git(proj, 'init', '-q');
  writeFileSync(join(proj, 'f.txt'), 'one');
  git(proj, 'add', 'f.txt');
  git(proj, 'commit', '-qm', 'one');
  writeFileSync(join(proj, 'f.txt'), 'two');
  assert.equal(await runFlow(['flow.yaml'], deps), 2);
  assert.deepEqual(err, ['flow.yaml: folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty']);
  assert.equal(existsSync(join(base, 'runs')), false);
  assert.equal(await runFlow(['--allow-dirty', 'flow.yaml'], deps), 0);
  git(proj, 'commit', '-qam', 'two');
  writeFileSync(join(proj, 'new.txt'), 'untracked');
  assert.equal(await runFlow(['flow.yaml'], deps), 0);
});

test('a live lock refuses the run; a stale one is replaced with a warning', async () => {
  const { base, out, err, deps } = setup(SHELL_ONLY);
  const lock = join(base, 'proj', '.flowboard', 'lock');
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, JSON.stringify({ pid: process.pid, runDir: 'runs/other' }));
  assert.equal(await runFlow(['flow.yaml'], deps), 2);
  assert.deepEqual(err, [`flow.yaml: folder: another run-flow (pid ${process.pid}) is working here on runs/other; if it is not, delete ${lock}`]);
  assert.equal(existsSync(join(base, 'runs')), false);
  const dead = spawnSync('true').pid;
  writeFileSync(lock, JSON.stringify({ pid: dead, runDir: 'runs/other' }));
  assert.equal(await runFlow(['flow.yaml'], deps), 0);
  assert.ok(out.includes(`-- warning: a run-flow (pid ${dead}) ended without cleaning up; check that none of its agents are still running`), out.join('\n'));
  assert.equal(existsSync(lock), false);
});

test('a host error stops every live run, saves the state and rethrows', async () => {
  const s = setup(SPLIT, { a: ['hang'] });
  let armed = false;
  s.deps.print = (l) => {
    s.out.push(l);
    if (l.startsWith('-- b attempt 1:')) armed = true;
  };
  s.deps.now = () => {
    if (!armed) return new Date(2026, 9, 18, 9, 5, 7);
    armed = false;
    throw new Error('disk full');
  };
  await assert.rejects(runFlow(['flow.yaml'], s.deps), /disk full/);
  const a = s.state().runs.find((r) => r.step === 'a');
  assert.deepEqual([a?.live, a?.wasted], [false, true]);
  assert.equal(existsSync(join(s.base, 'proj', '.flowboard', 'lock')), false);
  assert.ok(s.out.includes(`-- continue with: pnpm run-flow --resume ${join('runs', STAMPED)}`), s.out.join('\n'));
});

// --- gates and the terminal

/** An answerer that picks `decision` at every gate; `asked` records each batch. */
function deciding(decision: string) {
  const asked: Question[][] = [];
  const answer = async (questions: Question[]) => {
    asked.push(questions);
    return { decision, note: null };
  };
  const gate = () => asked.flat().find((q) => q.id === 'decision');
  return { asked, answer, gate };
}

const ONE_PLAN = `${HEAD}steps:\n  plan: { prompt: prompts/plan.md, produces: [plan] }\n`;
const ESCALATE = `${HEAD}steps:
  build: { prompt: prompts/build.md, produces: [notes], max_attempts: 2 }
  check: { shell: 'echo FAIL; exit 1', produces: [check_output] }
edges:
  - { from: build, to: check }
  - { from: check, to: build, condition: on_fail }
`;

test('a gate asks in the terminal; approving takes the pass route', async () => {
  const { out, deps, script } = setup(GATE, { review: ['none'] });
  const d = deciding('approve');
  deps.answer = d.answer;
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(d.gate()?.prompt, 'review: no outcome reported');
  assert.deepEqual(d.gate()?.options?.map((o) => o.value), ['approve', 'retry', 'fail']); // review has no on_fail edge
  assert.deepEqual(d.asked[0].map((q) => q.id), ['decision', 'note']);
  assert.ok(out.includes('-- review needs a decision'));
  assert.ok(script.timeline.includes('start:ship'));
});

test('a spent loop escalates with the failing output as evidence; failing the flow exits 1', async () => {
  const { base, out, deps } = setup(ESCALATE);
  const d = deciding('fail');
  deps.answer = d.answer;
  assert.equal(await runFlow(['flow.yaml'], deps), 1);
  assert.equal(d.gate()?.prompt, 'build: build has used 2 of 2 attempts');
  assert.equal(d.gate()?.help, `See: ${join(base, 'proj', '.flowboard', STAMPED, 'check_output.md')}`);
  assert.ok(out.at(-1)?.startsWith('-- flow failed: '), out.at(-1));
});

test('parallel agents ask one at a time, each batch headed with its step', async () => {
  const { out, deps } = setup(SPLIT, { a: ['ask'], b: ['ask'] });
  let open = 0;
  let most = 0;
  deps.answer = async () => {
    most = Math.max(most, ++open);
    await delay(30);
    open -= 1;
    return { colour: 'teal' };
  };
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(most, 1);
  assert.ok(out.includes('-- a asks:') && out.includes('-- b asks:'), out.join('\n'));
});

test('an agent that did not write its output waits at a gate; retry runs the next attempt', async () => {
  const { out, deps, script } = setup(ONE_PLAN, { plan: ['no-output', 'pass'] });
  const d = deciding('retry');
  deps.answer = d.answer;
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(d.gate()?.prompt, 'plan: did not write: plan');
  assert.ok(out.includes('-- plan attempt 2 (claude-code sonnet)'), out.join('\n'));
  assert.equal(script.specs.length, 2);
});

test('an infra failure waits at a gate offering retry or fail; retry runs the same attempt', async () => {
  const { out, deps } = setup(ONE_PLAN, { plan: ['error', 'pass'] });
  const d = deciding('retry');
  deps.answer = d.answer;
  assert.equal(await runFlow(['flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(d.gate()?.prompt, 'plan: run failed: boom');
  assert.deepEqual(d.gate()?.options?.map((o) => o.value), ['retry', 'fail']);
  assert.equal(out.filter((l) => l === '-- plan attempt 1 (claude-code sonnet)').length, 2);
});

// --- stopping and resuming

const RUN_DIR = join('runs', STAMPED);
const ONE_BUILD = `${HEAD}steps:\n  build: { prompt: prompts/build.md }\n`;
/** Calls `then` once `ready()` holds; checks every 5 ms. */
function when(ready: () => boolean, then: () => void) {
  const timer = setInterval(() => {
    if (!ready()) return;
    clearInterval(timer);
    then();
  }, 5);
}

test('Ctrl+C stops the flow, and --resume reruns the step it cut off', { timeout: 10_000 }, async () => {
  const s = setup(ONE_BUILD, { build: ['hang', 'pass'] });
  when(() => s.script.timeline.includes('start:build'), () => s.signals.emit('SIGINT'));
  assert.equal(await runFlow(['flow.yaml'], s.deps), 130);
  assert.ok(s.out.includes('-- stopping'), s.out.join('\n'));
  assert.ok(s.out.some((l) => l.startsWith('-- flow stopped: ')));
  assert.equal(s.out.at(-1), `-- continue with: pnpm run-flow --resume ${RUN_DIR}`);
  const stopped = s.state();
  assert.deepEqual([stopped.steps.build.state, stopped.runs[0].live, stopped.runs[0].wasted], ['running', false, true]);
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
  assert.deepEqual(s.state().runs.map((r) => [r.step, r.attempt]), [['build', 1], ['build', 1]]);
});

test('Ctrl+C stops a hanging check at once, and --resume reruns it', { timeout: 10_000 }, async () => {
  const s = setup(`${HEAD}steps:\n  check: { shell: 'test -f go.flag || sleep 30' }\n`);
  when(() => s.out.includes('-- check attempt 1 (shell)'), () => setTimeout(() => s.signals.emit('SIGINT'), 100));
  const at = Date.now();
  assert.equal(await runFlow(['flow.yaml'], s.deps), 130);
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
  writeFileSync(join(s.base, 'proj', 'go.flag'), '');
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
});

test('Ctrl+C at a gate prompt stops the flow like a first press', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  s.deps.answer = async () => {
    throw Object.assign(new Error('User force closed the prompt'), { name: 'ExitPromptError' });
  };
  assert.equal(await runFlow(['flow.yaml'], s.deps), 130);
  assert.equal(s.state().steps.review.state, 'awaiting_approval');
});

test('a paused flow resumes from its pinned copy and asks its open gate again', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow(['flow.yaml'], s.deps), 3);
  rmSync(join(s.base, 'flow.yaml')); // --resume runs the pinned flow.json
  s.deps.answer = deciding('approve').answer;
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
  assert.ok(s.out.includes(`-- resuming ${RUN_DIR}`));
  assert.ok(s.script.timeline.includes('start:ship'));
});

test('--resume refuses a missing state, another version, a finished flow and a held lock', { timeout: 10_000 }, async () => {
  const done = setup(SHELL_ONLY);
  assert.equal(await runFlow(['flow.yaml'], done.deps), 0);
  assert.equal(await runFlow(['--resume', 'runs/nope'], done.deps), 2);
  assert.equal(await runFlow(['--resume', RUN_DIR], done.deps), 2);
  const pinned = join(done.runDir, 'flow.json');
  writeFileSync(pinned, JSON.stringify({ ...JSON.parse(readFileSync(pinned, 'utf8')), version: 2 }));
  assert.equal(await runFlow(['--resume', RUN_DIR], done.deps), 2);
  assert.deepEqual(done.err, [
    'runs/nope: cannot resume: no state.json',
    `${RUN_DIR}: cannot resume: the flow already ended (done)`,
    `${RUN_DIR}: cannot resume: made by a different version of run-flow`,
  ]);
  const paused = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow(['flow.yaml'], paused.deps), 3);
  const lock = join(paused.base, 'proj', '.flowboard', 'lock');
  writeFileSync(lock, JSON.stringify({ pid: process.pid, runDir: 'runs/other' }));
  assert.equal(await runFlow(['--resume', RUN_DIR], paused.deps), 2);
  assert.deepEqual(paused.err, [`${RUN_DIR}: cannot resume: another run-flow (pid ${process.pid}) is working here on runs/other; if it is not, delete ${lock}`]);
});

test('state.json is written atomically, and a stray state.json.tmp is ignored', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow(['flow.yaml'], s.deps), 3);
  assert.equal(existsSync(join(s.runDir, 'state.json.tmp')), false);
  writeFileSync(join(s.runDir, 'state.json.tmp'), '{ half written');
  s.deps.answer = deciding('approve').answer;
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
});

test('a second Ctrl+C more than 300 ms after the first exits at once', { timeout: 10_000 }, async () => {
  const s = setup(ONE_BUILD, { build: ['hang'] });
  let clock = new Date(2026, 9, 18, 9, 5, 7).getTime();
  s.deps.now = () => new Date(clock);
  when(() => s.script.timeline.includes('start:build'), () => {
    s.signals.emit('SIGINT');
    clock += 100;
    s.signals.emit('SIGINT'); // within 300 ms: the same press, forwarded twice under pnpm
    clock += 400;
    s.signals.emit('SIGINT');
  });
  assert.equal(await runFlow(['flow.yaml'], s.deps), 130);
  assert.deepEqual(s.exits, [130]);
});
