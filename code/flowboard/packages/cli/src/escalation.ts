/**
 * Escalation to Slack: a question a run asks the page (`<runDir>/asks/<id>.json`), unanswered for its project's
 * `nudgeMin`, is posted to the project's channel; it can be answered there through a modal, the answer written by
 * `answerAsk` as the page writes it, so the first answer wins wherever it came from. The message is repainted once the
 * question is answered anywhere or stops waiting. A project's budget alert and cap are posted once a month each.
 *
 * What was posted lives in `<dataDir>/escalations.json`, never in a run folder or a repo. Without a bot token each
 * question is logged once and waits in FlowBoard (PRD §10: Slack is optional). Nothing here throws on a Slack failure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Answers } from '../../core/src/hitl/question.ts';
import type { PageAsk } from './ask/page.ts';
import { readAppSettings } from './app-settings.ts';
import { budgetState, monthName, monthOf, nextMonthName } from './budget.ts';
import { isFile, writeJsonFile } from './config.ts';
import { answerAsk, listRuns, readRun } from './flow-logs.ts';
import { findProject } from './isolation.ts';
import { projectSpendUsd, readProjects } from './projects.ts';
import { resolveSettings } from './settings.ts';
import { answersFromView, askMessage, askModal, type Blocks, clip, closedMessage, noteMessage, noticeModal, type Where } from './slack-blocks.ts';
import { connectSocket, slackCall, type SocketState, slackTokens } from './slack.ts';

/** One escalated ask, keyed `<run>/<id>`: where it went (`slackChannel`, `ts` once posted) and how it ended (`closed`). */
export interface Escalated {
  project: string;
  channel: string;
  ask: PageAsk;
  triedAt: string;
  slackChannel?: string;
  ts?: string;
  error?: string;
  /** `painted`: the message says so, or has nothing to repaint. */
  closed?: { by: Where | null; at: string; answers?: Answers; slackUser?: string; painted: boolean };
}
/** `budget`: what was posted per `<project id>/<month>`; `problems`: the last refusal per channel, cleared by a post. */
export interface Escalations { asks: Record<string, Escalated>; budget: Record<string, { alert?: true; cap?: true; triedAt?: string }>; problems: Record<string, string> }
export interface TickOptions { now?: number; base?: string; log?: (line: string) => void }

const RETRY_MS = 60_000;
/** Only a run's first asks escalate, and a pass posts only so many: a run that floods its asks folder can't flood Slack. */
const MAX_ASKS_PER_RUN = 10;
const MAX_POSTS_PER_PASS = 20;
const KEEP_MS = 7 * 24 * 3600_000;
const ID = /^[\w-]+$/;
const iso = (ms: number) => new Date(ms).toISOString();
const fileOf = (dataDir: string) => join(dataDir, 'escalations.json');
const offline = (error: string) => error.startsWith('Slack did not answer');

export function readEscalations(dataDir: string): Escalations {
  try {
    const s = isFile(fileOf(dataDir)) ? (JSON.parse(readFileSync(fileOf(dataDir), 'utf8')) as Partial<Escalations>) : {};
    return { asks: s.asks ?? {}, budget: s.budget ?? {}, problems: s.problems ?? {} };
  } catch {
    return { asks: {}, budget: {}, problems: {} }; // ponytail: a file that does not parse starts over; only this module writes it
  }
}
/** Read, change, write with no await between: the tick and an interaction never lose each other's writes. */
function update(dataDir: string, fn: (s: Escalations) => void): void {
  const s = readEscalations(dataDir);
  fn(s);
  writeJsonFile(fileOf(dataDir), s);
}

const WHY: Record<string, string> = {
  not_in_channel: 'the bot is not in the channel; invite it with /invite @FlowBoard',
  channel_not_found: 'no such channel',
  is_archived: 'the channel is archived',
};
/** Records Slack's refusal against the channel, or clears it after a post went through; a network failure is neither. */
const noteProblem = (s: Escalations, channel: string, error: string | undefined) => {
  if (error === undefined) delete s.problems[channel];
  else if (!offline(error)) s.problems[channel] = WHY[error] ?? error;
};

/** The project page's line about the channel it escalates to, when Slack last refused it. */
export function slackProblems(dataDir: string, channel: string): string[] {
  const why = readEscalations(dataDir).problems[channel];
  return why ? [`Slack: ${channel}: ${why}`] : [];
}

/** Each run folder's project, its escalation and budget settings resolved now, so a change applies to waiting questions. */
function contextOf(dataDir: string, folder: string, fallback: string) {
  const app = readAppSettings(dataDir);
  const p = findProject(dataDir, folder);
  const s = p ? resolveSettings(app, p.type, p.overrides) : undefined;
  return { project: p?.name ?? fallback, escalation: s?.escalation.value ?? app.escalation, address: app.address };
}

