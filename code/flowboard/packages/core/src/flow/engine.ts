/**
 * The flow engine: one pure function from (flow, state, event) to the next
 * state and the commands a host carries out. Every PRD §8 rule lives here.
 */
import { downstream, entries, isRework } from './flow.ts';
import type { FlowDef, Outcome } from './flow.ts';

export type InstanceState = 'pending' | 'running' | 'awaiting_approval' | 'done' | 'failed';
export type GateKind = 'verdict' | 'escalation' | 'run_failed';
export type Decision = 'approve' | 'reject' | 'retry' | 'fail';
/** `from`: escalation only. */
export interface Gate { kind: GateKind; reason: string; evidence: string[]; decisions: Decision[]; from?: string }
export interface StepInstance { state: InstanceState; attempts: number; outcome?: Outcome; gate?: Gate; inputs: string[]; note?: string }
export interface RunRecord { id: number; step: string; attempt: number; live: boolean; costUsd: number; wasted: boolean; outcome?: Outcome; reason?: string; error?: string; fingerprint?: string }
export interface FlowState { status: 'running' | 'done' | 'failed'; steps: Record<string, StepInstance>; runs: RunRecord[] }
export interface RunEnd { costUsd: number; outcome?: Outcome; reason?: string; error?: string; missing?: string[]; fingerprint?: string }
export type FlowEvent =
  | { type: 'start' }
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

  const startRun = (step: string, attempt: number, inputs: string[], note?: string) => {
    const id = s.runs.length + 1;
    s.runs.push({ id, step, attempt, live: true, costUsd: 0, wasted: false });
    s.steps[step] = { state: 'running', attempts: attempt, inputs: [...inputs], ...(note !== undefined && { note }) };
    commands.push({ type: 'run', run: id, step, attempt, inputs: [...inputs], ...(note !== undefined && { note }) });
  };

  const openGate = (step: string, kind: GateKind, reason: string, evidence: string[], from?: string) => {
    const onFail = routes(step).some((e) => e.condition === 'on_fail');
    const gate: Gate = { kind, reason, evidence: [...evidence], decisions: GATE_DECISIONS[kind].filter((d) => d !== 'reject' || onFail), ...(from !== undefined && { from }) };
    s.steps[step] ??= { state: 'pending', attempts: 0, inputs: [] }; // a repair step reached only by rework may have none yet
    s.steps[step].state = 'awaiting_approval';
    s.steps[step].gate = gate;
    commands.push({ type: 'gate', step, gate });
  };

  /** Rerun `t` as `attempt`, with `from`'s output: every run of `t` and below it is wasted, live ones stopped. */
  const redo = (t: string, from: string, attempt: number, note?: string) => {
    const reset = new Set([t, ...downstream(flow, t)]);
    const stopped: number[] = [];
    for (const r of s.runs) {
      if (!reset.has(r.step)) continue;
      r.wasted = true;
      if (r.live) {
        r.live = false;
        r.error = 'superseded';
        stopped.push(r.id);
      }
    }
    for (const id of reset) if (id !== t) delete s.steps[id];
    if (stopped.length) commands.push({ type: 'stop', runs: stopped });
    startRun(t, attempt, [...new Set([...def(t).requires, ...def(from).produces])], note);
  };

  /** A rework route from `from` to `t` fired: rerun `t`, or hand the loop to a person. */
  const rework = (t: string, from: string, note?: string) => {
    const used = s.steps[t]?.attempts ?? 0;
    const max = def(t).maxAttempts;
    const runs = s.runs.filter((r) => r.step === from);
    const last = runs.at(-1);
    const prev = runs.slice(0, -1).findLast((r) => r.outcome === 'fail' && r.fingerprint);
    const escalate = (reason: string) => openGate(t, 'escalation', reason, def(from).produces, from);
    if (used + 1 > max) escalate(`${t} has used ${used} of ${max} attempts`);
    else if (last?.fingerprint && prev?.fingerprint === last.fingerprint) escalate(`${from} failed the same way twice`);
    else redo(t, from, used + 1, note);
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
    for (const e of out) {
      if (e.condition !== 'always' && e.condition !== `on_${outcome}`) continue;
      if (isRework(flow, e)) rework(e.to, step, note);
      else s.steps[e.to] ??= { state: 'pending', attempts: 0, inputs: [] };
    }
  };

  const failFlow = () => {
    const stopped = s.runs.filter((r) => r.live);
    for (const r of stopped) {
      r.live = false;
      r.error = 'stopped';
    }
    for (const inst of Object.values(s.steps)) if (LIVE.includes(inst.state)) inst.state = 'failed';
    s.status = 'failed';
    if (stopped.length) commands.push({ type: 'stop', runs: stopped.map((r) => r.id) });
    commands.push({ type: 'end', status: 'failed' });
  };

  if (event.type === 'run_ended') {
    const r = s.runs.find((x) => x.id === event.run);
    if (r && !r.live) r.costUsd = event.costUsd; // a stopped run's late cost
    else if (r && s.status === 'running') {
      r.live = false;
      r.costUsd = event.costUsd;
      if (event.outcome) r.outcome = event.outcome;
      if (event.reason) r.reason = event.reason;
      if (event.error) r.error = event.error;
      if (event.fingerprint) r.fingerprint = event.fingerprint;
      const inst = s.steps[r.step];
      if (event.interrupted) {
        r.wasted = true;
        r.error = 'interrupted'; // the instance stays running, for resume
      } else if (event.error) {
        r.wasted = true;
        openGate(r.step, 'run_failed', `run failed: ${event.error}`, []);
      } else if (event.missing?.length) {
        if (event.outcome) inst.outcome = event.outcome;
        openGate(r.step, 'verdict', `did not write: ${event.missing.join(', ')}`, []);
      } else if (def(r.step).approval) {
        if (event.outcome) inst.outcome = event.outcome;
        const says = `${event.outcome ? `; the agent says ${event.outcome}` : ''}${event.reason ? `: ${event.reason}` : ''}`;
        openGate(r.step, 'verdict', `approval needed${says}`, def(r.step).produces);
      } else complete(r.step, event.outcome);
    }
  } else if (s.status !== 'running') {
    // Once the flow has ended, only a stopped run's late cost is recorded.
  } else if (event.type === 'start') {
    if (!s.runs.length) {
      const entry = entries(flow)[0];
      startRun(entry, 1, def(entry).requires);
    }
  } else if (event.type === 'decide') {
    const inst = s.steps[event.step];
    if (inst?.state !== 'awaiting_approval' || !inst.gate?.decisions.includes(event.decision)) return { state, commands: [] };
    if (event.decision === 'approve') complete(event.step, 'pass');
    else if (event.decision === 'reject') complete(event.step, 'fail', event.note);
    else if (event.decision === 'fail') failFlow();
    else if (inst.gate.kind === 'run_failed') startRun(event.step, inst.attempts, inst.inputs, event.note);
    else if (inst.gate.kind === 'escalation') redo(event.step, inst.gate.from!, inst.attempts + 1, event.note); // one more, past max_attempts
    else {
      const latest = s.runs.findLast((r) => r.step === event.step);
      if (latest) latest.wasted = true;
      startRun(event.step, inst.attempts + 1, inst.inputs, event.note);
    }
  } else if (event.type === 'resume') {
    // Runs still marked live never ended: the host stopped or crashed.
    for (const r of s.runs.filter((x) => x.live)) Object.assign(r, { live: false, wasted: true, error: 'interrupted' });
    for (const d of flow.steps) {
      const inst = s.steps[d.id];
      if (inst?.state === 'running') startRun(d.id, inst.attempts, inst.inputs, inst.note);
    }
    for (const d of flow.steps) {
      const inst = s.steps[d.id];
      if (inst?.state === 'awaiting_approval' && inst.gate) commands.push({ type: 'gate', step: d.id, gate: inst.gate });
    }
  }

  // Settle: start each pending step that nothing live can still feed, then end when nothing is left.
  if (s.status === 'running' && s.runs.length) {
    const live = Object.keys(s.steps).filter((id) => LIVE.includes(s.steps[id].state));
    for (const d of flow.steps) {
      if (s.steps[d.id]?.state !== 'pending') continue;
      const others = live.filter((x) => x !== d.id);
      const blocking = new Set([...others, ...others.flatMap((x) => [...downstream(flow, x)])]);
      const upstream = flow.edges.filter((e) => e.to === d.id && !isRework(flow, e)).map((e) => e.from);
      if (!upstream.some((u) => blocking.has(u))) startRun(d.id, 1, d.requires);
    }
    if (!Object.values(s.steps).some((i) => LIVE.includes(i.state))) {
      s.status = 'done';
      commands.push({ type: 'end', status: 'done' });
    }
  }
  return { state: s, commands };
}
