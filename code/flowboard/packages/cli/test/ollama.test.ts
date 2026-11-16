import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppSettings, updateAppSettings } from '../src/app-settings.ts';
import { loadFlow } from '../src/flow-config.ts';
import { modelRules, prepareRun } from '../src/models.ts';
import { ollamaAddress, ollamaConfig, readOllamaList, refreshOllama, toOllamaModels } from '../src/ollama.ts';
import { type ApprovedModel, CONTEXT_FLOOR, contextWarning, modelProblem, modelWarning, type OllamaModel } from '../src/settings.ts';
import { DELIVERY, flowProject, RUN_IN } from './fixtures/flow.ts';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'fb-ollama-')));
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => (r.ok ? r.value : assert.fail(r.error));
const GEMMA = 'ollama/gemma4:26b-64k';
const local = (id: string): ApprovedModel => ({ id, free: true, price: { in: 0, out: 0 }, approvedAt: '2026-11-15T00:00:00.000Z', local: true });
const model = (name: string, context: number | null): OllamaModel => ({ id: `ollama/${name}`, name, free: true, price: { in: 0, out: 0 }, local: true, context, contextFrom: context ? 'num_ctx' : null, maxContext: 262144, size: 1 });

/** Ollama 0.40's answers, as this machine gave them on 2026-11-13, plus a cloud model. */
const TAGS = {
  models: [
    { name: 'gemma4:26b-64k', size: 17989350764, capabilities: ['completion', 'vision', 'tools', 'thinking'], details: { context_length: 262144 } },
    { name: 'qwen3-coder:30b', size: 18556700761, capabilities: ['completion', 'tools'], details: { context_length: 262144 } },
    { name: 'nomic-embed-text:latest', size: 274302450, capabilities: ['embedding'], details: { context_length: 2048 } },
    { name: 'gemma4:cloud', size: 400, capabilities: ['completion', 'tools'], details: {} },
    { name: 'gpt-oss:120b-cloud', size: 400, capabilities: ['completion', 'tools'], details: {} },
    { name: 'mirror:latest', size: 400, remote_host: 'https://ollama.com:443', remote_model: 'mirror', capabilities: ['completion', 'tools'], details: {} },
    { name: 'small:4k', size: 1000, details: {} }, // capabilities only in /api/show, as before Ollama put them in tags
  ],
};
const SHOWS = {
  'gemma4:26b-64k': { parameters: 'num_ctx                        65536\ntemperature                    1' },
  'qwen3-coder:30b': { parameters: 'top_p                          0.8\ntemperature                    0.7' },
  'small:4k': { parameters: 'num_ctx 4096', capabilities: ['completion', 'tools'], model_info: { 'llama.context_length': 8192 } },
};

test('the list: local, tool-capable models only; the window from num_ctx, else OLLAMA_CONTEXT_LENGTH, else loaded, else unknown', () => {
  const list = toOllamaModels(TAGS, SHOWS, { models: [] });
  assert.deepEqual(list.map((m) => m.id), [GEMMA, 'ollama/qwen3-coder:30b', 'ollama/small:4k']); // no embedding, no cloud
  assert.deepEqual(list[0], { id: GEMMA, name: 'gemma4:26b-64k', free: true, price: { in: 0, out: 0 }, local: true, context: 65536, contextFrom: 'num_ctx', maxContext: 262144, size: 17989350764 });
  assert.deepEqual([list[1].context, list[1].contextFrom], [null, null]); // Ollama's own default: unknown
  assert.equal(list[2].maxContext, 8192); // from /api/show when tags lack it

  const env = toOllamaModels(TAGS, SHOWS, {}, '40960');
  assert.deepEqual([env[1].context, env[1].contextFrom], [40960, 'OLLAMA_CONTEXT_LENGTH']);
  assert.equal(env[0].context, 65536); // num_ctx wins over the server's setting

  const loaded = toOllamaModels(TAGS, SHOWS, { models: [{ name: 'qwen3-coder:30b', context_length: 262144 }] });
  assert.deepEqual([loaded[1].context, loaded[1].contextFrom], [262144, 'loaded']);
  assert.throws(() => toOllamaModels({ error: 'x' }, {}, {}), /no model list/);
});

