/**
 * `pnpm run-flow <flow.yaml>`: check a flow, draw it, or run it. The engine
 * decides what happens next; this host carries out its commands in one
 * process and one folder, and saves the state after every transition.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { z } from 'zod';
import { connectBox, dockerExecHost, excludeFlowboard, openBox } from '@flowboard/adapters';
import type { Box } from '@flowboard/adapters';
import { advance, entries, GIT, newFlowState } from '@flowboard/core';
import type { Answers, Decision, FlowCommand, FlowEvent, FlowState, Gate, Question, RunCommand } from '@flowboard/core';
import type { Answerer } from './ask/broker.ts';
import { either, pageAnswerer, watchStop } from './ask/page.ts';
import { noTerminal, terminalAnswerer } from './ask/terminal.ts';
import { isDir } from './config.ts';
import { agentNeeds, inside, loadFlow, NEEDS, toMermaid } from './flow-config.ts';
import type { FlowConfig, Sandbox } from './flow-config.ts';
import { artifactPath, execAi, execShell, processStart, shellEnv } from './flow-exec.ts';
import type { ExecContext, StepRun } from './flow-exec.ts';
import { dockerDefaultMemoryMb, dockerHasGvisor, dockerNotReady, PROJECT_FILE, projectLimits } from './project.ts';
import { readAppSettings } from './app-settings.ts';
import { findProject, IsolationSchema, isolationFor, SandboxSchema } from './isolation.ts';
import type { Isolation } from './isolation.ts';
import { approver } from './approvals.ts';
import { owns, readProjects } from './projects.ts';
import type { Project } from './projects.ts';
import { resolveSettings, TRUST } from './settings.ts';
import { alive, readLock } from './lock.ts';
import { openWorkspace } from './workspace.ts';
import { defaultProvider, stamp } from './run.ts';
import type { RunDeps } from './run.ts';

const USAGE = [
  'usage: pnpm run-flow --folder <dir> --task <file> [--workspace <task id>] [--budget-usd <n>] [--max-runs <n>] [--allow-dirty] [--page] <flow.yaml>',
  '       pnpm run-flow --check | --mermaid [--folder <dir> --task <file>] <flow.yaml>',
  '       pnpm run-flow --resume <run folder> [--budget-usd <n>] [--max-runs <n>] [--page]',
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
/** A host the box may be let reach, as `sandbox.egress` takes it. */
const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

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
        workspace: { type: 'string' },
        page: { type: 'boolean' },
      },
    });
  } catch {
    return usage(); // an unknown option, or an option missing its value
  }
  const { values: v, positionals } = parsed;
  const modes = [v.check, v.mermaid, v.resume !== undefined].filter(Boolean).length;
  if (modes > 1 || ((v['allow-dirty'] || v.workspace !== undefined) && modes > 0) || (v.page && (v.check || v.mermaid))) return usage();
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

  if (v.resume !== undefined) return resume(v.resume, { maxRuns, budget, page: v.page }, deps);
  const yaml = positionals[0];
  let loaded = loadFlow(yaml, deps.cwd, v.folder !== undefined && v.task !== undefined ? { folder: v.folder, task: v.task, budgetUsd: budget } : undefined);
  const dataDir = dataDirOf(deps);
  // Where a run works is its project's to say, before a workspace changes the repo; a check or a diagram runs nothing.
  let isolated: Isolated | undefined;
  if (loaded.ok && !v.check && !v.mermaid) {
    const { folder, sandbox, steps } = loaded.config;
    const project = findProject(dataDir, folder);
    const r = project ? isolate(project, sandbox, steps, dataDir, deps) : { refused: [`${folder}: not in a FlowBoard project; create one for this repo first`] };
    if ('refused' in r) {
      r.refused.forEach((l) => printErr(l));
      return 2;
    }
    isolated = r;
  }
  // A workspace is made only for a flow that loads, then the flow is loaded again to work in it.
  if (loaded.ok && v.workspace !== undefined) {
    const ws = await openWorkspace(loaded.config.folder, v.workspace);
    if ('error' in ws) {
      printErr(`${yaml}: --workspace: ${ws.error}`);
      return 2;
    }
    print(`-- workspace ${ws.path} on branch ${ws.branch}${ws.reused ? ', picked up again' : ', new'}`);
    loaded = loadFlow(yaml, deps.cwd, { folder: ws.folder, task: v.task!, budgetUsd: budget });
  }
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
  // The project's sandbox in place of the YAML's, so the limits below apply to it.
  config.sandbox = isolated!.sandbox;
  config.isolation = isolated!.isolation;
  let limitsLine: string | undefined;
  if (config.sandbox) {
    const project = projectLimits(config.folder);
    if (!project.ok) {
      project.errors.forEach((l) => printErr(l));
      return 2;
    }
    const limits = project.limits;
    const fromFile = Object.keys(limits).length > 0;
    const docker = config.sandbox.runtime === 'docker';
    const guessed = docker && limits.memoryMb === undefined;
    if (guessed) {
      const mb = (deps.dockerMemoryMb ?? dockerDefaultMemoryMb)();
      if (mb !== undefined) limits.memoryMb = mb;
    }
    config.sandbox.limits = limits;
    const parts = [
      limits.memoryMb !== undefined ? `${limits.memoryMb} MB of memory${guessed ? " (a quarter of Docker's)" : ''}` : docker ? 'no memory limit (Docker did not say its size)' : "OpenSandbox's default memory",
      limits.cpus !== undefined ? plural(limits.cpus, 'CPU') : docker ? 'any CPUs' : "OpenSandbox's default CPUs",
    ];
    limitsLine = `-- sandbox limits: ${parts.join(', ')}${fromFile ? ` (from ${PROJECT_FILE})` : ''}`;
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
    excludeFlowboard(config.folder);

    // The run folder is claimed by making it: a name another host made first, even this second, is passed over.
    // FLOWBOARD_RUNS_DIR is where the runs page looks, so a run it starts lands where it lists them.
    const runsDir = process.env.FLOWBOARD_RUNS_DIR ? resolve(deps.cwd, process.env.FLOWBOARD_RUNS_DIR) : join(deps.cwd, 'runs');
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
    print(isolated!.line);
    if (limitsLine) print(limitsLine);
    const removed = shellEnv(process.env).removed;
    if (removed.length && Object.values(config.steps).some((s) => s.kind === 'shell')) print(`-- shell steps run without: ${removed.join(', ')}`);

    let box: Box | undefined;
    if (config.sandbox?.runtime === 'opensandbox') {
      const sb = config.sandbox;
      try {
        box = await (deps.openBox ?? openBox)({ image: sb.image, folder: config.folder, egress: sb.egress, credentials: sb.credentials, timeoutSeconds: BOX_SECONDS, ...(sb.limits && { limits: sb.limits }) });
      } catch (e) {
        printErr(`${yaml}: sandbox: cannot open an OpenSandbox box: ${(e as Error).message}`);
        return 2;
      }
      writeFileSync(join(runDir, 'sandbox.json'), JSON.stringify({ id: box.id, token: box.token }) + '\n', { mode: 0o600 }); // the relay token
      print(`-- sandbox ${box.id}: ${config.folder} at its last commit; egress ${sb.egress.join(', ') || 'none'}`);
      for (const name of box.missing) print(`-- warning: sandbox: ${name} is not set; steps that need it will fail`);
    }
    return await drive({ config, runDir, artifactsDir, shown, pinned, lockPath, state: newFlowState(), first: { type: 'start' }, maxRuns: maxRuns ?? Infinity, page: !!v.page, dataDir, ...(box && { box }) }, deps);
  } finally {
    releaseLock(lockPath);
  }
}

