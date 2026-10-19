import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { FlowDef } from '@flowboard/core';
import { CLOSING } from '../src/config.ts';
import { loadFlow, OUTCOME_CLOSING, toMermaid } from '../src/flow-config.ts';
import { DELIVERY, flowProject } from './fixtures/flow.ts';

/** DELIVERY with one piece of text replaced. */
const change = (from: string, to: string) => {
  assert.ok(DELIVERY.includes(from), from);
  return DELIVERY.replace(from, to);
};
const withEdge = (yaml: string, edge: string) => `${yaml}  - ${edge}\n`;

test('a flow file becomes a FlowDef plus one launch config per ai step', () => {
  const base = flowProject(DELIVERY);
  const r = loadFlow('flow.yaml', base);
  assert.ok(r.ok, JSON.stringify(r));
  const { flow, steps, name, folder, warnings } = r.config;
  assert.deepEqual([name, folder, warnings], ['flow', join(base, 'proj'), []]);
  assert.deepEqual(flow.steps.map((s) => [s.id, s.approval, s.maxAttempts]), [['plan', true, 3], ['implement', false, 3], ['tests', false, 3], ['check', false, 3], ['review', false, 2]]);
  assert.deepEqual(flow.edges, [
    { from: 'plan', to: 'implement', condition: 'always' }, { from: 'plan', to: 'tests', condition: 'always' },
    { from: 'implement', to: 'check', condition: 'always' }, { from: 'tests', to: 'check', condition: 'always' },
    { from: 'check', to: 'review', condition: 'on_pass' }, { from: 'check', to: 'implement', condition: 'on_fail' },
    { from: 'review', to: 'implement', condition: 'on_fail' },
  ]); // an edge without `condition` is `always`
  assert.deepEqual(steps.check, { kind: 'shell', command: 'pnpm test', timeoutMinutes: 30 });
  const tests = steps.tests.kind === 'ai' ? steps.tests.run : assert.fail();
  assert.equal(tests.adapter, 'opencode');
  assert.deepEqual(tests.spec.guards?.writeRoots, [join(base, 'proj', 'tests')]);
  assert.deepEqual([tests.spec.prompt.preamble, tests.spec.prompt.template, tests.spec.prompt.closing], ['Build it.', 'tests', CLOSING]);
  const review = steps.review.kind === 'ai' ? steps.review.run : assert.fail();
  assert.equal(review.spec.prompt.closing, `${CLOSING} ${OUTCOME_CLOSING}`);
  assert.deepEqual(review.spec.limits, { maxTurns: 30 });
});

const NAME = 'name may only use lowercase letters, digits, - and _';
/** [what changed, the flow, the error line after `flow.yaml: ` (`<base>` is the temp base), whether it is the only line]. */
const ERRORS: [string, string, string, boolean][] = [
  ['an unknown step key', change('{ prompt: prompts/plan.md', '{ promt: prompts/plan.md'), 'steps.plan.promt: unknown key', true],
  ['a step name with path characters', change('  plan: {', '  ../evil: {'), `steps.../evil: ${NAME}`, true],
  ['a capitalised step name', change('  plan: {', '  Plan: {'), `steps.Plan: ${NAME}`, true],
  ['an artifact type with a slash', change('produces: [plan]', 'produces: [a/b]'), `steps.plan.produces.0: ${NAME}`, true],
  ['an input nothing produces', change('requires: [notes, test_notes, check_output]', 'requires: [notes, test_notes, check_output, summary]'), 'steps.review: requires "summary", and no step before it produces that', true],
  ['an opencode model without a provider', change('model: openrouter/deepseek/deepseek-v4.1-flash', 'model: deepseek'), 'steps.tests.model: opencode model must be "providerID/modelID"', true],
  ['a launch key on a shell step', change('{ shell: pnpm test,', '{ shell: pnpm test, model: sonnet,'), 'steps.check.model: not used by a shell step', true],
  ['an ai step with nothing to do', withEdge(change('  review: {', '  x: {}\n  review: {'), '{ from: review, to: x, condition: on_pass }'), 'steps.x: an ai step needs prompt, skill or system_prompt', false],
  ['a write root outside the folder', change('write_roots: [tests]', 'write_roots: [../out]'), 'steps.tests.write_roots.0: must be inside folder', true],
  ["yamlgraph's fan-out list", change('- { from: plan, to: implement }', '- { from: plan, to: [implement, tests] }'), 'edges.0.to: one step name; write one edge per pair of steps', true],
  ["a yamlgraph condition", change('condition: on_pass }', 'condition: critique.score < 0.8 }'), 'edges.4.condition: must be always, on_pass or on_fail', true],
  ["yamlgraph's START", withEdge(DELIVERY, '{ from: START, to: plan }'), 'edges.7.from: no START or END here; a flow starts at the step no edge points to and ends when nothing is left to run', true],
  ['a second edge between the same steps', withEdge(DELIVERY, '{ from: check, to: review }'), 'edges.7: repeats the edge check → review; keep one and set its condition', true],
  ['an edge to an unknown step', withEdge(DELIVERY, '{ from: review, to: nope }'), 'edges.7: unknown step "nope"', true],
  ['a folder that does not exist', change('folder: proj', 'folder: nope'), 'folder: not a directory: <base>/nope', true],
];

