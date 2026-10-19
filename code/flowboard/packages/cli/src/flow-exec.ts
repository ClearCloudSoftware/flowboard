/**
 * One run of one flow step: a shell command or an agent session. Each ends
 * with a RunEnd for the engine and never rejects.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint, ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, Outcome, RunCommand, RunEnd, RunResult, RunSpec } from '@flowboard/core';
import { startBroker } from './ask/broker.ts';
import type { Answerer } from './ask/broker.ts';
import type { Adapter, RunConfig } from './config.ts';
import { openLog, streamRun, summaryLines, withAsking, WITHDRAWN } from './run.ts';

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

/** `<NNN>-<step>`: the run id, zero-padded, and the step; names the run's files in the log folder. */
const runName = (run: RunCommand) => `${String(run.run).padStart(3, '0')}-${run.step}`;

/** `<logDir>/<NNN>-<step>.jsonl` for one run, with `log(kind, body)` appending a line. */
function runLog(ctx: ExecContext, run: RunCommand) {
  const { fd } = openLog(ctx.logDir, runName(run));
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

/** The verdict set_outcome wrote, when it wrote a valid one. */
function readOutcome(file: string): { outcome: Outcome; reason?: string } | undefined {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as { outcome?: unknown; reason?: unknown };
    if (v.outcome === 'pass' || v.outcome === 'fail') return { outcome: v.outcome, ...(typeof v.reason === 'string' && v.reason && { reason: v.reason }) };
  } catch {
    // no verdict reported
  }
  return undefined;
}

/** True when `path` was written at or after `since`: a copy left by an earlier attempt does not count. */
function writtenSince(path: string, since: number): boolean {
  try {
    return statSync(path).mtimeMs >= since;
  } catch {
    return false;
  }
}

/**
 * Runs one attempt of an agent step: inputs that exist go in the prompt, the rest are named as missing; the
 * verdict comes from set_outcome, else the provider's result; an output this run did not write is missing.
 */
export function execAi(config: RunConfig, run: RunCommand, produces: string[], ctx: ExecContext): StepRun {
  let stopped = false;
  let agent: AgentRun | undefined;
  const ended = (async (): Promise<RunEnd> => {
    const { log, close } = runLog(ctx, run);
    const outcomeFile = join(ctx.logDir, `${runName(run)}.outcome.json`);
    let tmp: string | undefined;
    let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
    const noRun = (error: string): RunEnd => {
      const result: RunResult = { usage: ZERO_USAGE, exitCode: 1, error };
      log('result', { result });
      return { costUsd: 0, error };
    };
    try {
      let spec: RunSpec;
      try {
        // Short and real: a Unix socket path is limited to about 104 characters, and /tmp is a link on macOS.
        tmp = realpathSync(mkdtempSync('/tmp/fb-'));
        const socket = join(tmp, 'ask.sock');
        broker = await startBroker(socket, ctx.answer, {
          onQuestion: (questions) => log('question', { questions }),
          onAnswer: (answers) => log('answer', { answers }),
          onWithdrawn: () => {
            log('withdrawn', {});
            ctx.show(WITHDRAWN);
          },
          onDone: () => {},
          onInterrupt: ctx.onInterrupt,
        });
        spec = withAsking(config, socket, tmp, { FLOWBOARD_OUTCOME_FILE: outcomeFile });
      } catch (e) {
        return noRun(`cannot set up the run: ${(e as Error).message}`);
      }
      const ref = (type: string) => ({ type, path: artifactPath(ctx.artifactsDir, type) });
      const missing = run.inputs.filter((type) => !existsSync(artifactPath(ctx.artifactsDir, type)));
      for (const type of missing) ctx.show(`-- ${run.step}: missing input ${type}; it runs without it`);
      // New objects: the config's own prompt and guards are shared by every attempt.
      spec.prompt = {
        ...spec.prompt,
        preamble:
          spec.prompt.preamble +
          (run.note ? `\n\nA person's note for this attempt: ${run.note}` : '') +
          (missing.length ? `\n\nMissing inputs (an earlier step did not write them): ${missing.join(', ')}` : ''),
        inputs: run.inputs.filter((type) => !missing.includes(type)).map(ref),
        outputs: produces.map(ref),
      };
      spec.guards = { ...spec.guards, writeRoots: [...(spec.guards?.writeRoots ?? []), ctx.artifactsDir] };
      log('start', { step: run.step, attempt: run.attempt, config: spec });
      if (stopped) return noRun('stopped');

      const startedAt = Date.now();
      const { result, failedTools, last } = await streamRun(() => (agent = ctx.makeProvider(config.adapter).launch(spec)), log, ctx.show);
      await broker.close(); // withdraw any question still open, so the log ends with the result
      broker = undefined;
      log('result', { result });
      summaryLines(failedTools, last).forEach((l) => ctx.show(l));

      const costUsd = result.usage.costUsd ?? 0;
      const error = result.error ?? (result.exitCode !== 0 ? `exit code ${result.exitCode}` : undefined);
      if (error) return { costUsd, error };
      const end: RunEnd = { costUsd };
      const reported = readOutcome(outcomeFile);
      if (reported) Object.assign(end, reported);
      else if (result.outcome) end.outcome = result.outcome;
      const unwritten = produces.filter((type) => !writtenSince(artifactPath(ctx.artifactsDir, type), startedAt));
      if (unwritten.length) end.missing = unwritten;
      return end;
    } finally {
      await broker?.close();
      close();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  })();
  return {
    ended,
    stop() {
      stopped = true;
      agent?.stop();
    },
  };
}
