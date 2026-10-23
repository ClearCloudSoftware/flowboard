/**
 * One run of one flow step: a shell command or an agent session. Each ends
 * with a RunEnd for the engine and never rejects.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint, ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, Outcome, RunCommand, RunEnd, RunResult, RunSpec } from '@flowboard/core';
import { startBroker } from './ask/broker.ts';
import type { Answerer } from './ask/broker.ts';
import type { Adapter, RunConfig } from './config.ts';
import { openLog, streamRun, summaryLines, withAsking, WITHDRAWN, WITHDRAWN_QUEUED } from './run.ts';
import type { Log } from './run.ts';

/** How much of a shell step's output its artifact keeps: the end, where failures are. */
export const OUTPUT_TAIL = 20_000;
const KILL_AFTER_MS = 2000;
/** How long a check's output may still arrive after its shell exits. */
const DRAIN_MS = 200;

/**
 * `ended` never rejects. `stop(reason)`: the run ends with `reason` as its error, `stopped` by default.
 * `kill()`: SIGKILL now, for a host that must exit before the run ends.
 */
export interface StepRun { ended: Promise<RunEnd>; stop(reason?: string): void; kill(): void }
export interface ExecContext {
  artifactsDir: string;
  logDir: string;
  show(line: string): void;
  now(): Date;
  // ai steps:
  makeProvider(adapter: Adapter): AgentProvider;
  answer: Answerer;
  onInterrupt(): void;
  /** Live agent runs' temp folders, for a host that must exit before their runs end. */
  temps?: Set<string>;
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

/**
 * When process `pid` started, as `ps` prints it; undefined when it has gone or `ps` cannot say. With the pid it
 * tells a run's process from a later one given the same pid.
 */
export function processStart(pid: number): string | undefined {
  if (!(pid > 0)) return undefined;
  const ps = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  return (ps.status === 0 && ps.stdout.trim()) || undefined;
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

/** A shell that could not run its command, or that died by a signal: the setup failed, not the work. */
function setupFailure(code: number | null, sig: NodeJS.Signals | null): string | undefined {
  if (sig) return `killed by ${sig}`;
  if (code === 126) return 'exit code 126: the command cannot run';
  if (code === 127) return 'exit code 127: command not found';
  return undefined;
}

/** The inputs not in the artifacts folder, each said aloud: the step runs without them. */
function missingInputs(run: RunCommand, ctx: ExecContext): string[] {
  const missing = run.inputs.filter((type) => !existsSync(artifactPath(ctx.artifactsDir, type)));
  for (const type of missing) ctx.show(`-- ${run.step}: missing input ${type}; it runs without it`);
  return missing;
}

/**
 * Runs `command` in `folder`: exit 0 is pass, any other exit a fail, except 126, 127 and a death by a signal,
 * which are setup failures. The output's tail is `produces[0]`'s artifact and the run log's last line.
 */
export function execShell(command: string, folder: string, run: RunCommand, produces: string[], ctx: ExecContext): StepRun {
  let logger: ReturnType<typeof runLog> | undefined;
  try {
    logger = runLog(ctx, run);
    logger.log('start', { command, run });
  } catch (e) {
    logger?.close();
    return { ended: Promise.resolve({ costUsd: 0, error: `cannot set up the run: ${(e as Error).message}` }), stop: () => {}, kill: () => {} };
  }
  const { log, close } = logger;
  missingInputs(run, ctx);
  // ponytail: spawned here, not through ExecHost, which cannot kill a process group; go through it once
  // the sandbox tier can. `detached` makes the command and everything it starts one group, so stop() reaches all.
  // stdin is /dev/null: a check never waits for input. A person's note reaches it as FLOWBOARD_NOTE.
  const child = spawn('sh', ['-c', command], {
    cwd: folder,
    env: { ...shellEnv(process.env).env, FLOWBOARD_ARTIFACTS: ctx.artifactsDir, ...(run.note !== undefined && { FLOWBOARD_NOTE: run.note }) },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    // The group to stop, should this host die with the check still running; `started` tells it from a later one.
    if (child.pid) log('pid', { pid: child.pid, group: true, started: processStart(child.pid) });
  } catch {
    // best effort, like the result line
  }
  let tail = '';
  for (const s of [child.stdout, child.stderr]) {
    s.setEncoding('utf8');
    s.on('data', (d: string) => (tail = (tail + d).slice(-OUTPUT_TAIL)));
  }

  let stopReason: string | undefined;
  let killer: NodeJS.Timeout | undefined;
  let settle!: (end: RunEnd) => void;
  const ended = new Promise<RunEnd>((resolve) => (settle = resolve));
  let done = false;
  const finish = (end: RunEnd, exitCode: number | null) => {
    if (done) return;
    done = true;
    clearTimeout(killer);
    try {
      log('result', { exitCode, ...end, output: tail });
    } catch {
      // Best effort: the end must still reach the host, whose own state writes report the disk trouble.
    } finally {
      close();
    }
    settle(end);
  };
  child.on('error', (e) => finish({ costUsd: 0, error: e.message }, null));
  /** The shell has exited: stop what it left running, save its output and report its verdict. */
  const over = (code: number | null, sig: NodeJS.Signals | null) => {
    if (done) return;
    // Whatever is left in the group was started in the background and outlived its shell: it ends with the check.
    if (signal('SIGTERM')) setTimeout(() => signal('SIGKILL'), KILL_AFTER_MS).unref();
    let unsaved: string | undefined;
    if (produces[0]) {
      try {
        mkdirSync(ctx.artifactsDir, { recursive: true }); // the check may have cleaned it away (git clean -fdx)
        writeFileSync(artifactPath(ctx.artifactsDir, produces[0]), tail);
      } catch (e) {
        unsaved = `cannot save the output: ${(e as Error).message}`;
      }
    }
    const last = tail.split('\n').findLast((l) => l.trim());
    if (last) ctx.show(`-- ${run.step}: last output: ${last.trim().slice(0, 300)}`);
    const error = stopReason ?? unsaved ?? setupFailure(code, sig);
    if (error) return finish({ costUsd: 0, error }, code);
    const end: RunEnd = { costUsd: 0, outcome: code === 0 ? 'pass' : 'fail' };
    if (code !== 0 && tail.trim()) end.fingerprint = fingerprint(tail);
    finish(end, code);
  };
  // The check is over when its shell exits. Output written before that drains in a moment; a background
  // command still holding the pipes after it would keep them open, so the end does not wait for them.
  let drain: NodeJS.Timeout | undefined;
  child.on('exit', (code, sig) => (drain = setTimeout(() => over(code, sig), DRAIN_MS)));
  child.on('close', (code, sig) => {
    clearTimeout(drain);
    over(code, sig);
  });

  /** False when the group has already gone. */
  const signal = (sig: NodeJS.Signals): boolean => {
    try {
      if (child.pid) process.kill(-child.pid, sig);
      return child.pid !== undefined;
    } catch {
      return false;
    }
  };
  return {
    ended,
    stop(reason = 'stopped') {
      if (done || stopReason) return;
      stopReason = reason;
      signal('SIGTERM');
      killer = setTimeout(() => signal('SIGKILL'), KILL_AFTER_MS);
    },
    kill() {
      signal('SIGKILL');
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
 * `verdict`: the step's routes or gate use the outcome; without it, set_outcome is not offered and no outcome kept.
 * `capUsd`: the most this run may spend, what the flow's budget has left; the step's own `budget_usd` if lower.
 */
export function execAi(config: RunConfig, run: RunCommand, produces: string[], ctx: ExecContext, opts: { verdict?: boolean; capUsd?: number } = {}): StepRun {
  const verdict = opts.verdict ?? true;
  let stopReason: string | undefined;
  let agent: AgentRun | undefined;
  let agentPid: number | undefined;
  const ended = (async (): Promise<RunEnd> => {
    let logger: ReturnType<typeof runLog> | undefined;
    const log: Log = (kind, body) => logger?.log(kind, body);
    // The broker calls these from its own code, where a throw would go unhandled: they log best effort.
    const quietly: Log = (kind, body) => {
      try {
        log(kind, body);
      } catch {
        // the result line, or the host's next state write, reports the disk trouble
      }
    };
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
        logger = runLog(ctx, run);
        // Short and real: a Unix socket path is limited to about 104 characters, and /tmp is a link on macOS.
        tmp = realpathSync(mkdtempSync('/tmp/fb-'));
        ctx.temps?.add(tmp);
        const socket = join(tmp, 'ask.sock');
        broker = await startBroker(socket, ctx.answer, {
          onQuestion: (questions, batch) => quietly('question', { batch, questions }),
          onAnswer: (answers, batch) => quietly('answer', { batch, answers }),
          onWithdrawn: (batch, shown) => {
            quietly('withdrawn', { batch });
            ctx.show(shown ? WITHDRAWN : WITHDRAWN_QUEUED);
          },
          onDone: () => {},
          onInterrupt: ctx.onInterrupt,
        });
        spec = await withAsking(config, socket, tmp, verdict ? { FLOWBOARD_OUTCOME_FILE: outcomeFile } : {});
      } catch (e) {
        return noRun(`cannot set up the run: ${(e as Error).message}`);
      }
      const ref = (type: string) => ({ type, path: artifactPath(ctx.artifactsDir, type) });
      const missing = missingInputs(run, ctx);
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
      if (opts.capUsd !== undefined) spec.limits = { ...spec.limits, maxBudgetUsd: Math.min(spec.limits?.maxBudgetUsd ?? Infinity, opts.capUsd) };
      log('start', { step: run.step, attempt: run.attempt, adapter: config.adapter, config: spec });
      if (stopReason) return noRun(stopReason);

      const startedAt = Date.now();
      const launch = () => {
        agent = ctx.makeProvider(config.adapter).launch(spec);
        // To stop it, should this host die first; `started` tells it from a later process given the same pid.
        agent.pid.then((pid) => {
          agentPid = pid;
          quietly('pid', { pid, started: processStart(pid) });
        }, () => {});
        return agent;
      };
      const { result, failedTools, last } = await streamRun(launch, log, ctx.show);
      await broker.close(); // withdraw any question still open, so the log ends with the result
      broker = undefined;
      log('result', { result, ...(stopReason && { error: stopReason }) }); // why the host stopped it, if it did
      summaryLines(failedTools, last).forEach((l) => ctx.show(l));

      // A run cut off before its result has its running totals; Claude's carry tokens but no price yet.
      const { usage } = result;
      const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
      const costUsd = usage.costUsd ?? (tokens ? null : 0);
      // OpenCode reports 0 for a model it has no price for, so limits.budget_usd can never stop it.
      if (config.adapter === 'opencode' && costUsd === 0 && tokens) ctx.show(`-- ${run.step}: no price for ${config.spec.model}: its cost shows as $0, and limits.budget_usd cannot stop it`);
      const error = stopReason ?? result.error ?? (result.exitCode !== 0 ? `exit code ${result.exitCode}` : undefined);
      if (error) return { costUsd, error };
      const end: RunEnd = { costUsd };
      const reported = verdict ? readOutcome(outcomeFile) : undefined;
      if (reported) Object.assign(end, reported);
      else if (verdict && result.outcome) end.outcome = result.outcome;
      const unwritten = produces.filter((type) => !writtenSince(artifactPath(ctx.artifactsDir, type), startedAt));
      if (unwritten.length) end.missing = unwritten;
      return end;
    } finally {
      await broker?.close();
      logger?.close();
      if (tmp) {
        rmSync(tmp, { recursive: true, force: true });
        ctx.temps?.delete(tmp);
      }
    }
  })().catch((e: unknown): RunEnd => {
    agent?.stop(); // whatever failed, the agent must not go on unwatched
    return { costUsd: 0, error: e instanceof Error ? e.message : String(e) };
  });
  return {
    ended,
    stop(reason = 'stopped') {
      stopReason ??= reason;
      agent?.stop();
    },
    kill() {
      try {
        if (agentPid !== undefined && agentPid > 0) process.kill(agentPid, 'SIGKILL');
      } catch {
        // already gone
      }
    },
  };
}
