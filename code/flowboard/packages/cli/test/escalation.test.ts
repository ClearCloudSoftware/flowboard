import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PageAsk } from '../src/ask/page.ts';
import { escalationTick, noteAnswered, onInteraction, readEscalations, slackProblems } from '../src/escalation.ts';
import { saveSlackTokens } from '../src/slack.ts';
import { fakeSlack, type FakeSlack, until } from './fake-slack.ts';

const BOT = 'xoxb-1-2-abcdefghijkl';
const RUN = '2026-11-15T10-00-00-delivery';
const AT = Date.parse('2026-11-15T10:00:00.000Z');
const MIN = 60_000;
const GATE: PageAsk = {
  id: '1700-0',
  heading: '',
  at: new Date(AT).toISOString(),
  questions: [
    { id: 'decision', kind: 'single_select', prompt: 'review: changes are needed', options: [{ value: 'approve', label: 'Approve' }, { value: 'retry', label: 'Retry' }] },
    { id: 'note', kind: 'text', prompt: 'Note for the next run (optional)', required: false },
  ],
};

/** A data folder with one project over `repo`, and a run of it asking the page. */
function setup(o: { overrides?: object; status?: string; pid?: number; asks?: PageAsk[]; budget?: object } = {}) {
  const data = realpathSync(mkdtempSync(join(tmpdir(), 'fb-esc-')));
  const runs = join(data, 'runs');
  const repo = join(data, 'repo');
  mkdirSync(repo);
  writeFileSync(join(data, 'projects.json'), JSON.stringify([{ id: 'p1', name: 'Scratch', slug: 'scratch', repoPath: repo, defaultFlow: null, baseBranch: 'main', createdAt: '', type: 'software', source: { kind: 'local' }, overrides: o.overrides ?? {} }]));
  makeRun(runs, RUN, repo, o);
  return { data, runs, repo };
}
function makeRun(runs: string, name: string, folder: string, o: { status?: string; pid?: number; asks?: PageAsk[]; costUsd?: number } = {}) {
  const dir = join(runs, name);
  mkdirSync(join(dir, 'asks'), { recursive: true });
  mkdirSync(join(dir, 'answers'), { recursive: true });
  const config = { name: 'delivery', folder, budgetUsd: 0, warnings: [], flow: { steps: [], edges: [] }, steps: {} };
  writeFileSync(join(dir, 'flow.json'), JSON.stringify({ version: 1, config, artifactsDir: join(runs, 'none') }));
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ status: o.status ?? 'running', steps: {}, runs: [{ id: 1, step: 'x', costUsd: o.costUsd ?? 0 }] }));
  writeFileSync(join(dir, 'host.json'), JSON.stringify({ pid: o.pid ?? process.pid, page: true }));
  for (const a of o.asks ?? [GATE]) writeFileSync(join(dir, 'asks', `${a.id}.json`), JSON.stringify(a));
  return dir;
}
const lines: string[] = [];
const log = (l: string) => lines.push(l);
const posts = (s: FakeSlack) => s.of('chat.postMessage');
const texts = (blocks: any[]) => JSON.stringify(blocks);

async function withSlack(fn: (s: FakeSlack) => Promise<void>) {
  const s = await fakeSlack();
  try {
    await fn(s);
  } finally {
    await s.close();
  }
}

test('an ask is posted once it has waited nudgeMin, once', () =>
  withSlack(async (slack) => {
    const { data, runs } = setup();
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 4 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 0);
    await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 1);
    const p = posts(slack)[0];
    assert.equal(p.token, BOT);
    assert.equal(p.body.channel, '#flowboard');
    assert.equal(p.body.unfurl_links, false);
    assert.equal(p.body.unfurl_media, false);
    assert.match(texts(p.body.blocks), /Scratch · run 2026-11-15T10-00-00-delivery · review/);
    assert.match(texts(p.body.blocks), /http:\/\/localhost:3000\/runs\?run=/);
    await escalationTick(data, runs, { now: AT + 6 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 1);
    const e = readEscalations(data).asks[`${RUN}/1700-0`];
    assert.equal(e.slackChannel, 'C1');
    assert.ok(e.ts);
    assert.ok(!existsSync(join(runs, RUN, 'escalations.json'))); // never in the run folder
  }));

test("a project's nudgeMin, changed while waiting, applies", () =>
  withSlack(async (slack) => {
    const { data, runs } = setup({ overrides: { escalation: { channel: '#builds', nudgeMin: 10 } } });
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 0);
    await escalationTick(data, runs, { now: AT + 10 * MIN, base: slack.base, log });
    assert.equal(posts(slack)[0].body.channel, '#builds');
  }));

