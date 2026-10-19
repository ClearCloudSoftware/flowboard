/**
 * `pnpm run-flow <flow.yaml>`: check a flow, draw it, or run it.
 */
import { parseArgs } from 'node:util';
import { loadFlow, toMermaid } from './flow-config.ts';
import type { RunDeps } from './run.ts';

const USAGE = [
  'usage: pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--max-runs <n>]',
];

export async function runFlow(args: string[], deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const printErr = deps.printErr ?? console.error;
  const usage = () => {
    USAGE.forEach((l) => printErr(l));
    return 2;
  };

  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        check: { type: 'boolean' },
        mermaid: { type: 'boolean' },
        resume: { type: 'string' },
        'max-runs': { type: 'string' },
        'allow-dirty': { type: 'boolean' },
      },
    });
  } catch {
    return usage(); // an unknown option, or an option missing its value
  }
  const { values: v, positionals } = parsed;
  const modes = [v.check, v.mermaid, v.resume !== undefined].filter(Boolean).length;
  if (modes > 1 || (v['allow-dirty'] && modes > 0)) return usage();
  if (v.resume !== undefined ? positionals.length > 0 : positionals.length !== 1) return usage();

  if (v.resume !== undefined) {
    printErr('run-flow: running flows comes in Task 9');
    return 2;
  }
  const loaded = loadFlow(positionals[0], deps.cwd);
  if (!loaded.ok) {
    loaded.errors.forEach((l) => printErr(l));
    return 2;
  }
  const { flow, warnings } = loaded.config;
  if (v.mermaid) {
    toMermaid(flow).split('\n').forEach((l) => print(l));
    return 0;
  }
  if (v.check) {
    warnings.forEach((w) => print(`-- warning: ${w}`));
    print(`-- flow ok: ${flow.steps.length} steps`);
    return 0;
  }
  printErr('run-flow: running flows comes in Task 9');
  return 2;
}
