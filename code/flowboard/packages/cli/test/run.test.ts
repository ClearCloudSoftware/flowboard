import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, NormalizedEvent, Question, RunResult, RunSpec } from '@flowboard/core';
import { ReplayProvider } from '@flowboard/adapters';
import { askBroker, SHIM_ENTRY } from '@flowboard/ask-user';
import { noTerminal } from '../src/ask/terminal.ts';
import { CLOSING } from '../src/config.ts';
import { runAgent } from '../src/run.ts';
import type { RunDeps } from '../src/run.ts';

const YAML = 'adapter: claude-code\nmodel: sonnet\nfolder: proj\nprompt: task.md\n';
const LOG_NAME = '2026-10-18T09-05-07-claude-code.jsonl';
const HELLO: NormalizedEvent[] = [
  { type: 'system', sessionId: 's-1' },
  { type: 'assistant_text', text: 'hi', raw: { native: true } },
  { type: 'result', usage: { ...ZERO_USAGE, costUsd: 0.01 } },
];

/** A temp project, plus deps that capture output and use `provider`. */
function setup(provider: () => AgentProvider, yaml = YAML) {
  const base = mkdtempSync(join(tmpdir(), 'fb-run-'));
  mkdirSync(join(base, 'proj'));
  writeFileSync(join(base, 'task.md'), 'Say hi.');
  writeFileSync(join(base, 'task.yaml'), yaml);
  const out: string[] = [];
  const err: string[] = [];
  const signals = new EventEmitter();
  const exits: number[] = [];
  const deps: RunDeps = {
    cwd: base,
    makeProvider: provider,
    print: (l) => out.push(l),
    printErr: (l) => err.push(l),
    signals,
    exit: (c) => exits.push(c),
    now: () => new Date(2026, 9, 18, 9, 5, 7),
  };
  return { base, out, err, signals, exits, deps };
}

const readLog = (path: string) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

/** An AgentProvider whose single run is whatever `run` returns. */
function fake(run: () => AgentRun): AgentProvider {
  return { id: 'fake', capabilities: new Set(), resolveModel: (m) => m, launch: run };
}

test('a successful run prints, logs and exits 0', async () => {
  const { base, out, deps } = setup(() => new ReplayProvider({ events: HELLO }));
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  const log = join(base, 'runs', LOG_NAME);
  const lines = readLog(log);
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['start', 'event', 'event', 'event', 'result'],
  );
  assert.equal(lines[0].yaml, join(base, 'task.yaml'));
  assert.equal(lines[0].config.cwd, join(base, 'proj'));
  assert.equal(lines[0].config.prompt.closing, CLOSING);
  assert.deepEqual(lines[2].event.raw, { native: true });
  assert.equal(lines[4].result.exitCode, 0);
  assert.equal(out[0], `-- claude-code sonnet in ${join(base, 'proj')}`);
  assert.equal(out[1], `-- log ${log}`);
  assert.ok(out.some((l) => l.startsWith('assistant_text ') && !l.includes('native')));
  assert.match(out.at(-1)!, /^-- result /);
});

test('a bad config prints field errors, exits 2 and creates no runs/', async () => {
  const { base, err, deps } = setup(() => new ReplayProvider({ events: HELLO }), YAML.replace('model: sonnet\n', ''));
  assert.equal(await runAgent(['task.yaml'], deps), 2);
  assert.deepEqual(err, ['task.yaml: model: required']);
  assert.ok(!existsSync(join(base, 'runs')));
});

test('no argument prints usage and exits 2', async () => {
  const { err, deps } = setup(() => new ReplayProvider({ events: HELLO }));
  assert.equal(await runAgent([], deps), 2);
  assert.deepEqual(err, ['usage: pnpm run-agent <task.yaml>']);
});

test('a result with error exits 1', async () => {
  const result: RunResult = { usage: ZERO_USAGE, exitCode: 0, error: 'boom' };
  const { deps } = setup(() =>
    fake(() => ({
      sessionId: Promise.resolve('s'),
      pid: Promise.resolve(1),
      events: (async function* () {})(),
      result: Promise.resolve(result),
      stop() {},
    })),
  );
  assert.equal(await runAgent(['task.yaml'], deps), 1);
});

