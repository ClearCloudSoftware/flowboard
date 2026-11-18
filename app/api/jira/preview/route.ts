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
  JiraCredentialMissingError,
  JiraTaskSource,
  McpClient,
  redactJiraTokens,
} from '../../../../packages/adapters/src/index.ts';
import { buildJiraTransport, collectJiraTokens, makeRefreshOAuthFn, readJiraSettings, staticResolver } from '../_lib.ts';
import { refused } from '../../flows/local.ts';

export async function GET(request: Request) {
  const no = refused(request);
  if (no) return no;

  const settings = readJiraSettings();
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

  const cred = settings.credential;
  const mcpClient = new McpClient(buildJiraTransport(cred));

  try {
    const src = new JiraTaskSource({
      resolver: staticResolver(cred),
      defaultJql,
      mcpClient,
      refreshOAuthFn: makeRefreshOAuthFn(settings),
    });
    const result = await src.fetch({ pageSize });
    return Response.json({ tasks: result.tasks, nextCursor: result.nextCursor, usage: result.usage });
  } catch (err) {
    if (err instanceof JiraCredentialMissingError) {
      return Response.json({ error: 'credentials missing' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: redactJiraTokens(message, ...collectJiraTokens(cred)) }, { status: 502 });
  }
}
