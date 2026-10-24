/**
 * One flow YAML, a reusable recipe -> a FlowDef for the engine, plus one
 * launch config per ai step, checked the way run-agent checks a single run.
 * A run adds the folder to work in and the task; the recipe's own paths are
 * relative to its file.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, sep } from 'node:path';
import { isMap, isScalar, parseDocument } from 'yaml';
import { z } from 'zod';
import { DEFAULT_MAX_ATTEMPTS, isRework, validateFlow } from '@flowboard/core';
import type { FlowDef } from '@flowboard/core';
import { CLOSING, configFromObject, isDir, isFile, issueLines, readYaml, RunSchema, toAbs } from './config.ts';
import type { RunConfig } from './config.ts';

export const OUTCOME_CLOSING =
  'Before you stop, report your verdict with the set_outcome tool: "pass" if the work meets the task, "fail" if it does not, with a one-line reason.';

/** `verdict`: its routes or its approval gate use the outcome, so it is offered set_outcome. */
export interface AiStep { kind: 'ai'; run: RunConfig; timeoutMinutes?: number; verdict: boolean }
export interface ShellStep { kind: 'shell'; command: string; timeoutMinutes: number }
/** Where steps run: a throwaway, non-root container from `image` per step. `env`: names of this machine's variables it gets, such as the agents' auth. */
export interface Sandbox { image: string; env: string[] }
/** `folder`: the run's; `budgetUsd`: the most the whole flow may spend, 0 for no ceiling. */
export interface FlowConfig { yamlPath: string; name: string; folder: string; budgetUsd: number; flow: FlowDef; steps: Record<string, AiStep | ShellStep>; warnings: string[]; sandbox?: Sandbox }
export type FlowLoadResult = { ok: true; config: FlowConfig } | { ok: false; errors: string[] };
/**
 * What one run of a recipe adds, as typed: relative paths resolve against the folder run-flow starts in.
 * `budgetUsd` replaces the recipe's `budget_usd` for this run.
 */
export interface RunInputs { folder: string; task: string; budgetUsd?: number }

const SHELL_TIMEOUT_MINUTES = 30;
/** Step names and artifact types become file names; lowercase only, since macOS treats Plan.md and plan.md as one file. */
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const BAD_NAME = 'name may only use lowercase letters, digits, - and _';
const PSEUDO_STEP = 'no START or END here; a flow starts at the step no edge points to (or the one entry: names) and ends when nothing is left to run';

