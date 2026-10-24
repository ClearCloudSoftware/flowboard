/**
 * `pnpm run-agent <task.yaml>`: launch the configured provider, print its
 * events live and append them to runs/<stamp>-<adapter>.jsonl as they come.
 */
import { appendFileSync, closeSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, RunResult, RunSpec } from '@flowboard/core';
import { ClaudeCodeProvider, OpencodeProvider } from '@flowboard/adapters';
import type { connectBox, openBox } from '@flowboard/adapters';
import { SHIM_ENTRY } from '@flowboard/ask-user';
import { startBroker } from './ask/broker.ts';
import type { Answerer } from './ask/broker.ts';
import { noTerminal, terminalAnswerer } from './ask/terminal.ts';
import { loadConfig, SKILLS_PLUGIN } from './config.ts';
import type { Adapter, RunConfig } from './config.ts';

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
  /** Answers the agent's questions; default: the terminal, or a refusal when stdin is not one. */
  answer?: Answerer;
  /** runtime: opensandbox; default: the adapters' own. */
  openBox?: typeof openBox;
  connectBox?: typeof connectBox;
}

export const WITHDRAWN = '-- question withdrawn: the agent stopped waiting';
export const WITHDRAWN_QUEUED = '-- question withdrawn before it was shown: the agent stopped waiting';

/**
 * The spec as launched: the ask_user shim on `socket`, Claude's own question tool off (so the agent asks
 * through ask_user), and the `skills:` folders copied into a `local` plugin under `tmp`. `env` joins the shim's;
 * `node` runs `shimEntry` (in a sandbox, `node` from PATH and the shim where the box keeps FlowBoard's code).
 */
export async function withAsking(config: RunConfig, socket: string, tmp: string, env: Record<string, string> = {}, node = process.execPath, shimEntry = SHIM_ENTRY): Promise<RunSpec> {
  const { adapter, spec, skills } = config;
  const out: RunSpec = {
    ...spec,
    tools: [...(spec.tools ?? []), { name: 'flowboard', command: node, args: [shimEntry], env: { FLOWBOARD_ASK_SOCKET: socket, ...env } }],
  };
  if (adapter === 'claude-code') out.toolPolicy = { ...spec.toolPolicy, deny: [...(spec.toolPolicy?.deny ?? []), 'AskUserQuestion'] };
  if (skills.length) {
    const plugin = join(tmp, SKILLS_PLUGIN);
    // ponytail: copied, not linked, links inside included: both CLIs and the plugin-loaded check handle links unreliably.
    // fs.cp, not cpSync: Node 24's cpSync keeps the links inside a folder even with `dereference`.
    for (const s of skills) await cp(s.path, join(plugin, 'skills', s.name), { recursive: true, dereference: true });
    out.capabilities = [...(spec.capabilities ?? []), { id: SKILLS_PLUGIN, provider: adapter, mount: { kind: 'plugin_dir', path: plugin } }];
  }
  return out;
}

export const defaultProvider = (adapter: Adapter): AgentProvider =>
  adapter === 'claude-code' ? new ClaudeCodeProvider() : new OpencodeProvider({ models: {} });

