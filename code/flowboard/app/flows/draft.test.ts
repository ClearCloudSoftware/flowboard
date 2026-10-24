import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { DELIVERY } from '../../packages/cli/test/fixtures/flow.ts';
import {
  addStep,
  connect,
  edgesOf,
  fromFlowValues,
  fromValues,
  layout,
  nextCondition,
  remove,
  renameStep,
  reworked,
  setCondition,
  shape,
  stepsOf,
  target,
  toDraft,
  toFlowValues,
  toValues,
  upstream,
} from './draft.ts';
import type { Draft } from './draft.ts';

const delivery = () => toDraft(parse(DELIVERY)) as Draft;
const pairs = (d: Draft) => edgesOf(d).map((e) => `${e.from}>${e.to}${e.condition ? ` ${e.condition}` : ''}`);

test('a parsed flow file becomes a draft, or the reason the canvas cannot draw it', () => {
  assert.deepEqual(stepsOf(toDraft(parse('budget_usd: 0\nsteps:\n  a:\n')) as Draft), { a: {} });
  assert.deepEqual(
    ['- a', 'steps: [a]', 'steps: { a: 1 }', 'edges: {}', 'edges: [{ from: a, to: [b, c] }]'].map((y) => toDraft(parse(y))),
    ['the file is not a mapping of keys', 'steps: not a mapping of step names', 'steps.a: not a mapping of keys', 'edges: not a list', 'edges.0: needs one from step and one to step'],
  );
});

test('steps are added, renamed and removed with their routes and entry', () => {
  const [added, id] = addStep(delivery(), 'review');
  assert.equal(id, 'step-6');
  assert.deepEqual(pairs(added).at(-1), 'review>step-6');
  assert.equal(addStep(added)[1], 'step-7');

  const renamed = renameStep({ ...delivery(), entry: 'plan' }, 'plan', 'design');
  assert.deepEqual(Object.keys(stepsOf(renamed)), ['design', 'implement', 'tests', 'check', 'review']);
  assert.deepEqual([renamed.entry, pairs(renamed).slice(0, 2)], ['design', ['design>implement', 'design>tests']]);
  const taken = delivery();
  assert.equal(renameStep(taken, 'plan', 'tests'), taken); // a name another step has is refused

  const removed = remove({ ...delivery(), entry: 'plan' }, ['plan'], [6]);
  assert.deepEqual([Object.keys(stepsOf(removed)).length, removed.entry], [4, undefined]);
  assert.deepEqual(pairs(removed), ['implement>check', 'tests>check', 'check>review on_pass', 'check>implement on_fail']);
});

test('a drawn route starts as always, or as a failure route back when it closes a loop', () => {
  const d = delivery();
  assert.deepEqual(pairs(connect(d, 'tests', 'review')).at(-1), 'tests>review');
  assert.deepEqual(pairs(connect(d, 'review', 'plan')).at(-1), 'review>plan on_fail');
  assert.deepEqual(pairs(connect(d, 'check', 'check')).at(-1), 'check>check on_fail');
  assert.equal(connect(d, 'plan', 'tests'), d); // already there
  // The label cycles always → on_pass → on_fail; always is written by leaving condition out.
  assert.deepEqual([nextCondition('always'), nextCondition('on_pass'), nextCondition('on_fail')], ['on_pass', 'on_fail', 'always']);
  assert.deepEqual(edgesOf(setCondition(d, 4, 'always'))[4], { from: 'check', to: 'review' });
  assert.deepEqual(edgesOf(setCondition(d, 0, 'on_pass'))[0], { from: 'plan', to: 'implement', condition: 'on_pass' });
});

test('what the inspector reads off the graph: types from upstream, steps that rework leads back to', () => {
  const d = delivery();
  assert.deepEqual([...upstream(d, 'review')].sort(), ['check_output', 'notes', 'plan', 'test_notes']);
  assert.deepEqual([...upstream(d, 'implement')], ['plan']); // review's notes come back by rework, not from upstream
  assert.deepEqual([...reworked(d)], ['implement']);
});