/** FlowBoard's data folder: FLOWBOARD_DATA_DIR, else `data/` where run-flow starts, as the app, which starts it, has it. */
const dataDirOf = (deps: RunDeps) => deps.dataDir ?? (process.env.FLOWBOARD_DATA_DIR ? resolve(deps.cwd, process.env.FLOWBOARD_DATA_DIR) : join(deps.cwd, 'data'));

/** A run's isolation, decided as it starts: the sandbox it gets and the line saying so. */
interface Isolated { sandbox?: Sandbox; isolation: Isolation; line: string }

/**
 * The isolation `project` gives a run of a flow whose own sandbox is `flowSandbox` (`isolation.ts`); or why it may not
 * run, a line each: a tier this machine cannot give, or a box that cannot start or log in.
 */
function isolate(project: Project, flowSandbox: Sandbox | undefined, steps: FlowConfig['steps'], dataDir: string, deps: RunDeps): Isolated | { refused: string[] } {
  const trust = resolveSettings(readAppSettings(dataDir), project.type, project.overrides).trust.value;
  const docker = deps.docker ?? { gvisor: () => dockerHasGvisor(), notReady: (image: string) => dockerNotReady(image) };
  const needs = agentNeeds(steps).map((n) => n.credential);
  const r = isolationFor(trust, flowSandbox, needs, trust === 'untrusted' && docker.gvisor());
  if ('refused' in r) return { refused: [r.refused] };
  if (r.sandbox?.runtime === 'docker') {
    const why = docker.notReady(r.sandbox.image);
    if (why) return { refused: [why] };
    // A container cannot read the macOS keychain, where the claude login is: it needs a token.
    const how = (k: string) => (k === NEEDS.claude.credential ? `Run \`claude setup-token\` and set ${k}` : `Set ${k}`);
    const unset = needs.filter((k) => !process.env[k]).map((k) => `${k} is not set: a container cannot use this machine's login. ${how(k)} where FlowBoard runs`);
    if (unset.length) return { refused: unset };
  }
  const asks = r.approvals ? '; agents ask before edits and shell commands' : '';
  // A copy: the run's sandbox may be this very object, and gets the project's limits.
  const isolation: Isolation = { projectId: project.id, trust, tier: r.tier, approvals: r.approvals, ...(flowSandbox && { flowSandbox: structuredClone(flowSandbox) }) };
  return { sandbox: r.sandbox, isolation, line: `-- isolation: ${TRUST[trust].label} (${r.tier}), from project ${project.name}${asks}` };
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

/** `1 step`, `2 steps`. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `$0.12`, or `cost unknown` when the provider reported none. */
const cost = (usd: number | null) => (usd === null ? 'cost unknown' : `$${usd.toFixed(2)}`);

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
async function resume(typed: string, given: { maxRuns?: number; budget?: number; page?: boolean }, deps: RunDeps): Promise<number> {
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
  // A run folder inside --folder is the agents' to write: the isolation pinned is read as untrusted input.
  const EDITED = "its project's isolation changed since it started, or its flow.json was edited; start the flow again";
  if (!PinSchema.safeParse(pinned.config).success) return refuse(EDITED);
  // A folder moved or deleted since is not made again: the flow would carry on in an empty one.
  if (!isDir(pinned.config.folder)) return refuse(`folder not found: ${pinned.config.folder}`);
  // The pin is checked against its project as it is now: a run folder inside --folder is the agents' to write, and a
  // pin they edited must not take the run below its project's tier. A run pinned before isolation was has no project
  // id: it is its folder's project's, and its sandbox was the flow's own.
  const dataDir = dataDirOf(deps);
  const was = pinned.config.isolation;
  const project = was ? readProjects(dataDir).find((p) => p.id === was.projectId) : findProject(dataDir, pinned.config.folder);
  if (!project) return refuse('its project is gone');
  if (!owns(project, realpathSync(pinned.config.folder))) return refuse(`its folder is no longer in its project ${project.name}`);
  const now = isolate(project, was ? was.flowSandbox : pinned.config.sandbox, pinned.config.steps, dataDir, deps);
  if ('refused' in now) {
    now.refused.forEach((l) => printErr(`${typed}: cannot resume: ${l}`));
    return 2;
  }
  // Limits are the project's, set as the run started; hosts a person let through since are added to egress.
  const bare = (sb: Sandbox | undefined) => sb && { ...sb, limits: undefined, egress: undefined };
  const same = isDeepStrictEqual(bare(now.sandbox), bare(pinned.config.sandbox)) && (!was || (was.tier === now.isolation.tier && was.approvals === now.isolation.approvals));
  if (!same) return refuse(EDITED);
  const config = { ...pinned.config, isolation: now.isolation, budgetUsd: given.budget ?? pinned.config.budgetUsd ?? 0 };
  const held = parseJson(readText(join(runDir, 'sandbox.json'))) as { id?: unknown; token?: unknown } | undefined;
  const recorded = typeof held?.id === 'string' && typeof held.token === 'string' ? { id: held.id, token: held.token } : undefined;
  // Only docker boxes each step itself; any other sandbox without its box would run the steps on this machine.
  if (config.sandbox && config.sandbox.runtime !== 'docker' && !recorded) return refuse('its OpenSandbox box is not recorded in sandbox.json; start the flow again');
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
    let box: Box | undefined;
    if (recorded) {
      try {
        box = await (deps.connectBox ?? connectBox)(recorded.id, { folder: config.folder, token: recorded.token });
      } catch (e) {
        // Never a fresh box: the flow's edits so far live only in the one that is gone.
        return refuse(`${(e as Error).message}: its edits cannot be resumed; start the flow again`);
      }
    }
    return await drive({ config, runDir, artifactsDir: pinned.artifactsDir, shown: typed, pinned: pin, lockPath, state, first: { type: 'resume' }, maxRuns: runs, page: !!given.page, dataDir, ...(box && { box }) }, deps);
  } finally {
    releaseLock(lockPath);
  }
}

