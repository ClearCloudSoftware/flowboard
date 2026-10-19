import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runFlow } from '../src/flow-run.ts';
import type { RunDeps } from '../src/run.ts';
import { DELIVERY, flowProject } from './fixtures/flow.ts';

const USAGE = [
  'usage: pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--max-runs <n>]',
];

/** A temp flow project, plus deps that capture output. */
function setup(yaml = DELIVERY) {
  const base = flowProject(yaml);
  const out: string[] = [];
  const err: string[] = [];
  const deps: RunDeps = { cwd: base, print: (l) => out.push(l), printErr: (l) => err.push(l), now: () => new Date(2026, 9, 19, 9, 5, 7) };
  return { base, out, err, deps };
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
});