test('without a token the ask is logged once, and posted once a token is saved', () =>
  withSlack(async (slack) => {
    const { data, runs } = setup();
    lines.length = 0;
    await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
    await escalationTick(data, runs, { now: AT + 6 * MIN, base: slack.base, log });
    assert.deepEqual(lines, ['-- escalation: Scratch: 2026-11-15T10-00-00-delivery asks "review: changes are needed"; Slack is not connected, so it waits in FlowBoard']);
    assert.equal(slack.calls.length, 0);
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 7 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 1);
  }));

test('a paused or ended run does not escalate', () =>
  withSlack(async (slack) => {
    const { data, runs, repo } = setup({ pid: 999999 });
    makeRun(runs, '2026-11-15T09-00-00-delivery', repo, { status: 'done' });
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 60 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 0);
  }));

test('Slack down or not_in_channel: a problem recorded, retried a minute later, never thrown', async () => {
  const slack = await fakeSlack();
  const { data, runs } = setup();
  saveSlackTokens(data, { bot: BOT });
  slack.reply['chat.postMessage'] = () => ({ ok: false, error: 'not_in_channel' });
  await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
  assert.deepEqual(slackProblems(data, '#flowboard'), ['Slack: #flowboard: the bot is not in the channel; invite it with /invite @FlowBoard']);
  await escalationTick(data, runs, { now: AT + 5 * MIN + 30_000, base: slack.base, log });
  assert.equal(posts(slack).length, 1);
  slack.reply['chat.postMessage'] = () => ({ ok: true, channel: 'C1', ts: '1.1' });
  await escalationTick(data, runs, { now: AT + 6 * MIN, base: slack.base, log });
  assert.equal(posts(slack).length, 2);
  assert.deepEqual(slackProblems(data, '#flowboard'), []);
  await slack.close();
  // Slack gone: a new ask is tried and the tick still returns
  makeRun(runs, '2026-11-15T10-30-00-delivery', join(data, 'repo'), { asks: [{ ...GATE, id: '1800-0' }] });
  await escalationTick(data, runs, { now: AT + 60 * MIN, base: slack.base, log });
  assert.match(readEscalations(data).asks['2026-11-15T10-30-00-delivery/1800-0'].error!, /^Slack did not answer/);
});

const action = (run: string, id: string) => ({ type: 'block_actions', trigger_id: 'trig-1', user: { id: 'U1', username: 'alex' }, actions: [{ action_id: 'fb_answer', value: `${run}/${id}` }] });
const submission = (run: string, id: string, values: object) => ({ type: 'view_submission', user: { id: 'U1', username: 'alex' }, view: { callback_id: 'fb_answer', private_metadata: JSON.stringify({ run, id }), state: { values } } });
const APPROVE = { q0: { v: { type: 'radio_buttons', selected_option: { value: '0' } } }, q1: { v: { type: 'plain_text_input', value: null } } };

test('Answer opens the modal; a submission writes the answer and repaints; a second is told already answered', () =>
  withSlack(async (slack) => {
    const { data, runs } = setup();
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
    assert.equal(await onInteraction(data, runs, action(RUN, '1700-0'), slack.base), undefined);
    const open = await until(() => slack.of('views.open')[0]);
    assert.equal(open.body.trigger_id, 'trig-1');
    assert.equal(open.body.view.callback_id, 'fb_answer');
    assert.equal(await onInteraction(data, runs, submission(RUN, '1700-0', APPROVE), slack.base), undefined);
    assert.deepEqual(JSON.parse(readFileSync(join(runs, RUN, 'answers', '1700-0.json'), 'utf8')), { decision: 'approve', note: null });
    const upd = await until(() => slack.of('chat.update')[0]);
    assert.equal(upd.body.channel, 'C1');
    assert.match(texts(upd.body.blocks), /Answered in Slack by alex/);
    assert.match(texts(upd.body.blocks), /review: changes are needed: Approve/);
    assert.ok(!upd.body.blocks.some((b: any) => b.type === 'actions'));
    const again = (await onInteraction(data, runs, submission(RUN, '1700-0', APPROVE), slack.base)) as any;
    assert.equal(again.response_action, 'update');
    assert.match(texts(again.view.blocks), /Already answered in Slack\./);
  }));

test('a number that is not a number keeps the modal open, and nothing is written', () =>
  withSlack(async (slack) => {
    const ask: PageAsk = { ...GATE, heading: '-- build asks:', questions: [{ id: 'n', kind: 'number', prompt: 'How many?' }] };
    const { data, runs } = setup({ asks: [ask] });
    saveSlackTokens(data, { bot: BOT });
    const r = await onInteraction(data, runs, submission(RUN, '1700-0', { q0: { v: { type: 'plain_text_input', value: 'lots' } } }), slack.base);
    assert.deepEqual(r, { response_action: 'errors', errors: { q0: 'a number, like 3 or 2.5' } });
    assert.ok(!existsSync(join(runs, RUN, 'answers', '1700-0.json')));
  }));

