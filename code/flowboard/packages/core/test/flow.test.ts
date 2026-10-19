import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downstream, isRework, validateFlow } from '../src/flow/flow.ts';
import type { EdgeCondition, FlowDef, FlowEdge, StepDef } from '../src/flow/flow.ts';

const step = (id: string, o: Partial<StepDef> = {}): StepDef => ({ id, requires: [], produces: [], approval: false, maxAttempts: 3, ...o });
const e = (from: string, to: string, condition: EdgeCondition = 'always'): FlowEdge => ({ from, to, condition });
const flow = (steps: (string | StepDef)[], edges: FlowEdge[]): FlowDef => ({ steps: steps.map((s) => (typeof s === 'string' ? step(s) : s)), edges });

const delivery = flow(
  [step('plan', { produces: ['plan'] }), step('implement', { requires: ['plan'], produces: ['notes'] }), step('check', { produces: ['check_output'] }), step('review', { requires: ['notes', 'check_output'], produces: ['review'] })],
  [e('plan', 'implement'), e('implement', 'check'), e('check', 'review', 'on_pass'), e('check', 'implement', 'on_fail'), e('review', 'implement', 'on_fail')],
);

test('a sound flow has no problems', () => assert.deepEqual(validateFlow(delivery), []));

test('rework routes go back to the step itself or an ancestor', () => {
  assert.equal(isRework(delivery, e('check', 'implement', 'on_fail')), true);
  assert.equal(isRework(delivery, e('check', 'check', 'on_fail')), true);
  assert.equal(isRework(delivery, e('check', 'review', 'on_pass')), false);
  assert.equal(isRework(delivery, e('plan', 'review', 'on_fail')), false);
});

test('downstream follows routes but not rework routes', () => {
  assert.deepEqual([...downstream(delivery, 'implement')].sort(), ['check', 'review']);
  assert.deepEqual([...downstream(delivery, 'review')], []);
});

test('structural problems', () => {
  assert.deepEqual(validateFlow(flow(['a'], [e('a', 'nope')])), [{ edge: 0, message: 'unknown step "nope"' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [e('a', 'b'), e('a', 'b', 'on_fail')])), [{ edge: 1, message: 'repeats the edge a → b; keep one and set its condition' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [])), [{ message: 'more than one entry step: a, b' }]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [e('a', 'b'), e('b', 'a')])), [
    { message: 'no entry step: every step has a route into it' },
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['s', 'a', 'b', 'c'], [e('s', 'a'), e('a', 'b'), e('b', 'a'), e('b', 'c')])), [
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['a', 'b', 'c', 'd'], [e('a', 'b'), e('c', 'd'), e('d', 'c', 'on_fail')])), [
    { step: 'c', message: 'no route leads here from the entry step "a"' },
    { step: 'd', message: 'no route leads here from the entry step "a"' },
  ]);
});

test('artifact problems: one producer per type, inputs from forward ancestors only', () => {
  const dup = structuredClone(delivery);
  dup.steps[3].produces = ['review', 'notes'];
  assert.deepEqual(validateFlow(dup), [{ step: 'review', message: 'produces "notes", which "implement" also produces' }]);
  const back = structuredClone(delivery);
  back.steps[1].requires = ['plan', 'review']; // review reaches implement only through a rework route
  assert.deepEqual(validateFlow(back), [{ step: 'implement', message: 'requires "review", and no step before it produces that' }]);
});

test('a join behind a conditional route is a warning', () => {
  assert.deepEqual(validateFlow(flow(['a', 'c', 'd'], [e('a', 'd', 'on_pass'), e('a', 'c'), e('c', 'd')])), [
    { step: 'd', warning: true, message: 'waits for "a", whose route here is conditional; if it does not fire, d runs without it' },
  ]);
});
