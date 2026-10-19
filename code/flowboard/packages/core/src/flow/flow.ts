/**
 * A flow: steps joined by routes, one route per `step_edges` row. The engine
 * and the validator take this plain shape, wherever the flow was read from.
 */
export type Outcome = 'pass' | 'fail';
export type EdgeCondition = 'always' | 'on_pass' | 'on_fail';
export interface FlowEdge { from: string; to: string; condition: EdgeCondition }
export interface StepDef { id: string; requires: string[]; produces: string[]; approval: boolean; maxAttempts: number }
export interface FlowDef { steps: StepDef[]; edges: FlowEdge[] }

export const DEFAULT_MAX_ATTEMPTS = 3;

/** `edge` is an index into `flow.edges`. */
export interface FlowProblem { step?: string; edge?: number; message: string; warning?: true }

// ponytail: every call recomputes the graph from the edge list; flows have a handful of steps.

/** Steps reachable from `from` along `edges`, `from` included. A Set's loop also visits what is added during it. */
function reach(edges: FlowEdge[], from: string): Set<string> {
  const seen = new Set([from]);
  for (const id of seen) for (const e of edges) if (e.from === id) seen.add(e.to);
  return seen;
}

/** An on_fail route to its own step or to an ancestor along always/on_pass routes. */
export function isRework(flow: FlowDef, edge: FlowEdge): boolean {
  return edge.condition === 'on_fail' && reach(flow.edges.filter((e) => e.condition !== 'on_fail'), edge.to).has(edge.from);
}

const forward = (flow: FlowDef) => flow.edges.filter((e) => !isRework(flow, e));

/**
 * The steps a flow starts at: those no route points to. When every step has a route into it, those only
 * rework routes point to, so a flow may loop back to its first step.
 */
export function entries(flow: FlowDef): string[] {
  const unrouted = flow.steps.filter((s) => !flow.edges.some((e) => e.to === s.id));
  if (unrouted.length) return unrouted.map((s) => s.id);
  const fwd = forward(flow);
  return flow.steps.filter((s) => !fwd.some((e) => e.to === s.id)).map((s) => s.id);
}

/** Steps reachable from `id` along non-rework routes; `id` itself excluded. */
export function downstream(flow: FlowDef, id: string): Set<string> {
  const out = reach(forward(flow), id);
  out.delete(id);
  return out;
}

/** Steps on a loop of `edges`: peel the steps nothing leads into, then those leading nowhere; the rest loop. */
function loops(ids: string[], edges: FlowEdge[]): string[] {
  const left = new Set(ids);
  for (const [side, other] of [['to', 'from'], ['from', 'to']] as const) {
    for (let peeled = true; peeled; ) {
      peeled = false;
      for (const id of left) {
        if (edges.some((e) => e[side] === id && left.has(e[other]))) continue;
        left.delete(id);
        peeled = true;
      }
    }
  }
  return ids.filter((id) => left.has(id));
}

export function validateFlow(flow: FlowDef): FlowProblem[] {
  const problems: FlowProblem[] = [];
  const ids = new Set(flow.steps.map((s) => s.id));
  const pairs = new Set<string>();
  flow.edges.forEach((e, edge) => {
    for (const name of new Set([e.from, e.to])) if (!ids.has(name)) problems.push({ edge, message: `unknown step "${name}"` });
    const pair = JSON.stringify([e.from, e.to]);
    if (pairs.has(pair)) problems.push({ edge, message: `repeats the edge ${e.from} → ${e.to}; keep one and set its condition` });
    pairs.add(pair);
  });
  if (problems.length) return problems;

  const starts = entries(flow);
  if (!starts.length) problems.push({ message: 'no entry step: every step has a route into it' });
  if (starts.length > 1) problems.push({ message: `more than one entry step: ${starts.join(', ')}` });

  const fwd = forward(flow);
  const looped = loops([...ids], fwd);
  if (looped.length) return [...problems, { message: `routes loop without an on_fail route back: ${looped.join(', ')}` }];

  if (starts.length === 1) {
    const reached = reach(flow.edges, starts[0]);
    for (const s of flow.steps) {
      if (!reached.has(s.id)) problems.push({ step: s.id, message: `no route leads here from the entry step "${starts[0]}"` });
    }
  }

  const producer = new Map<string, string>();
  for (const s of flow.steps) {
    for (const type of s.produces) {
      const first = producer.get(type) ?? s.id;
      producer.set(type, first);
      if (first !== s.id) problems.push({ step: s.id, message: `produces "${type}", which "${first}" also produces` });
    }
  }

  for (const s of flow.steps) {
    const before = flow.steps.filter((p) => p.id !== s.id && reach(fwd, p.id).has(s.id));
    for (const type of s.requires) {
      if (!before.some((p) => p.produces.includes(type))) problems.push({ step: s.id, message: `requires "${type}", and no step before it produces that` });
    }
  }

  for (const s of flow.steps) {
    const into = fwd.filter((e) => e.to === s.id);
    if (into.length < 2) continue;
    for (const e of into) {
      if (e.condition !== 'always') {
        problems.push({ step: s.id, warning: true, message: `waits for "${e.from}", whose route here is conditional; if it does not fire, ${s.id} runs without it` });
      }
    }
  }
  return problems;
}
