/**
 * GET /api/jira/auth/callback?code=...&state=...
 *
 * The Atlassian OAuth redirect lands here. We verify `state` matches what
 * /api/jira/auth/start stored (Review Focus #1 — mismatched state returns
 * 400 with no detail), exchange the code for tokens, list accessible
 * resources, pick the first site, store the credential, and redirect back
 * to the settings page.
 */

import {
  ATLASSIAN_CLIENT_ID,
  exchangeCode,
  listAccessibleResources,
} from '../../../../../packages/adapters/src/ticket/jira/oauth.ts';
import { readJira, writeJira } from '../../../../../packages/cli/src/jira.ts';
import { dataDir } from '../../../flows/local.ts';
import { pendingStates, sweepStates } from '../../local.ts';

const SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'read:jira:agent-interface',
  'search:jira:agent-interface',
  'offline_access',
] as const;
const SETTINGS_URL = '/settings/connections/tasks/jira';

export async function GET(request: Request) {
  sweepStates();
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (state === null || code === null) {
    return redirectWith(url.origin, 'missing');
  }

  const pending = pendingStates.get(state);
  if (pending === undefined) {
    return redirectWith(url.origin, 'state');
  }
  pendingStates.delete(state);

  const redirectUri = `${url.origin}/api/jira/auth/callback`;

  // Prefer the secret stored in jira.json (UI-settable, no restart needed);
  // fall back to the legacy env var.
  const stored = readJira(dataDir()).oauthClientSecret;
  const clientSecret =
    stored !== undefined && stored.trim() !== ''
      ? stored.trim()
      : (process.env['ATLASSIAN_CLIENT_SECRET'] ?? '').trim() || undefined;
  if (clientSecret === undefined) {
    console.error('[jira/auth/callback] no OAuth client secret saved; Atlassian 3LO requires it');
    return redirectWith(url.origin, 'no_secret');
  }

  try {
    const tokens = await exchangeCode(
      { clientId: ATLASSIAN_CLIENT_ID, clientSecret, scopes: SCOPES },
      { code, verifier: pending.codeVerifier, redirectUri },
    );
    const sites = await listAccessibleResources(tokens.accessToken);
    if (sites.length === 0) {
      console.error('[jira/auth/callback] no accessible resources returned');
      return redirectWith(url.origin, 'no_sites');
    }
    const site = sites[0]!;
    const existing = readJira(dataDir());
    writeJira(dataDir(), {
      ...existing,
      credential: {
        kind: 'atlassian_oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        cloudId: site.id,
        siteName: site.name,
      },
    });
    console.log('[jira/auth/callback] OAuth stored for site', site.name, site.id);
    return redirectWith(url.origin, 'ok');
  } catch (err) {
    console.error('[jira/auth/callback] exchange failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.cause) console.error('  cause:', err.cause);
    return redirectWith(url.origin, 'exchange');
  }
}

function redirectWith(origin: string, status: string): Response {
  const target = new URL(SETTINGS_URL, origin);
  target.searchParams.set('auth', status);
  return Response.redirect(target.toString(), 302);
}
