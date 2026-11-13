/**
 * Starting and resuming a run from the runs page: `run-flow --page` in the background. A new run starts in the folder
 * that holds `runs/`, with the page's task text written to a file first; it resolves once run-flow names its run
 * folder, or with what run-flow said when it refused to start. `dataDir`: the app's data folder, where run-flow finds
 * the projects.
 */
import { spawn } from 'node:child_process';
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOW_NAME } from './flow-files.ts';

export interface StartInput { flow: string; folder: string; task: string; budgetUsd?: number; allowDirty?: boolean; workspace?: string }
export type Started = { ok: true; name: string } | { ok: false; error: string };

const FLOW_MAIN = resolve(dirname(fileURLToPath(import.meta.url)), 'flow-main.ts');
const WAIT_MS = 20_000;

export async function startRun(runsDir: string, flowsDir: string, dataDir: string, input: StartInput): Promise<Started> {
  if (!FLOW_NAME.test(input.flow)) return { ok: false, error: `"${input.flow}": not a flow name` };
  if (!input.task.trim()) return { ok: false, error: 'the task is empty' };
  const folder = input.folder.startsWith('~/') ? join(homedir(), input.folder.slice(2)) : input.folder;
  if (!isAbsolute(folder)) return { ok: false, error: 'the folder must be an absolute path, or start with ~/' };
  // The task and run-flow's own output, kept beside the runs; a dot folder, so it is never listed as a run.
  const scratch = join(runsDir, '.started');
  mkdirSync(scratch, { recursive: true });
  const id = `${Date.now()}-${process.pid}`;
  const task = join(scratch, `${id}.task.md`);
  const log = join(scratch, `${id}.log`);
  writeFileSync(task, input.task.endsWith('\n') ? input.task : `${input.task}\n`);
  const args = [FLOW_MAIN, '--folder', folder, '--task', task, '--page'];
  if (input.budgetUsd !== undefined) args.push('--budget-usd', String(input.budgetUsd));
  if (input.allowDirty) args.push('--allow-dirty');
  if (input.workspace) args.push('--workspace', input.workspace);
  args.push(join(flowsDir, `${input.flow}.yaml`));
  const r = await launch(args, dirname(runsDir), dataDir, log, /^-- run folder (.+)$/m);
  if ('said' in r) return { ok: false, error: r.said };
  return r.ready ? { ok: true, name: r.ready[1].trim().split(/[\\/]/).at(-1)! } : { ok: false, error: `run-flow named no run folder within ${WAIT_MS / 1000} s; its output is in ${log}` };
}

/**
 * Continues a paused run from the runs page: `run-flow --resume <runDir> --page` in the background, its output
 * appended to `<runDir>/resume.log`. It resolves once run-flow says it is resuming, or with what it said when it
 * refused; still deciding after the wait, it is taken as resuming, and the page follows it from the run's files.
 */
export async function resumeRun(runDir: string, dataDir: string, budgetUsd?: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const budget = budgetUsd === undefined ? [] : ['--budget-usd', String(budgetUsd)];
  const r = await launch([FLOW_MAIN, '--resume', runDir, '--page', ...budget], process.cwd(), dataDir, join(runDir, 'resume.log'), /^-- resuming /m);
  return 'said' in r ? { ok: false, error: r.said } : { ok: true };
}

/**
 * Starts run-flow (`args`, after node) in the background with its output appended to `log`, and waits until what
 * it writes this time matches `ready`, or it exits first: then `said` is what it wrote. Neither within the wait: `{}`.
 */
async function launch(args: string[], cwd: string, dataDir: string, log: string, ready: RegExp): Promise<{ ready?: RegExpExecArray } | { said: string }> {
  const out = openSync(log, 'a');
  const from = fstatSync(out).size; // an appended log holds earlier attempts' lines
  // run-flow makes its run folder in FLOWBOARD_RUNS_DIR, which it inherits, else in runs/ where it starts; its data
  // folder is the app's, given whole, as it does not start where the app does.
  const env = { ...process.env, FLOWBOARD_DATA_DIR: dataDir };
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: ['ignore', out, out] });
  closeSync(out);
  child.unref();
  let exited: number | null | undefined;
  child.on('exit', (code) => (exited = code));
  for (const end = Date.now() + WAIT_MS; Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, 150));
    const text = readFileSync(log).subarray(from).toString('utf8');
    const m = ready.exec(text);
    if (m) return { ready: m };
    if (exited !== undefined) return { said: text.trim() || `run-flow exited with ${exited}` };
  }
  return {};
}
