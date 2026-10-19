import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { askBroker } from '@flowboard/ask-user';
import type { Answers, Question } from '@flowboard/core';
import { startBroker } from '../src/ask/broker.ts';
import type { Answerer, BrokerEvents } from '../src/ask/broker.ts';

const q = (id: string): Question => ({ id, prompt: `${id}?`, kind: 'text' });
const sock = () => join(mkdtempSync('/tmp/fb-'), 'ask.sock');

/** Events recorded in order, by name. */
function recorder() {
  const seen: string[] = [];
  const events: BrokerEvents = {
    onQuestion: (qs) => seen.push(`question:${qs.map((x) => x.id).join(',')}`),
    onAnswer: () => seen.push('answer'),
    onWithdrawn: () => seen.push('withdrawn'),
    onDone: () => seen.push('done'),
    onInterrupt: () => seen.push('interrupt'),
  };
  return { seen, events };
}

/** Resolves once `cond` holds, polling briefly. */
async function until(cond: () => boolean) {
  while (!cond()) await new Promise((r) => setTimeout(r, 5));
}

test('a request is answered by the answerer', async () => {
  const path = sock();
  const { seen, events } = recorder();
  const broker = await startBroker(path, async () => ({ a: 'x' }), events);
  assert.deepEqual(await askBroker(path, { questions: [q('a')] }), { answers: { a: 'x' } });
  await until(() => seen.includes('done'));
  assert.deepEqual(seen, ['question:a', 'answer', 'done']);
  await broker.close();
});

test('two requests at once are answered one after the other', async () => {
  const path = sock();
  const log: string[] = [];
  const answer: Answerer = async (qs) => {
    log.push(`start ${qs[0].id}`);
    await new Promise((r) => setTimeout(r, 20));
    log.push(`end ${qs[0].id}`);
    return { [qs[0].id]: qs[0].id.toUpperCase() } as Answers;
  };
  const broker = await startBroker(path, answer, recorder().events);
  const [a, b] = await Promise.all([askBroker(path, { questions: [q('a')] }), askBroker(path, { questions: [q('b')] })]);
  assert.deepEqual([a, b], [{ answers: { a: 'A' } }, { answers: { b: 'B' } }]);
  assert.equal(log.length, 4);
  assert.ok(log[1].startsWith('end') && log[2].startsWith('start'), log.join(' | '));
  await broker.close();
});

test('a dropped connection withdraws its question and aborts the prompt', async () => {
  const path = sock();
  const { seen, events } = recorder();
  let signal: AbortSignal | undefined;
  const answer: Answerer = (_qs, s) =>
    new Promise((_r, reject) => {
      signal = s;
      s.addEventListener('abort', () => reject(new Error('aborted')));
    });
  const broker = await startBroker(path, answer, events);
  const conn = createConnection(path, () => conn.write(JSON.stringify({ questions: [q('a')] }) + '\n'));
  await until(() => signal !== undefined);
  conn.destroy();
  await until(() => seen.includes('withdrawn'));
  assert.equal(signal!.aborted, true);
  await broker.close();
});

test('close() withdraws a question on screen', async () => {
  const path = sock();
  const { seen, events } = recorder();
  let signal: AbortSignal | undefined;
  const answer: Answerer = (_qs, s) =>
    new Promise((_r, reject) => {
      signal = s;
      s.addEventListener('abort', () => reject(new Error('aborted')));
    });
  const broker = await startBroker(path, answer, events);
  askBroker(path, { questions: [q('a')] }).catch(() => {});
  await until(() => signal !== undefined);
  await broker.close();
  assert.ok(seen.includes('withdrawn'));
  assert.equal(signal!.aborted, true);
});

test('Ctrl+C in the prompt interrupts the run', async () => {
  const path = sock();
  const { seen, events } = recorder();
  const broker = await startBroker(path, async () => Promise.reject(Object.assign(new Error('x'), { name: 'ExitPromptError' })), events);
  assert.deepEqual(await askBroker(path, { questions: [q('a')] }), { error: 'stopped' });
  assert.ok(seen.includes('interrupt'));
  await broker.close();
});

test('an answerer failure becomes an error reply', async () => {
  const path = sock();
  const broker = await startBroker(path, async () => Promise.reject(new Error('No one can answer questions in this run.')), recorder().events);
  assert.deepEqual(await askBroker(path, { questions: [q('a')] }), { error: 'No one can answer questions in this run.' });
  await broker.close();
});

test('a malformed request gets an error reply', async () => {
  const path = sock();
  const broker = await startBroker(path, async () => ({}), recorder().events);
  const reply = await new Promise<string>((resolve) => {
    const conn = createConnection(path, () => conn.write('not json\n'));
    let buf = '';
    conn.on('data', (d) => (buf += d));
    conn.on('close', () => resolve(buf));
  });
  assert.ok('error' in JSON.parse(reply));
  await broker.close();
});
