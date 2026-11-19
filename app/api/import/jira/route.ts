/**
 * POST /api/import/jira?project=<id>
 *
 * Kicks off a Jira import for the named project. Resolves the stored Jira
 * credential, builds a JiraTaskSource, calls startIntake() (synchronous ID
 * allocation) and returns `{ importId }` immediately. The UI then polls
 * GET /api/imports/<id> until `state !== 'running'`.
 *
 * Concurrency: a second POST for the same (project, source) pair while the
 * first is still running returns the first's importId. No doubled work, no
 * doubled rows.
 */

import { join } from 'node:path';
import { z } from 'zod';
import {
  JiraTaskSource,
  McpClient,
  redactJiraTokens,
} from '../../../../packages/adapters/src/index.ts';
import { openDb } from '../../../../packages/cli/src/storage.ts';
import { startIntake } from '../../../../packages/cli/src/intake.ts';
import { readProjects } from '../../../../packages/cli/src/projects.ts';
import {
  buildJiraTransport,
  collectJiraTokens,
  ensureFreshCredential,
  makeRefreshOAuthFn,
  readJiraSettings,
  staticResolver,
} from '../../jira/_lib.ts';
import { runningImports, runningKey } from '../../jira/local.ts';
import { dataDir, refused } from '../../flows/local.ts';

const Query = z.object({ project: z.string().min(1), jql: z.string().optional() });

export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    project: url.searchParams.get('project'),
    jql: url.searchParams.get('jql') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'missing ?project=<id>' }, { status: 400 });
  }
  const projectId = parsed.data.project;

  const projects = readProjects(dataDir());
  if (projects.find((p) => p.id === projectId) === undefined) {
    return Response.json({ error: `project not found: ${projectId}` }, { status: 404 });
  }

  const settings = readJiraSettings();
  if (settings.credential === undefined) {
    return Response.json({ error: 'no Jira credentials configured' }, { status: 400 });
  }

  const defaultJql = parsed.data.jql?.trim() || settings.defaultJql || '';
  if (defaultJql === '') {
    return Response.json({ error: 'no JQL provided and no default saved' }, { status: 400 });
  }

  const key = runningKey(projectId, 'jira');
  const existing = runningImports.get(key);
  if (existing !== undefined) {
    return Response.json({ importId: existing.importId, reused: true });
  }

  // Refresh OAuth BEFORE building the transport — the REST transport bakes
  // the bearer at construction, so a stale access token would 401 even
  // though the source itself has a working refresh function.
  let fresh: { cred: typeof settings.credential; settings: typeof settings };
  try {
    const r = await ensureFreshCredential(settings);
    fresh = { cred: r.cred, settings: r.settings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Jira token refresh failed: ${message}` }, { status: 401 });
  }
  const cred = fresh.cred!;
  const db = openDb(join(dataDir(), 'lamproom.db'));
  const mcpClient = new McpClient(buildJiraTransport(cred));

  const source = new JiraTaskSource({
    resolver: staticResolver(cred),
    defaultJql,
    mcpClient,
    refreshOAuthFn: makeRefreshOAuthFn(fresh.settings),
  });

  const tokens = collectJiraTokens(cred);
  const redact = (msg: string) => redactJiraTokens(msg, ...tokens);

  const { importId, finished } = startIntake(db, {
    projectId,
    sourceId: 'jira',
    source,
    input: {},
    redactFn: redact,
  });

  // Register in the running map; drop when the loop ends. We hold a .catch
  // so an unexpected error doesn't surface as an unhandled rejection in dev.
  const guarded = finished
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[import/jira] intake loop threw unexpectedly:', redact(message));
    })
    .finally(() => {
      runningImports.delete(key);
    });

  runningImports.set(key, { importId, promise: guarded });

  return Response.json({ importId, reused: false });
}
