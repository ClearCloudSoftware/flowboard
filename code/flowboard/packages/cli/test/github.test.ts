import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGh } from './fake-gh.ts';
import { ghOwners, ghRepos, ghStatus, ghSwitch, loginOk } from '../src/github.ts';

const host = (login: string, active: boolean, state = 'success', error = '') =>
  ({ state, ...(error && { error }), active, host: 'github.com', login, tokenSource: 'keyring', gitProtocol: 'https' });
const statusOf = (...hosts: object[]) => `echo '${JSON.stringify({ hosts: hosts.length ? { 'github.com': hosts } : {} })}'`;

test('status: connected, with every account gh holds', () => {
  const gh = fakeGh({ 'auth status --json hosts': statusOf(host('alex-work', false), host('alex', true)) });
  assert.deepEqual(ghStatus(gh), { state: 'connected', login: 'alex', accounts: ['alex-work', 'alex'] });
});

test('status: missing, signed out, rejected', () => {
  assert.deepEqual(ghStatus('/nonexistent/gh'), { state: 'missing' });
  assert.deepEqual(ghStatus(fakeGh({ 'auth status --json hosts': `${statusOf()}; echo 'You are not logged into any GitHub hosts.' >&2` })), { state: 'signed-out' });
  const rejected = fakeGh({ 'auth status --json hosts': statusOf(host('bob', true, 'error', 'HTTP 401: Bad credentials (https://api.github.com/)')) });
  assert.deepEqual(ghStatus(rejected), { state: 'rejected', login: 'bob', message: 'HTTP 401: Bad credentials (https://api.github.com/)' });
});

test('owners: the account first, then the organizations it is an active member of', () => {
  const gh = fakeGh({ 'api user --jq .login': 'echo alex', 'api user/memberships/orgs?state=active --paginate --jq .[].organization.login': 'printf "flowboard\\nclearcloud-labs\\n"' });
  assert.deepEqual(ghOwners(gh), { ok: true, owners: ['alex', 'flowboard', 'clearcloud-labs'] });
  assert.deepEqual(ghOwners(fakeGh({ 'api user --jq .login': 'echo "HTTP 401: Bad credentials" >&2; exit 1' })), { ok: false, error: 'HTTP 401: Bad credentials' });
});

test('repos: listed with their default branch and size', () => {
  const row = { defaultBranchRef: { name: 'trunk' }, description: 'Invoices', diskUsage: 27000, isPrivate: true, name: 'billing-svc', primaryLanguage: { name: 'Go' }, pushedAt: '2026-11-08T10:00:00Z' };
  const empty = { defaultBranchRef: null, description: null, diskUsage: 0, isPrivate: false, name: 'blank', primaryLanguage: null, pushedAt: '2026-11-01T10:00:00Z' };
  const gh = fakeGh({ 'repo list alex *': `echo '${JSON.stringify([row, empty])}'` });
  assert.deepEqual(ghRepos('alex', gh), {
    ok: true,
    repos: [
      { owner: 'alex', name: 'billing-svc', description: 'Invoices', language: 'Go', pushedAt: '2026-11-08T10:00:00Z', private: true, defaultBranch: 'trunk', sizeKb: 27000 },
      { owner: 'alex', name: 'blank', description: '', language: null, pushedAt: '2026-11-01T10:00:00Z', private: false, defaultBranch: null, sizeKb: 0 },
    ],
  });
});

test('repos: a restricted org says so', () => {
  const gh = fakeGh({
    'repo list partner-co *':
      "echo 'GraphQL: Although you appear to have the correct authorization credentials, the `partner-co` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.' >&2; exit 1",
    'repo list gone *': "echo 'GraphQL: Could not resolve to a RepositoryOwner with the login of gone.' >&2; exit 1",
  });
  const r = ghRepos('partner-co', gh);
  assert.equal(r.ok ? 'ok' : r.reason, 'restricted');
  assert.deepEqual(ghRepos('gone', gh), { ok: false, reason: 'error', error: 'GraphQL: Could not resolve to a RepositoryOwner with the login of gone.' });
});

test('a bad owner or login never reaches gh', () => {
  assert.equal(loginOk('ClearCloudSoftware'), true);
  assert.equal(loginOk('--help'), false);
  assert.equal(loginOk('a/b'), false);
  assert.equal(loginOk(''), false);
  const gh = fakeGh({});
  assert.deepEqual(ghRepos('--repo=x', gh), { ok: false, reason: 'error', error: 'not a GitHub account name: --repo=x' });
  assert.deepEqual(ghSwitch('-x', gh), { ok: false, error: 'not a GitHub account name: -x' });
});

test('switch: gh auth switch to the account given', () => {
  const gh = fakeGh({ 'auth switch --hostname github.com --user alex-work': 'echo "✓ Switched active account" >&2' });
  assert.deepEqual(ghSwitch('alex-work', gh), { ok: true });
});
