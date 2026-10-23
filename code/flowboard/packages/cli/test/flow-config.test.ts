import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { FlowDef } from '@flowboard/core';
import { CLOSING } from '../src/config.ts';
import { loadFlow, OUTCOME_CLOSING, toMermaid } from '../src/flow-config.ts';
import { DELIVERY, flowProject, RUN_IN } from './fixtures/flow.ts';

/** DELIVERY with one piece of text replaced. */
const change = (from: string, to: string) => {
  assert.ok(DELIVERY.includes(from), from);
  return DELIVERY.replace(from, to);
};
const withEdge = (yaml: string, edge: string) => `${yaml}  - ${edge}\n`;

test('a flow file, run in a folder with a task, becomes a FlowDef plus one launch config per ai step', () => {
  const base = flowProject(DELIVERY);
  const r = loadFlow('flow.yaml', base, RUN_IN);
  assert.ok(r.ok, JSON.stringify(r));
  const { flow, steps, name, folder, budgetUsd, warnings } = r.config;
  assert.deepEqual([name, folder, budgetUsd, warnings], ['flow', join(base, 'proj'), 0, []]);
  assert.deepEqual(flow.steps.map((s) => [s.id, s.approval, s.maxAttempts]), [['plan', true, 3], ['implement', false, 2], ['tests', false, 3], ['check', false, 3], ['review', false, 3]]);
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
  // set_outcome is offered, and the verdict asked for, where a route or a gate reads it
  assert.deepEqual(['plan', 'implement', 'tests', 'review'].map((n) => steps[n].kind === 'ai' && steps[n].verdict), [true, false, false, true]);
  const plan = steps.plan.kind === 'ai' ? steps.plan.run : assert.fail();
  assert.equal(plan.spec.prompt.closing, `${CLOSING} ${OUTCOME_CLOSING}`);
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
  ['write_roots on a shell step', change('{ shell: pnpm test,', '{ shell: pnpm test, write_roots: [src],'), 'steps.check.write_roots: not used by a shell step', true],
  ['an ai step with nothing to do', withEdge(change('  review: {', '  x: {}\n  review: {'), '{ from: review, to: x, condition: on_pass }'), 'steps.x: an ai step needs prompt, skill or system_prompt', false],
  ['a write root outside the folder', change('write_roots: [tests]', 'write_roots: [../out]'), 'steps.tests.write_roots.0: must be a path inside the folder, relative to it', true],
  ['an absolute write root, which ties a recipe to one machine', change('write_roots: [tests]', 'write_roots: [/srv/app]'), 'steps.tests.write_roots.0: must be a path inside the folder, relative to it', true],
  ["yamlgraph's fan-out list", change('- { from: plan, to: implement }', '- { from: plan, to: [implement, tests] }'), 'edges.0.to: one step name; write one edge per pair of steps', true],
  ["a yamlgraph condition", change('condition: on_pass }', 'condition: critique.score < 0.8 }'), 'edges.4.condition: must be always, on_pass or on_fail', true],
  ["yamlgraph's START", withEdge(DELIVERY, '{ from: START, to: plan }'), 'edges.7.from: no START or END here; a flow starts at the step no edge points to (or the one entry: names) and ends when nothing is left to run', true],
  ['a step name YAML reads as a number', change('  check: {', '  007: {'), 'steps.007: YAML reads this name as a number; quote it: "007"', false],
  ['an edge end YAML reads as a number', withEdge(DELIVERY, '{ from: review, to: 7 }'), 'edges.7.to: YAML reads 7 as a number; quote the step name', true],
  ['an entry naming no step', change('budget_usd: 0', 'budget_usd: 0\nentry: nope'), 'entry: unknown step "nope"', true],
  ['a rework route beside another on_fail route', withEdge(change('  review: {', '  notify: { shell: "true" }\n  review: {'), '{ from: check, to: notify, condition: on_fail }'),
    'steps.check: on a failure it would rework "implement" and also take the on_fail route to "notify"; a rework route must be its step\'s only on_fail route', false],
  ['max_attempts on a step no rework route reaches', change('produces: [review_notes] }', 'produces: [review_notes], max_attempts: 4 }'), 'steps.review.max_attempts: no rework route leads back to review, so nothing reads it', true],
  ['a second edge between the same steps', withEdge(DELIVERY, '{ from: check, to: review }'), 'edges.7: repeats the edge check → review; keep one and set its condition', true],
  ['an edge to an unknown step', withEdge(DELIVERY, '{ from: review, to: nope }'), 'edges.7: unknown step "nope"', true],
  ['a folder, which a run gives', change('budget_usd: 0', 'budget_usd: 0\nfolder: proj'), 'folder: not in a flow file: a flow is a reusable recipe, and each run gives its folder with --folder', true],
  ['a task, which a run gives', change('budget_usd: 0', 'budget_usd: 0\ntask: task.md'), 'task: not in a flow file: a flow is a reusable recipe, and each run gives its task with --task', true],
  ['no budget', change('budget_usd: 0\n', ''), 'budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling', true],
  ['a budget below 0', change('budget_usd: 0', 'budget_usd: -1'), 'budget_usd: must be 0 or more; 0 means no ceiling', true],
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

test("a run's folder and task must exist; a recipe's own paths are relative to its file", () => {
  const base = flowProject(DELIVERY);
  const bad = loadFlow('flow.yaml', base, { folder: 'nope', task: 'none.md' });
  assert.deepEqual(bad.ok ? [] : bad.errors, [`flow.yaml: --folder: not a directory: ${join(base, 'nope')}`, `flow.yaml: --task: not a file: ${join(base, 'none.md')}`]);
  // Run from another folder, the recipe still finds prompts/ beside it; --folder and --task are the caller's.
  const r = loadFlow(join(base, 'flow.yaml'), join(base, 'proj'), { folder: '.', task: '../task.md' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.config.folder, join(base, 'proj'));
  const plan = r.config.steps.plan.kind === 'ai' ? r.config.steps.plan.run : assert.fail();
  assert.deepEqual([plan.spec.prompt.preamble, plan.spec.prompt.template], ['Build it.', 'plan']);
});

test('an empty write_roots leaves an agent step only its artifacts folder', () => {
  const r = loadFlow('flow.yaml', flowProject(change('write_roots: [tests]', 'write_roots: []')));
  assert.ok(r.ok, JSON.stringify(r));
  const tests = r.config.steps.tests.kind === 'ai' ? r.config.steps.tests.run : assert.fail();
  assert.deepEqual(tests.spec.guards?.writeRoots, []); // run-flow adds the artifacts folder at launch
});

test('an agent step opted in to an unrestricted shell is a warning, so --check shows it too', () => {
  const base = flowProject(withEdge(change('  check: {', '  shell_agent: { prompt: prompts/x.md, permissions: { allow: [Bash], allow_unrestricted_shell: true } }\n  check: {'), '{ from: plan, to: shell_agent }'));
  const r = loadFlow('flow.yaml', base, RUN_IN);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.config.warnings.includes(`steps.shell_agent: unrestricted shell: commands can write outside ${join(base, 'proj')}`), JSON.stringify(r.config.warnings));
  const alone = loadFlow('flow.yaml', base); // --check with no run: no folder to name
  assert.ok(alone.ok && alone.config.warnings.includes('steps.shell_agent: unrestricted shell: commands can write outside the folder'));
});

test('a flow that loops back to its first step names it with entry:', () => {
  const loop = `
budget_usd: 0
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 5 } }
steps:
  build: { prompt: prompts/plan.md, produces: [notes] }
  check: { shell: 'true', produces: [check_output] }
edges:
  - { from: build, to: check }
  - { from: check, to: build, condition: on_fail }
`;
  const without = loadFlow('flow.yaml', flowProject(loop));
  assert.deepEqual(without.ok ? [] : without.errors, ['flow.yaml: steps: no entry step: every step has a route into it; name the first one with entry:']);
  const named = loadFlow('flow.yaml', flowProject(loop.replace('budget_usd: 0', 'budget_usd: 0\nentry: build')));
  assert.ok(named.ok, JSON.stringify(named));
  assert.equal(named.config.flow.entry, 'build');
});

test('warnings: an ai step with no limits, and a join behind a conditional route', () => {
  const noLimits = loadFlow('flow.yaml', flowProject(change(', limits: { max_turns: 30 } }', ' }')));
  assert.ok(noLimits.ok, JSON.stringify(noLimits));
  const NONE = 'no limits.max_turns or limits.budget_usd, and the flow has no budget; nothing stops a looping agent';
  assert.deepEqual(noLimits.config.warnings, ['plan', 'implement', 'tests', 'review'].map((n) => `steps.${n}: ${NONE}`));
  // A flow budget stops a looping agent: each run may spend only what is left of it.
  const budgeted = loadFlow('flow.yaml', flowProject(change(', limits: { max_turns: 30 } }', ' }').replace('budget_usd: 0', 'budget_usd: 5')));
  assert.deepEqual(budgeted.ok && [budgeted.config.budgetUsd, budgeted.config.warnings], [5, []]);
  // --budget-usd is this run's ceiling, for the warning too
  const raised = loadFlow('flow.yaml', flowProject(change(', limits: { max_turns: 30 } }', ' }')), { ...RUN_IN, budgetUsd: 5 });
  assert.deepEqual(raised.ok && [raised.config.budgetUsd, raised.config.warnings], [5, []]);
  const join = loadFlow('flow.yaml', flowProject(`
budget_usd: 0
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
  const placeholder = loadFlow('flow.yaml', flowProject(DELIVERY, { 'task.md': 'Fix {{issue}}.', 'prompts/plan.md': 'Plan {{issue}}.' }), RUN_IN);
  assert.ok(placeholder.ok, JSON.stringify(placeholder));
  assert.deepEqual(placeholder.config.warnings, ['--task: {{…}} is not filled in; the agent reads it as written', 'steps.plan.prompt: {{…}} is not filled in; the agent reads it as written']);
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
