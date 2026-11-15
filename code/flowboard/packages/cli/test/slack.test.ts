import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeKey, saveKey, savedKey } from '../src/openrouter.ts';
import { connectSocket, removeSlack, saveSlackTokens, type SocketState, slackTokens, testSlack } from '../src/slack.ts';
import { fakeSlack, until } from './fake-slack.ts';

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

const HELLO = { type: 'hello', num_connections: 1, connection_info: { app_id: 'A1' } };
const envelope = (id: string, payload: object) => ({ envelope_id: id, type: 'interactive', accepts_response_payload: true, payload });

test('Socket Mode: an interactive envelope is acked with what the handler returns, through a real WebSocket', async () => {
  const slack = await fakeSlack();
  const states: SocketState[] = [];
  const seen: any[] = [];
  const sock = connectSocket({ bot: BOT, app: APP, base: slack.base, onState: (s) => states.push(s), onInteraction: async (p) => (seen.push(p), { response_action: 'clear' }) });
  try {
    const conn = await until(() => slack.conns[0], 5000, 'a socket');
    assert.equal(slack.of('apps.connections.open')[0].token, APP);
    conn.send(HELLO);
    await until(() => states.some((s) => s.state === 'connected'), 5000, 'connected');
    assert.deepEqual(states.at(-1), { state: 'connected', team: 'Acme', appId: 'A1' });
    assert.equal(states[0].state, 'connecting');
    conn.send(envelope('e1', { type: 'view_submission', api_app_id: 'A1', team: { id: 'T1' } }));
    await until(() => conn.received.length, 5000, 'an ack');
    assert.deepEqual(conn.received[0], { envelope_id: 'e1', payload: { response_action: 'clear' } });
    assert.equal(seen.length, 1);
  } finally {
    sock.close();
    await slack.close();
  }
});

test('Socket Mode: an envelope from another app or team is acked and not handled; garbage is ignored; a handler that throws is acked', async () => {
  const slack = await fakeSlack();
  let handled = 0;
  const sock = connectSocket({ bot: BOT, app: APP, base: slack.base, onState: () => {}, onInteraction: async (p) => {
    handled++;
    if (p.boom) throw new Error('boom');
    return undefined;
  } });
  try {
    const conn = await until(() => slack.conns[0]);
    conn.send(HELLO);
    conn.send('not json {');
    conn.send(envelope('e1', { type: 'block_actions', api_app_id: 'A2', team: { id: 'T1' } }));
    conn.send(envelope('e2', { type: 'block_actions', api_app_id: 'A1', team: { id: 'T9' } }));
    conn.send(envelope('e3', { type: 'block_actions', api_app_id: 'A1', team: { id: 'T1' }, boom: true }));
    await until(() => conn.received.length === 3, 5000, 'three acks');
    assert.deepEqual(conn.received, [{ envelope_id: 'e1' }, { envelope_id: 'e2' }, { envelope_id: 'e3' }]);
    assert.equal(handled, 1);
  } finally {
    sock.close();
    await slack.close();
  }
});

test('Socket Mode: a disconnect message or a dropped socket reconnects', async () => {
  const slack = await fakeSlack();
  const sock = connectSocket({ bot: BOT, app: APP, base: slack.base, onState: () => {}, onInteraction: async () => undefined, backoffMs: [10] });
  try {
    const first = await until(() => slack.conns[0]);
    first.send(HELLO);
    first.send({ type: 'disconnect', reason: 'refresh_requested' });
    const second = await until(() => slack.conns[1], 5000, 'a second socket');
    assert.equal(slack.of('apps.connections.open').length, 2);
    second.close();
    await until(() => slack.conns[2], 5000, 'a third socket');
  } finally {
    sock.close();
    await slack.close();
  }
});

test('Socket Mode: a refused app-level token is an error state, retried', async () => {
  const slack = await fakeSlack();
  slack.reply['apps.connections.open'] = () => ({ ok: false, error: 'invalid_auth' });
  const states: SocketState[] = [];
  const sock = connectSocket({ bot: BOT, app: APP, base: slack.base, onState: (s) => states.push(s), onInteraction: async () => undefined, backoffMs: [10] });
  try {
    await until(() => slack.of('apps.connections.open').length >= 2, 5000, 'a retry');
    assert.deepEqual(states.find((s) => s.state === 'error'), { state: 'error', error: 'Slack refused the app-level token (invalid_auth)' });
  } finally {
    sock.close();
    await slack.close();
  }
});
