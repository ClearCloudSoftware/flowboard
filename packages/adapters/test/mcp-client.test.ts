import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, type McpTransport } from '../src/mcp/client.ts';
import { McpTransportError, mapMcpError } from '../src/mcp/errors.ts';
import { RetryableError } from '@lamproom/core';

function makeFakeTransport(responses: Record<string, unknown>): { transport: McpTransport; ops: string[] } {
  const ops: string[] = [];
  const transport: McpTransport = {
    async callTool(name, _args, _signal) {
      ops.push(`callTool:${name}`);
      if (!(name in responses)) throw new Error(`no fake response for ${name}`);
      const res = responses[name];
      if (res instanceof Error) throw res;
      return res;
    },
    async listTools() {
      ops.push('listTools');
      return [];
    },
    async close() {
      ops.push('close');
    },
  };
  return { transport, ops };
}

test('callTool forwards name and returns payload', async () => {
  const { transport, ops } = makeFakeTransport({ jira_search: { issues: [] } });
  const c = new McpClient(transport);
  const r = await c.callTool<{ issues: unknown[] }>(
    'jira_search',
    { jql: 'project = X' },
    { signal: new AbortController().signal },
  );
  assert.deepEqual(r, { issues: [] });
  assert.deepEqual(ops, ['callTool:jira_search']);
});

test('listTools delegates', async () => {
  const { transport, ops } = makeFakeTransport({});
  const c = new McpClient(transport);
  const tools = await c.listTools();
  assert.deepEqual(tools, []);
  assert.deepEqual(ops, ['listTools']);
});

test('close() delegates to the transport', async () => {
  const { transport, ops } = makeFakeTransport({});
  const c = new McpClient(transport);
  await c.close();
  assert.deepEqual(ops, ['close']);
});

test('callTool propagates McpTransportError through mapMcpError', async () => {
  const { transport } = makeFakeTransport({
    jira_search: new McpTransportError('rate limited', 429, { 'retry-after': '3' }),
  });
  const c = new McpClient(transport);
  await assert.rejects(
    c.callTool('jira_search', {}, { signal: new AbortController().signal }),
    (e: Error) => e instanceof RetryableError && (e as RetryableError).retryAfterMs === 3000,
  );
});

test('callTool propagates non-retryable errors unchanged', async () => {
  const unauthorized = new McpTransportError('unauthorized', 401, {});
  const { transport } = makeFakeTransport({ jira_search: unauthorized });
  const c = new McpClient(transport);
  await assert.rejects(
    c.callTool('jira_search', {}, { signal: new AbortController().signal }),
    (e: Error) => !(e instanceof RetryableError) && /unauthorized/.test(e.message),
  );
});

test('mapMcpError maps 429 to RetryableError with retryAfterMs from header', () => {
  const err = new McpTransportError('rate limit', 429, { 'retry-after': '3' });
  const mapped = mapMcpError(err);
  assert.ok(mapped instanceof RetryableError);
  assert.equal((mapped as RetryableError).retryAfterMs, 3000);
});

test('mapMcpError leaves 401 untouched (not retryable)', () => {
  const err = new McpTransportError('unauthorized', 401, {});
  const mapped = mapMcpError(err);
  assert.equal(mapped instanceof RetryableError, false);
  assert.equal(mapped.message, 'unauthorized');
});

test('mapMcpError leaves 404 untouched (not retryable)', () => {
  const err = new McpTransportError('not found', 404, {});
  assert.equal(mapMcpError(err) instanceof RetryableError, false);
});

test('mapMcpError maps 503 to RetryableError', () => {
  const err = new McpTransportError('service unavailable', 503, {});
  assert.ok(mapMcpError(err) instanceof RetryableError);
});

test('mapMcpError maps >=500 to RetryableError', () => {
  const err = new McpTransportError('internal error', 500, {});
  assert.ok(mapMcpError(err) instanceof RetryableError);
});

test('mapMcpError without Retry-After leaves retryAfterMs undefined', () => {
  const err = new McpTransportError('rate', 429, {});
  const mapped = mapMcpError(err);
  assert.equal((mapped as RetryableError).retryAfterMs, undefined);
});

test('mapMcpError wraps a non-Error into Error', () => {
  const mapped = mapMcpError('whoops');
  assert.ok(mapped instanceof Error);
  assert.equal(mapped.message, 'whoops');
});
