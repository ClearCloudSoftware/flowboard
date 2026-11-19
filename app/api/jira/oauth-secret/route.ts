/**
 * PUT    /api/jira/oauth-secret  — save or replace the Atlassian OAuth client secret
 * DELETE /api/jira/oauth-secret  — forget the stored secret (falls back to env var if any)
 *
 * The secret lives in `jira.json` with mode 0600. Lamproom never returns it
 * once saved; the status route (`/api/jira/auth/status`) exposes only a
 * `oauthSecretSaved: boolean` flag.
 *
 * Why it lives here and not in `.env.local`: rotating the secret used to
 * require editing the env file and restarting the dev server (Node reads
 * `NODE_EXTRA_CA_CERTS` et al. at startup). Storing it in jira.json lets
 * the UI PATCH it at will; every subsequent request re-reads it from disk.
 */

import { z } from 'zod';
import { jiraStatus, readJira, writeJira } from '../../../../packages/cli/src/jira.ts';
import { body, dataDir, refused } from '../../flows/local.ts';

const Input = z.object({ secret: z.string().trim().min(1, 'secret is required') });

export async function PUT(request: Request) {
  const no = refused(request);
  if (no) return no;
  const parsed = Input.safeParse(await body(request));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  }
  const current = readJira(dataDir());
  writeJira(dataDir(), { ...current, oauthClientSecret: parsed.data.secret });
  return Response.json(jiraStatus(dataDir()));
}

export async function DELETE(request: Request) {
  const no = refused(request);
  if (no) return no;
  const current = readJira(dataDir());
  const { oauthClientSecret, ...rest } = current;
  void oauthClientSecret;
  writeJira(dataDir(), rest);
  return Response.json(jiraStatus(dataDir()));
}
