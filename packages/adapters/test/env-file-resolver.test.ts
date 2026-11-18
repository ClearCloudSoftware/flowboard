import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvFileCredentialResolver } from '../src/credentials/env-file-resolver.ts';

const isPosix = process.platform !== 'win32';

async function makeStore(contents: Record<string, unknown> | undefined): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  if (contents !== undefined) {
    await mkdir(join(root, '.lamproom'), { recursive: true });
    const path = join(root, '.lamproom', 'credentials.json');
    await writeFile(path, JSON.stringify(contents), { mode: 0o600 });
    if (isPosix) await chmod(path, 0o600);
  }
  return root;
}

test('resolves github_pat from .lamproom/credentials.json', async () => {
  const root = await makeStore({ github: { kind: 'github_pat', token: 'ghp_xxx' } });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('github', 'default');
  assert.deepEqual(got, { kind: 'github_pat', token: 'ghp_xxx' });
});

test('returns { kind: "none" } when the file is missing', async () => {
  const root = await makeStore(undefined);
  const r = new EnvFileCredentialResolver({ root });
  assert.deepEqual(await r.resolve('github', 'default'), { kind: 'none' });
});

test('returns { kind: "none" } when the source is not configured', async () => {
  const root = await makeStore({});
  const r = new EnvFileCredentialResolver({ root });
  assert.deepEqual(await r.resolve('github', 'default'), { kind: 'none' });
});

test('refuses to read a file with mode broader than 0600', { skip: !isPosix }, async () => {
  const root = await makeStore({});
  const path = join(root, '.lamproom', 'credentials.json');
  await chmod(path, 0o644);
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), /mode/);
});

test('throws on parse failure, mentioning the path, never the content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  await mkdir(join(root, '.lamproom'), { recursive: true });
  const path = join(root, '.lamproom', 'credentials.json');
  await writeFile(path, '{ not: json', { mode: 0o600 });
  if (isPosix) await chmod(path, 0o600);
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), (e: Error) => {
    return /credentials\.json/.test(e.message) && !/not: json/.test(e.message);
  });
});

test('rejects an entry with an unknown kind, naming the kind', async () => {
  const root = await makeStore({ github: { kind: 'github_app_installation', token: 'x' } });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), /github_app_installation/);
});

test('resolves atlassian_oauth from credentials.json', async () => {
  const root = await makeStore({
    jira: {
      kind: 'atlassian_oauth',
      accessToken: 'eyJHEADER.eyJPAYLOAD.SIGNATURE',
      refreshToken: 'ref-xxx',
      expiresAt: '2026-12-01T12:00:00Z',
      cloudId: '11111111-2222-3333-4444-555555555555',
      siteName: 'acme',
    },
  });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('jira', 'default');
  assert.equal(got.kind, 'atlassian_oauth');
  assert.equal((got as { cloudId: string }).cloudId, '11111111-2222-3333-4444-555555555555');
  assert.equal((got as { siteName: string }).siteName, 'acme');
});

test('rejects atlassian_oauth missing required fields', async () => {
  const root = await makeStore({
    jira: { kind: 'atlassian_oauth', accessToken: 'eyJ...' },
  });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('jira', 'default'), /atlassian_oauth.*(refreshToken|expiresAt|cloudId|siteName)/);
});

test('resolves atlassian_api_token from credentials.json', async () => {
  const root = await makeStore({
    jira: {
      kind: 'atlassian_api_token',
      baseUrl: 'https://acme.atlassian.net',
      email: 'alice@acme.com',
      token: 'ATATT3xFfGF0APITOKEN',
    },
  });
  const r = new EnvFileCredentialResolver({ root });
  const got = await r.resolve('jira', 'default');
  assert.equal(got.kind, 'atlassian_api_token');
  assert.equal((got as { email: string }).email, 'alice@acme.com');
});

test('rejects atlassian_api_token missing baseUrl', async () => {
  const root = await makeStore({
    jira: { kind: 'atlassian_api_token', email: 'alice@acme.com', token: 't' },
  });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('jira', 'default'), /atlassian_api_token.*baseUrl/);
});

test('rejects atlassian_api_token with non-https baseUrl', async () => {
  const root = await makeStore({
    jira: {
      kind: 'atlassian_api_token',
      baseUrl: 'http://acme.atlassian.net',
      email: 'alice@acme.com',
      token: 't',
    },
  });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('jira', 'default'), /baseUrl.*https/);
});
