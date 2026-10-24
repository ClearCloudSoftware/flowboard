#!/usr/bin/env node
// A stand-in for `opencode serve`: just the HTTP + SSE surface OpencodeProvider uses.
// FAKE_OPENCODE_SCRIPT: JSON array of events streamed after prompt_async ("$SESSION" is replaced;
//   a permission.asked waits for its reply; { "hold": true } waits for an abort).
// FAKE_OPENCODE_LOG: JSONL of the startup env and every request.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const log = (entry) => appendFileSync(process.env.FAKE_OPENCODE_LOG, JSON.stringify(entry) + '\n');
const env = process.env;
log({
  pid: process.pid,
  env: Object.fromEntries(
    ['XDG_CONFIG_HOME', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_DISABLE_CLAUDE_CODE', 'FLOWBOARD_GUARDS'].map(
      (k) => [k, env[k]],
    ),
  ),
});

// Stands in for OpenCode loading the guard plugin, which marks itself loaded (FAKE_SKIP_PLUGIN: it failed to load).
if (JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}').plugin?.length && !env.FAKE_SKIP_PLUGIN) {
  writeFileSync(`${env.XDG_CONFIG_HOME}/flowboard-guard.loaded`, '');
}

// FAKE_IGNORE_TERM: a stuck server that only SIGKILL ends.
if (env.FAKE_IGNORE_TERM) process.on('SIGTERM', () => {});

const expectedAuth = 'Basic ' + Buffer.from(`opencode:${env.OPENCODE_SERVER_PASSWORD}`).toString('base64');
const script = JSON.parse(readFileSync(env.FAKE_OPENCODE_SCRIPT, 'utf8'));
const clients = new Set();
const waiting = new Map(); // permission id or "abort:<session>" -> resolve
const wait = (key) => new Promise((r) => waiting.set(key, r));
const release = (key) => (waiting.get(key)?.(), waiting.delete(key));
let connected;
const firstClient = new Promise((r) => (connected = r));

const send = (event) => {
  for (const res of clients) res.write(`data: ${JSON.stringify(event)}\n\n`);
};

async function play(session) {
  await firstClient;
  for (const raw of script) {
    const event = JSON.parse(JSON.stringify(raw).replaceAll('$SESSION', session));
    if (event.hold) {
      await wait(`abort:${session}`);
      return send({ type: 'session.idle', properties: { sessionID: session } });
    }
    send(event);
    if (event.type === 'permission.asked') await wait(event.properties.id);
    await new Promise((r) => setImmediate(r));
  }
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const path = new URL(req.url, 'http://x').pathname;
  log({ method: req.method, path, body: body ? JSON.parse(body) : undefined, ...(req.headers['x-test'] && { xTest: req.headers['x-test'] }) });
  if (req.headers.authorization !== expectedAuth) return json(res, { error: 'unauthorized' }, 401);

  let m;
  if (req.method === 'GET' && path === '/event') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ type: 'server.connected', properties: {} })}\n\n`);
    clients.add(res);
    connected();
    req.on('close', () => clients.delete(res));
  } else if (req.method === 'GET' && path === '/config/providers') {
    json(res, { providers: [{ id: 'fake', models: { m1: { id: 'm1', providerID: 'fake', variants: { high: {} } } } }], default: {} });
  } else if (req.method === 'POST' && path === '/session') {
    json(res, { id: 'ses_fake1', directory: new URL(req.url, 'http://x').searchParams.get('directory') });
  } else if (req.method === 'POST' && (m = /^\/session\/([^/]+)\/fork$/.exec(path))) {
    json(res, { id: 'ses_fork1' });
    // Like OpenCode, a fork republishes the cloned history under the new session id.
    send({ type: 'message.updated', properties: { sessionID: 'ses_fork1', info: { id: 'm_old', sessionID: 'ses_fork1', role: 'assistant' } } });
    send({ type: 'message.part.updated', properties: { sessionID: 'ses_fork1', part: { id: 'p_old', sessionID: 'ses_fork1', messageID: 'm_old', type: 'text', text: 'old reply', time: { start: 1, end: 2 } } } });
    send({ type: 'message.part.updated', properties: { sessionID: 'ses_fork1', part: { id: 's_old', sessionID: 'ses_fork1', messageID: 'm_old', type: 'step-finish', reason: 'stop', cost: 5, tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } } } });
  } else if (req.method === 'PATCH' && /^\/session\/[^/]+$/.test(path)) {
    json(res, {});
  } else if (req.method === 'POST' && (m = /^\/session\/([^/]+)\/prompt_async$/.exec(path))) {
    res.writeHead(204).end();
    play(m[1]);
  } else if (req.method === 'POST' && (m = /^\/session\/([^/]+)\/abort$/.exec(path))) {
    json(res, true);
    release(`abort:${m[1]}`);
  } else if (req.method === 'POST' && (m = /^\/permission\/([^/]+)\/reply$/.exec(path))) {
    // OpenCode settles a session's other pending requests when one is rejected; replying to those is a 404.
    if (m[1].startsWith('gone')) json(res, { name: 'NotFoundError', data: { message: 'Permission request not found' } }, 404);
    else json(res, true);
    release(m[1]);
  } else {
    json(res, { error: 'not found' }, 404);
  }
}).listen(Number(process.argv[process.argv.indexOf('--port') + 1] || 0), '127.0.0.1', function () {
  console.log(`opencode server listening on http://127.0.0.1:${this.address().port}`);
});
