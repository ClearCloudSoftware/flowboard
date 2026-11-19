import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downstream, entries, isRework, validateFlow } from '../src/flow/flow.ts';
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
  assert.deepEqual(validateFlow(flow(['a', 'b'], [])), [
    { step: 'a', message: 'no route leads here, nor to "b"; a flow starts at one step, so route the others in' },
    { step: 'b', message: 'no route leads here, nor to "a"; a flow starts at one step, so route the others in' },
  ]);
  assert.deepEqual(validateFlow(flow(['a', 'b'], [e('a', 'b'), e('b', 'a')])), [
    { message: 'no entry step: every step has a route into it; name the first one with entry:' },
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['s', 'a', 'b', 'c'], [e('s', 'a'), e('a', 'b'), e('b', 'a'), e('b', 'c')])), [
    { message: 'routes loop without an on_fail route back: a, b' },
  ]);
  assert.deepEqual(validateFlow(flow(['a', 'b', 'c', step('d', { produces: ['x'] })], [e('a', 'b'), e('c', 'd'), e('d', 'c', 'on_fail')])), [
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

test('a flow that loops back to its first step names it with entry', () => {
  const loop = flow(['impl', step('review', { produces: ['review'] })], [e('impl', 'review'), e('review', 'impl', 'on_fail')]);
  assert.deepEqual(validateFlow(loop), [{ message: 'no entry step: every step has a route into it; name the first one with entry:' }]);
  assert.deepEqual(validateFlow({ ...loop, entry: 'impl' }), []);
  assert.deepEqual(entries({ ...loop, entry: 'impl' }), ['impl']);
  assert.deepEqual(validateFlow({ ...loop, entry: 'nope' }), [{ entry: true, message: 'unknown step "nope"' }]);
  // The reflexion loop: routes alone would make critique, the step only a failure reaches, look like the start.
  const reflexion = flow(['draft', step('judge', { produces: ['verdict'] }), 'critique'], [e('draft', 'judge'), e('judge', 'critique', 'on_fail'), e('critique', 'draft')]);
  assert.equal(validateFlow(reflexion)[0].message, 'no entry step: every step has a route into it; name the first one with entry:');
  assert.deepEqual(validateFlow({ ...reflexion, entry: 'draft' }), []);
  // a repair step that only rework reaches is not a second entry while some step has no route into it
  assert.deepEqual(validateFlow(flow(['impl', step('check', { produces: ['out'] }), 'fix'], [e('impl', 'check'), e('check', 'fix', 'on_fail'), e('fix', 'check')])), []);
});

test('a rework route must be its step\'s only on_fail route', () => {
  // With another on_fail route, the result would depend on the order the edges are written in.
  const forward = { ...flow(['impl', step('check', { produces: ['out'] }), 'notify'], [e('impl', 'check'), e('check', 'impl', 'on_fail'), e('check', 'notify', 'on_fail')]), entry: 'impl' };
  assert.deepEqual(validateFlow(forward), [
    { step: 'check', message: 'on a failure it would rework "impl" and also take the on_fail route to "notify"; a rework route must be its step\'s only on_fail route' },
  ]);
  const two = { ...flow(['plan', 'impl', step('review', { produces: ['r'] })], [e('plan', 'impl'), e('impl', 'review'), e('review', 'impl', 'on_fail'), e('review', 'plan', 'on_fail')]), entry: 'plan' };
  assert.equal(validateFlow(two)[0].message, 'on a failure it would rework "impl" and also take the on_fail route to "plan"; a rework route must be its step\'s only on_fail route');
  // forward on_fail routes alone are fine
  assert.deepEqual(validateFlow(flow(['a', 'x', 'y'], [e('a', 'x', 'on_fail'), e('a', 'y', 'on_fail')])).filter((p) => !p.warning), []);
});

test('a rework from a step that produces nothing is a warning', () => {
  assert.deepEqual(validateFlow({ ...flow(['impl', 'check'], [e('impl', 'check'), e('check', 'impl', 'on_fail')]), entry: 'impl' }), [
    { step: 'check', warning: true, message: 'reworks "impl" on a failure but produces nothing, so impl runs again without seeing why' },
  ]);
});

test('a join behind a conditional route is a warning, however far up the route is', () => {
  assert.deepEqual(validateFlow(flow(['a', 'c', 'd'], [e('a', 'd', 'on_pass'), e('a', 'c'), e('c', 'd')])), [
    { step: 'd', warning: true, message: 'waits for "a", whose route here is conditional; if it does not fire, d runs without it' },
  ]);
  assert.deepEqual(validateFlow(flow(['a', 'b', 'c', 'e', 'd'], [e('a', 'b', 'on_pass'), e('b', 'c'), e('c', 'd'), e('a', 'e'), e('e', 'd')])), [
    { step: 'd', warning: true, message: 'waits for "c", which runs only if the conditional route a → b fires; if it does not, d runs without it' },
  ]);
  // A condition above the fork cuts off every branch at once: the join never waits alone.
  assert.deepEqual(validateFlow(flow(['s', 'a', 'b', 'c', 'd'], [e('s', 'a', 'on_pass'), e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')])), []);
  // A repair step runs on a failure: the check it feeds back into waits for it behind no conditional route.
  const repair = flow(['impl', step('check', { produces: ['out'] }), 'fix', 'ship'], [e('impl', 'check'), e('check', 'fix', 'on_fail'), e('fix', 'check'), e('check', 'ship', 'on_pass')]);
  assert.deepEqual(validateFlow(repair), []);
  // d runs through c too, so e waits for nothing a → b cuts off; f is the one that hangs on a condition, d → f.
  const twice = flow(['a', 'b', 'c', 'd', 'f', 'e'], [e('a', 'b', 'on_pass'), e('b', 'd'), e('a', 'c'), e('c', 'd'), e('d', 'e'), e('d', 'f', 'on_pass'), e('f', 'e')]);
  assert.deepEqual(validateFlow(twice), [
    { step: 'd', warning: true, message: 'waits for "b", which runs only if the conditional route a → b fires; if it does not, d runs without it' },
    { step: 'e', warning: true, message: 'waits for "f", which runs only if the conditional route d → f fires; if it does not, e runs without it' },
  ]);
});
