/**
 * `pnpm run-flow <flow.yaml>`: check a flow, draw it, or run it. The engine
 * decides what happens next; this host carries out its commands in one
 * process and one folder, and saves the state after every transition.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { dockerExecHost } from '@flowboard/adapters';
import { advance, entries, GIT, newFlowState } from '@flowboard/core';
import type { Answers, Decision, FlowCommand, FlowEvent, FlowState, Gate, Question, RunCommand } from '@flowboard/core';
import type { Answerer } from './ask/broker.ts';
import { noTerminal, terminalAnswerer } from './ask/terminal.ts';
import { isDir } from './config.ts';
import { inside, loadFlow, toMermaid } from './flow-config.ts';
import type { FlowConfig } from './flow-config.ts';
import { artifactPath, execAi, execShell, processStart, shellEnv } from './flow-exec.ts';
import type { ExecContext, StepRun } from './flow-exec.ts';
import { defaultProvider, stamp } from './run.ts';
import type { RunDeps } from './run.ts';

const USAGE = [
  'usage: pnpm run-flow --folder <dir> --task <file> [--budget-usd <n>] [--max-runs <n>] [--allow-dirty] <flow.yaml>',
  '       pnpm run-flow --check | --mermaid [--folder <dir> --task <file>] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--budget-usd <n>] [--max-runs <n>]',
];
/** setTimeout's longest delay; a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/**
 * Git commands that throw away uncommitted edits, which in a flow are the earlier steps' work: agent steps may
 * not run them. Staged-only restores, dry-run cleans and `git stash list`/`show` pass.
 */
