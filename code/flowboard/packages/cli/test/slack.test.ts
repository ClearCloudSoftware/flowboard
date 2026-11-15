import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeKey, saveKey, savedKey } from '../src/openrouter.ts';
import { removeSlack, saveSlackTokens, slackTokens, testSlack } from '../src/slack.ts';
import { fakeSlack } from './fake-slack.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-slack-')));
const OR = `sk-or-v1-${'a'.repeat(60)}beef`;
const BOT = 'xoxb-1-2-abcdefghijkl';
const APP = 'xapp-1-A1-3-abcdefghijkl';

test('the OpenRouter key and Slack’s tokens keep each other', () => {
  const d = temp();
  assert.deepEqual(saveKey(d, OR), { ok: true });
  assert.deepEqual(saveSlackTokens(d, { bot: BOT, app: APP }), { ok: true });
  assert.equal(savedKey(d), OR);
  removeKey(d);
  assert.equal(savedKey(d), undefined);
  assert.deepEqual(slackTokens(d), { bot: BOT, app: APP });
  if (process.platform !== 'win32') assert.equal(statSync(join(d, 'secrets.json')).mode & 0o777, 0o600);
  assert.deepEqual(saveSlackTokens(d, { bot: 'xoxb-1-2-other123456' }), { ok: true }); // one at a time keeps the other
  assert.deepEqual(slackTokens(d), { bot: 'xoxb-1-2-other123456', app: APP });
  saveKey(d, OR);
  removeSlack(d);
  assert.deepEqual(slackTokens(d), {});
  assert.equal(savedKey(d), OR);
  removeKey(d);
  assert.equal(existsSync(join(d, 'secrets.json')), false);
});

test('a Slack token must look like one', () => {
  const d = temp();
  assert.deepEqual(saveSlackTokens(d, { bot: 'sk-x' }), { ok: false, error: 'not a bot token: they start with xoxb-' });
  assert.deepEqual(saveSlackTokens(d, { app: 'xoxb-1-2-abcdefghijkl' }), { ok: false, error: 'not an app-level token: they start with xapp-' });
  assert.deepEqual(saveSlackTokens(d, {}), { ok: false, error: 'send a bot token, an app-level token, or both' });
  assert.deepEqual(slackTokens(d), {});
});

test('testSlack asks auth.test with the bot token', async () => {
  const d = temp();
  const slack = await fakeSlack();
  try {
    assert.deepEqual(await testSlack(d, slack.base), { ok: false, error: 'no bot token saved' });
    saveSlackTokens(d, { bot: BOT });
    assert.deepEqual(await testSlack(d, slack.base), { ok: true, team: 'Acme', teamId: 'T1', bot: 'flowboard' });
    assert.equal(slack.of('auth.test')[0].token, BOT);
    slack.reply['auth.test'] = () => ({ ok: false, error: 'invalid_auth' });
    assert.deepEqual(await testSlack(d, slack.base), { ok: false, error: 'Slack does not know this bot token (invalid_auth)' });
  } finally {
    await slack.close();
  }
  const r = await testSlack(d, slack.base);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /^Slack did not answer: /);
});
