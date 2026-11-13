/**
 * Starting a run from the runs page: `run-flow --page` in the background, in the folder that holds `runs/`, with
 * the page's task text written to a file first. It resolves once run-flow names its run folder, or with what
 * run-flow said when it refused to start.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOW_NAME } from './flow-files.ts';

export interface StartInput { flow: string; folder: string; task: string; budgetUsd?: number; allowDirty?: boolean; workspace?: string }
export type Started = { ok: true; name: string } | { ok: false; error: string };

const FLOW_MAIN = resolve(dirname(fileURLToPath(import.meta.url)), 'flow-main.ts');
const WAIT_MS = 20_000;

export async function startRun(runsDir: string, flowsDir: string, input: StartInput): Promise<Started> {
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
  const out = openSync(log, 'a');
  // run-flow makes its run folder in FLOWBOARD_RUNS_DIR, which it inherits, else in runs/ where it starts.
  const child = spawn(process.execPath, args, { cwd: dirname(runsDir), detached: true, stdio: ['ignore', out, out] });
  child.unref();
  let exited: number | null | undefined;
  child.on('exit', (code) => (exited = code));
  for (const end = Date.now() + WAIT_MS; Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, 150));
    const text = readFileSync(log, 'utf8');
    const named = /^-- run folder (.+)$/m.exec(text);
    if (named) return { ok: true, name: named[1].trim().split(/[\\/]/).at(-1)! };
    if (exited !== undefined) return { ok: false, error: text.trim() || `run-flow exited with ${exited}` };
  }
  return { ok: false, error: `run-flow named no run folder within ${WAIT_MS / 1000} s; its output is in ${log}` };
}
