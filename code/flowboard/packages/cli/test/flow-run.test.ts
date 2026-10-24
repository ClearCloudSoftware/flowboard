import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, FlowState, NormalizedEvent, Question, RunResult, RunSpec } from '@flowboard/core';
import { hostExecHost, ReplayProvider } from '@flowboard/adapters';
import type { Box } from '@flowboard/adapters';
import { askBroker } from '@flowboard/ask-user';
import { processStart } from '../src/flow-exec.ts';
import { DISCARD_COMMANDS, pushable, runFlow } from '../src/flow-run.ts';
import type { RunDeps } from '../src/run.ts';
import { DELIVERY, flowProject, RUN } from './fixtures/flow.ts';

const USAGE = [
  'usage: pnpm run-flow --folder <dir> --task <file> [--budget-usd <n>] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --check | --mermaid [--folder <dir> --task <file>] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--budget-usd <n>] [--max-runs <n>]',
];

type Play = 'pass' | 'fail' | 'none' | 'no-output' | 'error' | 'hang' | 'ask' | 'slow';
const COLOUR: Question = { id: 'colour', prompt: 'Colour?', kind: 'text' };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A provider whose n-th run of step S plays plays[S][n] (default `pass`); S is the step's prompt text. Every run
 * costs $0.10; one stopped ends early with tokens and no price, as a Claude run does. `timeline` records start:S and end:S.
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
        await delay(play === 'slow' ? 300 : 20); // long enough for parallel runs to overlap
        if (play === 'hang') await stopped;
        if (play === 'ask' && !halted) await askBroker(env.FLOWBOARD_ASK_SOCKET, { questions: [COLOUR] });
        timeline.push(`end:${step}`);
        live -= 1;
        if (halted) return { usage: { ...ZERO_USAGE, input: 1000 }, exitCode: 1, error: 'stopped' };
        if (play === 'error') return { usage, exitCode: 1, error: 'boom' };
        if (['pass', 'fail', 'none', 'ask', 'slow'].includes(play)) for (const o of spec.prompt.outputs) writeFileSync(o.path, step);
        // set_outcome is offered only where the verdict is read
        if (play !== 'none' && env.FLOWBOARD_OUTCOME_FILE) writeFileSync(env.FLOWBOARD_OUTCOME_FILE, JSON.stringify({ outcome: play === 'fail' ? 'fail' : 'pass' }));
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
  assert.deepEqual([out, err], [['-- flow ok: 5 steps, starting at plan'], []]);
});

test('a bad flow exits 2 with its errors on stderr and creates nothing', async () => {
  const { base, out, err, deps } = setup();
  assert.equal(await runFlow(['--folder', 'nope', '--task', 'task.md', 'flow.yaml'], deps), 2);
  assert.deepEqual([out, err], [[], [`flow.yaml: --folder: not a directory: ${join(base, 'nope')}`]]);
  assert.equal(existsSync(join(base, 'runs')), false);
});

test('--mermaid prints the diagram', async () => {
  const { out, deps } = setup();
  assert.equal(await runFlow(['--mermaid', 'flow.yaml'], deps), 0);
  assert.equal(out[0], 'flowchart LR');
});

test('bad arguments print the usage and exit 2', async () => {
  const cases = [
    [], ['--nope', 'flow.yaml'], ['--check', '--mermaid', 'flow.yaml'], ['--allow-dirty', '--check', 'flow.yaml'], ['--resume', 'runs/x', 'flow.yaml'], [...RUN, 'a.yaml', 'b.yaml'],
    ['flow.yaml'], ['--folder', 'proj', 'flow.yaml'], ['--check', '--task', 'task.md', 'flow.yaml'], ['--resume', 'runs/x', '--folder', 'proj'],
  ];
  for (const args of cases) {
    const { err, deps } = setup();
    assert.equal(await runFlow(args, deps), 2, args.join(' '));
    assert.deepEqual(err, USAGE, args.join(' '));
  }
  for (const n of ['0', '1.5', 'x']) {
    const { err, deps } = setup();
    assert.equal(await runFlow([...RUN, '--max-runs', n, 'flow.yaml'], deps), 2, n);
    assert.deepEqual(err, ['--max-runs: must be a whole number above 0'], n);
  }
  for (const n of ['x', '1e3', '.5']) {
    const { err, deps } = setup();
    assert.equal(await runFlow([...RUN, '--budget-usd', n, 'flow.yaml'], deps), 2, n);
    assert.deepEqual(err, ['--budget-usd: must be a number of dollars, 0 or more; 0 means no ceiling'], n);
  }
});

// --- running flows

