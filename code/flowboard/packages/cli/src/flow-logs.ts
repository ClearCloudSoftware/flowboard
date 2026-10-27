/**
 * The flow designer's view of run-flow's run folders: `runs/<stamp>-<flow>/`, each with its pinned `flow.json`,
 * its `state.json`, and one `<NNN>-<step>.jsonl` log per step run, a line per event as the adapter emitted it.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlowState, Gate, RunRecord } from '../../core/src/flow/engine.ts';
import type { PageAsk } from './ask/page.ts';
import { isDir, isFile } from './config.ts';
import type { FlowConfig } from './flow-config.ts';

/**
 * `running`: its host is alive. `waiting`: alive, and asking the page. `paused`: no host, not ended, so
 * `--resume` continues it (stopped, paused at a gate, over budget, or crashed). `starting`: no state yet.
 */
export type RunStatus = 'starting' | 'running' | 'waiting' | 'paused' | 'done' | 'failed';
export interface RunSummary { name: string; flow: string; status: RunStatus }
/** One step run's log: `lines` are its JSONL lines parsed, the unreadable ones left out. */
export interface StepLog { run: number; step: string; lines: Record<string, unknown>[] }

const RUN = /^[\w.-]+$/;
const LOG = /^(\d{3,})-([a-z0-9][a-z0-9_-]*)\.jsonl$/;
const json = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
};

