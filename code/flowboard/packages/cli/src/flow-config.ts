/**
 * One flow YAML -> a FlowDef for the engine, plus one launch config per ai
 * step, checked the way run-agent checks a single run.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, sep } from 'node:path';
import { z } from 'zod';
import { DEFAULT_MAX_ATTEMPTS, isRework, validateFlow } from '@flowboard/core';
import type { FlowDef } from '@flowboard/core';
import { CLOSING, configFromObject, isDir, isFile, issueLines, readYaml, RunSchema, toAbs } from './config.ts';
import type { RunConfig } from './config.ts';

export const OUTCOME_CLOSING =
  'Before you stop, report your verdict with the set_outcome tool: "pass" if the work meets the task, "fail" if it does not, with a one-line reason.';

export interface AiStep { kind: 'ai'; run: RunConfig; timeoutMinutes?: number }
export interface ShellStep { kind: 'shell'; command: string; timeoutMinutes: number }
export interface FlowConfig { yamlPath: string; name: string; folder: string; flow: FlowDef; steps: Record<string, AiStep | ShellStep>; warnings: string[] }
export type FlowLoadResult = { ok: true; config: FlowConfig } | { ok: false; errors: string[] };

const SHELL_TIMEOUT_MINUTES = 30;
/** Step names and artifact types become file names; lowercase only, since macOS treats Plan.md and plan.md as one file. */
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const BAD_NAME = 'name may only use lowercase letters, digits, - and _';
const PSEUDO_STEP = 'no START or END here; a flow starts at the step no edge points to and ends when nothing is left to run';

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
const StepName = z.string({ error: 'one step name; write one edge per pair of steps' });
const FlowSchema = z.strictObject({
  folder: z.string().min(1),
  task: z.string().min(1),
  defaults: Launch.optional(),
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

export function loadFlow(yamlPath: string, baseDir: string): FlowLoadResult {
  const read = readYaml(yamlPath, baseDir);
  if (!read.ok) return read;
  const fail = (lines: string[]): FlowLoadResult => ({ ok: false, errors: lines.map((l) => `${yamlPath}: ${l}`) });
  const parsed = FlowSchema.safeParse(read.raw);
  if (!parsed.success) return fail(parsed.error.issues.flatMap((i) => issueLines(i, read.raw)));
  const y = parsed.data;

  // Bad names and yamlgraph's pseudo-steps count as schema errors: nothing else is checked after them.
  const bad: string[] = [];
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
  const folderAbs = toAbs(y.folder, baseDir);
  if (!isDir(folderAbs)) err(0, `folder: not a directory: ${folderAbs}`);
  const folder = isDir(folderAbs) ? realpathSync(folderAbs) : folderAbs;
  const taskAbs = toAbs(y.task, baseDir);
  if (!isFile(taskAbs)) err(0, `task: not a file: ${taskAbs}`);
  else if (!readFileSync(taskAbs, 'utf8').trim()) err(0, 'task: file is empty');
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
  };
  const problems = validateFlow(flow);
  for (const p of problems) {
    if (!p.warning) err(1, `${p.edge !== undefined ? `edges.${p.edge}` : p.step !== undefined ? `steps.${p.step}` : 'steps'}: ${p.message}`);
  }
  const warnings = problems.filter((p) => p.warning).map((p) => `steps.${p.step}: ${p.message}`);

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
      const path = toAbs(merged.prompt, baseDir);
      if (!isFile(path)) err(2, `${at}.prompt: not a file: ${path}`);
      else {
        template = readFileSync(path, 'utf8');
        if (!template.trim()) err(2, `${at}.prompt: file is empty`);
      }
    } else if (merged.skill === undefined && merged.system_prompt === undefined) {
      err(3, `${at}: an ai step needs prompt, skill or system_prompt`);
    }
    const roots = (st.write_roots ?? []).map((r) => toAbs(r, folder));
    roots.forEach((r, i) => inside(folder, r) || err(6, `${at}.write_roots.${i}: must be inside folder`));
    if (merged.limits?.max_turns === undefined && merged.limits?.budget_usd === undefined) {
      warnings.push(`${at}: no limits.max_turns or limits.budget_usd; nothing stops a looping agent`);
    }
    if (!filesOk) continue; // every step would repeat the folder or task error

    // The task file is every step's preamble; the step's own prompt is its template.
    const r = configFromObject({ ...merged, folder: y.folder, prompt: y.task }, baseDir);
    if (!r.ok) {
      r.errors.forEach((l) => err(7, `${at}.${l}`));
      continue;
    }
    const { spec } = r.config;
    if (template !== undefined) spec.prompt.template = template;
    if (y.edges.some((e) => e.from === name && e.condition !== 'always')) spec.prompt.closing = `${CLOSING} ${OUTCOME_CLOSING}`;
    if (roots.length) spec.guards = { ...spec.guards, writeRoots: roots };
    steps[name] = { kind: 'ai', run: { yamlPath: read.abs, ...r.config }, ...(st.timeout_minutes !== undefined && { timeoutMinutes: st.timeout_minutes }) };
  }

  if (found.length) return fail(found.sort((a, b) => a[0] - b[0]).map(([, line]) => line));
  return { ok: true, config: { yamlPath: read.abs, name: basename(read.abs, extname(read.abs)), folder, flow, steps, warnings } };
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