const HEAD = 'budget_usd: 0\ndefaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }\n';
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
const REWORK = `${HEAD}entry: build
steps:
  build: { prompt: prompts/build.md, produces: [notes] }
  check: { shell: ${FAILS_ONCE}, produces: [check_output] }
edges:
  - { from: build, to: check }
  - { from: check, to: build, condition: on_fail }
`;
const SIBLING = `${HEAD}entry: build
steps:
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(state().status, 'done');
  for (const log of ['001-plan.jsonl', '002-build.jsonl', '003-check.jsonl']) assert.ok(existsSync(join(runDir, log)), log);
  const transitions = readFileSync(join(runDir, 'flow.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(transitions.map((t) => t.event.type), ['start', 'launched', 'run_ended', 'launched', 'run_ended', 'launched', 'run_ended']);
  assert.ok(existsSync(join(base, 'proj', '.flowboard', STAMPED, 'plan.md')));
  assert.equal(existsSync(join(base, 'proj', '.flowboard', 'lock')), false);
  assert.ok(out.includes(`-- warning: ${join(base, 'proj')} is not in a git repository; nothing can undo the flow's edits`), out.join('\n'));
  const without = out.find((l) => l.startsWith('-- shell steps run without: '));
  assert.ok(without?.slice('-- shell steps run without: '.length).split(', ').includes('FAKE_TOKEN'), without);
  assert.equal(out.at(-1), '-- flow done: 3 runs, $0.20 spent, $0.00 wasted');
});

test('fan-out runs both branches at once, and the join waits for both', async () => {
  const { deps, script } = setup(FAN);
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0);
  const at = (e: string) => script.timeline.indexOf(e);
  assert.ok(at('start:join') > at('end:a') && at('start:join') > at('end:b'), script.timeline.join(' '));
  assert.equal(script.maxLive, 2);
  const one = setup(FAN);
  assert.equal(await runFlow([...RUN, '--max-runs', '1', 'flow.yaml'], one.deps), 0);
  assert.equal(one.script.maxLive, 1);
});

test('a failed check reworks its target, which reads the failing output', async () => {
  const { out, deps, script } = setup(REWORK);
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
  const builds = script.specs.filter((s) => s.prompt.template === 'build');
  assert.ok(builds[1]?.prompt.inputs.some((i) => i.type === 'check_output'), JSON.stringify(builds[1]?.prompt.inputs));
  assert.equal(out.at(-1), '-- flow done: 4 runs, $0.20 spent, $0.10 wasted');
});

test('a rework stops a sibling run that is still going', async () => {
  const { out, deps, state } = setup(SIBLING, { lint: ['hang', 'pass'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
  assert.deepEqual(state().runs.filter((r) => r.step === 'lint').map((r) => [r.wasted, r.error]), [[true, 'superseded'], [false, undefined]]);
});

test('a gate with no one to answer it pauses the flow', async () => {
  const { out, deps } = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 3);
  assert.ok(out.includes('-- review needs a decision'), out.join('\n'));
  assert.ok(out.some((l) => l.startsWith('-- flow paused: ')));
  assert.deepEqual(out.slice(-2), ['-- waiting for a decision: review', `-- continue with: pnpm run-flow --resume ${join('runs', STAMPED)}`]);
});

test('a step that runs past timeout_minutes is stopped and waits at a run_failed gate', async () => {
  const { out, deps, state, runDir } = setup(TIMEOUT);
  const at = Date.now();
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 3);
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
  assert.ok(out.includes('-- check attempt 1: failed: timed out after 0.005 minutes, $0.00'), out.join('\n'));
  assert.equal(state().steps.check.gate?.kind, 'run_failed');
  const result = JSON.parse(readFileSync(join(runDir, '001-check.jsonl'), 'utf8').trim().split('\n').at(-1)!);
  assert.equal(result.error, 'timed out after 0.005 minutes');
});

test("a run_failed gate points at the run's log", async () => {
  const { deps, runDir } = setup(TIMEOUT);
  const d = deciding('fail');
  deps.answer = d.answer;
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 1);
  assert.equal(d.gate()?.help, `See: ${join(runDir, '001-check.jsonl')}`);
});

test("the timeout clock stops while a run's question waits for a person", { timeout: 10_000 }, async () => {
  const { out, deps } = setup(`${HEAD}steps:\n  build: { prompt: prompts/build.md, timeout_minutes: 0.005 }\n`, { build: ['ask'] });
  deps.answer = async () => {
    await delay(600); // twice the timeout
    return { colour: 'teal' };
  };
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 2);
  assert.deepEqual(err, ['flow.yaml: --folder: uncommitted changes in 1 file(s); commit or stash them first, or pass --allow-dirty']);
  assert.equal(existsSync(join(base, 'runs')), false);
  assert.equal(await runFlow([...RUN, '--allow-dirty', 'flow.yaml'], deps), 0);
  git(proj, 'commit', '-qam', 'two');
  writeFileSync(join(proj, 'new.txt'), 'untracked');
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0);
  // .flowboard/ is kept out of the repository, so an agent's `git add -A` leaves the lock alone
  assert.match(readFileSync(join(proj, '.git', 'info', 'exclude'), 'utf8'), /^\.flowboard\/$/m);
  writeFileSync(join(proj, '.flowboard', 'stray'), 'x');
  git(proj, 'add', '-A');
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8' }), 'A  new.txt\n');
});