/** run-agent's keys, minus `folder`: every one optional, so `defaults` can fill it. */
const Launch = RunSchema.omit({ folder: true }).partial();
const LAUNCH_KEYS = new Set(Object.keys(Launch.shape));
const StepSchema = Launch.extend({
  requires: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
  gate: z.literal('approval').optional(),
  max_attempts: z.number().int().min(1).optional(),
  shell: z.string().min(1).optional(),
  write_roots: z.array(z.string().min(1)).optional(),
  timeout_minutes: z.number().positive().optional(),
});
const StepName = z.string({
  error: (i) =>
    typeof i.input === 'number' || typeof i.input === 'boolean'
      ? `YAML reads ${String(i.input)} as a ${typeof i.input}; quote the step name`
      : 'one step name; write one edge per pair of steps',
});
const RECIPE = 'not in a flow file: a flow is a reusable recipe, and each run gives its';
const FlowSchema = z.strictObject({
  budget_usd: z.number({ error: 'must be a number of dollars' }).min(0, { error: 'must be 0 or more; 0 means no ceiling' }),
  entry: StepName.optional(),
  defaults: Launch.optional(),
  sandbox: z.strictObject({ image: z.string().min(1), env: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be a variable name')).default([]) }).optional(),
  steps: z.record(z.string(), StepSchema).refine((s) => Object.keys(s).length > 0, 'needs at least one step'),
  edges: z
    .array(
      z.strictObject({
        from: StepName,
        to: StepName,
        condition: z.enum(['always', 'on_pass', 'on_fail'], { error: 'must be always, on_pass or on_fail' }).default('always'),
      }),
    )
    .default([]),
});

/** True when `p` is `dir` or below it. */
export const inside = (dir: string, p: string) => {
  const rel = relative(dir, p);
  return !isAbsolute(rel) && rel.split(sep)[0] !== '..';
};

/**
 * Loads the recipe at `yamlPath` (relative to `baseDir`) for one `run`. Without one, as for `--check`, the recipe
 * is checked on its own: a stand-in folder and task let run-agent's checks run.
 */
export function loadFlow(yamlPath: string, baseDir: string, run?: RunInputs): FlowLoadResult {
  const read = readYaml(yamlPath, baseDir);
  if (!read.ok) return read;
  const fail = (lines: string[]): FlowLoadResult => ({ ok: false, errors: lines.map((l) => `${yamlPath}: ${l}`) });
  const moved = [`folder: ${RECIPE} folder with --folder`, `task: ${RECIPE} task with --task`].filter((l) => Object.hasOwn(read.raw, l.split(':')[0]));
  if (moved.length) return fail(moved);
  const parsed = FlowSchema.safeParse(read.raw);
  const NO_BUDGET = 'budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling';
  if (!parsed.success) return fail(parsed.error.issues.flatMap((i) => issueLines(i, read.raw)).map((l) => (l === 'budget_usd: required' ? NO_BUDGET : l)));
  const y = parsed.data;
  const recipeDir = dirname(read.abs); // the recipe's prompts, skills and plugins sit beside it
  const budgetUsd = run?.budgetUsd ?? y.budget_usd;

  // Bad names and yamlgraph's pseudo-steps count as schema errors: nothing else is checked after them.
  const bad: string[] = [];
  // YAML reads an unquoted 007 or true as a number or a boolean, and the key turns into "7" or "true".
  const doc = parseDocument(readFileSync(read.abs, 'utf8'));
  const stepsNode = doc.get('steps');
  for (const item of isMap(stepsNode) ? stepsNode.items : []) {
    if (isScalar(item.key) && typeof item.key.value !== 'string') {
      bad.push(`steps.${item.key.source}: YAML reads this name as a ${typeof item.key.value}; quote it: "${item.key.source}"`);
    }
  }
  for (const [name, st] of Object.entries(y.steps)) {
    if (!NAME.test(name)) bad.push(`steps.${name}: ${BAD_NAME}`);
    for (const key of ['produces', 'requires'] as const) {
      (st[key] ?? []).forEach((type, i) => NAME.test(type) || bad.push(`steps.${name}.${key}.${i}: ${BAD_NAME}`));
    }
  }
  y.edges.forEach((e, i) => {
    for (const end of ['from', 'to'] as const) if (e[end] === 'START' || e[end] === 'END') bad.push(`edges.${i}.${end}: ${PSEUDO_STEP}`);
  });
  if (bad.length) return fail(bad);

  // Every other problem is collected, then printed in row order: 0 flow files, 1 graph, 2 step prompt,
  // 3 nothing to do, 4 launch key on a shell step, 5 shell outputs, 6 write_roots, 7 run checks.
  const found: [number, string][] = [];
  const err = (row: number, line: string) => found.push([row, line]);
  // ponytail: run-agent's checks need a folder and a task file; a recipe checked alone gets its own folder and file.
  const folderAbs = run ? toAbs(run.folder, baseDir) : recipeDir;
  if (!isDir(folderAbs)) err(0, `--folder: not a directory: ${folderAbs}`);
  const folder = isDir(folderAbs) ? realpathSync(folderAbs) : folderAbs;
  const taskAbs = run ? toAbs(run.task, baseDir) : read.abs;
  if (!isFile(taskAbs)) err(0, `--task: not a file: ${taskAbs}`);
  else if (!readFileSync(taskAbs, 'utf8').trim()) err(0, '--task: file is empty');
  const filesOk = !found.length;

  const flow: FlowDef = {
    steps: Object.entries(y.steps).map(([id, st]) => ({
      id,
      requires: st.requires ?? [],
      produces: st.produces ?? [],
      approval: st.gate === 'approval',
      maxAttempts: st.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
    })),
    edges: y.edges.map(({ from, to, condition }) => ({ from, to, condition })),
    ...(y.entry !== undefined && { entry: y.entry }),
  };
  const problems = validateFlow(flow);
  const where = (p: (typeof problems)[number]) => (p.entry ? 'entry' : p.edge !== undefined ? `edges.${p.edge}` : p.step !== undefined ? `steps.${p.step}` : 'steps');
  for (const p of problems) if (!p.warning) err(1, `${where(p)}: ${p.message}`);
  const warnings = problems.filter((p) => p.warning).map((p) => `${where(p)}: ${p.message}`);
  // Only rework reads max_attempts; set anywhere else, it would look like a limit and limit nothing.
  for (const [name, st] of Object.entries(y.steps)) {
    if (st.max_attempts !== undefined && !problems.some((p) => !p.warning) && !flow.edges.some((e) => e.to === name && isRework(flow, e))) {
      err(1, `steps.${name}.max_attempts: no rework route leads back to ${name}, so nothing reads it`);
    }
  }
  // ponytail: no placeholders are filled in yet; a {{name}} reaches the agent as written.
  const PLACEHOLDER = /\{\{[^}]*\}\}/;
  if (run && filesOk && PLACEHOLDER.test(readFileSync(taskAbs, 'utf8'))) warnings.push('--task: {{…}} is not filled in; the agent reads it as written');

  const steps: Record<string, AiStep | ShellStep> = {};
  for (const [name, st] of Object.entries(y.steps)) {
    const at = `steps.${name}`;
    const launch = Object.fromEntries(Object.entries(st).filter(([k]) => LAUNCH_KEYS.has(k)));
    if (st.shell !== undefined) {
      for (const key of Object.keys(launch)) err(4, `${at}.${key}: not used by a shell step`);
      // write_roots guard an agent's file tools; on a check it would only look like a sandbox.
      if (st.write_roots) err(4, `${at}.write_roots: not used by a shell step`);
      if ((st.produces ?? []).length > 1) err(5, `${at}.produces: a shell step writes one artifact`);
      steps[name] = { kind: 'shell', command: st.shell, timeoutMinutes: st.timeout_minutes ?? SHELL_TIMEOUT_MINUTES };
      continue;
    }

    const merged: z.infer<typeof Launch> = { ...y.defaults, ...launch }; // a step's key replaces the default whole
    let template: string | undefined;
    if (merged.prompt !== undefined) {
      const path = toAbs(merged.prompt, recipeDir);
      if (!isFile(path)) err(2, `${at}.prompt: not a file: ${path}`);
      else {
        template = readFileSync(path, 'utf8');
        if (!template.trim()) err(2, `${at}.prompt: file is empty`);
        if (PLACEHOLDER.test(template)) warnings.push(`${at}.prompt: {{…}} is not filled in; the agent reads it as written`);
      }
    } else if (merged.skill === undefined && merged.system_prompt === undefined) {
      err(3, `${at}: an ai step needs prompt, skill or system_prompt`);
    }
    // A recipe runs in many folders: its write roots are paths inside whichever one, relative to it.
    (st.write_roots ?? []).forEach((r, i) => {
      if (isAbsolute(r) || r.startsWith('~') || r.split(/[\\/]/).includes('..')) err(6, `${at}.write_roots.${i}: must be a path inside the folder, relative to it`);
    });
    const roots = (st.write_roots ?? []).map((r) => toAbs(r, folder));
    if (budgetUsd === 0 && merged.limits?.max_turns === undefined && merged.limits?.budget_usd === undefined) {
      warnings.push(`${at}: no limits.max_turns or limits.budget_usd, and the flow has no budget; nothing stops a looping agent`);
    }
    if (!filesOk) continue; // every step would repeat the folder or task error

    // The task file is every step's preamble; the step's own prompt is its template.
    const r = configFromObject({ ...merged, folder, prompt: taskAbs }, recipeDir);
    if (!r.ok) {
      r.errors.forEach((l) => err(7, `${at}.${l}`));
      continue;
    }
    const { spec } = r.config;
    if (template !== undefined) spec.prompt.template = template;
    // The verdict is asked for, and set_outcome offered, where a route or the approval gate reads it.
    const verdict = st.gate === 'approval' || y.edges.some((e) => e.from === name && e.condition !== 'always');
    if (verdict) spec.prompt.closing = `${CLOSING} ${OUTCOME_CLOSING}`;
    if (r.config.unrestrictedShell) warnings.push(`${at}: unrestricted shell: commands can write outside ${run ? folder : 'the folder'}`);
    if (st.write_roots) spec.guards = { ...spec.guards, writeRoots: roots }; // [] leaves only the artifacts folder
    steps[name] = {
      kind: 'ai',
      run: { yamlPath: read.abs, ...r.config },
      verdict,
      ...(st.timeout_minutes !== undefined && { timeoutMinutes: st.timeout_minutes }),
    };
  }

  if (found.length) return fail(found.sort((a, b) => a[0] - b[0]).map(([, line]) => line));
  // ponytail: no egress proxy yet, so agents' boxes are online and hold the keys sandbox.env names (Sandboxing Roadmap)
  if (y.sandbox && Object.values(steps).some((s) => s.kind === 'ai')) warnings.push('sandbox: ai steps have open network access and the variables in sandbox.env');
  return { ok: true, config: { yamlPath: read.abs, name: basename(read.abs, extname(read.abs)), folder, budgetUsd, flow, steps, warnings, ...(y.sandbox && { sandbox: y.sandbox }) } };
}

/** Rework routes are dotted and marked ↺. */
export function toMermaid(flow: FlowDef): string {
  const node = (id: string) => `n${flow.steps.findIndex((s) => s.id === id)}`;
  const label = { always: '', on_pass: '|pass|', on_fail: '|fail|' };
  return [
    'flowchart LR',
    ...flow.steps.map((s, i) => `  n${i}["${s.id}${s.approval ? ' (approval)' : ''}"]`),
    ...flow.edges.map((e) =>
      isRework(flow, e) ? `  ${node(e.from)} -.->|fail ↺| ${node(e.to)}` : `  ${node(e.from)} -->${label[e.condition]} ${node(e.to)}`,
    ),
  ].join('\n');
}