test('each problem in a flow file gives its own error line', () => {
  for (const [what, yaml, line, only] of ERRORS) {
    const base = flowProject(yaml);
    const r = loadFlow('flow.yaml', base);
    const want = `flow.yaml: ${line.replace('<base>', base)}`;
    assert.ok(!r.ok, `${what}: loaded`);
    if (only) assert.deepEqual(r.errors, [want], what);
    else assert.ok(r.errors.includes(want), `${what}: ${JSON.stringify(r.errors)}`);
  }
});

test('warnings: an ai step with no limits, and a join behind a conditional route', () => {
  const noLimits = loadFlow('flow.yaml', flowProject(change(', limits: { max_turns: 30 } }', ' }')));
  assert.ok(noLimits.ok, JSON.stringify(noLimits));
  assert.deepEqual(noLimits.config.warnings, [
    'steps.plan: no limits.max_turns or limits.budget_usd; nothing stops a looping agent',
    'steps.implement: no limits.max_turns or limits.budget_usd; nothing stops a looping agent',
    'steps.tests: no limits.max_turns or limits.budget_usd; nothing stops a looping agent',
    'steps.review: no limits.max_turns or limits.budget_usd; nothing stops a looping agent',
  ]);
  const join = loadFlow('flow.yaml', flowProject(`
folder: proj
task: task.md
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }
steps:
  a: { prompt: prompts/a.md }
  c: { prompt: prompts/c.md }
  d: { prompt: prompts/d.md }
edges:
  - { from: a, to: d, condition: on_pass }
  - { from: a, to: c }
  - { from: c, to: d }
`));
  assert.ok(join.ok, JSON.stringify(join));
  assert.deepEqual(join.config.warnings, ['steps.d: waits for "a", whose route here is conditional; if it does not fire, d runs without it']);
});

test('toMermaid draws steps, routes and rework loops', () => {
  const f: FlowDef = {
    steps: [{ id: 'plan', requires: [], produces: [], approval: true, maxAttempts: 3 }, ...['check', 'fix', 'ship'].map((id) => ({ id, requires: [], produces: [], approval: false, maxAttempts: 3 }))],
    edges: [{ from: 'plan', to: 'check', condition: 'always' }, { from: 'check', to: 'ship', condition: 'on_pass' }, { from: 'check', to: 'fix', condition: 'on_fail' }, { from: 'fix', to: 'check', condition: 'always' }],
  };
  assert.equal(toMermaid(f), ['flowchart LR', '  n0["plan (approval)"]', '  n1["check"]', '  n2["fix"]', '  n3["ship"]', '  n0 --> n1', '  n1 -->|pass| n3', '  n1 -.->|fail ↺| n2', '  n2 --> n1'].join('\n'));
  const forward: FlowDef = { steps: [f.steps[1], f.steps[2]], edges: [{ from: 'check', to: 'fix', condition: 'on_fail' }] };
  assert.equal(toMermaid(forward).split('\n').at(-1), '  n0 -->|fail| n1');
});