test('a live lock is reported before uncommitted changes', async () => {
  const { base, err, deps } = setup(SHELL_ONLY);
  const proj = join(base, 'proj');
  git(proj, 'init', '-q');
  writeFileSync(join(proj, 'f.txt'), 'one');
  git(proj, 'add', 'f.txt');
  git(proj, 'commit', '-qm', 'one');
  writeFileSync(join(proj, 'f.txt'), 'two'); // the live flow's own edit
  const lock = join(proj, '.flowboard', 'lock');
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, JSON.stringify({ pid: process.pid, runDir: 'runs/other' }));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 2);
  assert.deepEqual(err, [`flow.yaml: --folder: another run-flow (pid ${process.pid}) is working here on runs/other; if it is not, delete ${lock}`]);
});

test('a live lock refuses the run; a stale one is replaced with a warning', async () => {
  const { base, out, err, deps } = setup(SHELL_ONLY);
  const lock = join(base, 'proj', '.flowboard', 'lock');
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, JSON.stringify({ pid: process.pid, runDir: 'runs/other' }));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 2);
  assert.deepEqual(err, [`flow.yaml: --folder: another run-flow (pid ${process.pid}) is working here on runs/other; if it is not, delete ${lock}`]);
  assert.equal(existsSync(join(base, 'runs')), false);
  const dead = spawnSync('true').pid;
  writeFileSync(lock, JSON.stringify({ pid: dead, runDir: 'runs/other' }));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0);
  assert.ok(out.includes(`-- warning: a run-flow (pid ${dead}) ended without cleaning up; check that none of its agents or checks are still running`), out.join('\n'));
  assert.equal(existsSync(lock), false);
  writeFileSync(lock, '{ half'); // not a lock run-flow writes: it publishes whole files
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 2);
  assert.equal(err.at(-1), `flow.yaml: --folder: cannot read ${lock}; if no run-flow is working here, delete it`);
});

test('a lock a check deletes is taken again; one another host took meanwhile is left to it', async () => {
  const again = setup(`${HEAD}steps:\n  wipe: { shell: 'rm -rf .flowboard/lock' }\n  after: { shell: 'cp .flowboard/lock lock.copy' }\nedges:\n  - { from: wipe, to: after }\n`);
  assert.equal(await runFlow([...RUN, 'flow.yaml'], again.deps), 0, again.out.join('\n'));
  assert.equal(existsSync(join(again.base, 'proj', '.flowboard', 'lock')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(again.base, 'proj', 'lock.copy'), 'utf8')), { pid: process.pid, runDir: again.runDir });
  const other = setup(`${HEAD}steps:\n  swap: { shell: 'printf %s "{\\"pid\\": ${process.ppid}}" > .flowboard/lock' }\n`);
  assert.equal(await runFlow([...RUN, 'flow.yaml'], other.deps), 0, other.out.join('\n'));
  assert.ok(other.out.some((l) => l.startsWith(`-- warning: a check deleted this folder's lock, and another run-flow (pid ${process.ppid}) took it`)), other.out.join('\n'));
  assert.equal(readFileSync(join(other.base, 'proj', '.flowboard', 'lock'), 'utf8'), `{"pid": ${process.ppid}}`);
});

test('a run folder another run made in the same second is passed over', async () => {
  const { base, out, deps } = setup(SHELL_ONLY);
  mkdirSync(join(base, 'runs', STAMPED), { recursive: true });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0);
  assert.ok(out.includes(`-- run folder ${join('runs', `${STAMPED}-2`)}`), out.join('\n'));
});

