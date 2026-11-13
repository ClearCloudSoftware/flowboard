import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeSignIn, harnessStatus, opencodeSignIn } from '../src/harnesses.ts';

test('sign-in lines: claude auth status and opencode auth list, as each prints them', () => {
  assert.deepEqual(claudeSignIn('{"loggedIn":true,"authMethod":"claude.ai"}'), { ok: true, text: 'logged in with a Claude subscription' });
  assert.equal(claudeSignIn('{"loggedIn":false}').ok, false);
  const list = '\x1b[0m\n┌  Credentials \x1b[90m~/.local/share/opencode/auth.json\n│\n●  OpenRouter \x1b[90mapi\n│\n└  1 credentials\n';
  assert.deepEqual(opencodeSignIn(list), { ok: true, text: 'credentials for OpenRouter (api)' });
  assert.equal(opencodeSignIn('┌  Credentials\n└  0 credentials\n').ok, false);
});

test('a program that is not there is not installed', async () => {
  assert.deepEqual(await harnessStatus('opencode', '/nonexistent/opencode'), { program: '/nonexistent/opencode', installed: false });
});
