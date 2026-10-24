/**
 * A recipe as the designer edits it: the flow file's own keys, as read, so a save writes back only what changed.
 * Pure functions; `editor.ts` holds the state, and the server's check (`run-flow --check`) is the judge.
 */
import { DEFAULT_MAX_ATTEMPTS, downstream, entries, isRework } from '../../packages/core/src/flow/flow.ts';
import type { EdgeCondition, FlowDef } from '../../packages/core/src/flow/flow.ts';

export type Condition = EdgeCondition;
export const CONDITIONS: Condition[] = ['always', 'on_pass', 'on_fail'];

export interface Edge { from: string; to: string; condition?: Condition }
/** run-agent's keys; the ones the designer has no field for (permissions, guards, plugins, skills) are kept as read. */
export interface Launch {
  adapter?: string;
  model?: string;
  effort?: string;
  prompt?: string;
  system_prompt?: string;
  skill?: string;
  limits?: { budget_usd?: number; max_turns?: number };
  [key: string]: unknown;
}
export interface Step extends Launch {
  shell?: string;
  requires?: string[];
  produces?: string[];
  gate?: 'approval';
  max_attempts?: number;
  timeout_minutes?: number;
  write_roots?: string[];
}
export interface Draft {
  budget_usd?: number;
  entry?: string;
  defaults?: Launch;
  steps?: Record<string, Step>;
  edges?: Edge[];
  [key: string]: unknown;
}

/** Step names and artifact types: what run-flow accepts as a file name. */
export const NAME = /^[a-z0-9][a-z0-9_-]*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The parsed YAML as a draft, or why the canvas cannot draw it; the check says the rest. */
export function toDraft(raw: unknown): Draft | string {
  if (!isRecord(raw)) return 'the file is not a mapping of keys';
  const { steps, edges } = raw;
  if (steps !== undefined && steps !== null && !isRecord(steps)) return 'steps: not a mapping of step names';
  for (const [id, s] of Object.entries(isRecord(steps) ? steps : {})) {
    if (s !== null && !isRecord(s)) return `steps.${id}: not a mapping of keys`;
  }
  if (edges !== undefined && edges !== null && !Array.isArray(edges)) return 'edges: not a list';
  for (const [i, e] of (Array.isArray(edges) ? edges : []).entries()) {
    if (!isRecord(e) || typeof e.from !== 'string' || typeof e.to !== 'string') return `edges.${i}: needs one from step and one to step`;
  }
  // `plan:` with nothing after it reads as null; the designer edits it as a step with no keys yet.
  const out: Draft = { ...raw };
  if (isRecord(steps)) out.steps = Object.fromEntries(Object.entries(steps).map(([id, s]) => [id, (s ?? {}) as Step]));
  return out;
}

export const stepsOf = (d: Draft): Record<string, Step> => d.steps ?? {};
export const edgesOf = (d: Draft): Edge[] => d.edges ?? [];
export const conditionOf = (e: Edge): Condition => e.condition ?? 'always';

/** The engine's view of the draft, for the core's graph functions. */
export function flowDef(d: Draft): FlowDef {
  return {
    steps: Object.entries(stepsOf(d)).map(([id, s]) => ({
      id,
      requires: names(s.requires),
      produces: names(s.produces),
      approval: s.gate === 'approval',
      maxAttempts: s.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
    })),
    edges: edgesOf(d).map((e) => ({ from: e.from, to: e.to, condition: conditionOf(e) })),
    ...(d.entry !== undefined && { entry: d.entry }),
  };
}

/** `obj` with `patch` applied; an undefined value removes its key, so an emptied field leaves the YAML. */
export function assign<T extends object>(obj: T, patch: Partial<T>): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

export const setStep = (d: Draft, id: string, step: Step): Draft => ({ ...d, steps: { ...stepsOf(d), [id]: step } });

/** A new step with no keys of its own, routed from `after` when given; returns the draft and the step's name. */
export function addStep(d: Draft, after?: string): [Draft, string] {
  const steps = stepsOf(d);
  let n = Object.keys(steps).length + 1;
  while (`step-${n}` in steps) n++;
  const id = `step-${n}`;
  const out: Draft = { ...d, steps: { ...steps, [id]: {} } };
  if (after !== undefined && after in steps) out.edges = [...edgesOf(d), { from: after, to: id }];
  return [out, id];
}

/** Removes the routes at `edges` (indexes), then the steps `ids` with every route into or out of them. */
export function remove(d: Draft, ids: string[], edges: number[] = []): Draft {
  const gone = new Set(ids);
  const out: Draft = { ...d, steps: Object.fromEntries(Object.entries(stepsOf(d)).filter(([id]) => !gone.has(id))) };
  if (d.edges) out.edges = d.edges.filter((e, i) => !edges.includes(i) && !gone.has(e.from) && !gone.has(e.to));
  if (d.entry !== undefined && gone.has(d.entry)) delete out.entry;
  return out;
}