test('agents may not write the run folder, whatever the flow file is called, nor discard uncommitted edits', async () => {
  const { base, deps, script } = setup(ONE_PLAN);
  writeFileSync(join(base, 'a[1].yaml'), readFileSync(join(base, 'flow.yaml'), 'utf8'));
  assert.equal(await runFlow(['--folder', '.', '--task', 'task.md', 'a[1].yaml'], deps), 0);
  const guards = script.specs[0].guards!;
  assert.deepEqual(guards.denyPaths, ['runs/2026-10-18T09-05-07-a_1_/**']);
  for (const c of DISCARD_COMMANDS) assert.ok(guards.denyCommands?.includes(c));
  const denied = (cmd: string) => DISCARD_COMMANDS.some((c) => new RegExp(c).test(cmd));
  for (const cmd of [
    'git checkout .', 'git checkout -- src/a.ts', 'git checkout .;', '(git checkout .)', `bash -c "git checkout ."`, `sh -c 'cd x && git checkout .'`,
    'git -C x restore a.ts', 'git restore --staged --worktree a.ts', 'git restore -W -S a.ts', 'git stash', 'git stash push -u',
    'git clean -fd', 'git switch -f main',
  ]) assert.ok(denied(cmd), cmd);
  for (const cmd of [
    'git checkout main', 'git checkout -b fix', 'git stash list', 'git commit -m "restore the cache"', 'git status',
    'git restore --staged a.ts', 'git restore -S a.ts', 'git clean -n', 'git clean --dry-run -d',
  ]) assert.ok(!denied(cmd), cmd);
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
  await assert.rejects(runFlow([...RUN, 'flow.yaml'], s.deps), /disk full/);
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
const ESCALATE = `${HEAD}entry: build
steps:
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 1);
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(most, 1);
  assert.ok(out.includes('-- a asks:') && out.includes('-- b asks:'), out.join('\n'));
});

test('an agent that did not write its output waits at a gate; retry runs the next attempt', async () => {
  const { out, deps, script } = setup(ONE_PLAN, { plan: ['no-output', 'pass'] });
  const d = deciding('retry');
  deps.answer = d.answer;
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
  assert.equal(d.gate()?.prompt, 'plan: did not write: plan');
  assert.ok(out.includes('-- plan attempt 2 (claude-code sonnet)'), out.join('\n'));
  assert.equal(script.specs.length, 2);
});

test('an infra failure waits at a gate offering retry or fail; retry runs the same attempt', async () => {
  const { out, deps } = setup(ONE_PLAN, { plan: ['error', 'pass'] });
  const d = deciding('retry');
  deps.answer = d.answer;
  assert.equal(await runFlow([...RUN, 'flow.yaml'], deps), 0, out.join('\n'));
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130);
  assert.ok(s.out.includes('-- stopping'), s.out.join('\n'));
  assert.ok(s.out.some((l) => l.startsWith('-- flow stopped: ')));
  assert.equal(s.out.at(-1), `-- continue with: pnpm run-flow --resume ${RUN_DIR}`);
  const stopped = s.state();
  assert.deepEqual([stopped.steps.build.state, stopped.runs[0].live, stopped.runs[0].wasted], ['running', false, true]);
  // stopped before its result, with tokens and no price: its cost is not known, not $0
  assert.equal(stopped.runs[0].costUsd, null);
  assert.ok(s.out.includes('-- flow stopped: 1 run, $0.00 spent, $0.00 wasted, cost unknown for 1 run'), s.out.join('\n'));
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
  assert.deepEqual(s.state().runs.map((r) => [r.step, r.attempt]), [['build', 1], ['build', 1]]);
});

test('a run reads as launched in state.json while it runs', { timeout: 10_000 }, async () => {
  const s = setup(`${HEAD}steps:\n  check: { shell: 'sleep 0.5' }\n`);
  let seen: unknown = 'not read';
  when(() => s.out.includes('-- check attempt 1 (shell)'), () => setTimeout(() => (seen = s.state().runs[0].queued), 250));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 0, s.out.join('\n'));
  assert.equal(seen, undefined);
});

test('a run still queued when the flow stops was not launched; --resume keeps the --max-runs it started with', { timeout: 10_000 }, async () => {
  const s = setup(SPLIT, { a: ['hang', 'pass'] });
  when(() => s.script.timeline.includes('start:a'), () => s.signals.emit('SIGINT'));
  assert.equal(await runFlow([...RUN, '--max-runs', '1', 'flow.yaml'], s.deps), 130);
  const b = s.state().runs.find((r) => r.step === 'b');
  assert.deepEqual([b?.wasted, b?.error], [false, 'not launched']);
  assert.ok(s.out.includes('-- flow stopped: 2 runs, $0.10 spent, $0.00 wasted, cost unknown for 1 run'), s.out.join('\n'));
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
  assert.equal(s.script.maxLive, 1);
});

test('a check that deletes the run folder leaves the run resumable', { timeout: 10_000 }, async () => {
  const s = setup(`budget_usd: 0\ndefaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }\nsteps:
  clean: { shell: 'rm -rf runs' }
  review: { prompt: prompts/review.md, gate: approval }
edges:
  - { from: clean, to: review }
`, { review: ['none'] });
  assert.equal(await runFlow(['--folder', '.', '--task', 'task.md', 'flow.yaml'], s.deps), 3, s.out.join('\n'));
  s.deps.answer = deciding('approve').answer;
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
});

test('--resume refuses a folder that has gone, rather than make an empty one', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 3);
  rmSync(join(s.base, 'proj'), { recursive: true });
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 2);
  assert.deepEqual(s.err, [`${RUN_DIR}: cannot resume: folder not found: ${join(s.base, 'proj')}`]);
  assert.equal(existsSync(join(s.base, 'proj')), false);
});

test('Ctrl+C stops a hanging check at once, and --resume reruns it', { timeout: 10_000 }, async () => {
  const s = setup(`${HEAD}steps:\n  check: { shell: 'test -f go.flag || sleep 30' }\n`);
  when(() => s.out.includes('-- check attempt 1 (shell)'), () => setTimeout(() => s.signals.emit('SIGINT'), 100));
  const at = Date.now();
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130);
  assert.ok(Date.now() - at < 2000, `took ${Date.now() - at} ms`);
  writeFileSync(join(s.base, 'proj', 'go.flag'), '');
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
});

test('Ctrl+C at a gate prompt stops the flow like a first press', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  s.deps.answer = async () => {
    throw Object.assign(new Error('User force closed the prompt'), { name: 'ExitPromptError' });
  };
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130);
  assert.equal(s.state().steps.review.state, 'awaiting_approval');
});

test('a paused flow resumes from its pinned copy and asks its open gate again', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 3);
  rmSync(join(s.base, 'flow.yaml')); // --resume runs the pinned flow.json
  s.deps.answer = deciding('approve').answer;
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
  assert.ok(s.out.includes(`-- resuming ${RUN_DIR}`));
  assert.ok(s.script.timeline.includes('start:ship'));
});

test('--resume refuses a missing state, another version, a finished flow and a held lock', { timeout: 10_000 }, async () => {
  const done = setup(SHELL_ONLY);
  assert.equal(await runFlow([...RUN, 'flow.yaml'], done.deps), 0);
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
  assert.equal(await runFlow([...RUN, 'flow.yaml'], paused.deps), 3);
  const lock = join(paused.base, 'proj', '.flowboard', 'lock');
  writeFileSync(lock, JSON.stringify({ pid: process.pid, runDir: 'runs/other' }));
  assert.equal(await runFlow(['--resume', RUN_DIR], paused.deps), 2);
  assert.deepEqual(paused.err, [`${RUN_DIR}: cannot resume: another run-flow (pid ${process.pid}) is working here on runs/other; if it is not, delete ${lock}`]);
});

test('state.json is written atomically, and a stray state.json.tmp is ignored', { timeout: 10_000 }, async () => {
  const s = setup(GATE, { review: ['none'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 3);
  assert.equal(existsSync(join(s.runDir, 'state.json.tmp')), false);
  writeFileSync(join(s.runDir, 'state.json.tmp'), '{ half written');
  s.deps.answer = deciding('approve').answer;
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 0, s.out.join('\n'));
});

test('a replayed agent drives a flow as an adapter does: the cost is what its stream reported, also when stopped', { timeout: 10_000 }, async () => {
  const s = setup(ONE_BUILD);
  const usage = { ...ZERO_USAGE, input: 120, output: 40, numTurns: 1 };
  s.deps.makeProvider = () => new ReplayProvider({ events: [{ type: 'system', sessionId: 's-1' }, { type: 'assistant_text', text: 'done' }, { type: 'result', usage: { ...usage, costUsd: 0.02 } }] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 0, s.out.join('\n'));
  assert.equal(s.state().runs[0].costUsd, 0.02);
  // Stopped mid-stream: what the running totals said, priced (OpenCode) or not (Claude).
  for (const [running, want] of [[{ ...usage, costUsd: 0.01 }, 0.01], [usage, null]] as const) {
    const t = setup(ONE_BUILD);
    t.deps.makeProvider = () => new ReplayProvider({ events: [{ type: 'system', sessionId: 's-1' }, { type: 'usage', usage: running }, { type: 'assistant_text', text: 'still going' }, { type: 'result', usage: { ...usage, costUsd: 0.02 } }], streamDelayMs: 100 });
    when(() => t.out.includes('-- build attempt 1 (claude-code sonnet)'), () => setTimeout(() => t.signals.emit('SIGINT'), 150));
    assert.equal(await runFlow([...RUN, 'flow.yaml'], t.deps), 130, t.out.join('\n'));
    assert.equal(t.state().runs[0].costUsd, want);
  }
});

test('a second Ctrl+C more than 300 ms after the first exits at once, after removing the runs\' temp folders', { timeout: 10_000 }, async () => {
  const s = setup(ONE_BUILD, { build: ['hang'] });
  let clock = new Date(2026, 9, 18, 9, 5, 7).getTime();
  s.deps.now = () => new Date(clock);
  const temp = () => dirname(s.script.specs[0].tools!.find((t) => t.name === 'flowboard')!.env!.FLOWBOARD_ASK_SOCKET);
  let tempLeft: boolean | undefined;
  s.deps.exit = (c) => {
    tempLeft = existsSync(temp());
    s.exits.push(c);
  };
  when(() => s.script.timeline.includes('start:build'), () => {
    s.signals.emit('SIGINT');
    clock += 100;
    s.signals.emit('SIGINT'); // within 300 ms: the same press, forwarded twice under pnpm
    clock += 400;
    s.signals.emit('SIGINT');
  });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130);
  assert.deepEqual([s.exits, tempLeft], [[130], false]);
});

const FORK = (b: string) => `${HEAD}steps:
  plan: { prompt: prompts/plan.md }
  a: { prompt: prompts/a.md }
  ${b}
  c: { prompt: prompts/c.md }
edges:
  - { from: plan, to: a }
  - { from: plan, to: b }
  - { from: b, to: c }
`;

test('a run that ends as Ctrl+C lands is fed before stopping: what it would start is stopped too', { timeout: 10_000 }, async () => {
  for (const b of ['b: { prompt: prompts/b.md }', 'b: { prompt: prompts/b.md, gate: approval }']) {
    const s = setup(FORK(b), { a: ['hang'] });
    let asked = 0;
    s.deps.answer = async () => {
      asked += 1;
      return { decision: 'approve', note: null };
    };
    s.deps.print = (l) => {
      s.out.push(l);
      if (l.startsWith('-- b attempt 1:')) s.signals.emit('SIGINT'); // the end is about to be posted
    };
    assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130, b);
    const st = s.state();
    assert.deepEqual(st.runs.filter((r) => r.live), [], `${b}: a run left live`);
    assert.equal(asked, 0, `${b}: a gate was asked after stopping`);
  }
});

test('a gate prompt the engine moves past is taken down', { timeout: 10_000 }, async () => {
  const s = setup(`${HEAD}entry: build
steps:
  build: { prompt: prompts/build.md, produces: [notes] }
  check: { shell: 'sleep 0.3; test -f done.flag || { touch done.flag; exit 1; }', produces: [check_output] }
  lint: { prompt: prompts/lint.md }
  ship: { prompt: prompts/ship.md }
edges:
  - { from: build, to: check }
  - { from: build, to: lint }
  - { from: check, to: build, condition: on_fail }
  - { from: lint, to: ship, condition: on_pass }
`, { lint: ['none', 'pass'] });
  const answers: string[] = [];
  // lint's first run reports no outcome and waits at a gate; check's rework then replaces lint before anyone answers.
  s.deps.answer = (_questions, signal) => {
    answers.push('open');
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        answers[answers.length - 1] = 'taken down';
        reject(signal.reason);
      });
    });
  };
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 0, s.out.join('\n'));
  assert.deepEqual(answers, ['taken down']);
});

// --- the budget, and processes left running

const CHAIN = (budget: string) => `budget_usd: ${budget}
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }
steps:
  plan: { prompt: prompts/plan.md }
  build: { prompt: prompts/build.md }
  ship: { prompt: prompts/ship.md }
