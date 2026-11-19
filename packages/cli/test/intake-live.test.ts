/**
 * End-to-end live test for the intake service: real Jira → runIntake →
 * SQLite. Gated on the same env vars the adapter's `jira-live.test.ts`
 * uses, so one set of credentials covers both suites.
 *
 * What it proves beyond the adapter's own live test:
 *   - runIntake drives the pagination loop to completion
 *   - rows land in SQLite under the (project, source, importKey) PK
 *   - import row ends in state='done' with non-zero created + pages
 *   - a re-run against the same JQL produces created=0, updated=N
 *     (idempotent on the natural key — Review Focus #1 extended)
 *
 * Skip it unless `FLOWBOARD_LIVE=1` AND `FLOWBOARD_LIVE_JIRA_JQL` are
 * set. The credential comes from `.lamproom/credentials.json` under
 * `FLOWBOARD_LIVE_ROOT` (defaults to cwd), via EnvFileCredentialResolver.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourceCredentials } from '@lamproom/core';
import {
  ATLASSIAN_CLIENT_ID,
  EnvFileCredentialResolver,
  JiraTaskSource,
  McpClient,
  httpTransport,
  refreshIfNeeded,
  restTransport,
} from '@lamproom/adapters';
import { runIntake } from '../src/intake.ts';
import { getImport, listTasks, openDb } from '../src/storage.ts';

const live =
  process.env.FLOWBOARD_LIVE === '1' && process.env.FLOWBOARD_LIVE_JIRA_JQL !== undefined;

test('live Jira → runIntake drains into SQLite and is idempotent on re-run', { skip: !live }, async () => {
  const root = process.env.FLOWBOARD_LIVE_ROOT ?? process.cwd();
  const resolver = new EnvFileCredentialResolver({ root });
  const cred = await resolver.resolve('jira', 'live');
  assert.notEqual(cred.kind, 'none', 'no live Jira credential in .lamproom/credentials.json');

  const dir = await mkdtemp(join(tmpdir(), 'lr-intake-live-'));
  const db = openDb(join(dir, 'intake-live.db'));

  const source = buildSource(cred, process.env.FLOWBOARD_LIVE_JIRA_JQL!);

  const first = await runIntake(db, {
    projectId: 'live-project',
    sourceId: 'jira',
    source,
    input: { pageSize: 25 },
    budget: { maxTasks: 100, maxMs: 90_000 },
  });
  assert.equal(first.state, 'done', first.error ?? 'first run should succeed');
  assert.ok(first.created > 0, 'expected the first run to create at least one task');
  assert.ok(first.pages >= 1);

  const stored = listTasks(db, 'live-project', { sourceId: 'jira' });
  assert.equal(stored.length, first.created + first.updated);
  const row = getImport(db, first.importId);
  assert.equal(row?.state, 'done');

  const source2 = buildSource(cred, process.env.FLOWBOARD_LIVE_JIRA_JQL!);
  const second = await runIntake(db, {
    projectId: 'live-project',
    sourceId: 'jira',
    source: source2,
    input: { pageSize: 25 },
    budget: { maxTasks: 100, maxMs: 90_000 },
  });
  assert.equal(second.state, 'done');
  assert.equal(second.created, 0, 'expected idempotent re-run: nothing new');
  assert.equal(second.updated, first.created, 'expected every row touched by the second run');
});

function buildSource(cred: SourceCredentials, defaultJql: string): JiraTaskSource {
  const mcpClient = new McpClient(buildTransport(cred));
  return new JiraTaskSource({
    resolver: {
      // runIntake calls source.fetch which calls resolver.resolve again; return the same cred.
      resolve: async () => cred,
    },
    defaultJql,
    mcpClient,
    refreshOAuthFn: async (c) => refreshIfNeeded(c, ATLASSIAN_CLIENT_ID, new Date()),
  });
}

function buildTransport(cred: SourceCredentials) {
  // Live tests prefer the REST transport (Rovo currently blocks third-party
  // OAuth apps). The transport mirrors the MCP response envelope so the
  // adapter does not notice.
  if (cred.kind === 'atlassian_oauth') {
    return restTransport({ cloudId: cred.cloudId, authorization: `Bearer ${cred.accessToken}` });
  }
  if (cred.kind === 'atlassian_api_token') {
    const basic = Buffer.from(`${cred.email}:${cred.token}`).toString('base64');
    return restTransport({ cloudId: cred.baseUrl, authorization: `Basic ${basic}` });
  }
  // The OAuth MCP transport is kept here for the day Rovo opens to 3P apps.
  void httpTransport;
  throw new Error(`live test: unsupported credential kind: ${cred.kind}`);
}