/** The step keeps its place in the file; its routes and `entry:` follow the new name. */
export function renameStep(d: Draft, from: string, to: string): Draft {
  const steps = stepsOf(d);
  if (from === to || !(from in steps) || to in steps) return d;
  const swap = (x: string) => (x === from ? to : x);
  const out: Draft = { ...d, steps: Object.fromEntries(Object.entries(steps).map(([id, s]) => [swap(id), s])) };
  if (d.edges) out.edges = d.edges.map((e) => ({ ...e, from: swap(e.from), to: swap(e.to) }));
  if (d.entry === from) out.entry = to;
  return out;
}

/** A route from `from` to `to`. One that would close a loop starts as a failure route back, a rework; any other as `always`. */
export function connect(d: Draft, from: string, to: string): Draft {
  if (edgesOf(d).some((e) => e.from === from && e.to === to)) return d;
  const back = isRework(flowDef(d), { from, to, condition: 'on_fail' });
  return { ...d, edges: [...edgesOf(d), back ? { from, to, condition: 'on_fail' } : { from, to }] };
}

/** `always` is written by leaving `condition` out, as the run-flow reference writes it. */
export function setCondition(d: Draft, index: number, condition: Condition): Draft {
  const edges = edgesOf(d).map((e, i) => (i === index ? assign(e, { condition: condition === 'always' ? undefined : condition }) : e));
  return { ...d, edges };
}

export const nextCondition = (c: Condition): Condition => CONDITIONS[(CONDITIONS.indexOf(c) + 1) % CONDITIONS.length];

/** Steps a rework route leads back to: the only ones whose `max_attempts` anything reads. */
export function reworked(d: Draft): Set<string> {
  const def = flowDef(d);
  return new Set(def.edges.filter((e) => isRework(def, e)).map((e) => e.to));
}

/** Types the steps before `id` produce, along forward routes: what `id` may require. */
export function upstream(d: Draft, id: string): Set<string> {
  const def = flowDef(d);
  return new Set(def.steps.filter((p) => p.id !== id && downstream(def, p.id).has(id)).flatMap((p) => p.produces));
}

/** A step's launch keys over the flow's `defaults`: a step's own key replaces the default whole. */
export const effective = (d: Draft, s: Step): Launch => ({ ...d.defaults, ...s });

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const str = (v: string) => (v === '' ? undefined : v);
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const list = (v: string[]) => (v.length ? v : undefined);
/** `limits` with two fields set over it, or undefined once it is empty. */
const limitsOf = (l: Launch['limits'], budget: string, turns: string) => {
  const out = assign(l ?? {}, { budget_usd: num(budget), max_turns: num(turns) });
  return Object.keys(out).length ? out : undefined;
};

/** A step's fields as the inspector's form holds them: text for inputs, lists for chips. */
export interface StepValues {
  name: string;
  kind: 'agent' | 'shell';
  shell: string;
  adapter: string;
  model: string;
  effort: string;
  prompt: string;
  skill: string;
  system_prompt: string;
  budget: string;
  max_turns: string;
  timeout: string;
  attempts: string;
  gate: boolean;
  requires: string[];
  produces: string[];
  write_roots: string[];
}

export function toValues(id: string, s: Step): StepValues {
  return {
    name: id,
    kind: s.shell === undefined ? 'agent' : 'shell',
    shell: text(s.shell),
    adapter: text(s.adapter),
    model: text(s.model),
    effort: text(s.effort),
    prompt: text(s.prompt),
    skill: text(s.skill),
    system_prompt: text(s.system_prompt),
    budget: text(s.limits?.budget_usd),
    max_turns: text(s.limits?.max_turns),
    timeout: text(s.timeout_minutes),
    attempts: text(s.max_attempts),
    gate: s.gate === 'approval',
    requires: names(s.requires),
    produces: names(s.produces),
    write_roots: names(s.write_roots),
  };
}

/** run-agent's keys and `write_roots`: a shell step takes none, so a step that becomes one drops them, as run-flow would refuse them. */
const AGENT_ONLY = ['adapter', 'model', 'effort', 'prompt', 'system_prompt', 'skill', 'skills', 'plugins', 'permissions', 'guards', 'limits', 'write_roots'];

/** The step the form describes, over the step as read: keys the form has no field for stay, and an emptied field's key goes. */
export function fromValues(v: StepValues, s: Step): Step {
  const both = {
    timeout_minutes: num(v.timeout),
    max_attempts: num(v.attempts),
    gate: v.gate ? ('approval' as const) : undefined,
    requires: list(v.requires),
    produces: list(v.produces),
  };
  if (v.kind === 'shell') {
    const kept = Object.fromEntries(Object.entries(s).filter(([k]) => !AGENT_ONLY.includes(k))) as Step;
    return assign(kept, { shell: v.shell, ...both });
  }
  return assign(s, {
    shell: undefined,
    adapter: str(v.adapter),
    model: str(v.model),
    effort: str(v.effort),
    prompt: str(v.prompt),
    skill: str(v.skill),
    system_prompt: str(v.system_prompt),
    limits: limitsOf(s.limits, v.budget, v.max_turns),
    write_roots: list(v.write_roots),
    ...both,
  });
}