const post = (bot: string, channel: string, m: Blocks, base?: string) => slackCall(bot, 'chat.postMessage', { channel, text: m.text, blocks: m.blocks, unfurl_links: false, unfurl_media: false }, base);

/** Repaints a closed entry's message; a refusal (the message deleted, say) counts as done, a network failure is retried. */
async function paint(dataDir: string, key: string, e: Escalated, base?: string): Promise<void> {
  const { bot } = slackTokens(dataDir);
  const c = e.closed!;
  if (bot && e.ts && e.slackChannel) {
    const m = closedMessage({ project: e.project, run: key.slice(0, key.indexOf('/')), ask: e.ask, by: c.by, ...(c.answers && { answers: c.answers }), ...(c.slackUser && { slackUser: c.slackUser }) });
    const r = await slackCall(bot, 'chat.update', { channel: e.slackChannel, ts: e.ts, text: m.text, blocks: m.blocks }, base);
    if (!r.ok && offline(r.error)) return;
    if (!r.ok) console.error(`-- escalation: could not repaint ${key}: ${r.error}`);
  }
  update(dataDir, (s) => {
    if (s.asks[key]?.closed) s.asks[key].closed!.painted = true;
  });
}

/**
 * One pass: posts what has waited long enough, closes and repaints what stopped waiting, posts budget lines once
 * each, and forgets closed questions after a week.
 */
export async function escalationTick(dataDir: string, runsDir: string, o: TickOptions = {}): Promise<void> {
  const now = o.now ?? Date.now();
  const log = o.log ?? console.log;
  const { bot } = slackTokens(dataDir);
  const runs = listRuns(runsDir);
  const open = new Set<string>();
  let posts = 0;
  // Each ask and each repaint fails on its own: one bad file never stops the rest of the pass.
  const guard = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      log(`-- escalation: ${what}: ${(e as Error).message}`);
    }
  };

  const escalate = async (r: (typeof runs)[number], ask: PageAsk, ctx: ReturnType<typeof contextOf>) => {
    const key = `${r.name}/${ask.id}`;
    if (!(now - Date.parse(ask.at) >= ctx.escalation.nudgeMin * 60_000)) return;
    const seen = readEscalations(dataDir).asks[key];
    if (seen?.ts || seen?.closed || (seen && now - Date.parse(seen.triedAt) < RETRY_MS)) return;
    const entry = { project: ctx.project, channel: ctx.escalation.channel, ask, triedAt: iso(now) };
    if (!bot) {
      if (!seen) {
        log(`-- escalation: ${ctx.project}: ${r.name} asks "${clip(ask.questions[0]?.prompt ?? '', 80)}"; Slack is not connected, so it waits in FlowBoard`);
        update(dataDir, (s) => void (s.asks[key] = entry));
      }
      return;
    }
    posts++;
    const res = await post(bot, ctx.escalation.channel, askMessage({ project: ctx.project, run: r.name, ask, address: ctx.address }), o.base);
    if (!res.ok) log(`-- escalation: ${ctx.project}: could not post to ${ctx.escalation.channel}: ${res.error}`);
    update(dataDir, (s) => {
      s.asks[key] = { ...entry, ...(res.ok ? { slackChannel: String(res.channel), ts: String(res.ts) } : { error: res.error }) };
      noteProblem(s, ctx.escalation.channel, res.ok ? undefined : res.error);
    });
  };
  for (const r of runs) {
    if (r.status !== 'waiting') continue;
    const detail = readRun(runsDir, r.name);
    if (!detail?.page) continue;
    for (const ask of detail.asks) open.add(`${r.name}/${ask.id}`); // every one is open, escalated or not
    const ctx = contextOf(dataDir, r.folder, r.flow);
    for (const ask of detail.asks.slice(0, MAX_ASKS_PER_RUN)) {
      if (posts >= MAX_POSTS_PER_PASS) break;
      await guard(`${r.name}/${ask.id}`, () => escalate(r, ask, ctx));
    }
  }

  // What stopped waiting: answered in the terminal while the run lives, else the run ended.
  const status = new Map(runs.map((r) => [r.name, r.status]));
  const close = async (key: string, e: Escalated) => {
    if (!e.closed) {
      if (open.has(key)) return;
      const st = status.get(key.slice(0, key.indexOf('/')));
      const by: Where | null = st === 'running' || st === 'waiting' || st === 'starting' ? 'the terminal' : null;
      let closed: Escalated | undefined;
      update(dataDir, (s) => {
        const x = s.asks[key];
        if (!x || x.closed) return; // an answer from Slack or the page got there first
        x.closed = { by, at: iso(now), painted: !x.ts };
        closed = x;
      });
      if (!closed?.ts) return;
      e.closed = closed.closed;
    }
    if (e.ts) await paint(dataDir, key, e, o.base);
  };
  for (const [key, e] of Object.entries(readEscalations(dataDir).asks)) if (!e.closed?.painted) await guard(key, () => close(key, e));
  update(dataDir, (s) => {
    for (const [key, e] of Object.entries(s.asks)) if (e.closed?.painted && now - Date.parse(e.closed.at) > KEEP_MS) delete s.asks[key];
  });

  await guard('budget', () => budgetTick(dataDir, runs, now, bot, log, o.base));
}