test('Ctrl+C stops the run and exits 130', async () => {
  const events: NormalizedEvent[] = Array.from({ length: 50 }, (_, i) => ({ type: 'assistant_text', text: `t${i}` }));
  const { base, out, signals, deps } = setup(() => new ReplayProvider({ events }));
  deps.print = (l) => {
    out.push(l);
    if (l.startsWith('assistant_text') && !out.includes('-- stopping')) signals.emit('SIGINT');
  };
  assert.equal(await runAgent(['task.yaml'], deps), 130);
  assert.ok(out.includes('-- stopping'));
  const last = readLog(join(base, 'runs', LOG_NAME)).at(-1);
  assert.equal(last.kind, 'result');
  assert.equal(last.result.error, 'stopped');
  assert.equal(signals.listenerCount('SIGINT'), 0);
});

test('a second Ctrl+C exits immediately', async () => {
  let release!: () => void;
  const stuck = new Promise<void>((r) => (release = r));
  const { out, signals, exits, deps } = setup(() =>
    fake(() => ({
      sessionId: Promise.resolve('s'),
      pid: Promise.resolve(1),
      events: (async function* () {
        yield { type: 'assistant_text', text: 'working' } as NormalizedEvent;
        await stuck; // stop() does nothing: a run that will not die
      })(),
      result: stuck.then(() => ({ usage: ZERO_USAGE, exitCode: 130, error: 'stopped' })),
      stop() {},
    })),
  );
  let t = Date.UTC(2026, 9, 18);
  deps.now = () => new Date(t);
  deps.print = (l) => {
    out.push(l);
    if (l.startsWith('assistant_text')) {
      signals.emit('SIGINT');
      t += 1000; // a human's second press
      signals.emit('SIGINT');
      release();
    }
  };
  await runAgent(['task.yaml'], deps);
  assert.deepEqual(exits, [130]);
});

test('one Ctrl+C delivered twice (pnpm forwards it) counts once', async () => {
  const events: NormalizedEvent[] = Array.from({ length: 50 }, (_, i) => ({ type: 'assistant_text', text: `t${i}` }));
  const { base, out, signals, exits, deps } = setup(() => new ReplayProvider({ events }));
  deps.print = (l) => {
    out.push(l);
    if (l.startsWith('assistant_text') && !out.includes('-- stopping')) {
      signals.emit('SIGINT'); // from the terminal's process group
      signals.emit('SIGINT'); // forwarded by pnpm
    }
  };
  assert.equal(await runAgent(['task.yaml'], deps), 130);
  assert.deepEqual(exits, []);
  assert.equal(readLog(join(base, 'runs', LOG_NAME)).at(-1).result.error, 'stopped');
});

test('two runs in the same second get separate logs', async () => {
  const { base, deps } = setup(() => new ReplayProvider({ events: HELLO }));
  await runAgent(['task.yaml'], deps);
  await runAgent(['task.yaml'], deps);
  assert.ok(existsSync(join(base, 'runs', LOG_NAME)));
  assert.ok(existsSync(join(base, 'runs', LOG_NAME.replace('.jsonl', '-2.jsonl'))));
});

test('an event stream that throws still logs a result and exits 1', async () => {
  let stopped = false;
  const { base, deps } = setup(() =>
    fake(() => ({
      sessionId: Promise.resolve('s'),
      pid: Promise.resolve(1),
      events: (async function* () {
        yield { type: 'assistant_text', text: 'hi' } as NormalizedEvent;
        throw new Error('stream died');
      })(),
      result: new Promise<RunResult>(() => {}), // never settles
      stop() {
        stopped = true;
      },
    })),
  );
  assert.equal(await runAgent(['task.yaml'], deps), 1);
  assert.ok(stopped);
  const last = readLog(join(base, 'runs', LOG_NAME)).at(-1);
  assert.equal(last.kind, 'result');
  assert.equal(last.result.exitCode, 1);
  assert.equal(last.result.error, 'stream died');
});