test('OLLAMA_HOST is read as the ollama CLI reads it, and refused off this machine', () => {
  const url = (h?: string) => {
    const a = ollamaAddress(h === undefined ? {} : { OLLAMA_HOST: h });
    return 'error' in a ? a.error : a.url;
  };
  assert.equal(url(), 'http://127.0.0.1:11434');
  assert.equal(url(''), 'http://127.0.0.1:11434');
  assert.equal(url('localhost'), 'http://localhost:11434');
  assert.equal(url('127.0.0.1:1234'), 'http://127.0.0.1:1234');
  assert.equal(url(':8080'), 'http://127.0.0.1:8080');
  assert.equal(url('http://localhost'), 'http://localhost:80');
  assert.equal(url('[::1]:9000'), 'http://[::1]:9000');
  assert.equal(url('::1'), 'http://[::1]:11434');
  for (const h of ['0.0.0.0', '0.0.0.0:11434', '192.168.1.5', 'gpu-box.local:11434', 'https://ollama.com'])
    assert.match(url(h), /^OLLAMA_HOST is .+, which is not this machine; FlowBoard uses only Ollama on this machine/, h);
});

test('a step on a local model: refused when not approved, no longer pulled, or when Ollama does not answer', () => {
  const approved = [local(GEMMA)];
  const models = [model('gemma4:26b-64k', 65536)];
  assert.match(modelProblem('ollama/qwen3-coder:30b', approved, null, { models }) ?? '', /is not an approved model/);
  assert.equal(modelProblem(GEMMA, approved, null, { models }), undefined);
  assert.equal(modelProblem(GEMMA, approved, null, { models: [] }), `${GEMMA} is no longer in Ollama; pick another model`);
  assert.equal(modelProblem(GEMMA, approved, null, { models: null }), undefined); // never listed: only the approval counts
  const down = 'Ollama does not answer on http://127.0.0.1:11434; start it, then run again';
  assert.equal(modelProblem(GEMMA, approved, null, { models: null, down }), down);
});

test('a small known window warns; a large or unknown one does not; a local model gets no privacy warning', () => {
  const approved = [local(GEMMA), local('ollama/small:4k'), local('ollama/qwen3-coder:30b')];
  const models = [model('gemma4:26b-64k', 65536), model('small:4k', 4096), model('qwen3-coder:30b', null), model('edge:32k', CONTEXT_FLOOR)];
  const warn = (id: string) => modelWarning(id, approved, null, { models });
  assert.equal(warn('ollama/small:4k'), 'ollama/small:4k runs with a 4,096-token window, which an agent can outgrow; set num_ctx on the model, or OLLAMA_CONTEXT_LENGTH');
  assert.equal(warn(GEMMA), undefined);
  assert.equal(warn('ollama/qwen3-coder:30b'), undefined); // Ollama's default: unknown, so no warning (decided 2026-11-15)
  assert.equal(warn('ollama/edge:32k'), undefined); // at the floor is enough
  assert.equal(contextWarning('x', 1000).includes('1,000-token'), true);
});

test("OpenCode's provider for a local model: Ollama's own address here, the box's name for this machine in a sandbox", () => {
  const list = [model('gemma4:26b-64k', 65536), { ...model('qwen3-coder:30b', null) }];
  const provider = (cfg: Record<string, unknown>) => (cfg as { provider: { ollama: { npm: string; options: { baseURL: string }; models: Record<string, unknown> } } }).provider.ollama;
  const here = provider(ollamaConfig(GEMMA, list, {}));
  assert.equal(here.npm, '@ai-sdk/openai-compatible');
  assert.equal(here.options.baseURL, 'http://127.0.0.1:11434/v1');
  assert.deepEqual(here.models, { 'gemma4:26b-64k': { name: 'gemma4:26b-64k', limit: { context: 65536, output: 8192 } } }); // the step's model only
  assert.equal(provider(ollamaConfig(GEMMA, list, { OLLAMA_HOST: '127.0.0.1:9999' }, 'host.docker.internal')).options.baseURL, 'http://host.docker.internal:9999/v1');
  // An unknown window plans for the model's maximum; a model not listed gets no limit at all.
  assert.deepEqual(provider(ollamaConfig('ollama/qwen3-coder:30b', list, {})).models, { 'qwen3-coder:30b': { name: 'qwen3-coder:30b', limit: { context: 262144, output: 8192 } } });
  assert.deepEqual(provider(ollamaConfig('ollama/other:1b', null, {})).models, { 'other:1b': { name: 'other:1b' } });
  assert.throws(() => ollamaConfig(GEMMA, list, { OLLAMA_HOST: '10.0.0.2' }), /not this machine/);
});

