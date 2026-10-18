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