test('the unrestricted-shell warning is printed', async () => {
  const yaml = YAML + 'permissions:\n  mode: bypassPermissions\n  allow_unrestricted_shell: true\n';
  const { base, out, deps } = setup(() => new ReplayProvider({ events: HELLO }), yaml);
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  assert.equal(out[2], `-- warning: unrestricted shell: commands can write outside ${join(base, 'proj')}`);
});

test('the end summary counts failed tool calls and shows the last message', async () => {
  const events: NormalizedEvent[] = [
    { type: 'tool_use', name: 'write', input: {}, summary: 'write a' },
    { type: 'tool_result', ok: false, output: 'Write outside the worktree: a' },
    { type: 'tool_result', ok: false, output: 'Not permitted in this headless run.' },
    { type: 'tool_result', ok: true, output: 'fine' },
    { type: 'assistant_text', text: 'first' },
    { type: 'assistant_text', text: 'Could not write.\nGave up.' },
    { type: 'result', usage: ZERO_USAGE },
  ];
  const { out, deps } = setup(() => new ReplayProvider({ events }));
  await runAgent(['task.yaml'], deps);
  assert.deepEqual(out.slice(-3, -1), ['-- 2 tool calls failed', '-- last message: Could not write. Gave up.']);
  assert.match(out.at(-1)!, /^-- result /);
});

test('the summary falls back to the last thinking and skips a zero failure count', async () => {
  const events: NormalizedEvent[] = [
    { type: 'thinking', text: 'I reached the step limit.' },
    { type: 'result', usage: ZERO_USAGE },
  ];
  const { out, deps } = setup(() => new ReplayProvider({ events }));
  await runAgent(['task.yaml'], deps);
  assert.equal(out.at(-2), '-- last message: I reached the step limit.');
  assert.ok(!out.some((l) => l.includes('tool calls failed')));
});

// --- asking ------------------------------------------------------------------

const COLOUR: Question = { id: 'colour', prompt: 'Colour?', kind: 'text' };
const WITHDRAWN = '-- question withdrawn: the agent stopped waiting';

/**
 * A fake agent that asks `questions` through the run's broker socket, as the shim would, then reports
 * the reply as its text. `during` runs after the ask is sent and before the reply is awaited.
 */
function askingProvider(during?: () => AsyncGenerator<NormalizedEvent>) {
  const seen: { spec?: RunSpec } = {};
  const provider = fake(() => {
    throw new Error('replaced below');
  });
  provider.launch = (spec) => {
    seen.spec = spec;
    const socket = spec.tools?.find((t) => t.name === 'flowboard')?.env?.FLOWBOARD_ASK_SOCKET;
    let stopped = false;
    let settle!: (r: RunResult) => void;
    const result = new Promise<RunResult>((r) => (settle = r));
    return {
      sessionId: Promise.resolve('s'),
      pid: Promise.resolve(1),
      events: (async function* () {
        const pending = askBroker(socket!, { questions: [COLOUR] });
        pending.catch(() => {}); // an agent that crashes mid-question never reads its reply
        if (during) yield* during();
        const reply = await pending;
        yield { type: 'assistant_text', text: JSON.stringify(reply) } as NormalizedEvent;
        settle(stopped ? { usage: ZERO_USAGE, exitCode: 130, error: 'stopped' } : { usage: ZERO_USAGE, exitCode: 0 });
      })(),
      result,
      stop() {
        stopped = true;
      },
    };
  };
  return { provider, seen };
}

