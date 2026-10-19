/**
 * `pnpm run-flow <flow.yaml>`: check a flow, draw it, or run it. The engine
 * decides what happens next; this host carries out its commands in one
 * process and one folder, and saves the state after every transition.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { advance, newFlowState } from '@flowboard/core';
import type { FlowCommand, FlowEvent, FlowState, RunCommand, RunEnd } from '@flowboard/core';
import { noTerminal } from './ask/terminal.ts';
import { inside, loadFlow, toMermaid } from './flow-config.ts';
import type { FlowConfig } from './flow-config.ts';
import { execAi, execShell, shellEnv } from './flow-exec.ts';
import type { ExecContext, StepRun } from './flow-exec.ts';
import { defaultProvider, stamp } from './run.ts';
import type { RunDeps } from './run.ts';

const USAGE = [
  'usage: pnpm run-flow [--check | --mermaid] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--max-runs <n>]',
];
/** setTimeout's longest delay; a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export async function runFlow(args: string[], deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const printErr = deps.printErr ?? console.error;
  const now = deps.now ?? (() => new Date());
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
  let maxRuns = Infinity;
  if (v['max-runs'] !== undefined) {
    if (!/^[1-9]\d*$/.test(v['max-runs'])) {
      printErr('--max-runs: must be a whole number above 0');
      return 2;
    }
    maxRuns = Number(v['max-runs']);
  }

  if (v.resume !== undefined) {
    printErr('run-flow: --resume comes in Task 11');
    return 2;
  }
  const yaml = positionals[0];
  const loaded = loadFlow(yaml, deps.cwd);
  if (!loaded.ok) {
    loaded.errors.forEach((l) => printErr(l));
    return 2;
  }
  const config = loaded.config;
  if (v.mermaid) {
    toMermaid(config.flow).split('\n').forEach((l) => print(l));
    return 0;
  }
  config.warnings.forEach((w) => print(`-- warning: ${w}`));
  if (v.check) {
    print(`-- flow ok: ${config.flow.steps.length} steps`);
    return 0;
  }

  // Agents and checks can run `git checkout .` or `git clean`; only a clean tree can be got back.
  if (!v['allow-dirty']) {
    // ponytail: untracked files don't count: the flow's own new files (flow.yaml, runs/, .flowboard/) usually are.
    const git = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', '.'], { cwd: config.folder, encoding: 'utf8' });
    if (git.error || git.status !== 0) print(`-- warning: ${config.folder} is not in a git repository; nothing can undo the flow's edits`);
    else {
      const changed = git.stdout.split('\n').filter(Boolean).length;
      if (changed) {
        printErr(`${yaml}: folder: uncommitted changes in ${changed} file(s); commit or stash them first, or pass --allow-dirty`);
        return 2;
      }
    }
  }

  const runsDir = join(deps.cwd, 'runs');
  const flowboardDir = join(config.folder, '.flowboard');
  const stem = `${stamp(now())}-${config.name}`;
  let name = stem;
  for (let n = 2; existsSync(join(runsDir, name)) || existsSync(join(flowboardDir, name)); n++) name = `${stem}-${n}`;
  const runDir = join(runsDir, name);
  const shown = relative(deps.cwd, runDir);
  const lockPath = join(flowboardDir, 'lock');
  let refused: string | undefined;
  try {
    refused = takeLock(lockPath, shown, print);
  } catch (e) {
    refused = `cannot take the lock: ${(e as Error).message}`;
  }
  if (refused) {
    printErr(`${yaml}: folder: ${refused}`);
    return 2;
  }

  try {
    const artifactsDir = join(flowboardDir, name);
    try {
      mkdirSync(runDir, { recursive: true });
      mkdirSync(artifactsDir, { recursive: true });
    } catch (e) {
      printErr(`${yaml}: runs: cannot create the run folder: ${(e as Error).message}`);
      return 2;
    }
    // A run folder inside `folder` is off limits to the agents' file tools; it is guarded before it is pinned.
    const realRun = realpathSync(runDir);
    if (inside(config.folder, realRun)) {
      const glob = `${relative(config.folder, realRun)}/**`;
      for (const s of Object.values(config.steps)) {
        if (s.kind === 'ai') s.run.spec.guards = { writeRoots: [config.folder], ...s.run.spec.guards, denyPaths: [...(s.run.spec.guards?.denyPaths ?? []), glob] };
      }
    }
    writeFileSync(join(runDir, 'flow.json'), JSON.stringify({ version: 1, config, artifactsDir }, null, 2) + '\n');

    print(`-- flow ${config.name}: ${config.flow.steps.length} steps in ${config.folder}`);
    print(`-- run folder ${shown}`);
    for (const [step, s] of Object.entries(config.steps)) {
      if (s.kind === 'ai' && s.run.unrestrictedShell) print(`-- warning: ${step}: unrestricted shell: commands can write outside ${config.folder}`);
    }
    const removed = shellEnv(process.env).removed;
    if (removed.length && Object.values(config.steps).some((s) => s.kind === 'shell')) print(`-- shell steps run without: ${removed.join(', ')}`);

    return await drive({ config, runDir, artifactsDir, shown, state: newFlowState(), first: { type: 'start' }, maxRuns }, deps);
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/** False when `pid` names no process. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // there, but not ours to signal
  }
}

/** Takes the folder's lock for this process, or says why not. A lock left by a process that is gone is replaced. */
function takeLock(path: string, runDir: string, print: (line: string) => void): string | undefined {
  mkdirSync(join(path, '..'), { recursive: true });
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, runDir }));
      closeSync(fd);
      return undefined;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let held: { pid?: unknown; runDir?: unknown } = {};
    try {
      held = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      // unreadable: whoever wrote it is not a run-flow that can still be working
    }
    if (typeof held.pid === 'number' && alive(held.pid)) {
      return `another run-flow (pid ${held.pid}) is working here on ${held.runDir}; if it is not, delete ${path}`;
    }
    // ponytail: the dead host's agents may still be running; its state.json does not record their pids yet.
    print(`-- warning: a run-flow (pid ${held.pid}) ended without cleaning up; check that none of its agents are still running`);
    rmSync(path, { force: true });
  }
}