/** Each capped project's alert, then its cap, once per month; the cap alone when both cross between two passes. */
async function budgetTick(dataDir: string, runs: ReturnType<typeof listRuns>, now: number, bot: string | undefined, log: (l: string) => void, base?: string) {
  const app = readAppSettings(dataDir);
  const projects = readProjects(dataDir);
  const month = monthOf(now);
  for (const p of projects) {
    const s = resolveSettings(app, p.type, p.overrides);
    const b = s.budget.value;
    if (!b.capUsd) continue;
    const spent = projectSpendUsd(runs, projects, p.id, month);
    const st = budgetState(b, spent);
    const key = `${p.id}/${month}`;
    const done = readEscalations(dataDir).budget[key] ?? {};
    const which = st.over ? (done.cap ? null : 'cap') : st.alert && !done.alert ? 'alert' : null;
    if (!which || (done.triedAt && now - Date.parse(done.triedAt) < RETRY_MS)) continue;
    const of = `its $${b.capUsd.toFixed(2)} for ${monthName(month)}`;
    const text =
      which === 'alert'
        ? `${p.name} has spent ${st.pct}% of ${of}.`
        : `${p.name} has spent $${spent.toFixed(2)} of ${of}; ${b.onLimit === 'ask' ? `new runs ask first, and Start anyway is on the runs page: ${app.address}/runs` : `new runs are paused until ${nextMonthName(month)}.`}`;
    const channel = s.escalation.value.channel;
    const res = bot ? await post(bot, channel, noteMessage(text), base) : undefined;
    if (!bot) log(`-- escalation: ${text}`);
    else if (!res!.ok) log(`-- escalation: ${p.name}: could not post to ${channel}: ${res!.error}`);
    update(dataDir, (x) => {
      if (res && !res.ok) {
        x.budget[key] = { ...done, triedAt: iso(now) };
        noteProblem(x, channel, res.error);
        return;
      }
      x.budget[key] = { alert: true, ...(which === 'cap' && { cap: true }) }; // the cap posted means the alert needs no post
      if (res) noteProblem(x, channel, undefined);
    });
  }
}

/** The page (or Slack) answered `<run>/<id>`: if it was escalated, its message says so now. */
export async function noteAnswered(dataDir: string, runsDir: string, run: string, id: string, answers: Record<string, unknown>, by: 'FlowBoard' | 'Slack', o: { slackUser?: string; base?: string } = {}): Promise<void> {
  const key = `${run}/${id}`;
  let e: Escalated | undefined;
  update(dataDir, (s) => {
    const x = s.asks[key];
    if (!x || x.closed) return;
    const picked: Answers = Object.fromEntries(x.ask.questions.map((q) => [q.id, (answers[q.id] === '' ? null : (answers[q.id] ?? null)) as Answers[string]]));
    x.closed = { by, at: new Date().toISOString(), answers: picked, ...(o.slackUser && { slackUser: o.slackUser }), painted: !x.ts };
    e = x;
  });
  if (e?.ts) await paint(dataDir, key, e, o.base);
}

/** Why `<run>/<id>` can no longer be answered, or undefined while it still can. */
function closedText(dataDir: string, runsDir: string, run: string, id: string): string | undefined {
  const by = readEscalations(dataDir).asks[`${run}/${id}`]?.closed?.by;
  if (by) return `Already answered in ${by}.`;
  const open = readRun(runsDir, run)?.asks.some((a) => a.id === id);
  return open ? undefined : 'No longer waiting.';
}

/**
 * Socket Mode's handler. **Answer** opens the modal (`views.open` with the click's `trigger_id`), or a notice when
 * the question is already answered. A submission is checked, written through `answerAsk`, and the message repainted;
 * what this returns is the modal's response: errors on a block, the notice, or nothing to close it.
 */