edges:
  - { from: plan, to: build }
  - { from: build, to: ship }
`;

test('a flow stops and waits once it has spent its budget, and each run may spend only what is left', { timeout: 10_000 }, async () => {
  const s = setup(CHAIN('0.15'));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 3, s.out.join('\n'));
  assert.ok(Math.abs((s.script.specs[1].limits?.maxBudgetUsd ?? 0) - 0.05) < 1e-9, JSON.stringify(s.script.specs[1].limits));
  assert.deepEqual(s.script.timeline.filter((x) => x.startsWith('start:')), ['start:plan', 'start:build']);
  assert.deepEqual(s.out.slice(-3), [
    '-- flow paused: 2 runs, $0.20 of $0.15 spent, $0.00 wasted',
    '-- the budget is spent: $0.20 of $0.15',
    `-- continue with: pnpm run-flow --resume ${RUN_DIR} --budget-usd <more>`,
  ]);
  assert.equal(await runFlow(['--resume', RUN_DIR], s.deps), 2);
  assert.deepEqual(s.err, [`${RUN_DIR}: cannot resume: the budget is spent, $0.20 of $0.15; give a larger one, or 0 for none, with --budget-usd`]);
  assert.equal(await runFlow(['--resume', RUN_DIR, '--budget-usd', '1'], s.deps), 0, s.out.join('\n'));
  assert.equal(s.out.at(-1), '-- flow done: 3 runs, $0.30 of $1.00 spent, $0.00 wasted');
  assert.equal(JSON.parse(readFileSync(join(s.runDir, 'flow.json'), 'utf8')).config.budgetUsd, 1);
  // 0 is no ceiling: nothing caps a run
  const free = setup(CHAIN('0'));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], free.deps), 0);
  assert.equal(free.script.specs[1].limits?.maxBudgetUsd, undefined);
});

test('the run-flow after one that died stops the processes its run logs name, and only those', { timeout: 15_000 }, async (t) => {
  const s = setup(SHELL_ONLY);
  const sleeper = () => spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  const left = sleeper(); // the dead host's check, in its own group
  const other = sleeper(); // a process given a pid an old log names
  t.after(() => [left, other].forEach((c) => c.kill('SIGKILL')));
  const old = join(s.base, 'runs', 'old');
  mkdirSync(old, { recursive: true });
  const line = (o: object) => JSON.stringify(o) + '\n';
  writeFileSync(join(old, '001-check.jsonl'), line({ kind: 'start' }) + line({ kind: 'pid', pid: left.pid, group: true, started: processStart(left.pid!) }));
  writeFileSync(join(old, '002-check.jsonl'), line({ kind: 'start' }) + line({ kind: 'pid', pid: other.pid, group: true, started: 'Thu Jan  1 00:00:00 1970' }));
  writeFileSync(join(old, '003-check.jsonl'), line({ kind: 'pid', pid: 1, started: 'x' }) + line({ kind: 'result' })); // ended: left alone
  const lock = join(s.base, 'proj', '.flowboard', 'lock');
  mkdirSync(dirname(lock), { recursive: true });
  const dead = spawnSync('true').pid;
  writeFileSync(lock, JSON.stringify({ pid: dead, runDir: old }));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 0, s.out.join('\n'));
  assert.ok(s.out.includes(`-- warning: a run-flow (pid ${dead}) ended without cleaning up; stopped 1 run it left running`), s.out.join('\n'));
  assert.ok(s.out.includes(`-- warning: pid ${other.pid} (${join(old, '002-check.jsonl')}) is running but may not be the process its run started; check it yourself`), s.out.join('\n'));
  await delay(100);
  assert.equal(left.signalCode, 'SIGTERM');
  assert.equal(other.exitCode ?? other.signalCode, null);
});

test('a second Ctrl+C kills a run that its stop did not end', { timeout: 10_000 }, async (t) => {
  const s = setup(ONE_BUILD);
  let child: ChildProcess | undefined;
  s.deps.makeProvider = () => ({
    id: 'stuck',
    capabilities: new Set(),
    resolveModel: (m) => m,
    launch: () => {
      const c = spawn('sleep', ['30'], { stdio: 'ignore' });
      child = c;
      const result = new Promise<RunResult>((r) => c.on('exit', () => r({ usage: ZERO_USAGE, exitCode: 1, error: 'killed' })));
      async function* events(): AsyncGenerator<NormalizedEvent> {
        await result;
      }
      return { sessionId: Promise.resolve('s-1'), pid: Promise.resolve(c.pid!), events: events(), result, stop: () => {} }; // stop does nothing
    },
  });
  t.after(() => child?.kill('SIGKILL'));
  let clock = new Date(2026, 9, 18, 9, 5, 7).getTime();
  s.deps.now = () => new Date(clock);
  when(() => child !== undefined, () =>
    setTimeout(() => {
      s.signals.emit('SIGINT');
      clock += 400;
      s.signals.emit('SIGINT');
    }, 100),
  );
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 130);
  assert.deepEqual([s.exits, child?.signalCode], [[130], 'SIGKILL']);
});

test('a spent budget takes down a gate prompt that is open, as Ctrl+C does', { timeout: 10_000 }, async () => {
  const s = setup(`budget_usd: 0.25
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }
steps:
  plan: { prompt: prompts/plan.md }
  a: { prompt: prompts/a.md, gate: approval }
  b: { prompt: prompts/b.md }
