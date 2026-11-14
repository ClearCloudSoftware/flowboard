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
    await mkdir(join(root, '.flowboard'), { recursive: true });
    const path = join(root, '.flowboard', 'credentials.json');
    await writeFile(path, JSON.stringify(contents), { mode: 0o600 });
    if (isPosix) await chmod(path, 0o600);
  }
  return root;
}

test('resolves github_pat from .flowboard/credentials.json', async () => {
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
  const path = join(root, '.flowboard', 'credentials.json');
  await chmod(path, 0o644);
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), /mode/);
});

test('throws on parse failure, mentioning the path, never the content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cred-'));
  await mkdir(join(root, '.flowboard'), { recursive: true });
  const path = join(root, '.flowboard', 'credentials.json');
  await writeFile(path, '{ not: json', { mode: 0o600 });
  if (isPosix) await chmod(path, 0o600);
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), (e: Error) => {
    return /credentials\.json/.test(e.message) && !/not: json/.test(e.message);
  });
});

test('rejects an entry with an unknown kind, naming the kind', async () => {
  const root = await makeStore({ github: { kind: 'github_oauth', token: 'x' } });
  const r = new EnvFileCredentialResolver({ root });
  await assert.rejects(r.resolve('github', 'default'), /github_oauth/);
});