// ponytail: anyone in the channel who can click may answer (single-user app); check payload.user.id if that changes
export async function onInteraction(dataDir: string, runsDir: string, payload: any, base?: string): Promise<object | undefined> {
  const { bot } = slackTokens(dataDir);
  if (!bot) return undefined;
  if (payload?.type === 'block_actions') {
    const value = payload.actions?.find((a: { action_id?: string }) => a.action_id === 'fb_answer')?.value;
    if (typeof value !== 'string' || !value.includes('/')) return undefined;
    const run = value.slice(0, value.indexOf('/'));
    const id = value.slice(value.indexOf('/') + 1);
    if (!ID.test(id)) return undefined;
    const text = closedText(dataDir, runsDir, run, id);
    const ask = text ? undefined : readRun(runsDir, run)?.asks.find((a) => a.id === id);
    const view = ask ? askModal({ run, ask }) : noticeModal(text ?? 'No longer waiting.');
    // Not awaited: the envelope is acked at once, and the trigger_id lasts 3 seconds.
    void slackCall(bot, 'views.open', { trigger_id: payload.trigger_id, view }, base).then((r) => !r.ok && console.error(`-- escalation: could not open the answer modal: ${r.error}`));
    return undefined;
  }
  if (payload?.type === 'view_submission' && payload.view?.callback_id === 'fb_answer') {
    let meta: { run?: unknown; id?: unknown };
    try {
      meta = JSON.parse(String(payload.view.private_metadata));
    } catch {
      return undefined;
    }
    if (typeof meta.run !== 'string' || typeof meta.id !== 'string' || !ID.test(meta.id)) return undefined;
    const { run, id } = meta as { run: string; id: string };
    const notice = (text: string) => ({ response_action: 'update', view: noticeModal(text) });
    const closed = closedText(dataDir, runsDir, run, id);
    const ask = readRun(runsDir, run)?.asks.find((a) => a.id === id);
    if (closed || !ask) return notice(closed ?? 'No longer waiting.');
    const r = answersFromView(ask, payload.view.state?.values ?? {});
    if ('errors' in r) return { response_action: 'errors', errors: r.errors };
    const why = answerAsk(runsDir, run, id, r.answers);
    if (why) return notice(closedText(dataDir, runsDir, run, id) ?? (why === 'already answered' ? 'Already answered in FlowBoard.' : why));
    const user = payload.user?.username ?? payload.user?.name ?? payload.user?.id;
    void noteAnswered(dataDir, runsDir, run, id, r.answers, 'Slack', { ...(typeof user === 'string' && { slackUser: user }), ...(base && { base }) });
    return undefined;
  }
  return undefined;
}

// --- the host: the Next server keeps it running ------------------------------------------------------------------

export interface EscalationHost {
  /** Reconnects with the tokens saved now; none, and it stays off. */
  refresh(): void;
  state(): SocketState | { state: 'off' };
  /** For tests: stops the pass and the socket, and forgets the host. */
  stop(): void;
}
const G = globalThis as { __fbEscalation?: EscalationHost };
export const escalationHost = (): EscalationHost | undefined => G.__fbEscalation;

/**
 * Once per server process (a dev server's reloads import this again): a Socket Mode connection while both tokens are
 * saved, and an `escalationTick` every `everyMs`, one at a time. Nothing in it throws into the server.
 */
// ponytail: a pass every 15 s reads every run folder; a file watcher on the runs folder if there get to be thousands
export function startEscalation(dataDir: string, runsDir: string, o: { everyMs?: number; base?: string } = {}): EscalationHost {
  if (G.__fbEscalation) return G.__fbEscalation;
  let state: SocketState | { state: 'off' } = { state: 'off' };
  let sock: { close(): void } | undefined;
  let gen = 0; // a closed socket's late state never overwrites the new one's
  const connect = () => {
    sock?.close();
    sock = undefined;
    const mine = ++gen;
    const t = slackTokens(dataDir);
    if (!t.bot || !t.app) {
      state = { state: 'off' };
      return;
    }
    sock = connectSocket({
      bot: t.bot,
      app: t.app,
      ...(o.base && { base: o.base }),
      onState: (s) => void (gen === mine && (state = s)),
      onInteraction: (p) => onInteraction(dataDir, runsDir, p, o.base),
    });
  };
  let busy = false;
  const pass = async () => {
    if (busy) return;
    busy = true;
    try {
      await escalationTick(dataDir, runsDir, { ...(o.base && { base: o.base }) });
    } catch (e) {
      console.error(`-- escalation: the pass failed: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void pass(), o.everyMs ?? 15_000);
  timer.unref();
  const host: EscalationHost = {
    refresh: connect,
    state: () => state,
    stop() {
      gen++;
      clearInterval(timer);
      sock?.close();
      sock = undefined;
      if (G.__fbEscalation === host) delete G.__fbEscalation;
    },
  };
  G.__fbEscalation = host;
  connect();
  return host;
}