// ponytail: like DEFAULT_DENY_COMMANDS, matched anywhere in the command, so a commit message quoting one is blocked
// too; and `git checkout <path>` without `--` looks like a branch switch and gets through. The sandbox is the floor.
const END = String.raw`(?=[\s;&|)"'\x60]|$)`;
export const DISCARD_COMMANDS = [
  String.raw`${GIT}checkout\b[^;&|\n]*\s(?:--|\.|-f|--force)${END}`,
  String.raw`${GIT}switch\b[^;&|\n]*\s(?:--discard-changes|-f|--force)${END}`,
  String.raw`${GIT}restore\b(?!(?=[^;&|\n]*\s(?:--staged|-S)${END})(?![^;&|\n]*\s(?:--worktree|-W)${END}))`,
  String.raw`${GIT}clean\b(?![^;&|\n]*\s(?:-n|--dry-run)${END})`,
  String.raw`${GIT}stash\b(?!\s+(?:list|show)\b)`,
];
const DECISION_LABELS: Record<Decision, string> = {
  approve: 'Approve (pass)',
  reject: 'Reject (fail)',
  retry: 'Retry this step',
  fail: 'Fail the flow',
};

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
        folder: { type: 'string' },
        task: { type: 'string' },
        'budget-usd': { type: 'string' },
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
  // A flow is a recipe: a run says where to work and what to do; a check may say both, or neither; a resume has them.
  const inputs = [v.folder, v.task].filter((x) => x !== undefined).length;
  if (v.resume !== undefined ? inputs > 0 : modes ? inputs === 1 : inputs < 2) return usage();
  let maxRuns: number | undefined;
  if (v['max-runs'] !== undefined) {
    if (!/^[1-9]\d*$/.test(v['max-runs'])) {
      printErr('--max-runs: must be a whole number above 0');
      return 2;
    }
    maxRuns = Number(v['max-runs']);
  }
  let budget: number | undefined;
  if (v['budget-usd'] !== undefined) {
    if (!/^\d+(\.\d+)?$/.test(v['budget-usd'])) {
      printErr('--budget-usd: must be a number of dollars, 0 or more; 0 means no ceiling');
      return 2;
    }
    budget = Number(v['budget-usd']);
  }

  if (v.resume !== undefined) return resume(v.resume, { maxRuns, budget }, deps);
  const yaml = positionals[0];
  const loaded = loadFlow(yaml, deps.cwd, v.folder !== undefined && v.task !== undefined ? { folder: v.folder, task: v.task, budgetUsd: budget } : undefined);
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
    print(`-- flow ok: ${plural(config.flow.steps.length, 'step')}, starting at ${entries(config.flow)[0]}`);
    return 0;
  }

  // The lock first: a second host is told another run-flow is here, not that the first one's edits are uncommitted.
  const flowboardDir = join(config.folder, '.flowboard');
  const lockPath = join(flowboardDir, 'lock');
  const taken = takeLock(lockPath);
  if ('refused' in taken) {
    printErr(`${yaml}: --folder: ${taken.refused}`);
    return 2;
  }
  try {
    await cleanUpAfter(taken.stale, deps.cwd, print);
    // Agents and checks can run `git checkout .` or `git clean`; only a clean tree can be got back.
    if (!v['allow-dirty']) {
      // ponytail: untracked files don't count: the flow's own new files (flow.yaml, runs/) usually are.
      const git = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude).flowboard'], { cwd: config.folder, encoding: 'utf8' });
      if (git.error || git.status !== 0) print(`-- warning: ${config.folder} is not in a git repository; nothing can undo the flow's edits`);
      else {
        const changed = git.stdout.split('\n').filter(Boolean).length;
        if (changed) {
          printErr(`${yaml}: --folder: uncommitted changes in ${changed} file(s); commit or stash them first, or pass --allow-dirty`);
          return 2;
        }
      }
    }
    excludeFromGit(config.folder);

    // The run folder is claimed by making it: a name another host made first, even this second, is passed over.
    const runsDir = join(deps.cwd, 'runs');
    const stem = `${stamp(now())}-${config.name.replace(/[^\w.-]/g, '_')}`;
    let name = stem;
    try {
      mkdirSync(runsDir, { recursive: true });
      for (let n = 2; ; n++) {
        if (!existsSync(join(flowboardDir, name)) && claim(join(runsDir, name))) break;
        name = `${stem}-${n}`;
      }
    } catch (e) {
      printErr(`${yaml}: runs: cannot create the run folder: ${(e as Error).message}`);
      return 2;
    }
    const runDir = join(runsDir, name);
    const shown = relative(deps.cwd, runDir);
    // A run folder inside `folder` is off limits to the agents' file tools; it is guarded before it is pinned.
    const realRun = realpathSync(runDir);
    const inFolder = inside(config.folder, realRun) ? relative(config.folder, realRun) : undefined;
    // The guard matches deny paths as globs: a path with a character a glob reads as a pattern cannot be kept out.
    if (inFolder !== undefined && !/^[\w./ -]+$/.test(inFolder)) {
      printErr(`${yaml}: runs: the run folder ${inFolder} is inside --folder, and its path has characters the guard cannot match exactly; start run-flow from another folder`);
      rmSync(runDir, { recursive: true, force: true });
      return 2;
    }
    const denyRun = inFolder === undefined ? undefined : `${inFolder}/**`;
    publish(lockPath, { pid: process.pid, runDir }, true);
    const artifactsDir = join(flowboardDir, name);
    try {
      mkdirSync(artifactsDir, { recursive: true });
    } catch (e) {
      printErr(`${yaml}: runs: cannot create the artifacts folder: ${(e as Error).message}`);
      return 2;
    }
    for (const s of Object.values(config.steps)) {
      if (s.kind !== 'ai') continue;
      const guards = s.run.spec.guards!;
      s.run.spec.guards = { ...guards, denyPaths: [...(guards.denyPaths ?? []), ...(denyRun ? [denyRun] : [])], denyCommands: [...(guards.denyCommands ?? []), ...DISCARD_COMMANDS] };
    }
    const pinned = JSON.stringify({ version: 1, config, artifactsDir, maxRuns: maxRuns ?? null }, null, 2) + '\n';
    writeFileSync(join(runDir, 'flow.json'), pinned);

    const ceiling = config.budgetUsd ? `a budget of $${config.budgetUsd.toFixed(2)}` : 'no budget ceiling';
    print(`-- flow ${config.name}: ${plural(config.flow.steps.length, 'step')} in ${config.folder}, ${ceiling}`);
    print(`-- run folder ${shown}`);
    const removed = shellEnv(process.env).removed;
    if (removed.length && Object.values(config.steps).some((s) => s.kind === 'shell')) print(`-- shell steps run without: ${removed.join(', ')}`);

    return await drive({ config, runDir, artifactsDir, shown, pinned, lockPath, state: newFlowState(), first: { type: 'start' }, maxRuns: maxRuns ?? Infinity }, deps);
  } finally {
    releaseLock(lockPath);
  }
}