test('the layout puts a step one column past its longest forward path, and leaves rework out', () => {
  assert.deepEqual(layout(delivery()), {
    plan: { x: 0, y: 0 },
    implement: { x: 200, y: -52 },
    tests: { x: 200, y: 52 },
    check: { x: 400, y: 0 },
    review: { x: 600, y: 0 },
  });
  // A forward loop is an error the check reports. While it is there, the steps keep their places: here, turning
  // check → review into a fail route makes review → implement forward, closing implement → check → review.
  const looped = setCondition(delivery(), 4, 'on_fail');
  assert.deepEqual(layout(looped), layout(delivery()));
  const pair = toDraft(parse('steps: { a: {}, b: {} }\nedges: [{ from: a, to: b }, { from: b, to: a }]')) as Draft;
  assert.deepEqual(layout(pair), { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } });
});

test('the library glyph comes from the graph', () => {
  const e = (from: string, to: string, condition = 'always') => ({ from, to, condition });
  const abc = ['a', 'b', 'c'];
  assert.deepEqual(
    [
      shape(abc, [e('a', 'b'), e('b', 'c')]),
      shape(abc, [e('a', 'b'), e('a', 'c')]),
      shape(abc, [e('a', 'b'), e('b', 'c'), e('c', 'b', 'on_fail')]),
      shape(['a', 'b', 'c', 'd'], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd'), e('d', 'a', 'on_fail')]),
      shape(abc, [e('a', 'b', 'on_pass'), e('a', 'c', 'on_fail')]),
    ],
    ['linear', 'fan', 'loop', 'fanloop', 'branch'],
  );
});

test("the inspector's fields map onto the step's keys and back, changing only what was edited", () => {
  const d = delivery();
  for (const [id, s] of Object.entries(stepsOf(d))) assert.deepEqual(fromValues(toValues(id, s), s), s, id);

  const tests = stepsOf(d).tests;
  const edited = fromValues({ ...toValues('tests', tests), budget: '1.5', model: '', write_roots: [], gate: true }, tests);
  assert.deepEqual(edited, {
    adapter: 'opencode',
    prompt: 'prompts/tests.md',
    requires: ['plan'],
    produces: ['test_notes'],
    limits: { budget_usd: 1.5 },
    gate: 'approval',
  });
  // A shell step takes no agent keys, so a step that becomes one drops them; one that stops being one drops `shell`.
  const asShell = fromValues({ ...toValues('tests', { ...tests, guards: { deny_paths: ['x'] } }), kind: 'shell', shell: 'pnpm test' }, { ...tests, guards: { deny_paths: ['x'] } });
  assert.deepEqual(asShell, { requires: ['plan'], produces: ['test_notes'], shell: 'pnpm test' });
  assert.deepEqual(fromValues({ ...toValues('check', stepsOf(d).check), kind: 'agent', prompt: 'p.md' }, stepsOf(d).check), { produces: ['check_output'], prompt: 'p.md' });
});

test("the flow's own fields: an emptied one leaves, and a new or refilled one goes where the reference writes it", () => {
  const d = delivery();
  assert.deepEqual(fromFlowValues(toFlowValues(d), d), d);
  const out = fromFlowValues({ ...toFlowValues(d), budget: '2', entry: 'plan', max_turns: '', adapter: '' }, d);
  assert.deepEqual(Object.keys(out), ['budget_usd', 'entry', 'defaults', 'steps', 'edges']);
  assert.deepEqual([out.budget_usd, out.entry, out.defaults], [2, 'plan', { model: 'sonnet' }]);
  // Typing a new budget over the old one: for a moment there is none, then it comes back, at the top.
  const emptied = fromFlowValues({ ...toFlowValues(d), budget: '' }, d);
  assert.equal('budget_usd' in emptied, false);
  assert.deepEqual(Object.keys(fromFlowValues({ ...toFlowValues(d), budget: '7' }, emptied)), ['budget_usd', 'defaults', 'steps', 'edges']);
});

test('a check line points at its step, its route, or the flow', () => {
  assert.deepEqual(
    [
      'steps.review: requires "summary", and no step before it produces that',
      'steps.tests.write_roots.0: must be a path inside the folder, relative to it',
      'edges.3: repeats the edge a → b; keep one and set its condition',
      'entry: unknown step "x"',
      'steps: no entry step: every step has a route into it; name the first one with entry:',
      'budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling',
    ].map(target),
    [{ step: 'review' }, { step: 'tests' }, { edge: 3 }, { flow: true }, { flow: true }, { flow: true }],
  );
});
