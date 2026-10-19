import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, GATE_DECISIONS, newFlowState } from '../src/flow/engine.ts';
import type { FlowCommand, FlowEvent } from '../src/flow/engine.ts';
import type { EdgeCondition, FlowDef, FlowEdge, Outcome, StepDef } from '../src/flow/flow.ts';

const step = (id: string, o: Partial<StepDef> = {}): StepDef => ({ id, requires: [], produces: [], approval: false, maxAttempts: 3, ...o });
const e = (from: string, to: string, condition: EdgeCondition = 'always'): FlowEdge => ({ from, to, condition });
const flow = (steps: (string | StepDef)[], edges: FlowEdge[]): FlowDef => ({ steps: steps.map((s) => (typeof s === 'string' ? step(s) : s)), edges });

type End = { end: string; outcome?: Outcome; reason?: string; error?: string; missing?: string[]; fp?: string; cost?: number; interrupted?: boolean };
type Ev = End | Exclude<FlowEvent, { type: 'start' | 'run_ended' }>;
const text = (c: FlowCommand) =>
  c.type === 'run' ? `run:${c.step}:${c.attempt}` : c.type === 'gate' ? `gate:${c.step}:${c.gate.kind}` : c.type === 'stop' ? `stop:${c.runs.join(',')}` : `end:${c.status}`;

/** Starts the flow, then feeds `events`; `{ end: s }` ends s's live run. `log` has one entry per event (start first): its commands as text, space-separated. */
function play(f: FlowDef, events: Ev[]) {
  let state = newFlowState();
  const commands: FlowCommand[] = [];
  const log: string[] = [];
  const all: (Ev | FlowEvent)[] = [{ type: 'start' }, ...events];
  for (const ev of all) {
    let event: FlowEvent;
    if ('end' in ev) {
      const run = state.runs.findLast((r) => r.step === ev.end && r.live);
      assert.ok(run, `no live run of ${ev.end}`);
      event = { type: 'run_ended', run: run.id, costUsd: ev.cost ?? 0, outcome: ev.outcome, reason: ev.reason, error: ev.error, missing: ev.missing, fingerprint: ev.fp, interrupted: ev.interrupted };
    } else event = ev;
    const r = advance(f, state, event);
    state = r.state;
    commands.push(...r.commands);
    log.push(r.commands.map(text).join(' '));
  }
  return { state, commands, log };
}

test('a linear flow runs each step once, then ends done', () => {
  assert.deepEqual(play(flow(['a', 'b'], [e('a', 'b')]), [{ end: 'a' }, { end: 'b' }]).log, ['run:a:1', 'run:b:1', 'end:done']);
});

