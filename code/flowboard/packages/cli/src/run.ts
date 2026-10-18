/**
 * `pnpm run-agent <task.yaml>`: launch the configured provider, print its
 * events live and append them to runs/<stamp>-<adapter>.jsonl as they come.
 */
import { appendFileSync, closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, RunResult } from '@flowboard/core';
import { ClaudeCodeProvider, OpencodeProvider } from '@flowboard/adapters';
import { loadConfig } from './config.ts';
import type { Adapter } from './config.ts';

export interface RunDeps {
  /** Base for every relative path. */
  cwd: string;
  makeProvider?: (adapter: Adapter) => AgentProvider;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  /** Where 'SIGINT' is listened on. */
  signals?: NodeJS.EventEmitter;
  /** Used by the second Ctrl+C. */
  exit?: (code: number) => void;
  now?: () => Date;
}

const defaultProvider = (adapter: Adapter): AgentProvider =>
  adapter === 'claude-code' ? new ClaudeCodeProvider() : new OpencodeProvider({ models: {} });

/** Local time as YYYY-MM-DDTHH-MM-SS. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Create the log file; a name already taken gets -2, -3, … */
function openLog(dir: string, name: string): { fd: number; path: string } {
  for (let n = 1; ; n++) {
    const path = join(dir, `${name}${n === 1 ? '' : `-${n}`}.jsonl`);
    try {
      return { fd: openSync(path, 'wx'), path };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

export async function runAgent(args: string[], deps: RunDeps): Promise<number> {
  const print = deps.print ?? console.log;
  const printErr = deps.printErr ?? console.error;
  const signals = deps.signals ?? process;
  const exit = deps.exit ?? process.exit;
  const now = deps.now ?? (() => new Date());

  if (args.length !== 1) {
    printErr('usage: pnpm run-agent <task.yaml>');
    return 2;
  }
  const loaded = loadConfig(args[0], deps.cwd);
  if (!loaded.ok) {
    loaded.errors.forEach((l) => printErr(l));
    return 2;
  }
  const { adapter, spec, yamlPath, unrestrictedShell } = loaded.config;

  const dir = join(deps.cwd, 'runs');
  mkdirSync(dir, { recursive: true });
  const { fd, path } = openLog(dir, `${stamp(now())}-${adapter}`);
  const log = (kind: string, body: object) =>
    appendFileSync(fd, JSON.stringify({ kind, at: now().toISOString(), ...body }) + '\n');

  let run: AgentRun | undefined;
  let firstInterrupt: number | undefined;
  const onInterrupt = () => {
    const at = now().getTime();
    if (firstInterrupt === undefined) {
      firstInterrupt = at;
      print('-- stopping');
      run?.stop();
    } else if (at - firstInterrupt > 300) {
      exit(130);
    }
    // ponytail: under `pnpm run-agent` one Ctrl+C arrives twice (the terminal's group signal plus pnpm's
    // forward); a second press within 300 ms counts as the same one.
  };
  signals.on('SIGINT', onInterrupt);
  try {
    log('start', { yaml: yamlPath, config: spec });
    print(`-- ${adapter} ${spec.model} in ${spec.cwd}`);
    print(`-- log ${path}`);
    if (unrestrictedShell) print(`-- warning: unrestricted shell: commands can write outside ${spec.cwd}`);

    let result: RunResult;
    let failedTools = 0;
    let lastText: string | undefined;
    let lastThinking: string | undefined;
    try {
      run = (deps.makeProvider ?? defaultProvider)(adapter).launch(spec);
      for await (const ev of run.events) {
        log('event', { event: ev });
        if (ev.type === 'tool_result' && !ev.ok) failedTools += 1;
        if (ev.type === 'assistant_text') lastText = ev.text;
        if (ev.type === 'thinking') lastThinking = ev.text;
        const { raw: _raw, ...shown } = ev;
        print(`${ev.type.padEnd(14)} ${JSON.stringify(shown).slice(0, 160)}`);
      }
      result = await run.result;
    } catch (e) {
      // ponytail: a stream that died may never settle `result`; report it ourselves.
      run?.stop();
      result = { usage: ZERO_USAGE, exitCode: 1, error: e instanceof Error ? e.message : String(e) };
    }

    log('result', { result });
    // A run can finish cleanly without doing the task; these two lines make that visible.
    if (failedTools) print(`-- ${failedTools} tool call${failedTools === 1 ? '' : 's'} failed`);
    const last = lastText ?? lastThinking;
    if (last) print(`-- last message: ${last.replace(/\s+/g, ' ').trim().slice(0, 300)}`);
    print(`-- result ${JSON.stringify(result)}`);
    if (result.error === 'stopped') return 130;
    return !result.error && result.exitCode === 0 ? 0 : 1;
  } finally {
    signals.off('SIGINT', onInterrupt);
    closeSync(fd);
  }
}
