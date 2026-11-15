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
