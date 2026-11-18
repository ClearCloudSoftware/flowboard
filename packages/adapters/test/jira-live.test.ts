import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JiraTaskSource } from '../src/ticket/jira/provider.ts';
import { ATLASSIAN_CLIENT_ID, refreshIfNeeded } from '../src/ticket/jira/oauth.ts';
import { httpTransport } from '../src/mcp/transport.ts';
import { McpClient } from '../src/mcp/client.ts';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';
import type { SourceCredentials } from '@lamproom/core';

const live = process.env.FLOWBOARD_LIVE === '1' && process.env.FLOWBOARD_LIVE_JIRA_JQL !== undefined;

test('live Jira fetch returns real issues (OAuth or API-token)', { skip: !live }, async () => {
  const root = process.env.FLOWBOARD_LIVE_ROOT ?? process.cwd();
  const resolver = new EnvFileCredentialResolver({ root });
  const cred = await resolver.resolve('jira', 'live');
  assert.notEqual(cred.kind, 'none', 'no live credentials in .lamproom/credentials.json');

  const transport = buildTransport(cred);
  const mcpClient = new McpClient(transport);

  const src = new JiraTaskSource({
    resolver,
    defaultJql: process.env.FLOWBOARD_LIVE_JIRA_JQL!,
    mcpClient,
    refreshOAuthFn: async (c) => refreshIfNeeded(c, ATLASSIAN_CLIENT_ID, new Date()),
  });

  const r = await src.fetch({ pageSize: 5 });
  assert.ok(Array.isArray(r.tasks));
  assert.ok(r.usage.requests >= 1);
  if (r.tasks.length > 0) {
    const first = r.tasks[0]!;
    assert.match(first.importKey, /^[a-z][a-z0-9]+-\d+$/);
    assert.ok(first._hint.upstream?.match(/^[A-Z][A-Z0-9]+-\d+$/));
    assert.ok(Array.isArray(first.labels));
    assert.ok(Array.isArray(first.assignees));
  }
});

function buildTransport(cred: SourceCredentials) {
  if (cred.kind === 'atlassian_oauth') {
    return httpTransport({
      url: 'https://mcp.atlassian.com/v2/mcp',
      bearer: cred.accessToken,
      headers: { 'X-Atlassian-Cloud-Id': cred.cloudId },
    });
  }
  if (cred.kind === 'atlassian_api_token') {
    const basic = Buffer.from(`${cred.email}:${cred.token}`).toString('base64');
    return httpTransport({
      url: 'https://mcp.atlassian.com/v2/mcp',
      headers: { Authorization: `Basic ${basic}` },
    });
  }
  throw new Error(`unsupported credential kind for live test: ${cred.kind}`);
}