test("the page's answer repaints the message; a late Answer click says so", () =>
  withSlack(async (slack) => {
    const { data, runs } = setup();
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 5 * MIN, base: slack.base, log });
    await noteAnswered(data, runs, RUN, '1700-0', { decision: 'retry', note: '' }, 'FlowBoard', { base: slack.base });
    const upd = slack.of('chat.update')[0];
    assert.match(texts(upd.body.blocks), /Answered in FlowBoard/);
    assert.match(texts(upd.body.blocks), /review: changes are needed: Retry/);
    assert.match(texts(upd.body.blocks), /Note for the next run \(optional\): skipped/);
    await onInteraction(data, runs, action(RUN, '1700-0'), slack.base);
    const v = await until(() => slack.of('views.open')[0]);
    assert.match(texts(v.body.view.blocks), /Already answered in FlowBoard\./);
    assert.equal(v.body.view.submit, undefined);
    await escalationTick(data, runs, { now: AT + 7 * MIN, base: slack.base, log });
    assert.equal(slack.of('chat.update').length, 1); // painted once
  }));

test('a gone ask repaints: the terminal while the run lives, no longer waiting once it ended', () =>
  withSlack(async (slack) => {
    const { data, runs, repo } = setup();
    const other = '2026-11-15T10-01-00-delivery';
    makeRun(runs, other, repo, { asks: [{ ...GATE, id: '1900-0' }] });
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now: AT + 6 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 2);
    rmSync(join(runs, RUN, 'asks', '1700-0.json')); // answered in the terminal: the host took it away
    rmSync(join(runs, other, 'asks', '1900-0.json'));
    writeFileSync(join(runs, other, 'host.json'), JSON.stringify({ pid: 999999, page: true })); // stopped
    await escalationTick(data, runs, { now: AT + 7 * MIN, base: slack.base, log });
    const ups = slack.of('chat.update').map((u) => texts(u.body.blocks));
    assert.equal(ups.length, 2);
    assert.ok(ups.some((t) => t.includes('Answered in the terminal')));
    assert.ok(ups.some((t) => t.includes('No longer waiting: the run ended')));
    await escalationTick(data, runs, { now: AT + 8 * MIN, base: slack.base, log });
    assert.equal(slack.of('chat.update').length, 2);
    await onInteraction(data, runs, action(other, '1900-0'), slack.base);
    const v = await until(() => slack.of('views.open')[0]);
    assert.match(texts(v.body.view.blocks), /No longer waiting\./);
  }));

test('the budget is posted once at the alert and once at the cap, each month', () =>
  withSlack(async (slack) => {
    const now = new Date(2026, 10, 15, 12).getTime();
    const { data, runs, repo } = setup({ overrides: { budget: { capUsd: 10, alertAt: 80, onLimit: 'ask' } }, asks: [] });
    rmSync(join(runs, RUN), { recursive: true });
    makeRun(runs, '2026-11-15T11-00-00-delivery', repo, { status: 'done', asks: [], costUsd: 8.5 });
    saveSlackTokens(data, { bot: BOT });
    await escalationTick(data, runs, { now, base: slack.base, log });
    await escalationTick(data, runs, { now: now + MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 1);
    assert.match(texts(posts(slack)[0].body.blocks), /Scratch has spent 85% of its \$10\.00 for November 2026\./);
    makeRun(runs, '2026-11-15T11-30-00-delivery', repo, { status: 'done', asks: [], costUsd: 2 });
    await escalationTick(data, runs, { now: now + 2 * MIN, base: slack.base, log });
    await escalationTick(data, runs, { now: now + 3 * MIN, base: slack.base, log });
    assert.equal(posts(slack).length, 2);
    assert.match(texts(posts(slack)[1].body.blocks), /Scratch has spent \$10\.50 of its \$10\.00 for November 2026; new runs ask first, and Start anyway is on the runs page: http:\/\/localhost:3000\/runs/);
    makeRun(runs, '2026-12-01T11-00-00-delivery', repo, { status: 'done', asks: [], costUsd: 9 });
    await escalationTick(data, runs, { now: new Date(2026, 11, 1, 12).getTime(), base: slack.base, log });
    assert.equal(posts(slack).length, 3);
    assert.match(texts(posts(slack)[2].body.blocks), /90% of its \$10\.00 for December 2026/);
  }));
