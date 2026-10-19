/**
 * One run of one flow step: a shell command or an agent session. Each ends
 * with a RunEnd for the engine and never rejects.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint } from '@flowboard/core';
import type { AgentProvider, RunCommand, RunEnd } from '@flowboard/core';
import type { Answerer } from './ask/broker.ts';
import type { Adapter } from './config.ts';
import { openLog } from './run.ts';

/** How much of a shell step's output its artifact keeps: the end, where failures are. */
export const OUTPUT_TAIL = 20_000;
const KILL_AFTER_MS = 2000;

/** `ended` never rejects. */
export interface StepRun { ended: Promise<RunEnd>; stop(): void }
export interface ExecContext {
  artifactsDir: string;
  logDir: string;
  show(line: string): void;
  now(): Date;
  // ai steps:
  makeProvider(adapter: Adapter): AgentProvider;
  answer: Answerer;
  onInterrupt(): void;
}

export const artifactPath = (artifactsDir: string, type: string): string => join(artifactsDir, `${type}.md`);

const SECRET = /_(KEY|TOKEN|SECRET|PASSWORD)$/i;

/** `env` without names ending in _KEY, _TOKEN, _SECRET or _PASSWORD (any case); `removed` lists them, sorted. */
export function shellEnv(env: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; removed: string[] } {
  return {
    env: Object.fromEntries(Object.entries(env).filter(([k]) => !SECRET.test(k))),
    removed: Object.keys(env).filter((k) => SECRET.test(k)).sort(),
  };
}

/** `<logDir>/<NNN>-<step>.jsonl` for one run, with `log(kind, body)` appending a line. */
function runLog(ctx: ExecContext, run: RunCommand) {
  const { fd } = openLog(ctx.logDir, `${String(run.run).padStart(3, '0')}-${run.step}`);
  return {
    log: (kind: string, body: object) => appendFileSync(fd, JSON.stringify({ kind, at: ctx.now().toISOString(), ...body }) + '\n'),
    close: () => closeSync(fd),
  };
}

/** Runs `command` in `folder`: exit 0 is pass. The output's tail is `produces[0]`'s artifact. */
export function execShell(command: string, folder: string, run: RunCommand, produces: string[], ctx: ExecContext): StepRun {
  const { log, close } = runLog(ctx, run);
  log('start', { command, run });
  // ponytail: spawned here, not through ExecHost, which cannot kill a process group; go through it once
  // the sandbox tier can. `detached` makes the command and everything it starts one group, so stop() reaches all.
  // stdin is /dev/null: a check never waits for input.
  const child = spawn('sh', ['-c', command], {
    cwd: folder,
    env: { ...shellEnv(process.env).env, FLOWBOARD_ARTIFACTS: ctx.artifactsDir },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '';
  for (const s of [child.stdout, child.stderr]) {
    s.setEncoding('utf8');
    s.on('data', (d: string) => (tail = (tail + d).slice(-OUTPUT_TAIL)));
  }

  let stopped = false;
  let killer: NodeJS.Timeout | undefined;
  let settle!: (end: RunEnd) => void;
  const ended = new Promise<RunEnd>((resolve) => (settle = resolve));
  let done = false;
  const finish = (end: RunEnd, exitCode: number | null) => {
    if (done) return;
    done = true;
    clearTimeout(killer);
    log('result', { exitCode, ...end });
    close();
    settle(end);
  };
  child.on('error', (e) => finish({ costUsd: 0, error: e.message }, null));
  child.on('close', (code) => {
    if (stopped) return finish({ costUsd: 0, error: 'stopped' }, code);
    if (produces[0]) writeFileSync(artifactPath(ctx.artifactsDir, produces[0]), tail);
    const end: RunEnd = { costUsd: 0, outcome: code === 0 ? 'pass' : 'fail' };
    if (code !== 0 && tail.trim()) end.fingerprint = fingerprint(tail);
    finish(end, code);
  });

  const signal = (sig: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, sig);
    } catch {
      // the group has already gone
    }
  };
  return {
    ended,
    stop() {
      if (done || stopped) return;
      stopped = true;
      signal('SIGTERM');
      killer = setTimeout(() => signal('SIGKILL'), KILL_AFTER_MS);
    },
  };
}