/** A fetch that answers Ollama's endpoints from `routes`, path → JSON; a path not in it is refused like a closed port. */
const ollama = (routes: Record<string, unknown>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const key = path === '/api/show' ? `/api/show ${JSON.parse(String(init?.body)).model}` : path;
    if (!(key in routes)) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
const ROUTES = { '/api/version': { version: '0.40.16' }, '/api/tags': TAGS, '/api/ps': { models: [] }, ...Object.fromEntries(Object.entries(SHOWS).map(([k, v]) => [`/api/show ${k}`, v])) };

test('asking Ollama: the list is kept for the designer; not answering is a reason, and refuses every local step at run start', async () => {
  const data = temp();
  const up = await refreshOllama(data, {}, ollama(ROUTES));
  assert.equal(up.version, '0.40.16');
  assert.deepEqual(up.models?.map((m) => m.id), readOllamaList(data)?.map((m) => m.id));
  const down = await refreshOllama(data, {}, ollama({}));
  assert.deepEqual(down, { address: 'http://127.0.0.1:11434', version: null, models: null, error: 'Ollama does not answer on http://127.0.0.1:11434; start it, then run again' });
  assert.equal(readOllamaList(data)?.length, 3); // the last good list stays

  value(updateAppSettings(data, { opencodeModels: [local(GEMMA)] }));
  assert.equal(modelRules(data).problem(GEMMA), undefined); // the designer's check: the saved list, no fetch
  assert.equal(modelRules(data, down).problem(GEMMA), down.error);
  const refused = await refreshOllama(data, { OLLAMA_HOST: '0.0.0.0' }, ollama(ROUTES));
  assert.match(refused.error ?? '', /not this machine/);
});

test('run start asks Ollama only when a local model is approved', async () => {
  const data = temp();
  const lines: string[] = [];
  const saved = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = '127.0.0.1:9'; // nothing listens on the discard port
  try {
    value(updateAppSettings(data, { opencodeModels: [local(GEMMA)] }));
    const rules = await prepareRun(data, (l) => lines.push(l));
    assert.match(rules.problem(GEMMA) ?? '', /^Ollama does not answer on http:\/\/127\.0\.0\.1:9/);
    assert.deepEqual(lines, []); // and no OpenRouter fetch, so no warning about one
  } finally {
    if (saved === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = saved;
  }
});

test('an approved model saved before local models existed still reads; an ollama/ id is accepted', () => {
  const data = temp();
  const old = { id: 'openrouter/deepseek/deepseek-v4.1-flash', free: false, price: { in: 0.1, out: 0.4 }, approvedAt: '2026-11-13T00:00:00.000Z' };
  writeFileSync(join(data, 'settings.json'), JSON.stringify({ opencodeModels: [old] }));
  assert.deepEqual(readAppSettings(data).opencodeModels, [old]);
  assert.deepEqual(value(updateAppSettings(data, { opencodeModels: [old, local(GEMMA)] })).opencodeModels, [old, local(GEMMA)]);
  const bad = updateAppSettings(data, { opencodeModels: [{ ...local(GEMMA), id: 'llama/x' }] });
  assert.ok(!bad.ok && /an OpenRouter or Ollama model/.test(bad.error), JSON.stringify(bad));
});

test("a flow's local step: warned of a small window in the check; in OpenSandbox its box may reach this machine, with no credential", () => {
  const yaml = DELIVERY.replace('openrouter/deepseek/deepseek-v4.1-flash', 'ollama/small:4k');
  const data = temp();
  value(updateAppSettings(data, { opencodeModels: [local('ollama/small:4k')] }));
  writeFileSync(join(data, 'ollama-models.json'), JSON.stringify({ models: [model('small:4k', 4096)] }));
  const r = loadFlow('flow.yaml', flowProject(yaml), RUN_IN, undefined, modelRules(data));
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(r.config.warnings, [`steps.tests.model: ${contextWarning('ollama/small:4k', 4096)}`]);

  const boxed = loadFlow('flow.yaml', flowProject(`sandbox: { runtime: opensandbox, image: flowboard-sandbox }\n${yaml}`));
  assert.ok(boxed.ok, JSON.stringify(boxed));
  assert.deepEqual(boxed.config.sandbox, { runtime: 'opensandbox', image: 'flowboard-sandbox', egress: ['api.anthropic.com', 'host.docker.internal'], credentials: ['CLAUDE_CODE_OAUTH_TOKEN'] });
});
