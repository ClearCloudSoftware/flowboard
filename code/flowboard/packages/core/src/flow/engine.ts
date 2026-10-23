/**
 * The flow engine: one pure function from (flow, state, event) to the next
 * state and the commands a host carries out. Every PRD §8 rule lives here.
 */
import { downstream, entries, isRework } from './flow.ts';
import type { FlowDef, FlowEdge, Outcome } from './flow.ts';

export type InstanceState = 'pending' | 'running' | 'awaiting_approval' | 'done' | 'failed';
export type GateKind = 'verdict' | 'escalation' | 'run_failed';
export type Decision = 'approve' | 'reject' | 'retry' | 'fail';
/** Escalation only: `from`, the step whose failure escalated; `note`, a Reject's note, kept for the Retry. */
export interface Gate { kind: GateKind; reason: string; evidence: string[]; decisions: Decision[]; from?: string; note?: string }
/** `note`: what the step's current attempt was started with; on a pending step, what its first run will get. */
export interface StepInstance { state: InstanceState; attempts: number; outcome?: Outcome; gate?: Gate; inputs: string[]; note?: string }
/**
 * `costUsd`: null when the provider reported none (a Claude run stopped before its result). `queued`: waiting
 * for the host to launch it. `missing`: outputs the run did not write.
 */
export interface RunRecord {
  id: number;
  step: string;
  attempt: number;
  live: boolean;
  queued?: true;
  costUsd: number | null;
  wasted: boolean;
  outcome?: Outcome;
  reason?: string;
  error?: string;
  missing?: string[];
  fingerprint?: string;
}
export interface FlowState { status: 'running' | 'done' | 'failed'; steps: Record<string, StepInstance>; runs: RunRecord[] }
export interface RunEnd { costUsd: number | null; outcome?: Outcome; reason?: string; error?: string; missing?: string[]; fingerprint?: string }
export type FlowEvent =
  | { type: 'start' }
  | { type: 'launched'; run: number }
  | ({ type: 'run_ended'; run: number; interrupted?: boolean } & RunEnd)
  | { type: 'decide'; step: string; decision: Decision; note?: string }
  | { type: 'resume' };
export type FlowCommand =
  | { type: 'run'; run: number; step: string; attempt: number; inputs: string[]; note?: string }
  | { type: 'gate'; step: string; gate: Gate }
  | { type: 'stop'; runs: number[] }
  | { type: 'end'; status: 'done' | 'failed' };
export type RunCommand = Extract<FlowCommand, { type: 'run' }>;

export const GATE_DECISIONS: Record<GateKind, Decision[]> = {
  verdict: ['approve', 'reject', 'retry', 'fail'],
  escalation: ['retry', 'fail'],
  run_failed: ['retry', 'fail'],
};

export function newFlowState(): FlowState {
  return { status: 'running', steps: {}, runs: [] };
}

const LIVE: InstanceState[] = ['pending', 'running', 'awaiting_approval'];

