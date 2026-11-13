import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_DEFAULTS, resolveSettings } from '../../packages/cli/src/settings.ts';
import { draftFrom, problems, summary, toggle, toLimits, toOverrides, type Ctx } from './settings-model.ts';

const base = resolveSettings(APP_DEFAULTS, 'software', {});
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ base, os: 'darwin', typeName: 'Software', flows: ['delivery', 'review-loop'], repo: { name: 'api', branch: 'main', sizeKb: 48000 }, ...over });
const fresh = () => draftFrom(base, {});

test('a draft starts from the resolved settings: overridden where the project sets them, limits as text', () => {
  const d = draftFrom(resolveSettings(APP_DEFAULTS, 'software', { draft: true }), { memoryMb: 2048 });
  assert.equal(d.ov.draft, true);
  assert.equal(d.ov.trust, false);
  assert.deepEqual([d.v.memMb, d.v.cpus], ['2048', '']);
  assert.deepEqual(toOverrides(d), { draft: true });
  assert.deepEqual(toLimits(d), { memoryMb: 2048 });
});

test('turning an override on starts it from the inherited value; off drops it from what is saved', () => {
  let d = toggle(fresh(), 'budget', true, base);
  assert.deepEqual([d.v.cap, d.v.alertAt, d.v.onLimit], ['', '80', 'pause']); // the app has no cap: nothing to start from
  d = { ...d, v: { ...d.v, cap: '150' } };
  assert.deepEqual(toOverrides(d), { budget: { capUsd: 150, alertAt: 80, onLimit: 'pause' } });
  assert.deepEqual(toOverrides(toggle(d, 'budget', false, base)), {});
  assert.deepEqual(toggle(fresh(), 'knowledge', true, base).v.knowledge, { serena: true, graphify: true, rebuild: 'push' });
});

test('errors: every field rule, in the words the mockup uses', () => {
  const e = (v: Partial<ReturnType<typeof fresh>['v']>, ov: Partial<ReturnType<typeof fresh>['ov']> = {}) => {
    const d = fresh();
    return problems({ ov: { ...d.ov, ...ov }, v: { ...d.v, ...v } }, ctx()).errors;
  };
  assert.deepEqual(e({ memMb: '63' }), { memMb: 'a whole number of MB, 64 or more' });
  assert.deepEqual(e({ cpus: '0' }), { cpus: 'more than 0; 1.5 is a CPU and a half' });
  assert.deepEqual(e({ cap: '' }, { budget: true }), { cap: 'a dollar amount above 0' });
  assert.deepEqual(e({ cap: '10', alertAt: '0' }, { budget: true }), { alertAt: 'alert at 1 to 100 percent' });
  assert.deepEqual(e({ channel: 'general' }, { escalation: true }), { channel: 'a Slack channel, like #billing-alerts' });
  assert.deepEqual(e({ nudge: '200' }, { escalation: true }), { nudge: '1 to 120 minutes' });
  assert.deepEqual(e({ cap: '' }, { budget: false }), {}); // not overridden: not checked
  assert.deepEqual(problems({ ...fresh(), ov: { ...fresh().ov, budget: true } }, ctx(), 'app').errors, {}); // the app may have no cap
});

test('warnings: no sandbox, gVisor off Linux, graphify’s cost, no maps', () => {
  const texts = (d: ReturnType<typeof fresh>, c = ctx()) => problems(d, c).warns.map((w) => w.text);
  const untrusted = toggle(fresh(), 'trust', true, base);
  untrusted.v.trust = 'untrusted';
  assert.ok(texts(untrusted).includes('gVisor runs on Linux only; on this Mac, every run of this project is refused.'));
  assert.ok(!texts(untrusted, ctx({ os: 'linux' })).some((t) => t.startsWith('gVisor')));
  const trusted = { ...untrusted, v: { ...untrusted.v, trust: 'trusted' as const } };
  assert.ok(texts(trusted).includes('With no sandbox, agents in delivery and review-loop stop before each file edit and shell command until you allow it.'));
  const graphify = problems(fresh(), ctx()).warns.find((w) => w.page === 'knowledge');
  assert.equal(graphify?.caution, true);
  assert.match(graphify!.text, /about \$0\.38 a rebuild, on every move of main, and the project has no budget cap to stop it/);
  const none = toggle(fresh(), 'knowledge', true, base);
  none.v.knowledge = { serena: false, graphify: false, rebuild: 'manual' };
  assert.ok(texts(none).includes('With no maps, agents find their way by reading files, which costs more tokens on a large repo.'));
});

test('summaries: what each setting comes to, overridden or inherited', () => {
  const d = toggle(fresh(), 'budget', true, base);
  d.v.cap = '150';
  d.v.memMb = '2048';
  const s = summary(d, ctx());
  assert.equal(s.trust, 'Normal: container · 2048 MB');
  assert.equal(s.budget, '$150 a month · alert at 80% · then pause new runs');
  assert.equal(summary(fresh(), ctx()).budget, 'no cap: only each flow’s own budget');
  assert.equal(s.knowledge, 'Serena and graphify, rebuilt when the base branch moves');
  assert.equal(s.escalation, '#flowboard, after 5 min');
});
