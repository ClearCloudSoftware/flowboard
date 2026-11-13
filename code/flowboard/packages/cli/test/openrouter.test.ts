import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateAppSettings } from '../src/app-settings.ts';
import { loadFlow } from '../src/flow-config.ts';
import { keyView, modelRules, readCatalogue, refreshCatalogue, removeKey, saveKey, savedKey, toCatalogue, applySavedKey } from '../src/openrouter.ts';
import { type ApprovedModel, type Catalogue, FREE_WARNING, modelProblem } from '../src/settings.ts';
import { DELIVERY, flowProject, RUN_IN } from './fixtures/flow.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-openrouter-')));
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => (r.ok ? r.value : assert.fail(r.error));
const KEY = `sk-or-v1-${'a'.repeat(60)}beef`;
const FLASH = 'openrouter/deepseek/deepseek-v4.1-flash';
const approve = (id: string, free: boolean, price = { in: 0.1, out: 0.4 }): ApprovedModel => ({ id, free, price, approvedAt: '2026-11-13T00:00:00.000Z' });
const listed = (id: string, price: { in: number; out: number }) => ({ id, name: id, free: price.in === 0 && price.out === 0, price, context: null });

test("OpenRouter's /models: prices per token become dollars per million, free is 0 and 0, a router with no price is left out", () => {
  const c = toCatalogue({
    data: [
      { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek', context_length: 1000, pricing: { prompt: '0.0000001', completion: '0.0000004' } },
      { id: 'nvidia/nemotron:free', name: 'Nemotron', pricing: { prompt: '0', completion: '0' } },
      { id: 'openrouter/auto', name: 'Auto', pricing: { prompt: '-1', completion: '-1' } },
    ],
  }, new Date('2026-11-13T00:00:00Z'));
  assert.deepEqual(c, {
    fetchedAt: '2026-11-13T00:00:00.000Z',
    models: [
      { id: FLASH, name: 'DeepSeek', free: false, price: { in: 0.1, out: 0.4 }, context: 1000 },
      { id: 'openrouter/nvidia/nemotron:free', name: 'Nemotron', free: true, price: { in: 0, out: 0 }, context: null },
    ],
  });
  assert.throws(() => toCatalogue({ error: 'x' }), /no model list/);
});

test('a step may run on a model only when approved, still listed, and no dearer than when approved', () => {
  const approved = [approve(FLASH, false), approve('openrouter/gone/model', false)];
  const catalogue: Catalogue = { fetchedAt: '', models: [listed(FLASH, { in: 0.1, out: 0.4 })] };
  assert.equal(modelProblem(FLASH, approved, catalogue), undefined);
  assert.equal(modelProblem('openrouter/x/y', approved, catalogue), 'openrouter/x/y is not an approved model; approve it in Settings → Agents → OpenCode models');
  assert.equal(modelProblem('openrouter/gone/model', approved, catalogue), 'openrouter/gone/model is no longer listed by OpenRouter; pick another model');
  assert.equal(modelProblem('openrouter/gone/model', approved, null), undefined); // no list yet: the approval alone
  const dearer: Catalogue = { fetchedAt: '', models: [listed(FLASH, { in: 0.1, out: 0.6 })] };
  assert.equal(modelProblem(FLASH, approved, dearer), `${FLASH} costs more than when you approved it (output $0.4 → $0.6 per million tokens); approve it again in Settings → Agents → OpenCode models`);
  const cheaper: Catalogue = { fetchedAt: '', models: [listed(FLASH, { in: 0.05, out: 0.4 })] };
  assert.equal(modelProblem(FLASH, approved, cheaper), undefined);
});

test('the key: saved owner-only and never shown, an exported one wins, a bad one is refused', () => {
  const data = temp();
  assert.deepEqual(keyView(data, {}), { source: null, last4: null });
  assert.deepEqual(saveKey(data, 'hunter2'), { ok: false, error: 'not an OpenRouter key: they start with sk-or-' });
  assert.deepEqual(saveKey(data, `  ${KEY}\n`), { ok: true });
  assert.equal(savedKey(data), KEY);
  if (process.platform !== 'win32') assert.equal(statSync(join(data, 'secrets.json')).mode & 0o777, 0o600);
  assert.deepEqual(keyView(data, {}), { source: 'saved', last4: 'beef' });
  assert.deepEqual(keyView(data, { OPENROUTER_API_KEY: 'sk-or-exported1234' }), { source: 'env', last4: '1234' });
  const env: NodeJS.ProcessEnv = {};
  applySavedKey(data, env);
  assert.equal(env.OPENROUTER_API_KEY, KEY);
  const exported: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: 'mine' };
  applySavedKey(data, exported);
  assert.equal(exported.OPENROUTER_API_KEY, 'mine');
  // the settings file, which the pages read, never holds it
  value(updateAppSettings(data, { draft: true }));
  assert.ok(!readFileSync(join(data, 'settings.json'), 'utf8').includes('sk-or-'));
  removeKey(data);
  assert.equal(savedKey(data), undefined);
});
test('the model list is fetched when stale, kept when fresh, and the saved one serves when OpenRouter cannot be reached', async () => {
  const data = temp();
  let calls = 0;
  const answer = (body: unknown, status = 200) => (async () => (calls++, new Response(JSON.stringify(body), { status }))) as typeof fetch;
  const LIST = { data: [{ id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek', pricing: { prompt: '0.0000001', completion: '0.0000004' } }] };
  const t0 = new Date('2026-11-13T10:00:00Z');
  assert.equal((await refreshCatalogue(data, 3_600_000, answer(LIST), t0)).catalogue?.models.length, 1);
  assert.equal(readCatalogue(data)?.fetchedAt, t0.toISOString());
  await refreshCatalogue(data, 3_600_000, answer(LIST), new Date('2026-11-13T10:30:00Z'));
  assert.equal(calls, 1); // fresh: not fetched
  const down = await refreshCatalogue(data, 0, answer({}, 503), new Date('2026-11-13T12:00:00Z'));
  assert.equal(down.catalogue?.fetchedAt, t0.toISOString());
  assert.equal(down.error, "could not fetch OpenRouter's models: OpenRouter answered 503");
});

test("a flow's opencode step: refused on a model not approved, run with a warning on an approved free one", () => {
  const data = temp();
  const base = flowProject(DELIVERY); // its tests step runs on opencode, FLASH
  const errors = (r: ReturnType<typeof loadFlow>) => (r.ok ? [] : r.errors);
  assert.deepEqual(errors(loadFlow('flow.yaml', base, RUN_IN, undefined, modelRules(data))), [
    `flow.yaml: steps.tests.model: ${FLASH} is not an approved model; approve it in Settings → Agents → OpenCode models`,
  ]);
  value(updateAppSettings(data, { opencodeModels: [approve(FLASH, false)] }));
  const paid = loadFlow('flow.yaml', base, RUN_IN, undefined, modelRules(data));
  assert.ok(paid.ok, JSON.stringify(paid));
  assert.deepEqual(paid.config.warnings, []);
  value(updateAppSettings(data, { opencodeModels: [approve(FLASH, true, { in: 0, out: 0 })] }));
  const free = loadFlow('flow.yaml', base, RUN_IN, undefined, modelRules(data));
  assert.ok(free.ok, JSON.stringify(free));
  assert.deepEqual(free.config.warnings, [`steps.tests.model: ${FLASH} is ${FREE_WARNING}`]);
});
