import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JiraTaskSource } from '../src/ticket/jira/provider.ts';
import { CredentialMissingError } from '../src/ticket/jira/auth.ts';
import { McpClient, type McpTransport } from '../src/mcp/client.ts';
import { McpTransportError } from '../src/mcp/errors.ts';
import { RetryableError, type SourceCredentialResolver, type SourceCredentials } from '@lamproom/core';
import type { RovoJiraSearchResult } from '../src/ticket/jira/normalize.ts';

const here = import.meta.dirname;

async function fixturePayload(): Promise<RovoJiraSearchResult> {
  return JSON.parse(await readFile(join(here, 'fixtures/jira/search-page1.json'), 'utf8')) as RovoJiraSearchResult;
}

function fakeClient(responses: Array<unknown | Error>, opsRef?: string[]): McpClient {
  let i = 0;
  const ops = opsRef ?? [];
  const transport: McpTransport = {
    async callTool(name) {
      ops.push(`callTool:${name}`);
      const r = responses[i++];
      if (r === undefined) throw new Error('fake transport: script exhausted');
      if (r instanceof Error) throw r;
      return r;
    },
    async listTools() { return []; },
    async close() { ops.push('close'); },
  };
  return new McpClient(transport);
}

function resolver(c: SourceCredentials): SourceCredentialResolver {
  return { resolve: async () => c };
}

const oauthCred = (overrides: Partial<Extract<SourceCredentials, { kind: 'atlassian_oauth' }>> = {}) => ({
  kind: 'atlassian_oauth' as const,
  accessToken: 'eyJACCESS',
  refreshToken: 'eyJREFRESH',
  expiresAt: '2030-01-01T00:00:00Z',
  cloudId: 'cid-xxx',
  siteName: 'acme',
  ...overrides,
});

const apiTokenCred: Extract<SourceCredentials, { kind: 'atlassian_api_token' }> = {
  kind: 'atlassian_api_token',
  baseUrl: 'https://acme.atlassian.net',
  email: 'alice@acme.com',
  token: 'ATATT3xFfGF0APITOKEN',
};

test('throws CredentialMissingError before opening MCP transport (Review Focus #5)', async () => {
  const ops: string[] = [];
  const src = new JiraTaskSource({
    resolver: resolver({ kind: 'none' }),
    defaultJql: 'project = X',
    mcpClient: fakeClient([await fixturePayload()], ops),
  });
  await assert.rejects(src.fetch({}), (e: Error) => e instanceof CredentialMissingError);
  assert.equal(ops.filter((o) => o.startsWith('callTool:')).length, 0);
  assert.equal(ops.filter((o) => o === 'close').length, 0, 'transport must not be closed if it was never opened');
});

test('refreshes OAuth credential before opening transport when expiring (Review Focus #2)', async () => {
  const now = new Date('2026-11-17T10:00:00Z');
  const expiring = oauthCred({ expiresAt: '2026-11-17T10:00:30Z' });
  let refreshCalls = 0;
  let calledWith: SourceCredentials | undefined;
  const src = new JiraTaskSource({
    resolver: resolver(expiring),
    defaultJql: 'project = X',
    mcpClient: fakeClient([await fixturePayload()]),
    nowFn: () => now,
    refreshOAuthFn: async (c) => {
      refreshCalls++;
      calledWith = c;
      return { ...expiring, accessToken: 'eyJNEWACCESS', expiresAt: '2026-11-17T11:00:00Z' };
    },
  });
  await src.fetch({});
  assert.equal(refreshCalls, 1);
  assert.equal(calledWith?.kind, 'atlassian_oauth');
});

test('does NOT refresh when expiresAt is far enough away', async () => {
  let refreshed = false;
  const src = new JiraTaskSource({
    resolver: resolver(oauthCred({ expiresAt: '2030-01-01T00:00:00Z' })),
    defaultJql: 'project = X',
    mcpClient: fakeClient([await fixturePayload()]),
    nowFn: () => new Date('2026-11-17T10:00:00Z'),
    refreshOAuthFn: async (c) => { refreshed = true; return c; },
  });
  await src.fetch({});
  assert.equal(refreshed, false);
});