/** Local time as YYYY-MM-DDTHH-MM-SS. */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Create the log file; a name already taken gets -2, -3, … */
export function openLog(dir: string, name: string): { fd: number; path: string } {
  for (let n = 1; ; n++) {
    const path = join(dir, `${name}${n === 1 ? '' : `-${n}`}.jsonl`);
    try {
      return { fd: openSync(path, 'wx'), path };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

export type Log = (kind: string, body: object) => void;

/** Launches and streams one run: each event is logged and shown; a launch or stream failure becomes a result with `error`. */
export async function streamRun(
  launch: () => AgentRun,
  log: Log,
  show: (line: string) => void,
): Promise<{ result: RunResult; failedTools: number; last?: string }> {
  let run: AgentRun | undefined;
  let failedTools = 0;
  let lastText: string | undefined;
  let lastThinking: string | undefined;
  let usage = ZERO_USAGE; // the running totals, should the stream die before the result
  try {
    run = launch();
    for await (const ev of run.events) {
      log('event', { event: ev });
      if (ev.type === 'usage') usage = ev.usage;
      if (ev.type === 'tool_result' && !ev.ok) failedTools += 1;
      if (ev.type === 'assistant_text') lastText = ev.text;
      if (ev.type === 'thinking') lastThinking = ev.text;
      const { raw: _raw, ...shown } = ev;
      show(`${ev.type.padEnd(14)} ${JSON.stringify(shown).slice(0, 160)}`);
    }
    return { result: await run.result, failedTools, last: lastText ?? lastThinking };
  } catch (e) {
    // ponytail: a stream that died may never settle `result`; report it ourselves.
    run?.stop();
    return { result: { usage, exitCode: 1, error: e instanceof Error ? e.message : String(e) }, failedTools, last: lastText ?? lastThinking };
  }
}

/** `-- N tool call(s) failed` and `-- last message: …`, each only when there is something to say. */
export function summaryLines(failedTools: number, last?: string): string[] {
  return [
    ...(failedTools ? [`-- ${failedTools} tool call${failedTools === 1 ? '' : 's'} failed`] : []),
    ...(last ? [`-- last message: ${last.replace(/\s+/g, ' ').trim().slice(0, 300)}`] : []),
  ];
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
  const { adapter, yamlPath, unrestrictedShell } = loaded.config;

  let fd: number;
  let path: string;
  try {
    const dir = join(deps.cwd, 'runs');
    mkdirSync(dir, { recursive: true });
    ({ fd, path } = openLog(dir, `${stamp(now())}-${adapter}`));
  } catch (e) {
    printErr(`${args[0]}: runs: cannot create the log: ${(e as Error).message}`);
    return 2;
  }
  const log = (kind: string, body: object) =>
    appendFileSync(fd, JSON.stringify({ kind, at: now().toISOString(), ...body }) + '\n');

  let tmp: string | undefined; // the socket and the skills plugin; made in the setup below
  let run: AgentRun | undefined;
  let firstInterrupt: number | undefined;
  const onInterrupt = () => {
    const at = now().getTime();
    if (firstInterrupt === undefined) {
      firstInterrupt = at;
      print('-- stopping');
      run?.stop();
    } else if (at - firstInterrupt > 300) {
      if (tmp) rmSync(tmp, { recursive: true, force: true }); // exit skips the finally below
      exit(130);
    }
    // ponytail: under `pnpm run-agent` one Ctrl+C arrives twice (the terminal's group signal plus pnpm's
    // forward); a second press within 300 ms counts as the same one.
  };
  // Closing the terminal (SIGHUP) or a kill (SIGTERM) stops the run like Ctrl+C, so it still cleans up.
  const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const sig of STOP_SIGNALS) signals.on(sig, onInterrupt);

  // While a question is on screen, event lines wait so they do not print over the prompt.
  let asking = false;
  const held: string[] = [];
  const show = (line: string) => (asking ? held.push(line) : print(line));
  let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
  try {
    let spec: RunSpec;
    try {
      // Short and real: a Unix socket path is limited to about 104 characters, and /tmp is a link on macOS.
      tmp = realpathSync(mkdtempSync('/tmp/fb-'));
      broker = await startBroker(join(tmp, 'ask.sock'), deps.answer ?? (process.stdin.isTTY ? terminalAnswerer(undefined, print) : noTerminal), {
        onQuestion: (questions, batch) => {
          asking = true; // a batch is on screen, or queued behind one
          log('question', { batch, questions });
        },
        onAnswer: (answers, batch) => log('answer', { batch, answers }),
        onWithdrawn: (batch, shown) => {
          log('withdrawn', { batch });
          show(shown ? WITHDRAWN : WITHDRAWN_QUEUED); // another question may still be on screen
        },
        onDone: () => {
          asking = false;
          held.splice(0).forEach((l) => print(l));
        },
        onInterrupt,
      });
      spec = await withAsking(loaded.config, join(tmp, 'ask.sock'), tmp);
    } catch (e) {
      // Nothing launched yet; still end the log, and the output, with a result.
      const result: RunResult = { usage: ZERO_USAGE, exitCode: 1, error: `cannot set up the run: ${(e as Error).message}` };
      log('result', { result });
      print(`-- result ${JSON.stringify(result)}`);
      return 1;
    }
    log('start', { yaml: yamlPath, config: spec });
    print(`-- ${adapter} ${spec.model} in ${spec.cwd}`);
    print(`-- log ${path}`);
    if (unrestrictedShell) print(`-- warning: unrestricted shell: commands can write outside ${spec.cwd}`);

    // `run` is set as it launches, so Ctrl+C can stop it.
    const { result, failedTools, last } = await streamRun(() => (run = (deps.makeProvider ?? defaultProvider)(adapter).launch(spec)), log, show);
    // Withdraw any question still open before the result, so the log ends with it.
    await broker.close();
    broker = undefined;

    log('result', { result });
    // A run can finish cleanly without doing the task; these two lines make that visible.
    summaryLines(failedTools, last).forEach((l) => print(l));
    print(`-- result ${JSON.stringify(result)}`);
    if (result.error === 'stopped') return 130;
    return !result.error && result.exitCode === 0 ? 0 : 1;
  } finally {
    await broker?.close();
    for (const sig of STOP_SIGNALS) signals.off(sig, onInterrupt);
    closeSync(fd);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
