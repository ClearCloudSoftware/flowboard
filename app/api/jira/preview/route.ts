/**
 * GET /api/jira/preview?jql=...&limit=10
 *
 * Constructs a JiraTaskSource, calls fetch() for one page, returns the
 * normalized tasks for the UI preview table. Nothing writes to disk except
 * a refreshed OAuth token (when refresh fires).
 *
 * The caller may pass `?jql=` to override the saved default JQL; omit it
 * to use the operator's stored default.
 */

import {
  httpTransport,
  JiraCredentialMissingError,
  JiraTaskSource,
  McpClient,
  redactJiraTokens,
} from '../../../../packages/adapters/src/index.ts';
import { ATLASSIAN_CLIENT_ID, refreshIfNeeded } from '../../../../packages/adapters/src/ticket/jira/oauth.ts';
import { readJira, writeJira, type JiraCredential } from '../../../../packages/cli/src/jira.ts';
import type { SourceCredentialResolver, SourceCredentials } from '../../../../packages/core/src/index.ts';
import { dataDir, refused } from '../../flows/local.ts';

export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;

  const settings = readJira(dataDir());
  if (settings.credential === undefined) {
    return Response.json({ error: 'no credentials configured' }, { status: 400 });
  }

  const url = new URL(request.url);
  const jql = (url.searchParams.get('jql') ?? '').trim();
  const limitRaw = url.searchParams.get('limit');
  const pageSize = limitRaw !== null ? Math.max(1, Math.min(50, Number(limitRaw) || 10)) : 10;
  const defaultJql = jql !== '' ? jql : settings.defaultJql ?? '';
  if (defaultJql === '') {
    return Response.json({ error: 'no JQL provided and no default saved' }, { status: 400 });
  }

  const cred: JiraCredential = settings.credential;
  const resolver: SourceCredentialResolver = {
    resolve: async (): Promise<SourceCredentials> => cred,
  };

  const transport = buildTransport(cred);
  const mcpClient = new McpClient(transport);

  try {
    const src = new JiraTaskSource({
      resolver,
      defaultJql,
      mcpClient,
      refreshOAuthFn: async (c) => {
        const refreshed = await refreshIfNeeded(
          c,
          ATLASSIAN_CLIENT_ID,
          new Date(),
          fetch,
          process.env['ATLASSIAN_CLIENT_SECRET'],
        );
        writeJira(dataDir(), { ...settings, credential: refreshed });
        return refreshed;
      },
    });
    const result = await src.fetch({ pageSize });
    return Response.json({ tasks: result.tasks, nextCursor: result.nextCursor, usage: result.usage });
  } catch (err) {
    if (err instanceof JiraCredentialMissingError) {
      return Response.json({ error: 'credentials missing' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    const tokens = collectTokens(cred);
    return Response.json({ error: redactJiraTokens(message, ...tokens) }, { status: 502 });
  }
}

function buildTransport(cred: JiraCredential) {
  if (cred.kind === 'atlassian_oauth') {
    return httpTransport({
      url: 'https://mcp.atlassian.com/v2/mcp',
      bearer: cred.accessToken,
      headers: { 'X-Atlassian-Cloud-Id': cred.cloudId },
    });
  }
  const basic = Buffer.from(`${cred.email}:${cred.token}`).toString('base64');
  return httpTransport({
    url: 'https://mcp.atlassian.com/v2/mcp',
    headers: { Authorization: `Basic ${basic}` },
  });
}

function collectTokens(cred: JiraCredential): Array<string | undefined> {
  if (cred.kind === 'atlassian_oauth') return [cred.accessToken, cred.refreshToken];
  return [cred.token];
}