test('fan-out starts both branches; the join waits for both', () => {
  const f = flow(['a', 'b', 'c', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b' }, { end: 'c' }, { end: 'd' }]).log, ['run:a:1', 'run:b:1 run:c:1', '', 'run:d:1', 'end:done']);
});

test('a join waits for a branch that has not reached it yet', () => {
  const f = flow(['a', 'b', 'c', 'x', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'x'), e('x', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b' }, { end: 'c' }, { end: 'x' }, { end: 'd' }]).log,
    ['run:a:1', 'run:b:1 run:c:1', '', 'run:x:1', 'run:d:1', 'end:done']);
});

test('the outcome picks the route', () => {
  const f = flow(['a', 'p', 'q'], [e('a', 'p', 'on_pass'), e('a', 'q', 'on_fail')]);
  assert.equal(play(f, [{ end: 'a', outcome: 'pass' }]).log[1], 'run:p:1');
  assert.equal(play(f, [{ end: 'a', outcome: 'fail' }]).log[1], 'run:q:1');
});

test('no outcome on a conditional step waits for a verdict; approve takes the pass route', () => {
  const f = flow(['a', 'p', 'q'], [e('a', 'p', 'on_pass'), e('a', 'q', 'on_fail')]);
  const { log, state } = play(f, [{ end: 'a' }, { type: 'decide', step: 'a', decision: 'approve' }]);
  assert.deepEqual(log.slice(1), ['gate:a:verdict', 'run:p:1']);
  assert.equal(play(f, [{ end: 'a' }]).state.steps.a.gate?.reason, 'no outcome reported');
  assert.equal(state.steps.a.outcome, 'pass');
});

test("an approval step waits even with an outcome, and approve wins over the agent's fail", () => {
  const f = flow([step('a', { approval: true, produces: ['plan'] }), 'p'], [e('a', 'p', 'on_pass')]);
  const first = play(f, [{ end: 'a', outcome: 'fail', reason: 'unsure' }]);
  assert.deepEqual(first.state.steps.a.gate, { kind: 'verdict', reason: 'approval needed; the agent says fail: unsure', evidence: ['plan'], decisions: ['approve', 'retry', 'fail'] });
  assert.equal(play(f, [{ end: 'a', outcome: 'fail' }, { type: 'decide', step: 'a', decision: 'approve' }]).log.at(-1), 'run:p:1');
});

test('reject is offered only with an on_fail route; fail stops every live run', () => {
  const f = flow(['a', step('b', { approval: true }), 'c'], [e('a', 'b'), e('a', 'c')]);
  const gated = play(f, [{ end: 'a' }, { end: 'b' }]).state;
  assert.deepEqual(gated.steps.b.gate?.decisions, ['approve', 'retry', 'fail']);
  assert.deepEqual(advance(f, gated, { type: 'decide', step: 'b', decision: 'reject' }), { state: gated, commands: [] });
  const { log, state } = play(f, [{ end: 'a' }, { end: 'b' }, { type: 'decide', step: 'b', decision: 'fail' }]);
  assert.deepEqual(log.slice(1), ['run:b:1 run:c:1', 'gate:b:verdict', 'stop:3 end:failed']);
  assert.deepEqual([state.status, state.steps.c.state, state.runs[2].live], ['failed', 'failed', false]);
});

test('a fail that fires no route waits at a gate; a pass that fires none ends its branch', () => {
  const f = flow([step('a', { produces: ['out'] }), 'p'], [e('a', 'p', 'on_pass')]);
  const failed: Ev[] = [{ end: 'a', outcome: 'fail', reason: 'two tests fail' }];
  assert.deepEqual(play(f, failed).state.steps.a.gate,
    { kind: 'verdict', reason: 'failed (two tests fail), and no edge handles a failure', evidence: ['out'], decisions: ['approve', 'retry', 'fail'] });
  assert.equal(play(f, [...failed, { type: 'decide', step: 'a', decision: 'approve' }]).log.at(-1), 'run:p:1');
  assert.equal(play(flow(['a', 'q'], [e('a', 'q', 'on_fail')]), [{ end: 'a', outcome: 'pass' }]).log[1], 'end:done');
});

test('a run that did not write its outputs waits for a verdict', () => {
  const f = flow([step('a', { produces: ['plan', 'notes'] }), 'b'], [e('a', 'b')]);
  assert.equal(play(f, [{ end: 'a', missing: ['plan', 'notes'] }]).state.steps.a.gate?.reason, 'did not write: plan, notes');
});

test('an infra failure waits at a run_failed gate; retry reruns the same attempt', () => {
  const f = flow(['a'], []);
  const { log, state } = play(f, [{ end: 'a', error: 'boom', cost: 0.2 }, { type: 'decide', step: 'a', decision: 'retry' }]);
  assert.deepEqual(log.slice(1), ['gate:a:run_failed', 'run:a:1']);
  assert.deepEqual([state.runs[0].wasted, state.runs[0].costUsd], [true, 0.2]);
  assert.equal(play(f, [{ end: 'a', error: 'boom' }]).state.steps.a.gate?.reason, 'run failed: boom');
});

test('retry at a verdict gate starts the next attempt with the note and wastes the run it replaces', () => {
  const { commands, state } = play(flow([step('a', { approval: true })], []), [{ end: 'a' }, { type: 'decide', step: 'a', decision: 'retry', note: 'shorter' }]);
  assert.deepEqual(commands.at(-1), { type: 'run', run: 2, step: 'a', attempt: 2, inputs: [], note: 'shorter' });
  assert.equal(state.runs[0].wasted, true);
});

test('a decision the gate does not offer, or for a step not at a gate, changes nothing', () => {
  const f = flow(['a', 'b'], [e('a', 'b')]);
  const before = play(f, [{ end: 'a', error: 'boom' }]).state;
  for (const ev of [{ type: 'decide', step: 'a', decision: 'approve' }, { type: 'decide', step: 'b', decision: 'retry' }] as FlowEvent[]) {
    assert.deepEqual(advance(f, before, ev), { state: before, commands: [] });
  }
  assert.deepEqual(GATE_DECISIONS, { verdict: ['approve', 'reject', 'retry', 'fail'], escalation: ['retry', 'fail'], run_failed: ['retry', 'fail'] });
});

test('a join whose conditional route did not fire runs once nothing can still feed it', () => {
  const f = flow(['a', 'b', 'c', 'x', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd', 'on_pass'), e('b', 'x', 'on_fail'), e('c', 'd')]);
  assert.deepEqual(play(f, [{ end: 'a' }, { end: 'b', outcome: 'fail' }, { end: 'c' }, { end: 'x' }, { end: 'd' }]).log,
    ['run:a:1', 'run:b:1 run:c:1', 'run:x:1', 'run:d:1', '', 'end:done']);
});

test('advance does not change the state it is given', () => {
  const f = flow(['a', 'b'], [e('a', 'b')]);
  const s = play(f, []).state;
  const copy = structuredClone(s);
  advance(f, s, { type: 'run_ended', run: 1, costUsd: 0 });
  assert.deepEqual(s, copy);
});

// plan → impl → check; check on_pass → review; check and review on_fail → impl
const loop = (max = 3) => flow(
  ['plan', step('impl', { requires: ['plan'], produces: ['notes'], maxAttempts: max }), step('check', { produces: ['check_output'] }), step('review', { produces: ['review'] })],
  [e('plan', 'impl'), e('impl', 'check'), e('check', 'review', 'on_pass'), e('check', 'impl', 'on_fail'), e('review', 'impl', 'on_fail')],
);
const SPENT: Ev[] = [
  { end: 'plan' }, { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'A' },
  { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' },
  { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' },
];

test('a failed check reworks its target with the raw failing output and wastes the superseded runs', () => {
  const { log, commands, state } = play(loop(), SPENT.slice(0, 3));
  assert.equal(log.at(-1), 'run:impl:2');
  assert.deepEqual(commands.at(-1), { type: 'run', run: 4, step: 'impl', attempt: 2, inputs: ['plan', 'check_output'] });
  assert.deepEqual(state.runs.map((r) => r.wasted), [false, true, true, false]);
  assert.equal(state.steps.check, undefined);
});

test('check and review share the target\'s attempts; a spent loop escalates and starts nothing', () => {
  const { log, state } = play(loop(), SPENT);
  assert.deepEqual(log.slice(3), ['run:impl:2', 'run:check:1', 'run:review:1', 'run:impl:3', 'run:check:1', 'run:review:1', 'gate:impl:escalation']);
  assert.deepEqual(state.steps.impl.gate, { kind: 'escalation', reason: 'impl has used 3 of 3 attempts', evidence: ['review'], decisions: ['retry', 'fail'], from: 'review' });
});

test('a check failing like its previous failure escalates with attempts left, even across a pass', () => {
  const twice = play(loop(5), [...SPENT.slice(0, 3), { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'A' }]);
  assert.equal(twice.log.at(-1), 'gate:impl:escalation');
  assert.equal(twice.state.steps.impl.gate?.reason, 'check failed the same way twice');
  assert.equal(play(loop(5), [...SPENT.slice(0, 3), { end: 'impl' }, { end: 'check', outcome: 'fail', fp: 'B' }]).log.at(-1), 'run:impl:3');
  assert.equal(play(loop(5), [...SPENT.slice(0, 7), { end: 'check', outcome: 'fail', fp: 'A' }]).log.at(-1), 'gate:impl:escalation');
});

test('retry at an escalation grants one more attempt with the note; the next failure escalates at once', () => {
  const { commands, log } = play(loop(), [...SPENT, { type: 'decide', step: 'impl', decision: 'retry', note: 'use the cache' }, { end: 'impl' }, { end: 'check', outcome: 'pass' }, { end: 'review', outcome: 'fail' }]);
  assert.deepEqual(commands.find((c) => c.type === 'run' && c.attempt === 4), { type: 'run', run: 10, step: 'impl', attempt: 4, inputs: ['plan', 'review'], note: 'use the cache' });
  assert.equal(log.at(-1), 'gate:impl:escalation');
  assert.equal(play(loop(), [...SPENT, { type: 'decide', step: 'impl', decision: 'fail' }]).log.at(-1), 'end:failed');
});

test("a reject's note goes to the rework target", () => {
  const f = flow(['impl', step('review', { approval: true, produces: ['review'] })], [e('impl', 'review'), e('review', 'impl', 'on_fail')]);
  const { commands } = play(f, [{ end: 'impl' }, { end: 'review' }, { type: 'decide', step: 'review', decision: 'reject', note: 'add tests' }]);
  assert.deepEqual(commands.at(-1), { type: 'run', run: 3, step: 'impl', attempt: 2, inputs: ['review'], note: 'add tests' });
});

test('a rework stops a downstream run that is still going and wastes it', () => {
  const f = flow(['impl', step('check', { produces: ['out'] }), 'lint'], [e('impl', 'check'), e('impl', 'lint'), e('check', 'impl', 'on_fail')]);
  const { log, state } = play(f, [{ end: 'impl' }, { end: 'check', outcome: 'fail' }]);
  assert.deepEqual(log.slice(1), ['run:check:1 run:lint:1', 'stop:3 run:impl:2']);
  assert.deepEqual([state.runs[2].live, state.runs[2].wasted], [false, true]);
  assert.equal(state.steps.lint, undefined);
});

test('a step may rework itself; a repair step reached only by rework starts at attempt 1', () => {
  const self = flow(['s', step('a', { maxAttempts: 2 })], [e('s', 'a'), e('a', 'a', 'on_fail')]);
  assert.deepEqual(play(self, [{ end: 's' }, { end: 'a', outcome: 'fail' }, { end: 'a', outcome: 'fail' }]).log, ['run:s:1', 'run:a:1', 'run:a:2', 'gate:a:escalation']);
  const repair = flow(['impl', step('check', { produces: ['out'] }), 'fix'], [e('impl', 'check'), e('check', 'fix', 'on_fail'), e('fix', 'check')]);
  assert.deepEqual(play(repair, [{ end: 'impl' }, { end: 'check', outcome: 'fail' }, { end: 'fix' }]).log, ['run:impl:1', 'run:check:1', 'run:fix:1', 'run:check:1']);
});

test('an interrupted run keeps its step running; resume restarts it at the same attempt and re-asks open gates', () => {
  const f = flow(['a', 'b', step('c', { approval: true })], [e('a', 'b'), e('a', 'c')]);
  const { state } = play(f, [{ end: 'a' }, { end: 'c' }, { end: 'b', interrupted: true, cost: 0.3 }]);
  assert.equal(state.steps.b.state, 'running');
  assert.deepEqual([state.runs[1].live, state.runs[1].wasted, state.runs[1].costUsd], [false, true, 0.3]);
  assert.deepEqual(advance(f, state, { type: 'resume' }).commands.map(text), ['run:b:1', 'gate:c:verdict']);
});

test('resume after a crash wastes runs that never ended', () => {
  const f = flow(['a'], []);
  const r = advance(f, play(f, []).state, { type: 'resume' });
  assert.deepEqual(r.commands.map(text), ['run:a:1']);
  assert.deepEqual([r.state.runs[0].live, r.state.runs[0].wasted, r.state.runs[0].error], [false, true, 'interrupted']);
});

test('a stopped run reporting late only updates its cost', () => {
  const f = flow(['a', step('b', { approval: true }), 'c'], [e('a', 'b'), e('a', 'c')]);
  const { state } = play(f, [{ end: 'a' }, { end: 'b' }, { type: 'decide', step: 'b', decision: 'fail' }]);
  const r = advance(f, state, { type: 'run_ended', run: 3, costUsd: 0.7, outcome: 'pass' });
  assert.deepEqual([r.commands, r.state.runs[2].costUsd, r.state.runs[2].outcome], [[], 0.7, undefined]);
});

test('a step named like an object property (constructor) runs like any other', () => {
  assert.deepEqual(play(flow(['a', 'constructor'], [e('a', 'constructor')]), [{ end: 'a' }, { end: 'constructor' }]).log, ['run:a:1', 'run:constructor:1', 'end:done']);
});