/** A promise with its resolve exposed. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

test('the agent gets the answer and the log records question and answer', async () => {
  const { provider } = askingProvider();
  const { base, out, deps } = setup(() => provider);
  deps.answer = async () => ({ colour: 'teal' });
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  assert.ok(out.some((l) => l.startsWith('assistant_text') && l.includes('teal')));
  const kinds = readLog(join(base, 'runs', LOG_NAME)).map((l) => l.kind);
  assert.ok(kinds.indexOf('question') < kinds.indexOf('answer') && kinds.indexOf('answer') < kinds.indexOf('result'), kinds.join());
});

test("the shim is injected and Claude's built-in question tool is denied", async () => {
  const { provider } = askingProvider();
  const { base, deps } = setup(() => provider);
  deps.answer = async () => ({ colour: 'teal' });
  await runAgent(['task.yaml'], deps);
  const { config } = readLog(join(base, 'runs', LOG_NAME))[0];
  assert.equal(config.tools[0].name, 'flowboard');
  assert.equal(config.tools[0].command, process.execPath);
  assert.deepEqual(config.tools[0].args, [SHIM_ENTRY]);
  assert.match(config.tools[0].env.FLOWBOARD_ASK_SOCKET, /^\/(private\/)?tmp\/fb-.+\/ask\.sock$/);
  assert.ok(config.toolPolicy.deny.includes('AskUserQuestion'));
});

test('opencode runs get the shim but no AskUserQuestion deny', async () => {
  const { provider } = askingProvider();
  const yaml = 'adapter: opencode\nmodel: x/y\nfolder: proj\nprompt: task.md\n';
  const { base, deps } = setup(() => provider, yaml);
  deps.answer = async () => ({ colour: 'teal' });
  await runAgent(['task.yaml'], deps);
  const { config } = readLog(join(base, 'runs', '2026-10-18T09-05-07-opencode.jsonl'))[0];
  assert.equal(config.tools[0].name, 'flowboard');
  assert.equal(config.toolPolicy, undefined);
});

test('events during a question print after it is answered', async () => {
  const onScreen = deferred();
  const { provider } = askingProvider(async function* () {
    await onScreen.promise;
    yield { type: 'assistant_text', text: 'during' } as NormalizedEvent;
  });
  const { out, deps } = setup(() => provider);
  let printedWhileAsking: boolean | undefined;
  deps.answer = async () => {
    onScreen.resolve();
    await new Promise((r) => setTimeout(r, 30));
    printedWhileAsking = out.some((l) => l.includes('during'));
    return { colour: 'teal' };
  };
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  assert.equal(printedWhileAsking, false);
  assert.ok(out.some((l) => l.includes('during')));
});

test('a run that ends mid-question withdraws it and still exits with a result', async () => {
  const onScreen = deferred();
  const { provider } = askingProvider(async function* () {
    await onScreen.promise;
    throw new Error('crashed');
  });
  const { base, out, deps } = setup(() => provider);
  let signal: AbortSignal | undefined;
  deps.answer = (_qs, s) =>
    new Promise((_r, reject) => {
      signal = s;
      onScreen.resolve();
      s.addEventListener('abort', () => reject(new Error('aborted')));
    });
  assert.equal(await runAgent(['task.yaml'], deps), 1);
  assert.ok(out.includes(WITHDRAWN));
  assert.equal(signal?.aborted, true);
  const kinds = readLog(join(base, 'runs', LOG_NAME)).map((l) => l.kind);
  assert.ok(kinds.includes('withdrawn'));
  assert.equal(kinds.at(-1), 'result');
});

test('Ctrl+C at a question stops the run with 130', async () => {
  const { provider } = askingProvider();
  const { out, deps } = setup(() => provider);
  deps.answer = async () => Promise.reject(Object.assign(new Error('User force closed the prompt'), { name: 'ExitPromptError' }));
  assert.equal(await runAgent(['task.yaml'], deps), 130);
  assert.ok(out.includes('-- stopping'));
});

test('skills are copied into a local plugin and the temp dir is removed afterwards', async () => {
  const { provider, seen } = askingProvider();
  let skillCopied = false;
  const launch = provider.launch;
  provider.launch = (spec) => {
    const plugin = spec.capabilities?.find((c) => c.id === 'local');
    if (plugin?.mount.kind === 'plugin_dir') skillCopied = existsSync(join(plugin.mount.path, 'skills/grill-me/SKILL.md'));
    return launch(spec);
  };
  const yaml = YAML + 'skills: [skills/grill-me]\nskill: /grill-me\n';
  const { base, deps } = setup(() => provider, yaml);
  mkdirSync(join(base, 'skills', 'grill-me'), { recursive: true });
  writeFileSync(join(base, 'skills', 'grill-me', 'SKILL.md'), '---\nname: grill-me\n---\nGrill.\n');
  deps.answer = async () => ({ colour: 'teal' });
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  const plugin = seen.spec!.capabilities!.find((c) => c.id === 'local')!;
  assert.equal(plugin.provider, 'claude-code');
  assert.ok(plugin.mount.kind === 'plugin_dir' && plugin.mount.path.endsWith('/local'));
  assert.ok(skillCopied);
  assert.equal(seen.spec!.prompt.invocation, '/local:grill-me');
  assert.ok(plugin.mount.kind === 'plugin_dir' && !existsSync(join(plugin.mount.path, '..')), 'temp dir removed');
});

test('without a terminal the agent is told no one can answer', async () => {
  const { provider } = askingProvider();
  const { out, deps } = setup(() => provider);
  deps.answer = noTerminal;
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  assert.ok(out.some((l) => l.includes('No one can answer questions in this run.')));
});

test('a queued question withdrawn while another is on screen does not print over the prompt', async () => {
  const onScreen = deferred();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let socket = '';
  const { provider } = askingProvider(async function* () {
    await onScreen.promise;
    // A second, parallel ask that its agent gives up on while the first is still on screen.
    const conn = createConnection(socket, () => conn.write(JSON.stringify({ questions: [{ ...COLOUR, id: 'size' }] }) + '\n'));
    conn.on('error', () => {});
    await sleep(20);
    conn.destroy();
    await sleep(20);
  });
  const launch = provider.launch;
  provider.launch = (spec) => {
    socket = spec.tools!.find((t) => t.name === 'flowboard')!.env!.FLOWBOARD_ASK_SOCKET;
    return launch(spec);
  };
  const { out, deps } = setup(() => provider);
  let printedWhileAsking: boolean | undefined;
  deps.answer = async () => {
    onScreen.resolve();
    await sleep(80);
    printedWhileAsking = out.includes(WITHDRAWN);
    return { colour: 'teal' };
  };
  assert.equal(await runAgent(['task.yaml'], deps), 0);
  assert.equal(printedWhileAsking, false);
  assert.ok(out.includes(WITHDRAWN));
});

test('the second Ctrl+C removes the temp dir before exiting', async () => {
  let release!: () => void;
  const stuck = new Promise<void>((r) => (release = r));
  const { base, out, signals, deps } = setup(() =>
    fake(() => ({
      sessionId: Promise.resolve('s'),
      pid: Promise.resolve(1),
      events: (async function* () {
        yield { type: 'assistant_text', text: 'working' } as NormalizedEvent;
        await stuck;
      })(),
      result: stuck.then(() => ({ usage: ZERO_USAGE, exitCode: 130, error: 'stopped' })),
      stop() {},
    })),
  );
  let t = Date.UTC(2026, 9, 18);
  deps.now = () => new Date(t);
  let tmpGoneAtExit: boolean | undefined;
  deps.exit = () => {
    const [start] = readLog(join(base, 'runs', readdirSync(join(base, 'runs'))[0]));
    tmpGoneAtExit = !existsSync(dirname(start.config.tools[0].env.FLOWBOARD_ASK_SOCKET));
  };
  deps.print = (l) => {
    out.push(l);
    if (l.startsWith('assistant_text')) {
      signals.emit('SIGINT');
      t += 1000;
      signals.emit('SIGINT');
      release();
    }
  };
  await runAgent(['task.yaml'], deps);
  assert.equal(tmpGoneAtExit, true);
});

test('SIGTERM and SIGHUP stop the run like Ctrl+C', async () => {
  for (const sig of ['SIGTERM', 'SIGHUP']) {
    const events: NormalizedEvent[] = Array.from({ length: 50 }, (_, i) => ({ type: 'assistant_text', text: `t${i}` }));
    const { out, signals, deps } = setup(() => new ReplayProvider({ events }));
    deps.print = (l) => {
      out.push(l);
      if (l.startsWith('assistant_text') && !out.includes('-- stopping')) signals.emit(sig);
    };
    assert.equal(await runAgent(['task.yaml'], deps), 130, sig);
    assert.equal(signals.listenerCount(sig), 0, sig);
  }
});
