/**
 * A flow: steps joined by routes, one route per `step_edges` row. The engine
 * and the validator take this plain shape, wherever the flow was read from.
 */
export type Outcome = 'pass' | 'fail';
export type EdgeCondition = 'always' | 'on_pass' | 'on_fail';
export interface FlowEdge { from: string; to: string; condition: EdgeCondition }
export interface StepDef { id: string; requires: string[]; produces: string[]; approval: boolean; maxAttempts: number }
/** `entry`: the step the flow starts at, when the routes alone do not say. */
export interface FlowDef { steps: StepDef[]; edges: FlowEdge[]; entry?: string }

export const DEFAULT_MAX_ATTEMPTS = 3;

/** `edge` is an index into `flow.edges`; `entry` marks a problem with `flow.entry`. */
export interface FlowProblem { step?: string; edge?: number; entry?: true; message: string; warning?: true }

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
 * The steps a flow starts at: the one `entry` names, else those no route points to. A flow that loops back to
 * its first step names it: when every step has a route into it, the routes cannot say which one goes first.
 */
export function entries(flow: FlowDef): string[] {
  if (flow.entry !== undefined) return [flow.entry];
  return flow.steps.filter((s) => !flow.edges.some((e) => e.to === s.id)).map((s) => s.id);
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
  if (flow.entry !== undefined && !ids.has(flow.entry)) problems.push({ entry: true, message: `unknown step "${flow.entry}"` });
  if (problems.length) return problems;

  const starts = entries(flow);
  if (!starts.length) problems.push({ message: 'no entry step: every step has a route into it; name the first one with entry:' });
  for (const id of starts.length > 1 ? starts : []) {
    const others = starts.filter((x) => x !== id).map((x) => `"${x}"`).join(', ');
    problems.push({ step: id, message: `no route leads here, nor to ${others}; a flow starts at one step, so route the others in` });
  }

  // A rework resets everything below its target, so another route fired by the same failure would act on
  // steps the reset removes or is about to remove, and the result would depend on the order of the edges.
  for (const s of flow.steps) {
    const fails = flow.edges.filter((e) => e.from === s.id && e.condition === 'on_fail');
    const rework = fails.find((e) => isRework(flow, e));
    if (!rework || fails.length < 2) continue;
    const others = fails.filter((e) => e !== rework).map((e) => `"${e.to}"`).join(', ');
    problems.push({ step: s.id, message: `on a failure it would rework "${rework.to}" and also take the on_fail route to ${others}; a rework route must be its step's only on_fail route` });
  }

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

  // A join runs once nothing can still feed it, so a branch cut off by a conditional route is not waited for.
  const conditional = fwd.filter((e) => e.condition !== 'always');
  const forwardReach = starts.length === 1 ? reach(fwd, starts[0]) : new Set<string>();
  for (const s of flow.steps) {
    const into = fwd.filter((e) => e.to === s.id);
    if (into.length < 2) continue;
    for (const e of into) {
      if (e.condition !== 'always') {
        problems.push({ step: s.id, warning: true, message: `waits for "${e.from}", whose route here is conditional; if it does not fire, ${s.id} runs without it` });
        continue;
      }
      // A source no forward route reaches (a repair step) runs on a failure, not behind a conditional route.
      if (!forwardReach.has(e.from)) continue;
      // Further up: a conditional route without which e.from never runs, while this join still can.
      const c = conditional.find((c) => {
        const without = reach(fwd.filter((x) => x !== c), starts[0]);
        return !without.has(e.from) && without.has(s.id);
      });
      if (c) {
        problems.push({ step: s.id, warning: true, message: `waits for "${e.from}", which runs only if the conditional route ${c.from} → ${c.to} fires; if it does not, ${s.id} runs without it` });
      }
    }
  }

  for (const e of flow.edges) {
    if (isRework(flow, e) && !flow.steps.find((x) => x.id === e.from)!.produces.length) {
      problems.push({ step: e.from, warning: true, message: `reworks "${e.to}" on a failure but produces nothing, so ${e.to} runs again without seeing why` });
    }
  }
  return problems;
}