/** The run folders in `runsDir`, newest first (their names start with the time they started). */
export function listRuns(runsDir: string): RunSummary[] {
  if (!isDir(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((n) => RUN.test(n) && isFile(join(runsDir, n, 'flow.json')))
    .sort()
    .reverse()
    .map((name) => {
      const pin = json(join(runsDir, name, 'flow.json')) as { config?: { name?: string } } | undefined;
      return { name, flow: pin?.config?.name ?? '', status: statusOf(join(runsDir, name)) };
    });
}

/** Every step log of the run `name`, in run order; undefined when there is no such run. */
export function readLogs(runsDir: string, name: string): StepLog[] | undefined {
  const dir = join(runsDir, name);
  if (!RUN.test(name) || name.startsWith('.') || !isDir(dir)) return undefined;
  return readdirSync(dir)
    .map((f) => LOG.exec(f))
    .filter((m) => m !== null)
    .map((m) => ({
      run: Number(m[1]),
      step: m[2],
      // ponytail: re-reads whole files on every poll; read from an offset if logs grow past a few MB
      lines: readFileSync(join(dir, m[0]), 'utf8')
        .split('\n')
        .flatMap((l) => {
          try {
            return l ? [JSON.parse(l) as Record<string, unknown>] : [];
          } catch {
            return []; // a line still being written
          }
        }),
    }))
    .sort((a, b) => a.run - b.run);
}

const alive = (pid: unknown) => {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};
const asksOf = (dir: string): PageAsk[] =>
  isDir(join(dir, 'asks'))
    ? readdirSync(join(dir, 'asks'))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .flatMap((f) => (json(join(dir, 'asks', f)) as PageAsk | undefined) ?? [])
    : [];
const hostOf = (dir: string) => json(join(dir, 'host.json')) as { pid?: number; page?: boolean } | undefined;

function statusOf(dir: string): RunStatus {
  const state = json(join(dir, 'state.json')) as { status?: string } | undefined;
  if (!state) return alive(hostOf(dir)?.pid) ? 'starting' : 'paused';
  if (state.status === 'done' || state.status === 'failed') return state.status;
  if (!alive(hostOf(dir)?.pid)) return 'paused';
  return asksOf(dir).length ? 'waiting' : 'running';
}

export interface StepView {
  name: string;
  kind: 'ai' | 'shell';
  adapter?: string;
  model?: string;
  effort?: string;
  command?: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  outcome?: string;
  gate?: Gate;
}
export interface RunView extends RunRecord { startedAt?: string; endedAt?: string }
export interface ArtifactView { type: string; file: string; bytes: number; by?: string }
export interface RunDetail {
  name: string;
  flow: string;
  status: RunStatus;
  /** The host takes decisions from the page (`--page`). */
  page: boolean;
  folder: string;
  budgetUsd: number;
  sandbox: string;
  steps: StepView[];
  runs: RunView[];
  spentUsd: number;
  wastedUsd: number;
  artifacts: ArtifactView[];
  /** `changes.patch` (an OpenSandbox run's edits), cut at PATCH_MAX bytes. */
  patch?: { text: string; cut: boolean };
  asks: PageAsk[];
}

const PATCH_MAX = 300_000;

/** What the run page shows of one run; undefined when there is no such run. */
export function readRun(runsDir: string, name: string): RunDetail | undefined {
  const dir = join(runsDir, name);
  if (!RUN.test(name) || name.startsWith('.') || !isFile(join(dir, 'flow.json'))) return undefined;
  const pin = json(join(dir, 'flow.json')) as { config: FlowConfig; artifactsDir: string } | undefined;
  if (!pin?.config) return undefined;
  const { config } = pin;
  const state = json(join(dir, 'state.json')) as FlowState | undefined;
  const logs = readLogs(runsDir, name) ?? [];
  const times = new Map(logs.map((l) => [l.run, { startedAt: l.lines[0]?.at as string | undefined, endedAt: l.lines.findLast((x) => x.kind === 'result')?.at as string | undefined }]));
  const runs = (state?.runs ?? []).map((r) => ({ ...r, ...times.get(r.id) }));
  const cost = (rs: RunRecord[]) => rs.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  const steps = config.flow.steps.map((def): StepView => {
    const step = config.steps[def.id];
    const at = state?.steps[def.id];
    return {
      name: def.id,
      kind: step.kind,
      ...(step.kind === 'ai' ? { adapter: step.run.adapter, model: step.run.spec.model, ...(step.run.spec.effort && { effort: step.run.spec.effort }) } : { command: step.command }),
      state: at?.state ?? 'pending',
      attempts: at?.attempts ?? 0,
      maxAttempts: def.maxAttempts,
      ...(at?.outcome && { outcome: at.outcome }),
      ...(at?.gate && { gate: at.gate }),
    };
  });
  const by = (type: string) => config.flow.steps.find((s) => s.produces.includes(type))?.id;
  const artifacts = isDir(pin.artifactsDir)
    ? readdirSync(pin.artifactsDir)
        .filter((f) => f.endsWith('.md') && isFile(join(pin.artifactsDir, f)))
        .map((f) => ({ type: f.slice(0, -3), file: join(pin.artifactsDir, f), bytes: statSync(join(pin.artifactsDir, f)).size, by: by(f.slice(0, -3)) }))
    : [];
  const patchFile = join(dir, 'changes.patch');
  let patch: RunDetail['patch'];
  if (isFile(patchFile)) {
    const text = readFileSync(patchFile, 'utf8');
    patch = { text: text.slice(0, PATCH_MAX), cut: text.length > PATCH_MAX };
  }
  const sandbox = !config.sandbox
    ? 'none · runs on this machine'
    : config.sandbox.runtime === 'opensandbox'
      ? `opensandbox · egress ${config.sandbox.egress?.length ? `allows ${config.sandbox.egress.join(', ')}` : 'default-deny'}`
      : `docker · ${config.sandbox.image}`;
  return {
    name,
    flow: config.name,
    status: statusOf(dir),
    page: !!hostOf(dir)?.page && alive(hostOf(dir)?.pid),
    folder: config.folder,
    budgetUsd: config.budgetUsd,
    sandbox,
    steps,
    runs,
    spentUsd: cost(runs),
    wastedUsd: cost(runs.filter((r) => r.wasted)),
    artifacts,
    ...(patch && { patch }),
    asks: asksOf(dir),
  };
}

/** The artifact `type` of run `name`, read for the page; undefined unless the run pinned an artifact of that type. */
export function readArtifact(runsDir: string, name: string, type: string): string | undefined {
  const run = readRun(runsDir, name);
  const a = run?.artifacts.find((x) => x.type === type);
  return a && readFileSync(a.file, 'utf8');
}

/**
 * Writes the page's answer to the open ask `id` of run `name`, once each answer fits its question: a select's
 * value is one of its options, a required question is answered. Returns why not, or undefined when written.
 */
export function answerAsk(runsDir: string, name: string, id: string, answers: Record<string, unknown>): string | undefined {
  const run = readRun(runsDir, name);
  if (!run) return `no run ${name}`;
  if (!run.page) return 'this run does not take answers from the page; start it with --page';
  const ask = run.asks.find((a) => a.id === id);
  if (!ask) return 'that question is no longer open';
  for (const q of ask.questions) {
    const v = answers[q.id];
    if (v == null || v === '') {
      if (q.required !== false) return `${q.prompt}: needs an answer`;
      continue;
    }
    const values = q.options?.map((o) => o.value);
    if (q.kind === 'single_select' && !values?.includes(v as string)) return `${q.prompt}: not one of its options`;
    if (q.kind === 'multi_select' && !(Array.isArray(v) && v.every((x) => values?.includes(x)))) return `${q.prompt}: not among its options`;
    if (q.kind === 'yes_no' && typeof v !== 'boolean') return `${q.prompt}: yes or no`;
    if (q.kind === 'number' && typeof v !== 'number') return `${q.prompt}: a number`;
    if (q.kind === 'text' && typeof v !== 'string') return `${q.prompt}: text`;
  }
  const picked = Object.fromEntries(ask.questions.map((q) => [q.id, answers[q.id] === '' ? null : (answers[q.id] ?? null)]));
  writeFileSync(join(runsDir, name, 'answers', `${id}.json`), JSON.stringify(picked));
  return undefined;
}

/** Asks the host of run `name` to stop, as one Ctrl+C would; why not, or undefined when asked. */
export function stopRun(runsDir: string, name: string): string | undefined {
  const run = readRun(runsDir, name);
  if (!run) return `no run ${name}`;
  if (run.status !== 'running' && run.status !== 'waiting' && run.status !== 'starting') return `the run is ${run.status}; nothing to stop`;
  writeFileSync(join(runsDir, name, 'stop'), '');
  return undefined;
}