/** The flow's own fields: its ceiling, its first step, and the defaults every agent step starts from. */
export interface FlowValues { budget: string; entry: string; adapter: string; model: string; effort: string; run_budget: string; max_turns: string }

export function toFlowValues(d: Draft): FlowValues {
  const l = d.defaults ?? {};
  return {
    budget: text(d.budget_usd),
    entry: text(d.entry),
    adapter: text(l.adapter),
    model: text(l.model),
    effort: text(l.effort),
    run_budget: text(l.limits?.budget_usd),
    max_turns: text(l.limits?.max_turns),
  };
}

/** The order the run-flow reference writes a flow's own keys in. */
const FLOW_KEYS = ['budget_usd', 'entry', 'defaults', 'steps', 'edges'];

export function fromFlowValues(v: FlowValues, d: Draft): Draft {
  const l = d.defaults ?? {};
  const defaults = assign(l, { adapter: str(v.adapter), model: str(v.model), effort: str(v.effort), limits: limitsOf(l.limits, v.run_budget, v.max_turns) });
  const out = assign(d, { budget_usd: num(v.budget), entry: str(v.entry), defaults: Object.keys(defaults).length ? defaults : undefined });
  // A key the flow did not have (or had, until its field was emptied) goes where the reference writes it, not last.
  const keys = Object.keys(out).filter((k) => k in d);
  for (const k of Object.keys(out).filter((x) => !(x in d))) {
    const next = keys.findIndex((x) => FLOW_KEYS.indexOf(x) > FLOW_KEYS.indexOf(k));
    keys.splice(next === -1 ? keys.length : next, 0, k);
  }
  return Object.fromEntries(keys.map((k) => [k, out[k]]));
}

export const NODE_WIDTH = 140;
const COLUMN = 200;
const ROW = 104;

/**
 * Where each step sits: a column per step of the longest forward path to it, rows in file order and centred.
 * Rework routes are left out, so a loop does not stretch the layout. The layout is the same on every open, which
 * is why the file holds no positions (backlog D4).
 */
export function layout(d: Draft): Record<string, { x: number; y: number }> {
  const def = flowDef(d);
  const col: Record<string, number> = Object.fromEntries(def.steps.map((s) => [s.id, 0]));
  const fwd = def.edges.filter((e) => e.from !== e.to && e.from in col && e.to in col && !isRework(def, e));
  // A forward loop is an error the check reports. While it is there, the route that closes it, found depth first
  // from the start, is left out of the layout, so the steps keep their places.
  const state = new Map<string, 'open' | 'done'>();
  const acyclic: typeof fwd = [];
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const e of fwd.filter((x) => x.from === id && state.get(x.to) !== 'open')) {
      acyclic.push(e);
      if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, 'done');
  };
  for (const id of [...entries(def), ...def.steps.map((s) => s.id)]) if (id in col && !state.has(id)) visit(id);
  for (let moved = true; moved; ) {
    moved = false;
    for (const e of acyclic) {
      if (col[e.to] > col[e.from]) continue;
      col[e.to] = col[e.from] + 1;
      moved = true;
    }
  }
  const columns = new Map<number, string[]>();
  for (const s of def.steps) columns.set(col[s.id], [...(columns.get(col[s.id]) ?? []), s.id]);
  const at: Record<string, { x: number; y: number }> = {};
  for (const [c, ids] of columns) ids.forEach((id, i) => (at[id] = { x: c * COLUMN, y: (i - (ids.length - 1) / 2) * ROW }));
  return at;
}

export type Shape = 'linear' | 'fan' | 'loop' | 'fanloop' | 'branch';

/** The library's glyph: a parallel split, a rework loop, both, a pass/fail split, or a straight line. */
export function shape(steps: string[], edges: { from: string; to: string; condition: string }[]): Shape {
  const def: FlowDef = {
    steps: steps.map((id) => ({ id, requires: [], produces: [], approval: false, maxAttempts: DEFAULT_MAX_ATTEMPTS })),
    edges: edges.map((e) => ({ ...e, condition: e.condition as Condition })),
  };
  const loop = def.edges.some((e) => isRework(def, e));
  const fwd = def.edges.filter((e) => !isRework(def, e));
  const fan = steps.some((id) => fwd.filter((e) => e.from === id && e.condition === 'always').length > 1);
  const branch = steps.some((id) => ['on_pass', 'on_fail'].every((c) => fwd.some((e) => e.from === id && e.condition === c)));
  if (fan) return loop ? 'fanloop' : 'fan';
  return loop ? 'loop' : branch ? 'branch' : 'linear';
}

export type Target = { step: string } | { edge: number } | { flow: true };

/** What a `--check` line is about, from its field: `steps.<name>…`, `edges.<n>…`, or else the flow as a whole. */
export function target(line: string): Target {
  const field = line.slice(0, line.indexOf(': '));
  const step = /^steps\.([^.]+)/.exec(field);
  if (step) return { step: step[1] };
  const edge = /^edges\.(\d+)/.exec(field);
  return edge ? { edge: Number(edge[1]) } : { flow: true };
}