// ponytail: the flow is assumed valid (one entry, known steps, no forward loops); validateFlow ran first.
export function advance(flow: FlowDef, state: FlowState, event: FlowEvent): { state: FlowState; commands: FlowCommand[] } {
  const s = structuredClone(state);
  const commands: FlowCommand[] = [];
  const def = (id: string) => flow.steps.find((d) => d.id === id)!;
  const routes = (id: string) => flow.edges.filter((e) => e.from === id);
  // Own properties only: a step named `constructor` must not find Object.prototype's.
  const instance = (id: string): StepInstance | undefined => (Object.hasOwn(s.steps, id) ? s.steps[id] : undefined);

  const startRun = (step: string, attempt: number, inputs: string[], note?: string) => {
    const id = s.runs.length + 1;
    s.runs.push({ id, step, attempt, live: true, queued: true, costUsd: 0, wasted: false });
    s.steps[step] = { state: 'running', attempts: attempt, inputs: [...inputs], ...(note !== undefined && { note }) };
    commands.push({ type: 'run', run: id, step, attempt, inputs: [...inputs], ...(note !== undefined && { note }) });
  };

  const openGate = (step: string, kind: GateKind, reason: string, evidence: string[], from?: string, note?: string) => {
    const onFail = routes(step).some((e) => e.condition === 'on_fail');
    const gate: Gate = {
      kind,
      reason,
      evidence: [...evidence],
      decisions: GATE_DECISIONS[kind].filter((d) => d !== 'reject' || onFail),
      ...(from !== undefined && { from }),
      ...(note !== undefined && { note }),
    };
    if (!instance(step)) s.steps[step] = { state: 'pending', attempts: 0, inputs: [] }; // a repair step reached only by rework may have none yet
    s.steps[step].state = 'awaiting_approval';
    s.steps[step].gate = gate;
    commands.push({ type: 'gate', step, gate });
  };

  /** True when `e` fired for its step's outcome. */
  const firedFor = (e: FlowEdge) => {
    const inst = instance(e.from);
    return inst?.state === 'done' && (e.condition === 'always' || e.condition === `on_${inst.outcome}`);
  };

  /** Ends a live run the flow no longer wants with `error`; one the host never launched cost and did nothing. */
  const cut = (r: RunRecord, error: string, wasted: boolean) => {
    r.live = false;
    if (r.queued) r.error = 'not launched';
    else Object.assign(r, { error, ...(wasted && { wasted }) });
    delete r.queued;
  };

  /**
   * Everything below `t` is discarded: its runs wasted, live ones stopped, its steps dropped. A step that a route
   * from outside fed already waits again, pending, so a join keeps a sibling's input.
   */
  const clearBelow = (t: string) => {
    const below = downstream(flow, t);
    const stopped: number[] = [];
    for (const r of s.runs) {
      if (!below.has(r.step)) continue;
      if (!r.live) r.wasted = true;
      else {
        cut(r, 'superseded', true);
        stopped.push(r.id);
      }
    }
    for (const id of below) delete s.steps[id];
    for (const id of below) {
      const fed = flow.edges.find((e) => e.to === id && e.from !== t && !below.has(e.from) && !isRework(flow, e) && firedFor(e));
      if (fed) s.steps[id] = { state: 'pending', attempts: 0, inputs: [] };
    }
    if (stopped.length) commands.push({ type: 'stop', runs: stopped });
  };

  /** Rerun `t` as `attempt`: every run of `t` and below it is wasted, live ones stopped. */
  const redo = (t: string, inputs: string[], attempt: number, note?: string) => {
    clearBelow(t);
    for (const r of s.runs) if (r.step === t) r.wasted = true; // none is live: its failure, or its gate, came first
    startRun(t, attempt, [...new Set(inputs)], note);
  };

  /** What `from`'s failing run hands on: its outputs, less any it did not write this time. */
  const handed = (from: string) => {
    const missing = s.runs.findLast((r) => r.step === from)?.missing ?? [];
    return def(from).produces.filter((type) => !missing.includes(type));
  };

  /** A rework route from `from` to `t` fired: rerun `t`, or hand the loop to a person and stop what runs below it. */
  const rework = (t: string, from: string, note?: string) => {
    const used = instance(t)?.attempts ?? 0;
    const max = def(t).maxAttempts;
    const runs = s.runs.filter((r) => r.step === from);
    const last = runs.at(-1);
    const prev = runs.slice(0, -1).findLast((r) => r.outcome === 'fail' && r.fingerprint);
    // Retry and Fail would both discard the work below t, so it stops now instead of spending on.
    const escalate = (reason: string) => {
      clearBelow(t);
      openGate(t, 'escalation', reason, handed(from), from, note);
    };
    // A person's Retry may have taken t past its budget already.
    if (used + 1 > max) escalate(used > max ? `${t} has used ${used} attempts, past its max_attempts of ${max}` : `${t} has used ${used} of ${max} attempts`);
    else if (last?.fingerprint && prev?.fingerprint === last.fingerprint) escalate(`${from} failed the same way twice`);
    else redo(t, [...def(t).requires, ...handed(from)], used + 1, note);
  };

  const complete = (step: string, outcome: Outcome | undefined, note?: string) => {
    const inst = s.steps[step];
    const out = routes(step);
    if (outcome) inst.outcome = outcome;
    if (!outcome && out.some((e) => e.condition !== 'always')) return openGate(step, 'verdict', 'no outcome reported', def(step).produces);
    if (outcome === 'fail' && !out.some((e) => e.condition !== 'on_pass')) {
      const reason = s.runs.findLast((r) => r.step === step)?.reason;
      return openGate(step, 'verdict', `failed${reason ? ` (${reason})` : ''}, and no edge handles a failure`, def(step).produces);
    }
    inst.state = 'done';
    delete inst.gate;
    // A rework goes last: it resets what lies below its target, the targets of the other routes included, so
    // the result does not depend on the order the edges are written in.
    const fired = out.filter((e) => e.condition === 'always' || e.condition === `on_${outcome}`);
    for (const e of fired.filter((x) => !isRework(flow, x))) {
      if (!instance(e.to)) s.steps[e.to] = { state: 'pending', attempts: 0, inputs: [], ...(note !== undefined && { note }) };
      else if (note !== undefined && instance(e.to)!.state === 'pending') instance(e.to)!.note ??= note;
    }
    for (const e of fired.filter((x) => isRework(flow, x))) rework(e.to, step, note);
  };

  const failFlow = () => {
    const stopped = s.runs.filter((r) => r.live);
    for (const r of stopped) cut(r, 'stopped', false);
    for (const inst of Object.values(s.steps)) if (LIVE.includes(inst.state)) inst.state = 'failed';
    s.status = 'failed';
    if (stopped.length) commands.push({ type: 'stop', runs: stopped.map((r) => r.id) });
    commands.push({ type: 'end', status: 'failed' });
  };

  /** A run cut off before it ended: wasted, unless it never launched. Its step stays running, for resume. */
  const interrupt = (r: RunRecord) => cut(r, 'interrupted', true);

  if (event.type === 'launched') {
    const r = s.runs.find((x) => x.id === event.run);
    if (r?.live) delete r.queued;
  } else if (event.type === 'run_ended') {
    const r = s.runs.find((x) => x.id === event.run);
    if (r && !r.live) r.costUsd = event.costUsd; // a stopped run's late cost
    else if (r && s.status === 'running') {
      r.live = false;
      r.costUsd = event.costUsd;
      if (event.outcome) r.outcome = event.outcome;
      if (event.reason) r.reason = event.reason;
      if (event.error) r.error = event.error;
      if (event.missing?.length) r.missing = [...event.missing];
      if (event.fingerprint) r.fingerprint = event.fingerprint;
      const inst = s.steps[r.step];
      if (event.interrupted) interrupt(r);
      else if (event.error) {
        r.wasted = true;
        openGate(r.step, 'run_failed', `run failed: ${event.error}`, []);
      } else if (event.missing?.length) {
        if (event.outcome) inst.outcome = event.outcome;
        openGate(r.step, 'verdict', `did not write: ${event.missing.join(', ')}`, []);
      } else if (def(r.step).approval) {
        if (event.outcome) inst.outcome = event.outcome;
        const says = `${event.outcome ? `; it reported ${event.outcome}` : ''}${event.reason ? `: ${event.reason}` : ''}`;
        openGate(r.step, 'verdict', `approval needed${says}`, def(r.step).produces);
      } else complete(r.step, event.outcome);
      if (!event.interrupted) delete r.queued; // it ran, whether or not its launch was reported
    }
  } else if (s.status !== 'running') {
    // Once the flow has ended, only a stopped run's late cost is recorded.
  } else if (event.type === 'start') {
    if (!s.runs.length) {
      const entry = entries(flow)[0];
      startRun(entry, 1, def(entry).requires);
    }
  } else if (event.type === 'decide') {
    const inst = instance(event.step);
    if (inst?.state !== 'awaiting_approval' || !inst.gate?.decisions.includes(event.decision)) return { state, commands: [] };
    // A note goes to the runs the decision starts: Approve's and Reject's to the steps their routes start.
    if (event.decision === 'approve') complete(event.step, 'pass', event.note);
    else if (event.decision === 'reject') complete(event.step, 'fail', event.note);
    else if (event.decision === 'fail') failFlow();
    else if (inst.gate.kind === 'run_failed') startRun(event.step, inst.attempts, inst.inputs, event.note ?? inst.note); // the same attempt
    else if (inst.gate.kind === 'escalation') {
      // One more attempt, past max_attempts, with the evidence the gate showed.
      redo(event.step, [...def(event.step).requires, ...inst.gate.evidence], inst.attempts + 1, event.note ?? inst.gate.note);
    } else {
      const latest = s.runs.findLast((r) => r.step === event.step);
      if (latest) latest.wasted = true;
      startRun(event.step, inst.attempts + 1, inst.inputs, event.note ?? inst.note); // the next attempt, same guidance
    }
  } else if (event.type === 'resume') {
    // Runs still marked live never ended: the host stopped or crashed.
    for (const r of s.runs.filter((x) => x.live)) interrupt(r);
    for (const d of flow.steps) {
      const inst = instance(d.id);
      if (inst?.state === 'running') startRun(d.id, inst.attempts, inst.inputs, inst.note);
    }
    for (const d of flow.steps) {
      const inst = instance(d.id);
      if (inst?.state === 'awaiting_approval' && inst.gate) commands.push({ type: 'gate', step: d.id, gate: inst.gate });
    }
  }

  // Settle: start each pending step that nothing live can still feed, then end when nothing is left.
  if (s.status === 'running' && s.runs.length) {
    const live = Object.keys(s.steps).filter((id) => LIVE.includes(s.steps[id].state));
    for (const d of flow.steps) {
      if (instance(d.id)?.state !== 'pending') continue;
      const others = live.filter((x) => x !== d.id);
      const blocking = new Set([...others, ...others.flatMap((x) => [...downstream(flow, x)])]);
      const upstream = flow.edges.filter((e) => e.to === d.id && !isRework(flow, e)).map((e) => e.from);
      if (!upstream.some((u) => blocking.has(u))) startRun(d.id, 1, d.requires, instance(d.id)!.note);
    }
    if (!Object.values(s.steps).some((i) => LIVE.includes(i.state))) {
      s.status = 'done';
      commands.push({ type: 'end', status: 'done' });
    }
  }
  return { state: s, commands };
}
