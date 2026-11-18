/**
 * Atlassian OAuth 2.1 helper — PKCE, loopback redirect, refresh.
 *
 * Lamproom is a public client; no client secret. PKCE (S256) satisfies the
 * confidentiality requirement for the authorization code.
 *
 * The flow:
 *   1. pkcePair() generates { verifier, challenge }.
 *   2. buildAuthUrl() constructs the Atlassian authorize URL. The caller
 *      opens it in the user's browser.
 *   3. User completes consent; Atlassian redirects to the loopback callback
 *      URL with ?code=...&state=...
 *   4. The HTTP route (Task 6) verifies state, then calls exchangeCode()
 *      to swap the code + verifier for access/refresh tokens.
 *   5. listAccessibleResources() lists the Atlassian sites the token can
 *      reach; the caller picks a cloudId (first site wins for v1).
 *   6. refreshIfNeeded() is called by JiraTaskSource before every fetch;
 *      it POSTs to the token endpoint when expiresAt is within 60s.
 *
 * startOAuthFlow() wires steps 1-4 into a single call that returns a
 * promise resolving when the callback fires. It owns a loopback HTTP server
 * on a port it picks.
 *
 * Every function that touches network accepts an optional `fetchFn` for
 * tests to inject a fake. The real fetch is the global `fetch`.
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SourceCredentials } from '@lamproom/core';

/** Lamproom's registered Atlassian OAuth client id. Public (shipped with the app). */
export const ATLASSIAN_CLIENT_ID = 'fh9fENvFEkMHKnh3czK1azZ09d2SyO7a';

export const ATLASSIAN_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

export interface AtlassianOAuthConfig {
  clientId: string;
  /** Required for Atlassian 3LO — they're confidential clients even with PKCE. */
  clientSecret?: string;
  scopes: readonly string[];
  /** 0 = pick a free port; any other value = bind to that port. */
  loopbackPort?: number;
  /** Side-effect: open the browser. Tests pass a noop. */
  openBrowser?: (url: string) => Promise<void>;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
}

export interface AtlassianOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface AtlassianSite {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

type OAuthCred = Extract<SourceCredentials, { kind: 'atlassian_oauth' }>;

const REFRESH_WINDOW_MS = 60 * 1000;

/**
 * Produce an RFC 7636 PKCE pair. Verifier is 64 bytes of randomness
 * base64url-encoded (lands around 85-86 chars). Challenge is
 * base64url(sha256(verifier)) with padding stripped.
 */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Build the authorize URL. Caller opens it in the user's browser.
 */
export function buildAuthUrl(
  cfg: Pick<AtlassianOAuthConfig, 'clientId' | 'scopes'>,
  state: string,
  codeChallenge: string,
  redirectUri: string,
): URL {
  const url = new URL(ATLASSIAN_AUTHORIZE_URL);
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('scope', cfg.scopes.join(' '));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'consent');
  return url;
}

/**
 * Exchange an authorization code + PKCE verifier for access + refresh tokens.
 */
export async function exchangeCode(
  cfg: AtlassianOAuthConfig,
  args: { code: string; verifier: string; redirectUri: string },
): Promise<AtlassianOAuthTokens> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const body = JSON.stringify({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    ...(cfg.clientSecret !== undefined ? { client_secret: cfg.clientSecret } : {}),
    code: args.code,
    code_verifier: args.verifier,
    redirect_uri: args.redirectUri,
  });
  const response = await fetchFn(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  if (!response.ok) {
    const txt = await safeText(response);
    throw new Error(`atlassian oauth: exchange failed with status ${response.status}: ${txt}`);
  }
  const payload = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: expiryFromNow(payload.expires_in).toISOString(),
  };
}

/**
 * Refresh when expiresAt is within 60s. Returns a credential with new tokens,
 * carrying the cloudId and siteName across. When the token response omits a
 * refresh_token (some IdPs do this on rotation), the previous refresh token
 * is kept.
 */
export async function refreshIfNeeded(
  creds: OAuthCred,
  clientId: string,
  now: Date,
  fetchFn: typeof fetch = fetch,
  clientSecret?: string,
): Promise<OAuthCred> {
  const expiresAtMs = Date.parse(creds.expiresAt);
  if (expiresAtMs - now.getTime() > REFRESH_WINDOW_MS) return creds;
  const body = JSON.stringify({
    grant_type: 'refresh_token',
    client_id: clientId,
    ...(clientSecret !== undefined ? { client_secret: clientSecret } : {}),
    refresh_token: creds.refreshToken,
  });
  const response = await fetchFn(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  if (!response.ok) {
    const txt = await safeText(response);
    throw new Error(`atlassian oauth: refresh failed with status ${response.status}: ${txt}`);
  }
  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    kind: 'atlassian_oauth',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? creds.refreshToken,
    expiresAt: expiryFromNow(payload.expires_in, now).toISOString(),
    cloudId: creds.cloudId,
    siteName: creds.siteName,
  };
}

/**
 * List the Atlassian sites the access token can reach. Caller picks one and
 * stores its id as `cloudId`.
 */
export async function listAccessibleResources(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<AtlassianSite[]> {
  const response = await fetchFn(ATLASSIAN_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`atlassian oauth: accessible-resources returned ${response.status}`);
  }
  return (await response.json()) as AtlassianSite[];
}

/**
 * Run the entire loopback OAuth flow in one call. Spawns an HTTP server on a
 * loopback port, opens the browser, waits for the callback, exchanges the
 * code for tokens, and returns them. Server shuts down automatically.
 *
 * The promise rejects after 10 minutes if no callback arrives.
 */
export async function startOAuthFlow(cfg: AtlassianOAuthConfig): Promise<{
  authUrl: string;
  state: string;
  codeVerifier: string;
  localCallback: Promise<AtlassianOAuthTokens>;
}> {
  const { verifier, challenge } = pkcePair();
  const state = randomUUID();

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(cfg.loopbackPort ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl = buildAuthUrl(cfg, state, challenge, redirectUri).toString();

  const localCallback = new Promise<AtlassianOAuthTokens>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('atlassian oauth: callback timed out after 10 minutes'));
    }, 10 * 60 * 1000);

    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/callback') {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const returnedState = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (returnedState !== state) {
          res.statusCode = 400;
          res.end('state mismatch');
          clearTimeout(timer);
          server.close();
          reject(new Error('atlassian oauth: callback state did not match'));
          return;
        }
        if (code === null) {
          res.statusCode = 400;
          res.end('missing code');
          clearTimeout(timer);
          server.close();
          reject(new Error('atlassian oauth: callback missing code'));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><title>Signed in</title><body>You can close this window and return to Lamproom.</body>');
        exchangeCode(cfg, { code, verifier, redirectUri })
          .then((tokens) => {
            clearTimeout(timer);
            server.close();
            resolve(tokens);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            server.close();
            reject(err);
          });
      } catch (err) {
        clearTimeout(timer);
        server.close();
        reject(err);
      }
    });
  });

  if (cfg.openBrowser !== undefined) await cfg.openBrowser(authUrl);

  return { authUrl, state, codeVerifier: verifier, localCallback };
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function expiryFromNow(seconds: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + seconds * 1000);
}

async function safeText(r: Response): Promise<string> {
  try {
    return (await r.text()).slice(0, 500);
  } catch {
    return '';
  }
}
