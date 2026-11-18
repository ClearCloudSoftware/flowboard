import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pkcePair,
  buildAuthUrl,
  exchangeCode,
  refreshIfNeeded,
  listAccessibleResources,
  ATLASSIAN_CLIENT_ID,
  type AtlassianOAuthConfig,
} from '../src/ticket/jira/oauth.ts';

const scopes = ['read:jira-work', 'read:jira-user', 'offline_access'] as const;

test('ATLASSIAN_CLIENT_ID is a non-empty constant', () => {
  assert.equal(typeof ATLASSIAN_CLIENT_ID, 'string');
  assert.ok(ATLASSIAN_CLIENT_ID.length > 0);
});

test('pkcePair returns a verifier and a URL-safe base64 challenge', () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length}`);
  assert.match(verifier, /^[A-Za-z0-9\-_]+$/);
  assert.match(challenge, /^[A-Za-z0-9\-_]+$/);
  assert.equal(challenge.includes('='), false);
  assert.equal(challenge.includes('+'), false);
  assert.equal(challenge.includes('/'), false);
});

test('pkcePair returns a different pair on each call', () => {
  const a = pkcePair();
  const b = pkcePair();
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.challenge, b.challenge);
});

test('buildAuthUrl constructs an Atlassian authorize URL with every required parameter', () => {
  const url = buildAuthUrl(
    { clientId: 'cid', scopes },
    'state-x',
    'challenge-y',
    'http://127.0.0.1:7777/callback',
  );
  assert.equal(url.origin, 'https://auth.atlassian.com');
  assert.equal(url.pathname, '/authorize');
  assert.equal(url.searchParams.get('audience'), 'api.atlassian.com');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('scope'), 'read:jira-work read:jira-user offline_access');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:7777/callback');
  assert.equal(url.searchParams.get('state'), 'state-x');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-y');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('exchangeCode POSTs to the token endpoint with the PKCE verifier', async () => {
  let seenUrl: string | URL | undefined;
  let seenInit: RequestInit | undefined;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    seenUrl = url;
    seenInit = init;
    return new Response(
      JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
      { status: 200 },
    );
  }) as typeof fetch;

  const cfg: AtlassianOAuthConfig = { clientId: 'cid', scopes, fetchFn: fakeFetch };
  const tokens = await exchangeCode(cfg, {
    code: 'the-code',
    verifier: 'ver-xxx',
    redirectUri: 'http://127.0.0.1:7777/callback',
  });

  assert.equal(tokens.accessToken, 'a');
  assert.equal(tokens.refreshToken, 'r');
  assert.ok(new Date(tokens.expiresAt).getTime() > Date.now());

  assert.equal(String(seenUrl), 'https://auth.atlassian.com/oauth/token');
  assert.equal(seenInit?.method, 'POST');
  const body = seenInit?.body as string;
  assert.ok(body.includes('"code":"the-code"'));
  assert.ok(body.includes('"code_verifier":"ver-xxx"'));
  assert.ok(body.includes('"grant_type":"authorization_code"'));
});

test('exchangeCode throws on non-2xx with a redacted message', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch;
  await assert.rejects(
    exchangeCode({ clientId: 'cid', scopes, fetchFn: fakeFetch }, {
      code: 'bad',
      verifier: 'v',
      redirectUri: 'http://127.0.0.1:7777/callback',
    }),
    /invalid_grant|exchange failed/i,
  );
});

test('refreshIfNeeded is a no-op when expiresAt is >60s away', async () => {
  let fetched = 0;
  const fakeFetch = (async () => {
    fetched++;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const creds = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: '2030-01-01T00:00:00Z',
    cloudId: 'c',
    siteName: 's',
  };
  const out = await refreshIfNeeded(creds, 'cid', new Date('2026-11-17T10:00:00Z'), fakeFetch);
  assert.equal(out.accessToken, 'a');
  assert.equal(fetched, 0);
});

test('refreshIfNeeded calls the token endpoint when expiry is near', async () => {
  let seenBody: string | undefined;
  const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
    seenBody = init?.body as string;
    return new Response(
      JSON.stringify({ access_token: 'new', refresh_token: 'newref', expires_in: 3600 }),
      { status: 200 },
    );
  }) as typeof fetch;
  const creds = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'old',
    refreshToken: 'r',
    expiresAt: '2026-11-17T10:00:30Z',
    cloudId: 'c',
    siteName: 's',
  };
  const out = await refreshIfNeeded(creds, 'cid', new Date('2026-11-17T10:00:00Z'), fakeFetch);
  assert.equal(out.accessToken, 'new');
  assert.equal(out.refreshToken, 'newref');
  assert.ok(seenBody?.includes('"grant_type":"refresh_token"'));
  assert.ok(seenBody?.includes('"refresh_token":"r"'));
  // cloudId and siteName carry over
  assert.equal(out.cloudId, 'c');
  assert.equal(out.siteName, 's');
});

test('refreshIfNeeded retains the previous refresh token when the response omits one', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 }), { status: 200 })) as typeof fetch;
  const creds = {
    kind: 'atlassian_oauth' as const,
    accessToken: 'old',
    refreshToken: 'keep-me',
    expiresAt: '2026-11-17T10:00:30Z',
    cloudId: 'c',
    siteName: 's',
  };
  const out = await refreshIfNeeded(creds, 'cid', new Date('2026-11-17T10:00:00Z'), fakeFetch);
  assert.equal(out.refreshToken, 'keep-me');
});

test('listAccessibleResources returns sites with id, name, url', async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify([
        { id: 'cid-1', name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'] },
        { id: 'cid-2', name: 'other', url: 'https://other.atlassian.net', scopes: ['read:jira-work'] },
      ]),
      { status: 200 },
    )) as typeof fetch;
  const sites = await listAccessibleResources('token', fakeFetch);
  assert.equal(sites.length, 2);
  assert.equal(sites[0]?.id, 'cid-1');
  assert.equal(sites[0]?.name, 'acme');
});

test('listAccessibleResources sends bearer token', async () => {
  let seenAuth: string | undefined;
  const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    seenAuth = headers['Authorization'];
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  await listAccessibleResources('mytoken', fakeFetch);
  assert.equal(seenAuth, 'Bearer mytoken');
});

test('listAccessibleResources throws on non-2xx', async () => {
  const fakeFetch = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;
  await assert.rejects(listAccessibleResources('bad', fakeFetch), /403|accessible-resources/i);
});
