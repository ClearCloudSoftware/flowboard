import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZERO_USAGE } from '@flowboard/core';
import type { AgentProvider, AgentRun, NormalizedEvent, RunResult } from '@flowboard/core';
import { ReplayProvider } from '@flowboard/adapters';
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
  deps.print = (l) => {
    out.push(l);
    if (l.startsWith('assistant_text')) {
      signals.emit('SIGINT');
      signals.emit('SIGINT');
      release();
    }
  };
  await runAgent(['task.yaml'], deps);
  assert.deepEqual(exits, [130]);
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