/** What `--resume` reads from a pinned config before trusting it; the rest of the config is not checked. */
const PinSchema = z.object({ folder: z.string(), sandbox: SandboxSchema.optional(), isolation: IsolationSchema.optional() });

/** What the runs cost, as far as their providers reported it. */
const sumCost = (runs: FlowState['runs']) => runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

/**
 * The artifacts to copy into an OpenSandbox box before a process starts: every file here except the outputs of
 * agents still running (their copy in the box is newer) and the verdicts, which only ever travel back.
 */
export function pushable(artifactsDir: string, producing: Set<string>): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory() && e.name !== '.outcomes') walk(p);
      else if (e.isFile() && !producing.has(p)) out.push(p);
    }
  };
  if (existsSync(artifactsDir)) walk(artifactsDir);
  return out;
}

/** How long an OpenSandbox box lives unattended: a paused flow keeps its box for --resume this long. */
const BOX_SECONDS = 86_400;

/** Each step's box: the folder (its cwd) and the artifacts read-write, `mounts` read-only; only agents go online. */
export const sandboxFor = (sb: Extract<Sandbox, { runtime: 'docker' }>, artifactsDir: string): NonNullable<ExecContext['sandbox']> => ({ online, tmpDir, mounts = [] }) =>
  dockerExecHost(
    {
      tier: sb.gvisor ? 'gvisor' : 'container',
      image: sb.image,
      egressAllow: online ? ['*'] : [],
      ...(sb.limits && { limits: sb.limits }),
      mounts: [{ source: artifactsDir, target: artifactsDir }, ...mounts.map((m) => ({ source: m, target: m, readOnly: true }))],
      // sandbox.env is for the agents; a check gets none of it, only what run-flow sets (FLOWBOARD_*)
      env: online ? Object.fromEntries(sb.env.flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]!]]))) : {},
    },
    { ...(tmpDir && { tmpDir }) },
  );

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
  /** runtime: opensandbox: the box the whole run works in. */
  box?: Box;
  /** `--page`: the runs page may also answer and decide (ask/page.ts); its Stop works on any run. */
  page: boolean;
  /** FlowBoard's data folder, where the run's project and its saved approvals are. */
  dataDir: string;
}

