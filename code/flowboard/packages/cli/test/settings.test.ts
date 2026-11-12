import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppSettings, updateAppSettings } from '../src/app-settings.ts';
import { APP_DEFAULTS, OverridesSchema, resolveSettings } from '../src/settings.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-settings-')));
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => (r.ok ? r.value : assert.fail(r.error));

test('app settings: defaults with no file, an edit is kept, a bad value is refused with why', () => {
  const data = temp();
  assert.deepEqual(readAppSettings(data), APP_DEFAULTS);
  value(updateAppSettings(data, { projectsFolder: '~/code', budget: { capUsd: 200, alertAt: 75, onLimit: 'ask' } }));
  assert.equal(readAppSettings(data).projectsFolder, '~/code');
  assert.equal(readAppSettings(data).budget.capUsd, 200);
  assert.equal(readAppSettings(data).trust, 'normal'); // untouched keys keep their defaults
  assert.deepEqual(updateAppSettings(data, { escalation: { channel: 'billing', nudgeMin: 5 } }), { ok: false, status: 400, error: 'a Slack channel, like #billing-alerts' });
  assert.deepEqual(updateAppSettings(data, { projectsFolder: 'code' }), { ok: false, status: 400, error: 'a folder path: absolute, or starting with ~/' });
  value(updateAppSettings(data, { projectsFolder: null }));
  assert.equal(readAppSettings(data).projectsFolder, null);
});

test('precedence: app, then the type, then the project; each value says where it came from', () => {
  const app = { ...APP_DEFAULTS, draft: true };
  const r = resolveSettings(app, 'software', { budget: { capUsd: 150, alertAt: 80, onLimit: 'pause' } });
  assert.deepEqual(r.trust, { value: 'normal', from: 'type' });
  assert.deepEqual(r.knowledge, { value: { serena: true, graphify: true, rebuild: 'push' }, from: 'type' });
  assert.deepEqual(r.budget, { value: { capUsd: 150, alertAt: 80, onLimit: 'pause' }, from: 'project' });
  assert.deepEqual(r.draft, { value: true, from: 'app' });
  assert.deepEqual(resolveSettings(app, 'software', { trust: 'untrusted' }).trust, { value: 'untrusted', from: 'project' });
});

test('overrides: every rule the wizard checks, with its message', () => {
  const bad = (ov: unknown) => OverridesSchema.safeParse(ov).error?.issues[0].message;
  assert.equal(bad({ budget: { capUsd: 0, alertAt: 80, onLimit: 'pause' } }), 'a dollar amount above 0');
  assert.equal(bad({ budget: { capUsd: null, alertAt: 80, onLimit: 'pause' } }), 'a dollar amount above 0');
  assert.equal(bad({ budget: { capUsd: 5, alertAt: 101, onLimit: 'pause' } }), 'alert at 1 to 100 percent');
  assert.equal(bad({ budget: { capUsd: 5, alertAt: 2.5, onLimit: 'pause' } }), 'alert at 1 to 100 percent');
  assert.equal(bad({ escalation: { channel: '#Billing', nudgeMin: 5 } }), 'a Slack channel, like #billing-alerts');
  assert.equal(bad({ escalation: { channel: '#ok', nudgeMin: 121 } }), '1 to 120 minutes');
  assert.ok(bad({ network: ['x'] })); // strict: nothing outside Settings
  assert.ok(bad({ trust: 'root' }));
  assert.equal(OverridesSchema.safeParse({ memory: true, draft: false }).success, true);
});