test('respects Retry-After from MCP transport over exponential (Review Focus #3)', async () => {
  const start = Date.now();
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: fakeClient([new McpTransportError('rate', 429, { 'retry-after': '1' }), await fixturePayload()]),
    retryPolicy: { maxAttempts: 2, baseMs: 10000, maxMs: 10000, respectRetryAfter: true },
  });
  await src.fetch({});
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 900, `expected ~1s wait (Retry-After), got ${elapsed}`);
  assert.ok(elapsed < 2500, `expected ~1s wait, got ${elapsed}`);
});

test('redacts access token and refresh token from compound error (Review Focus #4)', async () => {
  const access = 'eyJACCESSTOKENVALUESECRET';
  const refresh = 'REFRESHTOKENVALUESECRET';
  const transport: McpTransport = {
    async callTool() {
      throw new Error(`Bad: ${access} AND ${refresh}`);
    },
    async listTools() { return []; },
    async close() {},
  };
  const src = new JiraTaskSource({
    resolver: resolver(oauthCred({ accessToken: access, refreshToken: refresh })),
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport),
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), (e: Error) => {
    return !e.message.includes(access) && !e.message.includes(refresh) && e.message.includes('[redacted]');
  });
});

test('redacts API token from error on the api_token path', async () => {
  const token = apiTokenCred.token;
  const transport: McpTransport = {
    async callTool() { throw new Error(`Auth failed: ${token}`); },
    async listTools() { return []; },
    async close() {},
  };
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport),
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), (e: Error) => !e.message.includes(token) && e.message.includes('[redacted]'));
});

test('returns nextCursor when the Rovo response has next_page_token', async () => {
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: fakeClient([await fixturePayload()]),
  });
  const r = await src.fetch({});
  assert.equal(typeof r.nextCursor, 'string');
  assert.ok(r.tasks.length > 0);
  assert.equal(r.usage.requests, 1);
});

test('nextCursor is undefined when next_page_token is absent', async () => {
  const payload: RovoJiraSearchResult = { issues: (await fixturePayload()).issues.slice(0, 2) };
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: fakeClient([payload]),
  });
  const r = await src.fetch({});
  assert.equal(r.nextCursor, undefined);
  assert.equal(r.tasks.length, 2);
});

test('4xx other than 429 propagates immediately (no retry)', async () => {
  let calls = 0;
  const transport: McpTransport = {
    async callTool() {
      calls++;
      throw new McpTransportError('bad request', 400, {});
    },
    async listTools() { return []; },
    async close() {},
  };
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport),
    retryPolicy: { maxAttempts: 3, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}), /bad request/);
  assert.equal(calls, 1);
});

test('closes the MCP client in finally block on success', async () => {
  const ops: string[] = [];
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: fakeClient([await fixturePayload()], ops),
  });
  await src.fetch({});
  assert.equal(ops.filter((o) => o === 'close').length, 1);
});

test('closes the MCP client in finally block on error', async () => {
  const ops: string[] = [];
  const transport: McpTransport = {
    async callTool(name) {
      ops.push(`callTool:${name}`);
      throw new Error('boom');
    },
    async listTools() { return []; },
    async close() { ops.push('close'); },
  };
  const src = new JiraTaskSource({
    resolver: resolver(apiTokenCred),
    defaultJql: 'project = X',
    mcpClient: new McpClient(transport),
    retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1, respectRetryAfter: true },
  });
  await assert.rejects(src.fetch({}));
  assert.equal(ops.filter((o) => o === 'close').length, 1);
});

test('capabilities set is exactly the seven declared', () => {
  const src = new JiraTaskSource({
    resolver: resolver({ kind: 'none' }),
    defaultJql: 'project = X',
    mcpClient: fakeClient([]),
  });
  assert.deepEqual(
    [...src.capabilities].sort(),
    ['assignees', 'incremental', 'labels', 'pagination', 'pull', 'rich_body', 'stable_upstream_key'],
  );
});

test('id is "jira"', () => {
  const src = new JiraTaskSource({
    resolver: resolver({ kind: 'none' }),
    defaultJql: 'project = X',
    mcpClient: fakeClient([]),
  });
  assert.equal(src.id, 'jira');
});
