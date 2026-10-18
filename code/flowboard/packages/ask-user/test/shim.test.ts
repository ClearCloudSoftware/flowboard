import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AskReply, AskRequest } from '@flowboard/core';
import { SHIM_ENTRY } from '../src/index.ts';

/** A fake broker replying `reply` to every request; `requests` records what it saw. */
async function fakeBroker(reply: AskReply | object) {
  const socketPath = join(mkdtempSync('/tmp/fb-'), 'ask.sock');
  const requests: AskRequest[] = [];
  const server = createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d;
      if (!buf.includes('\n')) return;
      requests.push(JSON.parse(buf.split('\n')[0]));
      conn.end(JSON.stringify(reply) + '\n');
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, r));
  return { socketPath, requests, close: () => new Promise((r) => server.close(r)) };
}

/** An MCP client connected to the shim, which talks to `socketPath`. */
async function shim(socketPath: string) {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [SHIM_ENTRY],
      env: { ...process.env, FLOWBOARD_ASK_SOCKET: socketPath } as Record<string, string>,
    }),
  );
  return client;
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (client: Client, name: string, args: object) =>
  (await client.callTool({ name, arguments: args as Record<string, unknown> })) as ToolResult;

const colour = { id: 'color', prompt: 'Colour?', kind: 'text' };

test('lists ask_user and ask_user_batch', async (t) => {
  const broker = await fakeBroker({ answers: {} });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ['ask_user', 'ask_user_batch']);
});

test('ask_user forwards one question and returns the answers', async (t) => {
  const broker = await fakeBroker({ answers: { color: 'teal' } });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const res = await call(client, 'ask_user', { question: colour });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [colour] }]);
  assert.deepEqual(JSON.parse(res.content[0].text), { answers: { color: 'teal' } });
});

test('ask_user_batch forwards the whole batch', async (t) => {
  const broker = await fakeBroker({ answers: { color: 'teal', size: 3 } });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const size = { id: 'size', prompt: 'Size?', kind: 'number', required: false };
  const res = await call(client, 'ask_user_batch', { questions: [colour, size] });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [colour, size] }]);
  assert.deepEqual(JSON.parse(res.content[0].text), { answers: { color: 'teal', size: 3 } });
});

test('a broker error becomes a tool error', async (t) => {
  const broker = await fakeBroker({ error: 'nope' });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const res = await call(client, 'ask_user', { question: colour });
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, 'nope');
});

test('an unknown reply is relayed verbatim', async (t) => {
  const park = { status: 'no_answer_yet', instruction: 'Write your state.' };
  const broker = await fakeBroker(park);
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const res = await call(client, 'ask_user', { question: colour });
  assert.ok(!res.isError);
  assert.deepEqual(JSON.parse(res.content[0].text), park);
});

test('malformed questions never reach the broker', async (t) => {
  const broker = await fakeBroker({ answers: {} });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  const a = { id: 'a', prompt: 'A?', kind: 'text' };
  const res = await call(client, 'ask_user_batch', { questions: [a, a] });
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, 'duplicate question id "a"');
  assert.deepEqual(broker.requests, []);
});

test('an unreachable broker is a tool error', async (t) => {
  const client = await shim(join(mkdtempSync('/tmp/fb-'), 'missing.sock'));
  t.after(() => client.close());
  const res = await call(client, 'ask_user', { question: colour });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /broker/);
});

// --- lenient input: some models send nested values as text -----------------

/** A shim on a fake broker that answers {}, closed when the test ends. */
async function lenient(t: { after: (fn: () => Promise<void>) => void }) {
  const broker = await fakeBroker({ answers: {} });
  const client = await shim(broker.socketPath);
  t.after(async () => {
    await client.close();
    await broker.close();
  });
  return { broker, client };
}

test('a question sent as JSON text is accepted', async (t) => {
  const { broker, client } = await lenient(t);
  const res = await call(client, 'ask_user', { question: JSON.stringify(colour) });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [colour] }]);
});

test('a flattened question with its options as text is accepted', async (t) => {
  // What dots-3-note-preview sent on its first try in a real run.
  const { broker, client } = await lenient(t);
  const res = await call(client, 'ask_user', {
    question: 'Purpose?',
    id: 'purpose',
    kind: 'single_select',
    options: JSON.stringify([{ label: 'Learning', value: 'learning' }]),
  });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [
    { questions: [{ id: 'purpose', prompt: 'Purpose?', kind: 'single_select', options: [{ label: 'Learning', value: 'learning' }] }] },
  ]);
});

test('options sent as JSON text inside a question object are accepted', async (t) => {
  const { broker, client } = await lenient(t);
  const options = [{ label: 'Yes', value: 'y' }];
  const res = await call(client, 'ask_user', { question: { id: 'q', prompt: 'Q?', kind: 'single_select', options: JSON.stringify(options) } });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [{ id: 'q', prompt: 'Q?', kind: 'single_select', options }] }]);
});

test('a batch sent as JSON text is accepted', async (t) => {
  const { broker, client } = await lenient(t);
  const res = await call(client, 'ask_user_batch', { questions: JSON.stringify([colour]) });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [colour] }]);
});

test('a plain-text question with no id or kind is a clear tool error', async (t) => {
  const { broker, client } = await lenient(t);
  const res = await call(client, 'ask_user', { question: 'Purpose?' });
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, 'a question given as plain text also needs id and kind');
  assert.deepEqual(broker.requests, []);
});

test('a batch item with its options as JSON text is accepted', async (t) => {
  const { broker, client } = await lenient(t);
  const options = [{ label: 'Yes', value: 'y' }];
  const res = await call(client, 'ask_user_batch', {
    questions: [colour, { id: 'q', prompt: 'Q?', kind: 'single_select', options: JSON.stringify(options) }],
  });
  assert.ok(!res.isError, res.content[0]?.text);
  assert.deepEqual(broker.requests, [{ questions: [colour, { id: 'q', prompt: 'Q?', kind: 'single_select', options }] }]);
});