edges:
  - { from: plan, to: a }
  - { from: plan, to: b }
`, { b: ['slow'] });
  let taken = false;
  s.deps.answer = (_questions, signal) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => {
        taken = true;
        reject(signal.reason);
      }),
    );
  assert.equal(await runFlow([...RUN, 'flow.yaml'], s.deps), 3, s.out.join('\n'));
  assert.equal(taken, true);
  assert.ok(s.out.includes('-- the budget is spent: $0.30 of $0.25'), s.out.join('\n'));
});


// --- runtime: opensandbox, with a fake box: processes run on this machine, every box call is recorded.
const BOXED = (flow: string) => flow.replace(HEAD, `${HEAD}sandbox: { runtime: opensandbox, image: flowboard-sandbox }\n`);

function fakeBox(o: { missing?: string[]; gone?: boolean } = {}) {
  const calls: string[] = [];
  const box: Box = {
    id: 'box-1',
    token: 'tok-1',
    missing: o.missing ?? [],
    exec: ({ push }) => ({
      ...hostExecHost,
      id: 'container',
      spawn: (command, args, opts) => {
        calls.push(`spawn:push=${(push?.() ?? []).map((f) => basename(f)).sort().join(',')}`);
        return hostExecHost.spawn(command, args, opts);
      },
      tunnel: async () => ({ close() {} }),
      mapPath: (p) => p,
    }),
    pushDir: async () => void calls.push('push'),
    pullFiles: async (files) => void calls.push(`pull:${files.map((f) => basename(f)).join(',')}`),
    patch: async () => {
      calls.push('patch');
      return Buffer.from('diff --git a/x b/x\n');
    },
    kill: async () => void calls.push('kill'),
  };
  const deps: Pick<RunDeps, 'openBox' | 'connectBox'> = {
    openBox: async () => {
      calls.push('open');
      return box;
    },
    connectBox: async (id) => {
      calls.push(`connect:${id}`);
      if (o.gone) throw new Error(`sandbox ${id} is gone`);
      return box;
    },
  };
  return { calls, deps };
}

test('an opensandbox flow opens one box, syncs artifacts around each step and ends with changes.patch', async () => {
  const s = setup(BOXED(LINEAR));
  const fb = fakeBox();
  assert.equal(await runFlow([...RUN, 'flow.yaml'], { ...s.deps, ...fb.deps }), 0, s.out.join('\n'));
  // Each agent brings back only what it produces; the check gets every artifact the host has.
  assert.deepEqual(fb.calls, ['open', 'pull:plan.md', 'pull:notes.md', 'spawn:push=notes.md,plan.md', 'patch', 'kill']);
  assert.equal(readFileSync(join(s.runDir, 'changes.patch'), 'utf8'), 'diff --git a/x b/x\n');
  assert.deepEqual(JSON.parse(readFileSync(join(s.runDir, 'sandbox.json'), 'utf8')), { id: 'box-1', token: 'tok-1' });
  assert.equal(statSync(join(s.runDir, 'sandbox.json')).mode & 0o777, 0o600, 'it holds the relay token');
  assert.ok(s.out.some((l) => l.startsWith('-- sandbox box-1: ')), s.out.join('\n'));
  assert.ok(s.out.includes(`-- changes: ${join('runs', STAMPED, 'changes.patch')} (1 file); review it, then: git -C ${join(s.base, 'proj')} apply ${join(s.runDir, 'changes.patch')}`), s.out.join('\n'));
});

test('a paused opensandbox flow keeps its box and --resume reconnects to it', async () => {
  const s = setup(BOXED(GATE), { review: ['none'] });
  const fb = fakeBox();
  assert.equal(await runFlow([...RUN, 'flow.yaml'], { ...s.deps, ...fb.deps }), 3);
  assert.ok(!fb.calls.includes('kill'), fb.calls.join());
  assert.ok(s.out.includes('-- sandbox box-1 kept for --resume'), s.out.join('\n'));
  await runFlow(['--resume', join('runs', STAMPED)], { ...s.deps, ...fb.deps });
  assert.ok(fb.calls.includes('connect:box-1'), fb.calls.join());
});

test('--resume refuses when the box is gone', async () => {
  const s = setup(BOXED(GATE), { review: ['none'] });
  assert.equal(await runFlow([...RUN, 'flow.yaml'], { ...s.deps, ...fakeBox().deps }), 3);
  const gone = fakeBox({ gone: true });
  assert.equal(await runFlow(['--resume', join('runs', STAMPED)], { ...s.deps, ...gone.deps }), 2);
  assert.ok(s.err.includes(`${join('runs', STAMPED)}: cannot resume: sandbox box-1 is gone: its edits cannot be resumed; start the flow again`), s.err.join('\n'));
});

test('a missing credential is a warning, not an error', async () => {
  const s = setup(BOXED(LINEAR));
  assert.equal(await runFlow([...RUN, 'flow.yaml'], { ...s.deps, ...fakeBox({ missing: ['CLAUDE_CODE_OAUTH_TOKEN'] }).deps }), 0, s.out.join('\n'));
  assert.ok(s.out.includes('-- warning: sandbox: CLAUDE_CODE_OAUTH_TOKEN is not set; steps that need it will fail'), s.out.join('\n'));
});

test('an artifact a running agent produces is never pushed over its copy in the box', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-push-'));
  for (const f of ['plan.md', 'notes.md', 'check_output.md']) writeFileSync(join(dir, f), f);
  mkdirSync(join(dir, '.outcomes'));
  writeFileSync(join(dir, '.outcomes', '001-plan.json'), '{}');
  assert.deepEqual(pushable(dir, new Set([join(dir, 'notes.md')])).map((f) => basename(f)).sort(), ['check_output.md', 'plan.md']);
});
