/**
 * POST /api/jira/auth/start
 *
 * Generates an OAuth state + PKCE verifier/challenge, stores them in-memory
 * for 10 minutes, returns the Atlassian authorize URL. The client opens that
 * URL in a new tab; the user completes OAuth; Atlassian redirects to
 * /api/jira/auth/callback which looks up the state and exchanges the code.
 */

import { randomUUID } from 'node:crypto';
import { ATLASSIAN_CLIENT_ID, buildAuthUrl, pkcePair } from '../../../../../packages/adapters/src/ticket/jira/oauth.ts';
import { refused } from '../../../flows/local.ts';
import { pendingStates, sweepStates } from '../../local.ts';

const SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'] as const;

export async function POST(request: Request) {
  const no = refused(request);
  if (no) return no;
  sweepStates();

  const state = randomUUID();
  const { verifier, challenge } = pkcePair();
  pendingStates.set(state, { codeVerifier: verifier, createdAt: Date.now() });

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/jira/auth/callback`;
  const authUrl = buildAuthUrl({ clientId: ATLASSIAN_CLIENT_ID, scopes: SCOPES }, state, challenge, redirectUri);

  return Response.json({ authUrl: authUrl.toString(), state });
}
