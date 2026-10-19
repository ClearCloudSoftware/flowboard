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
