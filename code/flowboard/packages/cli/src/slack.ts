/**
 * Slack, for escalation: its two tokens (kept in `secrets.json`), its Web API, and a Socket Mode connection, which
 * needs no public URL. The bot token (`xoxb-`, scope `chat:write`) posts and repaints; the app-level token (`xapp-`,
 * scope `connections:write`) opens the socket that brings button clicks and modal submissions back.
 * `SLACK_API_URL` points it elsewhere (the tests' fake Slack).
 */
import { readSecret, setSecret } from './secrets.ts';

export const slackBase = () => process.env.SLACK_API_URL || 'https://slack.com/api';

export type SlackAnswer = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** Calls a Web API method with JSON; never throws: Slack's own error code, or why it could not be reached. */
export async function slackCall(token: string, method: string, args: object = {}, base = slackBase()): Promise<SlackAnswer> {
  try {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: unknown; error?: unknown };
    if (body.ok === true) return body as SlackAnswer;
    return { ok: false, error: typeof body.error === 'string' ? body.error : `Slack answered ${res.status}` };
  } catch (e) {
    return { ok: false, error: `Slack did not answer: ${(e as Error).message}` };
  }
}

// --- the tokens --------------------------------------------------------------------------------------------------

const BOT_RE = /^xoxb-\S{8,300}$/;
const APP_RE = /^xapp-\S{8,300}$/;

export function slackTokens(dataDir: string): { bot?: string; app?: string } {
  const bot = readSecret(dataDir, 'slackBot');
  const app = readSecret(dataDir, 'slackApp');
  return { ...(bot && { bot }), ...(app && { app }) };
}

/** Saves the tokens given, each checked first; one left out keeps what is saved. */
export function saveSlackTokens(dataDir: string, t: { bot?: string; app?: string }): { ok: true } | { ok: false; error: string } {
  const bot = t.bot?.trim();
  const app = t.app?.trim();
  if (!bot && !app) return { ok: false, error: 'send a bot token, an app-level token, or both' };
  if (bot && !BOT_RE.test(bot)) return { ok: false, error: 'not a bot token: they start with xoxb-' };
  if (app && !APP_RE.test(app)) return { ok: false, error: 'not an app-level token: they start with xapp-' };
  if (bot) setSecret(dataDir, 'slackBot', bot);
  if (app) setSecret(dataDir, 'slackApp', app);
  return { ok: true };
}

export function removeSlack(dataDir: string): void {
  setSecret(dataDir, 'slackBot', null);
  setSecret(dataDir, 'slackApp', null);
}

const REFUSED = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive', 'token_expired']);

/** `auth.test` with the bot token: the workspace and the bot's name. */
export async function testSlack(dataDir: string, base = slackBase()): Promise<{ ok: true; team: string; teamId: string; bot: string } | { ok: false; error: string }> {
  const { bot } = slackTokens(dataDir);
  if (!bot) return { ok: false, error: 'no bot token saved' };
  const r = await slackCall(bot, 'auth.test', {}, base);
  if (!r.ok) return { ok: false, error: REFUSED.has(r.error) ? `Slack does not know this bot token (${r.error})` : r.error };
  return { ok: true, team: String(r.team ?? ''), teamId: String(r.team_id ?? ''), bot: String(r.user ?? '') };
}

// --- Socket Mode -------------------------------------------------------------------------------------------------

export type SocketState = { state: 'connecting' } | { state: 'connected'; team: string; appId: string } | { state: 'error'; error: string };

export interface SocketOptions {
  bot: string;
  app: string;
  base?: string;
  /** An interactive payload of this app in this workspace; what it returns is sent back with the ack (a modal's response). */
  onInteraction(payload: any): Promise<object | undefined>;
  onState(s: SocketState): void;
  /** Waits before each reconnect; the last repeats, and a `hello` starts it over. */
  backoffMs?: number[];
}

/**
 * Keeps a Socket Mode connection open: `auth.test` for the workspace, `apps.connections.open` for the URL, then
 * Node's `WebSocket`. Every envelope is acked by its `envelope_id`; one whose `api_app_id` is not the app's (from
 * `hello`) or whose team is not the bot's is acked and dropped. A `disconnect` message, a close or an error
 * reconnects after the backoff. Never throws.
 */
export function connectSocket(o: SocketOptions): { close(): void } {
  const base = o.base ?? slackBase();
  const backoff = o.backoffMs ?? [1000, 2000, 5000, 15_000, 60_000];
  let stopped = false;
  let tries = 0;
  let ws: WebSocket | undefined;
  let timer: NodeJS.Timeout | undefined;
  const again = () => {
    if (stopped) return;
    timer = setTimeout(() => void open().catch((e) => fail(`could not connect to Slack: ${(e as Error).message}`)), backoff[Math.min(tries++, backoff.length - 1)]);
    timer.unref?.();
  };
  const fail = (error: string) => {
    if (stopped) return;
    o.onState({ state: 'error', error });
    again();
  };
  const open = async () => {
    if (stopped) return;
    o.onState({ state: 'connecting' });
    const auth = await slackCall(o.bot, 'auth.test', {}, base);
    if (!auth.ok) return fail(REFUSED.has(auth.error) ? `Slack refused the bot token (${auth.error})` : auth.error);
    const conn = await slackCall(o.app, 'apps.connections.open', {}, base);
    if (!conn.ok) return fail(REFUSED.has(conn.error) ? `Slack refused the app-level token (${conn.error})` : conn.error);
    if (stopped) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(String(conn.url));
    } catch (e) {
      return fail(`Slack sent a socket address that does not work: ${(e as Error).message}`);
    }
    ws = sock;
    const teamId = String(auth.team_id ?? '');
    let appId: string | undefined;
    let lost = false;
    const gone = (why: string) => {
      if (lost) return;
      lost = true;
      if (ws === sock) ws = undefined;
      try {
        sock.close();
      } catch {
        // already closed
      }
      fail(why);
    };
    sock.addEventListener('message', (ev) => {
      let m: any;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return; // not Slack's
      }
      if (m?.type === 'hello') {
        appId = typeof m.connection_info?.app_id === 'string' ? m.connection_info.app_id : undefined;
        tries = 0;
        o.onState({ state: 'connected', team: String(auth.team ?? ''), appId: appId ?? '' });
        return;
      }
      if (m?.type === 'disconnect') return gone(`Slack asked to reconnect (${String(m.reason ?? 'no reason')})`);
      if (typeof m?.envelope_id !== 'string') return;
      const p = m.payload;
      const ours = m.type === 'interactive' && !!appId && p?.api_app_id === appId && p?.team?.id === teamId;
      const handled = ours ? o.onInteraction(p).catch((e) => (console.error(`-- slack: an interaction failed: ${(e as Error).message}`), undefined)) : Promise.resolve(undefined);
      void handled.then((payload) => {
        try {
          sock.send(JSON.stringify(payload ? { envelope_id: m.envelope_id, payload } : { envelope_id: m.envelope_id }));
        } catch {
          // the socket closed first; Slack sends the envelope again on the next one
        }
      });
    });
    sock.addEventListener('close', () => gone('the connection to Slack closed; reconnecting'));
    sock.addEventListener('error', () => gone('the connection to Slack failed; reconnecting'));
  };
  void open().catch((e) => fail(`could not connect to Slack: ${(e as Error).message}`));
  return {
    close() {
      stopped = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed
      }
    },
  };
}
