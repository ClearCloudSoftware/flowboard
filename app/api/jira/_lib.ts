/**
 * Shared Jira helpers for /api/jira/* and /api/import/jira.
 *
 * Centralises the three small decisions the preview route made inline:
 *   - which transport factory to use (REST today; httpTransport when Rovo
 *     opens to third parties);
 *   - which fields of the credential are secrets to redact in error paths;
 *   - how to refresh an OAuth credential and persist the result.
 */

import { refreshIfNeeded } from '../../../packages/adapters/src/ticket/jira/oauth.ts';
import { restTransport } from '../../../packages/adapters/src/ticket/jira/rest-transport.ts';
import { readJira, writeJira, type JiraCredential, type JiraSettings } from '../../../packages/cli/src/jira.ts';
import type { McpTransport } from '../../../packages/adapters/src/mcp/client.ts';
import { ATLASSIAN_CLIENT_ID } from '../../../packages/adapters/src/ticket/jira/oauth.ts';
import { dataDir } from '../flows/local.ts';

export function buildJiraTransport(cred: JiraCredential): McpTransport {
  if (cred.kind === 'atlassian_oauth') {
    return restTransport({ cloudId: cred.cloudId, authorization: `Bearer ${cred.accessToken}` });
  }
  const basic = Buffer.from(`${cred.email}:${cred.token}`).toString('base64');
  return restTransport({ cloudId: cred.baseUrl, authorization: `Basic ${basic}` });
}

export function collectJiraTokens(cred: JiraCredential): Array<string | undefined> {
  if (cred.kind === 'atlassian_oauth') return [cred.accessToken, cred.refreshToken];
  return [cred.token];
}

export function makeRefreshOAuthFn(settings: JiraSettings) {
  return async (c: Extract<JiraCredential, { kind: 'atlassian_oauth' }>) => {
    const refreshed = await refreshIfNeeded(
      c,
      ATLASSIAN_CLIENT_ID,
      new Date(),
      fetch,
      process.env['ATLASSIAN_CLIENT_SECRET'],
    );
    writeJira(dataDir(), { ...settings, credential: refreshed });
    return refreshed;
  };
}

/** Build a `SourceCredentialResolver` that always returns the stored credential. */
export function staticResolver(cred: JiraCredential) {
  return { resolve: async () => cred };
}

export function readJiraSettings() {
  return readJira(dataDir());
}