/** Feeds the engine from `first` until the flow ends or waits on a person, and resolves with the exit code. */
async function drive(d: Drive, deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const now = deps.now ?? (() => new Date());
  const { config } = d;
  let state = d.state;
  const live = new Map<number, { cmd: RunCommand; run: StepRun }>();
  /** OpenSandbox: artifact files agents still running are writing in the box. */
  const producing = new Set<string>();
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
  const page = d.page ? pageAnswerer(d.runDir) : undefined;
  /** Whoever can answer: the terminal, the page, or both, the first answer winning. */
  const asker = term && page ? either(term.ask, page) : (term?.ask ?? page);
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
    ...(config.sandbox?.runtime === 'docker' && { sandbox: sandboxFor(config.sandbox, d.artifactsDir) }),
    ...(d.box && {
      sandbox: ({ tmpDir, mounts }) => d.box!.exec({ ...(tmpDir && { tmpDir }), ...(mounts && { mounts }), push: () => pushable(d.artifactsDir, producing) }),
      pull: (files) => d.box!.pullFiles(files),
    }),
  };

  /** Lets the box reach `host` and pins it to the run's egress, so a resumed run's box allows it too. */
  const allowHost = async (host: string) => {
    if (!HOST.test(host) || /^[\d.]+$/.test(host)) return show(`-- ${host}: not a host name or *.domain; nothing allowed`);
    const sb = d.config.sandbox;
    if (!d.box || sb?.runtime !== 'opensandbox' || sb.egress.includes(host)) return;
    try {
      await d.box.allow([host]);
    } catch (e) {
      return show(`-- sandbox: could not allow ${host}: ${(e as Error).message}`);
    }
    sb.egress.push(host);
    const pin = JSON.parse(d.pinned) as { config: FlowConfig };
    pin.config.sandbox = sb;
    d.pinned = JSON.stringify(pin, null, 2) + '\n';
    writeFileSync(join(d.runDir, 'flow.json'), d.pinned);
    show(`-- sandbox: egress now allows ${host}`);
  };

  /** Gate prompts open or waiting their turn, by step. */
  const asks = new Map<string, AbortController>();
  const askGate = (step: string, gate: Gate, ask: NonNullable<typeof asker>) => {
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
      // A sandboxed step that failed may have been refused a host: a retry can let the box reach it first.
      ...(d.box && gate.decisions.includes('retry') && gate.kind !== 'verdict'
        ? [{ id: 'allow_host', kind: 'text' as const, prompt: 'Host to allow before the retry, like registry.npmjs.org (optional)', required: false }]
        : []),
    ];
    ask(questions, abort.signal)
      .then(async (a) => {
        const host = typeof a.allow_host === 'string' ? a.allow_host.trim().toLowerCase() : '';
        if (host && a.decision === 'retry') await allowHost(host);
        post({ type: 'decide', step, decision: a.decision as Decision, ...(typeof a.note === 'string' && a.note && { note: a.note }) });
      })
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
      if (asker && !stopping) askGate(c.step, c.gate, asker); // once stopping, --resume asks it again
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
    // In a box, an agent's outputs are newest there until it ends: no other step's push may overwrite them.
    const mine = step.kind === 'ai' && d.box ? produces.map((type) => artifactPath(d.artifactsDir, type)) : [];
    for (const f of mine) producing.add(f);
    show(`-- ${cmd.step} attempt ${cmd.attempt} (${step.kind === 'shell' ? 'shell' : `${step.run.adapter} ${step.run.spec.model}`})`);
    mkdirSync(d.runDir, { recursive: true });
    mkdirSync(d.artifactsDir, { recursive: true });
    // timeout_minutes counts the run's own time: the clock stops while one of its questions waits for a person.
    const minutes = step.timeoutMinutes;
    let left = minutes === undefined ? undefined : Math.min(minutes * 60_000, MAX_TIMER_MS);
    let timer: NodeJS.Timeout | undefined;
    let since = 0;
    let over = false; // an answer coming in after the run ended must not start its clock again
    const startClock = () => {
      if (left === undefined || over) return;
      since = Date.now();
      timer = setTimeout(() => run.stop(`timed out after ${minutes} minutes`), left);
    };
    const stopClock = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      left = Math.max(0, left! - (Date.now() - since));
    };
    let waiting = 0; // an agent's approvals may be open at once: the clock runs again once none is
    const ask: Answerer = async (qs, signal) => {
      if (waiting++ === 0) stopClock();
      try {
        return await asker!(qs, signal, `-- ${cmd.step} asks:`);
      } finally {
        if (--waiting === 0) startClock();
      }
    };
    const answer = asker ? ask : noTerminal;
    const iso = config.isolation;
    const approve = iso?.approvals && step.kind === 'ai' ? approver({ dataDir: d.dataDir, projectId: iso.projectId, folder: config.folder, ask: answer, show, step: cmd.step }) : undefined;
    const runCtx: ExecContext = { ...ctx, answer, ...(approve && { approve }) };
    // ponytail: parallel runs may each spend all that is left; the ceiling is checked again as each one ends.
    const capUsd = budget > 0 ? budget - sumCost(state.runs) : undefined;
    const run = step.kind === 'shell' ? execShell(step.command, config.folder, cmd, produces, runCtx) : execAi(step.run, cmd, produces, runCtx, { verdict: step.verdict, capUsd });
    live.set(cmd.run, { cmd, run });
    void run.ended.then(() => mine.forEach((f) => producing.delete(f))); // pulled back by now: the host's copy is current
    running.add(run);
    void run.ended.then(() => running.delete(run));
    post({ type: 'launched', run: cmd.run });
    startClock();
    run.ended
      .then((end) => {
        over = true;
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
  // The page sees which host drives this run, and stops it as a first Ctrl+C would.
  writeFileSync(join(d.runDir, 'host.json'), JSON.stringify({ pid: process.pid, page: d.page }) + '\n');
  // A second Stop on the page is a repeat, not a second Ctrl+C: the page promises --resume can continue the run.
  const unwatch = watchStop(d.runDir, () => stopAsked || interrupt());

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
    unwatch();
    rmSync(join(d.runDir, 'host.json'), { force: true });
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
  if (d.box && (status === 'done' || status === 'failed')) {
    const patchPath = join(d.runDir, 'changes.patch');
    try {
      const patch = await d.box.patch();
      writeFileSync(patchPath, patch);
      const files = (patch.toString('latin1').match(/^diff --git /gm) ?? []).length;
      print(`-- changes: ${join(d.shown, 'changes.patch')} (${plural(files, 'file')}); review it, then: git -C ${config.folder} apply ${patchPath}`);
      await d.box.kill();
    } catch (e) {
      print(`-- warning: sandbox ${d.box.id}: cannot bring the changes back, so it is kept: ${(e as Error).message}`);
    }
  } else if (d.box) print(`-- sandbox ${d.box.id} kept for --resume`);
  const more = overBudget ? ' --budget-usd <more>' : '';
  if (status === 'paused' || status === 'stopped') print(`-- continue with: pnpm run-flow --resume ${d.shown}${more}`);
  return { done: 0, failed: 1, paused: 3, stopped: 130 }[status];
}