interface Drive {
  config: FlowConfig;
  runDir: string;
  artifactsDir: string;
  /** The run folder as the --resume hint shows it. */
  shown: string;
  state: FlowState;
  first: FlowEvent;
  maxRuns: number;
}

/** Feeds the engine from `first` until the flow ends or waits on a person, and resolves with the exit code. */
async function drive(d: Drive, deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const now = deps.now ?? (() => new Date());
  const { config } = d;
  let state = d.state;
  const live = new Map<number, { cmd: RunCommand; run: StepRun }>();
  const queued: RunCommand[] = [];
  const inbox: FlowEvent[] = [];
  let ended: 'done' | 'failed' | undefined;
  let stopping = false;
  let crashed: { error: unknown } | undefined;
  let wake = () => {};
  const post = (event: FlowEvent) => {
    inbox.push(event);
    wake();
  };
  /** An error in a callback reaches the loop, which handles it like its own. */
  const crash = (error: unknown) => {
    crashed ??= { error };
    wake();
  };

  const ctx: ExecContext = {
    artifactsDir: d.artifactsDir,
    logDir: d.runDir,
    show: print,
    now,
    makeProvider: deps.makeProvider ?? defaultProvider,
    answer: noTerminal,
    onInterrupt: () => {},
  };

  const save = () => {
    mkdirSync(d.runDir, { recursive: true }); // a check may have cleaned it away (git clean -fdx)
    writeFileSync(join(d.runDir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  };
  const feed = (event: FlowEvent) => {
    const r = advance(config.flow, state, event);
    state = r.state;
    mkdirSync(d.runDir, { recursive: true });
    appendFileSync(join(d.runDir, 'flow.jsonl'), JSON.stringify({ at: now().toISOString(), event, commands: r.commands }) + '\n');
    save();
    for (const c of r.commands) act(c);
  };
  const act = (c: FlowCommand) => {
    if (c.type === 'run') queued.push(c);
    else if (c.type === 'gate') print(`-- ${c.step} needs a decision`);
    else if (c.type === 'stop') {
      for (const id of c.runs) {
        live.get(id)?.run.stop();
        const i = queued.findIndex((q) => q.run === id);
        if (i !== -1) queued.splice(i, 1);
      }
    } else ended = c.status;
  };

  const launch = (cmd: RunCommand) => {
    const step = config.steps[cmd.step];
    const produces = config.flow.steps.find((s) => s.id === cmd.step)!.produces;
    print(`-- ${cmd.step} attempt ${cmd.attempt} (${step.kind === 'shell' ? 'shell' : `${step.run.adapter} ${step.run.spec.model}`})`);
    mkdirSync(d.runDir, { recursive: true });
    mkdirSync(d.artifactsDir, { recursive: true });
    const run = step.kind === 'shell' ? execShell(step.command, config.folder, cmd, produces, ctx) : execAi(step.run, cmd, produces, ctx);
    live.set(cmd.run, { cmd, run });
    const minutes = step.timeoutMinutes;
    let timedOut = false;
    const timer =
      minutes === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            run.stop();
          }, Math.min(minutes * 60_000, MAX_TIMER_MS));
    run.ended
      .then((end) => {
        clearTimeout(timer);
        if (stopping) return; // stopAll feeds it
        live.delete(cmd.run);
        const e: RunEnd = timedOut ? { costUsd: end.costUsd, error: `timed out after ${minutes} minutes` } : end;
        print(`-- ${cmd.step} attempt ${cmd.attempt}: ${e.error ? `failed: ${e.error}` : (e.outcome ?? 'no outcome')}, $${e.costUsd.toFixed(2)}`);
        post({ type: 'run_ended', run: cmd.run, ...e });
      })
      .catch(crash);
  };
  const pump = () => {
    while (!stopping && queued.length && live.size < d.maxRuns) launch(queued.shift()!);
  };

  /** Stops launching and stops every live run; each one's end is fed as interrupted, so --resume reruns it. */
  const stopAll = async () => {
    stopping = true;
    const runs = [...live.values()];
    live.clear();
    runs.forEach((x) => x.run.stop());
    const ends = await Promise.all(runs.map((x) => x.run.ended));
    while (inbox.length) feed(inbox.shift()!); // runs that ended just before
    runs.forEach((x, i) => feed({ type: 'run_ended', run: x.cmd.run, ...ends[i], interrupted: true }));
  };

  try {
    feed(d.first);
    for (;;) {
      if (crashed) throw crashed.error;
      if (inbox.length) {
        feed(inbox.shift()!);
        continue;
      }
      pump();
      if (!live.size && !queued.length) break; // ended, or waiting on a person
      await new Promise<void>((r) => (wake = r));
      wake = () => {};
    }
  } catch (e) {
    try {
      await stopAll();
      save();
    } finally {
      print(`-- continue with: pnpm run-flow --resume ${d.shown}`);
    }
    throw e;
  }

  const status = ended ?? 'paused';
  const total = (runs: FlowState['runs']) => runs.reduce((sum, r) => sum + r.costUsd, 0).toFixed(2);
  print(`-- flow ${status}: ${state.runs.length} runs, $${total(state.runs)} spent, $${total(state.runs.filter((r) => r.wasted))} wasted`);
  if (status === 'paused') {
    const waiting = config.flow.steps.map((s) => s.id).filter((id) => state.steps[id]?.state === 'awaiting_approval');
    print(`-- waiting for a decision: ${waiting.join(', ')}`);
    print(`-- continue with: pnpm run-flow --resume ${d.shown}`);
  }
  return status === 'done' ? 0 : status === 'failed' ? 1 : 3;
}
