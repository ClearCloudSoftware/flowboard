import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { checkFlow, createFlow, draftFlow, listFlows, readFlow, saveFlow, toYaml } from '../src/flow-files.ts';
import { DELIVERY, flowProject } from './fixtures/flow.ts';

/** A recipe written by hand: aligned comments, flow style, a comment on its own line. */
const BY_HAND = `# Build, check, review; failures go back to implement.
budget_usd: 5                      # the most the whole flow may spend
defaults: { adapter: claude-code, model: sonnet, limits: { max_turns: 30 } }
steps:
  implement: { prompt: prompts/implement.md, produces: [notes], max_attempts: 2 }
  check: { shell: pnpm test, produces: [check_output] }   # exit 0 is pass
  review: { prompt: prompts/review.md, requires: [notes, check_output], produces: [review_notes] }
edges:
  # the happy path
  - { from: implement, to: check }
  - { from: check, to: review, condition: on_pass }
  - { from: check, to: implement, condition: on_fail }   # rework: spends implement's attempts
  - { from: review, to: implement, condition: on_fail }
`;
type Draft = { budget_usd: number; steps: Record<string, Record<string, unknown>>; edges: Record<string, unknown>[] };
const draft = () => parse(BY_HAND) as Draft;

test('a save that changes nothing writes the file back byte for byte', () => {
  assert.equal(toYaml(BY_HAND, draft()), BY_HAND);
});

test('an edit rewrites only the lines whose meaning changed, keeping their comments', () => {
  const d = draft();
  d.budget_usd = 6;
  d.steps.review.requires = ['notes'];
  assert.equal(
    toYaml(BY_HAND, d),
    BY_HAND.replace('budget_usd: 5                      #', 'budget_usd: 6 #').replace(
      'review: { prompt: prompts/review.md, requires: [notes, check_output], produces: [review_notes] }',
      'review: { prompt: prompts/review.md, requires: [ notes ], produces: [ review_notes ] }',
    ),
  );
});

test('new steps and edges take the style of their neighbours, and a renamed step keeps its place', () => {
  const d = draft();
  const rename = (s: unknown) => (s === 'check' ? 'tests' : s);
  d.steps = Object.fromEntries(Object.entries(d.steps).map(([k, v]) => [rename(k) as string, v]));
  d.edges = d.edges.map((e) => ({ ...e, from: rename(e.from), to: rename(e.to) }));
  d.steps.notify = { shell: 'echo done' };
  d.edges.push({ from: 'review', to: 'notify', condition: 'on_pass' });
  const out = toYaml(BY_HAND, d);
  assert.deepEqual(parse(out), d);
  const lines = out.split('\n');
  assert.deepEqual(lines.slice(4, 8), [
    '  implement: { prompt: prompts/implement.md, produces: [notes], max_attempts: 2 }',
    '  tests: { shell: pnpm test, produces: [ check_output ] }', // a new key: check's comment went with it
    '  review: { prompt: prompts/review.md, requires: [notes, check_output], produces: [review_notes] }',
    '  notify: { shell: echo done }',
  ]);
  assert.ok(lines.includes('  # the happy path'));
  assert.ok(lines.includes('  - { from: tests, to: implement, condition: on_fail } # rework: spends implement\'s attempts'));
  assert.equal(lines.at(-2), '  - { from: review, to: notify, condition: on_pass }');
});

test('spacing inside a quoted string is part of the value, so a change there is still written', () => {
  const text = 'budget_usd: 0\nsteps:\n  a: { system_prompt: "keep [ this ]" }\n';
  const want = { budget_usd: 0, steps: { a: { system_prompt: 'keep [this]' } } };
  assert.deepEqual(parse(toYaml(text, want)), want);
});

test('a folder of recipes: listed with what the library shows, each checked as --check checks it', () => {
  const dir = flowProject(DELIVERY, {
    'two.yaml': '# Two steps, one agent.\nbudget_usd: 1\ndefaults: { adapter: claude-code, model: sonnet }\nsteps:\n  a: { system_prompt: x }\n  b: { shell: "true", gate: approval }\nedges:\n  - { from: a, to: b }\n',
    'Not A Name.yaml': 'budget_usd: 0\n',
  });
  assert.deepEqual(
    listFlows(dir).map((f) => [f.name, f.description, f.steps.join(' '), f.edges.length, f.gates, f.budgetUsd, f.errors]),
    [['flow', '', 'plan implement tests check review', 7, 1, 0, 0], ['two', 'Two steps, one agent.', 'a b', 1, 1, 1, 0]],
  );
  assert.deepEqual(listFlows(join(dir, 'none')), []);

  const flow = readFlow(dir, 'flow')!;
  assert.deepEqual([flow.text, flow.check], [DELIVERY, { errors: [], warnings: [] }]);
  assert.equal(readFlow(dir, 'gone'), undefined);
  // Lines as --check prints them, less the file name in front.
  assert.deepEqual(checkFlow(dir, 'flow', DELIVERY.replace('requires: [notes, test_notes, check_output]', 'requires: [notes, summary]')), {
    errors: ['steps.review: requires "summary", and no step before it produces that'],
    warnings: [],
  });
});

test('a new recipe is created with its budget only, and never over an existing one', () => {
  const dir = flowProject(DELIVERY);
  const made = createFlow(join(dir, 'flows'), 'fresh')!;
  assert.match(made.text, /^budget_usd: 0 /);
  assert.deepEqual(made.check.errors, ['steps: required']);
  assert.equal(createFlow(join(dir, 'flows'), 'fresh'), undefined);
  assert.equal(createFlow(dir, 'flow'), undefined);
  assert.equal(readFileSync(join(dir, 'flow.yaml'), 'utf8'), DELIVERY);
});

test('a save writes only a recipe that passes the check, over the version it was opened at', () => {
  const dir = flowProject(DELIVERY);
  const opened = readFlow(dir, 'flow')!;
  const d = parse(DELIVERY) as Draft;

  d.steps.review.requires = ['summary'];
  const bad = saveFlow(dir, 'flow', d, opened.version);
  assert.deepEqual(bad, { ok: false, check: { errors: ['steps.review: requires "summary", and no step before it produces that'], warnings: [] } });
  assert.deepEqual(draftFlow(dir, 'flow', d)?.check, (bad as { check: unknown }).check);
  assert.equal(readFileSync(join(dir, 'flow.yaml'), 'utf8'), DELIVERY);

  d.steps.review.requires = ['notes'];
  const good = saveFlow(dir, 'flow', d, opened.version);
  assert.ok(good.ok, JSON.stringify(good));
  assert.equal(readFileSync(join(dir, 'flow.yaml'), 'utf8'), good.file.text);
  assert.match(good.file.text, /requires: \[ notes \]/);
  assert.notEqual(good.file.version, opened.version);

  // Opened before that save, or edited by hand since: refused, and the file is left as it is.
  assert.deepEqual(saveFlow(dir, 'flow', d, opened.version), {
    ok: false,
    conflict: 'flow.yaml changed on disk after it was opened; open it again to see the change',
  });
  writeFileSync(join(dir, 'flow.yaml'), DELIVERY);
  assert.equal(saveFlow(dir, 'flow', d, good.file.version).ok, false);
  assert.deepEqual(saveFlow(dir, 'gone', d, opened.version), { ok: false, conflict: `gone.yaml is no longer in ${dir}` });
});