/** Makes `dir`; false when it already exists. */
function claim(dir: string): boolean {
  try {
    mkdirSync(dir);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

/** Adds `.flowboard/` to the local exclude file of `folder`'s git repository, so `git add -A` leaves it alone. */
function excludeFromGit(folder: string): void {
  const git = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: folder, encoding: 'utf8' });
  if (git.error || git.status !== 0) return;
  const file = resolve(folder, git.stdout.trim());
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    // no exclude file yet
  }
  if (text.split('\n').some((l) => l.trim() === '.flowboard/')) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}.flowboard/\n`);
  } catch {
    // best effort: the uncommitted-changes check leaves .flowboard/ out anyway
  }
}

/** `1 step`, `2 steps`. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `$0.12`, or `cost unknown` when the provider reported none. */
const cost = (usd: number | null) => (usd === null ? 'cost unknown' : `$${usd.toFixed(2)}`);

/** False when `pid` names no process. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // there, but not ours to signal
  }
}

/** The lock's content; undefined when there is no lock, null when it cannot be read. */
function readLock(path: string): { pid?: unknown; runDir?: unknown } | null | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null;
  }
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null ? v : null;
  } catch {
    return null;
  }
}

/** Writes `content` to `path` whole, through a temp file: linked, so only if `path` is free, or renamed over it. */
function publish(path: string, content: object, replace: boolean): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(content));
  try {
    if (replace) renameSync(tmp, path);
    else linkSync(tmp, path);
  } catch (e) {
    // ponytail: a disk without hard links (FAT, some network mounts) gets a plain exclusive create; a reader that
    // catches it half-written refuses, as for any unreadable lock, rather than taking the folder.
    if (replace || !['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e;
    writeFileSync(path, JSON.stringify(content), { flag: 'wx' });
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Takes the folder's lock for this process, or says why not. A lock left by a process that is gone is moved
 * aside, then checked: a lock another host took meanwhile, moved by mistake, is put back. `stale` is the lock
 * replaced, whose run may have left processes running.
 */
// ponytail: a third host taking the lock between a mistaken move and its return still gets in.
function takeLock(path: string): { refused: string } | { stale?: { pid: unknown; runDir: unknown } } {
  try {
    mkdirSync(dirname(path)); // .flowboard only: a folder that has gone is not made again
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return { refused: `cannot take the lock: ${(e as Error).message}` };
  }
  let stale: { pid: unknown; runDir: unknown } | undefined;
  for (;;) {
    try {
      publish(path, { pid: process.pid }, false);
      return { stale };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return { refused: `cannot take the lock: ${(e as Error).message}` };
    }
    const held = readLock(path);
    if (held === undefined) continue; // released meanwhile
    if (held === null) return { refused: `cannot read ${path}; if no run-flow is working here, delete it` };
    if (typeof held.pid === 'number' && alive(held.pid)) {
      return { refused: `another run-flow (pid ${held.pid}) is working here${typeof held.runDir === 'string' ? ` on ${held.runDir}` : ''}; if it is not, delete ${path}` };
    }
    const aside = `${path}.${process.pid}.stale`;
    try {
      renameSync(path, aside);
    } catch {
      continue; // another host moved it first
    }
    if (readLock(aside)?.pid !== held.pid) {
      try {
        linkSync(aside, path); // not the stale lock: put it back
      } catch {
        // taken again meanwhile; that host holds the folder now
      }
      rmSync(aside, { force: true });
      continue;
    }
    rmSync(aside, { force: true });
    stale = { pid: held.pid, runDir: held.runDir };
  }
}

/**
 * Stops what a run-flow that died left running in `runDir`: the process of each run whose log has a `pid` line
 * and no `result`. A pid is signalled only while its process is the one the log recorded, by its start time:
 * the pid may be another process's by now. A check's group is signalled even when its shell has gone.
 */
// ponytail: an agent is signalled by its CLI's pid; what that CLI started and left behind is not reached.
/** `stopped` counts runs: a check's whole process group is one. */
async function stopLeftovers(runDir: string): Promise<{ stopped: number; unsure: string[] }> {
  const targets: { pid: number; group: boolean }[] = [];
  const unsure: string[] = [];
  let logs: string[] = [];
  try {
    logs = readdirSync(runDir).filter((f) => /^\d{3}-.+\.jsonl$/.test(f));
  } catch {
    return { stopped: 0, unsure }; // the run folder has gone with its logs
  }
  for (const f of logs) {
    const lines = (readText(join(runDir, f)) ?? '').split('\n').flatMap((l) => {
      try {
        return [JSON.parse(l) as { kind?: unknown; pid?: unknown; group?: unknown; started?: unknown }];
      } catch {
        return [];
      }
    });
    const line = lines.find((l) => l.kind === 'pid' && typeof l.pid === 'number' && l.pid > 0);
    if (!line || lines.some((l) => l.kind === 'result')) continue;
    const pid = line.pid as number;
    const group = line.group === true;
    const started = processStart(pid);
    if (started === undefined) {
      if (group) targets.push({ pid, group }); // the shell has gone; what it left in its group has not, perhaps
    } else if (started === line.started) targets.push({ pid, group });
    else unsure.push(`pid ${pid} (${join(runDir, f)})`);
  }
  const signal = (sig: NodeJS.Signals | 0) =>
    targets.filter((t) => {
      try {
        process.kill(t.group ? -t.pid : t.pid, sig);
        return true;
      } catch {
        return false; // gone
      }
    });
  const hit = signal('SIGTERM');
  for (let i = 0; i < 20 && signal(0).length; i++) await new Promise((r) => setTimeout(r, 100)); // 2 s to go quietly
  signal('SIGKILL');
  return { stopped: hit.length, unsure };
}

/** Says what a replaced stale lock's run-flow left behind, and stops what is still running. */
async function cleanUpAfter(stale: { pid: unknown; runDir: unknown } | undefined, cwd: string, print: (line: string) => void): Promise<void> {
  if (!stale) return;
  // Locks written before run folders were absolute hold one relative to that host's own folder.
  const runDir = typeof stale.runDir === 'string' ? resolve(cwd, stale.runDir) : undefined;
  const known = runDir !== undefined && existsSync(runDir);
  const { stopped, unsure } = known ? await stopLeftovers(runDir) : { stopped: 0, unsure: [] };
  const what = !known
    ? '; check that none of its agents or checks are still running'
    : stopped
      ? `; stopped ${plural(stopped, 'run')} it left running`
      : '';
  print(`-- warning: a run-flow (pid ${String(stale.pid)}) ended without cleaning up${what}`);
  for (const u of unsure) print(`-- warning: ${u} is running but may not be the process its run started; check it yourself`);
}

/** Removes the lock while it is this host's: a check may have deleted it, and another host taken the folder since. */
function releaseLock(path: string): void {
  if (readLock(path)?.pid === process.pid) rmSync(path, { force: true });
}

/**
 * The one terminal that gates and agents share: prompts take turns, first come first served, and lines shown
 * while one is open wait until it closes.
 */
function terminal(answer: Answerer, print: (line: string) => void) {
  let turn: Promise<unknown> = Promise.resolve();
  let open = false;
  const held: string[] = [];
  return {
    show(line: string) {
      if (open) held.push(line);
      else print(line);
    },
    /** Asks `questions` once the terminal is free, printing `heading` first. */
    ask(questions: Question[], signal: AbortSignal, heading?: string): Promise<Answers> {
      const mine = turn.then(async () => {
        signal.throwIfAborted();
        open = true;
        if (heading) print(heading);
        try {
          return await answer(questions, signal);
        } finally {
          open = false;
          held.splice(0).forEach((l) => print(l));
        }
      });
      turn = mine.catch(() => {});
      return mine;
    },
  };
}

/** The file's text, or undefined when it cannot be read. */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** The parsed JSON text, or undefined when there is none or it is not JSON. */
function parseJson(text: string | undefined): unknown {
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * `--resume <dir>`: continues a stopped, paused or crashed flow from its pinned flow.json and its state.json,
 * with the `--max-runs` and budget it started with unless others are given.
 */
async function resume(typed: string, given: { maxRuns?: number; budget?: number }, deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const printErr = deps.printErr ?? console.error;
  const refuse = (why: string) => {
    printErr(`${typed}: cannot resume: ${why}`);
    return 2;
  };
  const runDir = resolve(deps.cwd, typed);
  const state = parseJson(readText(join(runDir, 'state.json'))) as FlowState | undefined;
  if (!state) return refuse('no state.json');
  const text = readText(join(runDir, 'flow.json'));
  const pinned = parseJson(text) as { version?: unknown; config: FlowConfig; artifactsDir: string; maxRuns?: number | null } | undefined;
  if (!pinned) return refuse('no flow.json');
  if (pinned.version !== 1) return refuse('made by a different version of run-flow');
  if (state.status !== 'running') return refuse(`the flow already ended (${state.status})`);
  // A folder moved or deleted since is not made again: the flow would carry on in an empty one.
  if (!isDir(pinned.config.folder)) return refuse(`folder not found: ${pinned.config.folder}`);
  const config = { ...pinned.config, budgetUsd: given.budget ?? pinned.config.budgetUsd ?? 0 };
  const spent = sumCost(state.runs);
  if (config.budgetUsd && spent >= config.budgetUsd) {
    return refuse(`the budget is spent, $${spent.toFixed(2)} of $${config.budgetUsd.toFixed(2)}; give a larger one, or 0 for none, with --budget-usd`);
  }
  // The YAML is not read again, and uncommitted changes are not checked: the tree holds the flow's own edits now.
  const lockPath = join(config.folder, '.flowboard', 'lock');
  const taken = takeLock(lockPath);
  if ('refused' in taken) return refuse(taken.refused);
  try {
    publish(lockPath, { pid: process.pid, runDir }, true);
    await cleanUpAfter(taken.stale, deps.cwd, print);
    // Its own runs too, should the lock of the host that died with them have been deleted by hand.
    const { stopped, unsure } = await stopLeftovers(runDir);
    if (stopped) print(`-- stopped ${plural(stopped, 'run')} the last run-flow left running`);
    for (const u of unsure) print(`-- warning: ${u} is running but may not be the process its run started; check it yourself`);
    print(`-- resuming ${typed}`);
    const runs = given.maxRuns ?? pinned.maxRuns ?? Infinity;
    // A new budget goes into the pin, for the next resume.
    const pin = given.budget === undefined ? text! : JSON.stringify({ ...pinned, config }, null, 2) + '\n';
    if (pin !== text) writeFileSync(join(runDir, 'flow.json'), pin);
    return await drive({ config, runDir, artifactsDir: pinned.artifactsDir, shown: typed, pinned: pin, lockPath, state, first: { type: 'resume' }, maxRuns: runs }, deps);
  } finally {
    releaseLock(lockPath);
  }
}

/** What the runs cost, as far as their providers reported it. */
const sumCost = (runs: FlowState['runs']) => runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

interface Drive {
  config: FlowConfig;
  runDir: string;
  artifactsDir: string;
  /** The run folder as the --resume hint shows it. */
  shown: string;
  /** flow.json's text, to write again should a check delete it. */
  pinned: string;
  lockPath: string;
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
  /** Every run not yet ended, stopping ones included, for a second Ctrl+C to kill. */
  const running = new Set<StepRun>();
  // The flow's budget: each agent run may spend what is left, and once it is spent the flow stops and waits.
  const budget = config.budgetUsd ?? 0; // a flow.json from before budgets has none
  let overBudget = false;
  const spentOut = () => budget > 0 && !ended && sumCost(state.runs) >= budget;
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

  // The answerer prints its own lines ("question 1 of 2") while its prompt is open, so it gets the bare print.
  const answer = deps.answer ?? (process.stdin.isTTY ? terminalAnswerer(undefined, print) : undefined);
  const term = answer && terminal(answer, print);
  const show = term ? (line: string) => term.show(line) : print;
  const temps = new Set<string>();
  const ctx: ExecContext = {
    artifactsDir: d.artifactsDir,
    logDir: d.runDir,
    show,
    now,
    makeProvider: deps.makeProvider ?? defaultProvider,
    answer: noTerminal,
    onInterrupt: () => interrupt(), // Ctrl+C at an agent's question
    temps,
    ...(config.sandbox && { exec: dockerExecHost({ tier: 'container', image: config.sandbox.image, egressAllow: [], mounts: [{ source: d.artifactsDir, target: d.artifactsDir }] }) }),
  };

  /** Gate prompts open or waiting their turn, by step. */
  const asks = new Map<string, AbortController>();
  const askGate = (step: string, gate: Gate, ask: NonNullable<typeof term>['ask']) => {
    asks.get(step)?.abort();
    const abort = new AbortController();
    asks.set(step, abort);
    const seen = gate.evidence.map((type) => artifactPath(d.artifactsDir, type)).filter((path) => existsSync(path));
    // A run that failed leaves no artifact to show; its log ends with what it printed or streamed.
    const failed = gate.kind === 'run_failed' && state.runs.findLast((r) => r.step === step);
    const log = failed && join(d.runDir, `${String(failed.id).padStart(3, '0')}-${step}.jsonl`);
    if (log && existsSync(log)) seen.push(log);
    const questions: Question[] = [
      {
        id: 'decision',
        kind: 'single_select',
        prompt: `${step}: ${gate.reason}`,
        ...(seen.length > 0 && { help: `See: ${seen.join(', ')}` }),
        options: gate.decisions.map((value) => ({ value, label: DECISION_LABELS[value] })),
      },
      { id: 'note', kind: 'text', prompt: 'Note for the next run (optional)', required: false },
    ];
    ask(questions, abort.signal)
      .then((a) => post({ type: 'decide', step, decision: a.decision as Decision, ...(typeof a.note === 'string' && a.note && { note: a.note }) }))
      .catch((e) => {
        if (abort.signal.aborted) return;
        if ((e as Error).name === 'ExitPromptError') interrupt(); // Ctrl+C at the prompt
        else crash(e);
      })
      .finally(() => {
        if (asks.get(step) === abort) asks.delete(step);
        wake();
      });
  };

  /**
   * Writes state.json whole or not at all: a crash mid-write leaves the last good copy. A check that cleaned
   * away the run folder or the lock (git clean -fdx) gets them back, so the flow can still be resumed.
   */
  let lockWarned = false;
  const save = () => {
    mkdirSync(d.runDir, { recursive: true });
    const pin = join(d.runDir, 'flow.json');
    if (!existsSync(pin)) writeFileSync(pin, d.pinned);
    const file = join(d.runDir, 'state.json');
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    renameSync(tmp, file);
    const held = readLock(d.lockPath);
    if (held === undefined) {
      try {
        mkdirSync(dirname(d.lockPath));
      } catch {
        // there already, or the folder itself has gone
      }
      try {
        publish(d.lockPath, { pid: process.pid, runDir: d.runDir }, false);
      } catch {
        // taken meanwhile, or the folder has gone: the next save looks again
      }
    } else if (held?.pid !== process.pid && !lockWarned) {
      lockWarned = true;
      print(`-- warning: a check deleted this folder's lock, and another run-flow (pid ${String(held?.pid)}) took it; both are working here now`);
    }
  };
  const feed = (event: FlowEvent) => {
    const r = advance(config.flow, state, event);
    state = r.state;
    mkdirSync(d.runDir, { recursive: true });
    appendFileSync(join(d.runDir, 'flow.jsonl'), JSON.stringify({ at: now().toISOString(), event, commands: r.commands }) + '\n');
    save();
    for (const c of r.commands) act(c);
    // A gate the engine has moved past (a rework replaced its step, the flow ended) needs no answer.
    for (const [step, abort] of asks) if (state.steps[step]?.state !== 'awaiting_approval') abort.abort();
  };
  const act = (c: FlowCommand) => {
    if (c.type === 'run') queued.push(c);
    else if (c.type === 'gate') {
      show(`-- ${c.step} needs a decision`);
      if (term && !stopping) askGate(c.step, c.gate, term.ask); // once stopping, --resume asks it again
    }
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
    show(`-- ${cmd.step} attempt ${cmd.attempt} (${step.kind === 'shell' ? 'shell' : `${step.run.adapter} ${step.run.spec.model}`})`);
    mkdirSync(d.runDir, { recursive: true });
    mkdirSync(d.artifactsDir, { recursive: true });
    // timeout_minutes counts the run's own time: the clock stops while one of its questions waits for a person.
    const minutes = step.timeoutMinutes;
    let left = minutes === undefined ? undefined : Math.min(minutes * 60_000, MAX_TIMER_MS);
    let timer: NodeJS.Timeout | undefined;
    let since = 0;
    const startClock = () => {
      if (left === undefined) return;
      since = Date.now();
      timer = setTimeout(() => run.stop(`timed out after ${minutes} minutes`), left);
    };
    const stopClock = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      left = Math.max(0, left! - (Date.now() - since));
    };
    const ask: Answerer = async (qs, signal) => {
      stopClock();
      try {
        return await term!.ask(qs, signal, `-- ${cmd.step} asks:`);
      } finally {
        startClock();
      }
    };
    const runCtx: ExecContext = { ...ctx, answer: term ? ask : noTerminal };
    // ponytail: parallel runs may each spend all that is left; the ceiling is checked again as each one ends.
    const capUsd = budget > 0 ? budget - sumCost(state.runs) : undefined;
    const run = step.kind === 'shell' ? execShell(step.command, config.folder, cmd, produces, runCtx) : execAi(step.run, cmd, produces, runCtx, { verdict: step.verdict, capUsd });
    live.set(cmd.run, { cmd, run });
    running.add(run);
    void run.ended.then(() => running.delete(run));
    post({ type: 'launched', run: cmd.run });
    startClock();
    run.ended
      .then((end) => {
        stopClock();
        if (stopping) return; // stopAll feeds it
        live.delete(cmd.run);
        show(`-- ${cmd.step} attempt ${cmd.attempt}: ${end.error ? `failed: ${end.error}` : (end.outcome ?? 'no outcome')}, ${cost(end.costUsd)}`);
        post({ type: 'run_ended', run: cmd.run, ...end });
      })
      .catch(crash);
  };
  const pump = () => {
    while (!stopping && queued.length && live.size < d.maxRuns) launch(queued.shift()!);
  };

  /** Stops launching and stops every live run; each one's end is fed as interrupted, so --resume reruns it. */
  const stopAll = async () => {
    stopping = true;
    // Runs that ended just before go first, so what they would start is stopped with the rest.
    while (inbox.length) feed(inbox.shift()!);
    const runs = [...live.values()];
    const unlaunched = queued.splice(0);
    live.clear();
    runs.forEach((x) => x.run.stop());
    const ends = await Promise.all(runs.map((x) => x.run.ended));
    runs.forEach((x, i) => feed({ type: 'run_ended', run: x.cmd.run, ...ends[i], interrupted: true }));
    unlaunched.forEach((cmd) => feed({ type: 'run_ended', run: cmd.run, costUsd: 0, interrupted: true }));
  };

  // Ctrl+C, SIGTERM or SIGHUP (R13, R29): the first stops the flow so --resume can continue it; another,
  // more than 300 ms later, quits at once.
  let stopAsked = false;
  let firstPress: number | undefined;
  function interrupt() {
    const at = now().getTime();
    if (firstPress === undefined) {
      firstPress = at;
      print('-- stopping');
      stopAsked = true;
      for (const abort of asks.values()) abort.abort();
      wake();
    } else if (at - firstPress > 300) {
      // Nothing waits any more: what still runs is killed. The lock stays behind, so the next run-flow says so.
      for (const run of running) run.kill();
      for (const t of temps) rmSync(t, { recursive: true, force: true }); // as run-agent's second press does (R29)
      (deps.exit ?? process.exit)(130);
    }
    // ponytail: under `pnpm run-flow` one Ctrl+C arrives twice (the terminal's group signal plus pnpm's
    // forward); a second press within 300 ms counts as the same one.
  }
  const signals = deps.signals ?? process;
  const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const sig of STOP_SIGNALS) signals.on(sig, interrupt);

  try {
    feed(d.first);
    for (;;) {
      if (crashed) throw crashed.error;
      if (!stopAsked && spentOut()) {
        overBudget = true;
        for (const abort of asks.values()) abort.abort(); // --resume asks them again
      }
      if (stopAsked || overBudget) {
        await stopAll();
        break;
      }
      if (inbox.length) {
        feed(inbox.shift()!);
        continue;
      }
      pump();
      if (inbox.length) continue; // the launches pump just reported
      if (!live.size && !queued.length && !asks.size) break; // ended, or waiting on a person who is not here
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
  } finally {
    for (const sig of STOP_SIGNALS) signals.off(sig, interrupt);
  }

  const status = ended ?? (stopAsked ? 'stopped' : 'paused');
  const launched = state.runs.filter((r) => r.error !== 'not launched');
  const total = (runs: FlowState['runs']) => sumCost(runs).toFixed(2);
  const unknown = launched.filter((r) => r.costUsd === null).length;
  const unpriced = unknown ? `, cost unknown for ${plural(unknown, 'run')}` : '';
  const of = budget > 0 ? ` of $${budget.toFixed(2)}` : '';
  print(`-- flow ${status}: ${plural(launched.length, 'run')}, $${total(launched)}${of} spent, $${total(launched.filter((r) => r.wasted))} wasted${unpriced}`);
  const waiting = config.flow.steps.map((s) => s.id).filter((id) => state.steps[id]?.state === 'awaiting_approval');
  if (status === 'paused' && waiting.length) print(`-- waiting for a decision: ${waiting.join(', ')}`);
  if (status === 'paused' && overBudget) print(`-- the budget is spent: $${total(state.runs)} of $${budget.toFixed(2)}`);
  const more = overBudget ? ' --budget-usd <more>' : '';
  if (status === 'paused' || status === 'stopped') print(`-- continue with: pnpm run-flow --resume ${d.shown}${more}`);
  return { done: 0, failed: 1, paused: 3, stopped: 130 }[status];
}
