import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox } from '../src/flow-config.ts';
import type { Knowledge, Trust } from '../src/settings.ts';
import { doctorNeeds, readSetup, type FlowNeed, type Setup } from '../src/doctor-needs.ts';
import { CHECK_IDS, type DoctorReport, type Probes, runDoctor } from '../src/doctor.ts';

// --- needs --------------------------------------------------------------------------------------------------------

const KN: Knowledge = { serena: true, graphify: true, rebuild: 'push' };
const proj = (name: string, trust: Trust, knowledge = KN) => ({ id: name, name, trust, knowledge });
const flow = (name: string, needs: FlowNeed[], sandbox?: Sandbox) => ({ name, needs, ...(sandbox && { sandbox }) });
const setup = (over: Partial<Setup> = {}): Setup => ({
  projects: [],
  newProject: { trust: 'normal', knowledge: KN },
  flows: [],
  unreadableFlows: [],
  localModelApproved: false,
  agents: { 'claude-code': { path: null, model: null, effort: null }, opencode: { path: null, model: null, effort: null } },
  dataDir: '/data',
  flowsDir: '/flows',
  ...over,
});

test('doctorNeeds: Trusted-only machine needs host CLIs, Docker only for new projects', () => {
  const n = doctorNeeds(setup({ projects: [proj('Scratch', 'trusted')], flows: [flow('a', ['claude'])] }), 'lamproom:cli');
  assert.equal(n.container, 'new');
  assert.equal(n.claude, 'yes');
  assert.equal(n.tokenClaude, 'new');
  assert.deepEqual(n.images, ['lamproom:cli']);
  assert.match(n.why.claude, /Scratch is Trusted/);
  assert.match(n.why.docker, /new projects \(Normal\)/);
});

test('doctorNeeds: Normal project needs Docker, image and token; Untrusted adds gVisor', () => {
  const n = doctorNeeds(setup({ projects: [proj('api', 'normal'), proj('x', 'untrusted')], flows: [flow('a', ['claude'])] }), 'lamproom:cli');
  assert.equal(n.container, 'yes');
  assert.equal(n.tokenClaude, 'yes');
  assert.equal(n.gvisor, 'yes');
  assert.equal(n.claude, 'no');
  assert.match(n.why.docker, /api, x/);
});

test('doctorNeeds: a flow docker sandbox makes Docker needed and adds its image', () => {
  const n = doctorNeeds(
    setup({ newProject: { trust: 'trusted', knowledge: KN }, projects: [proj('s', 'trusted')], flows: [flow('b', [], { runtime: 'docker', image: 'my:img', env: [] })] }),
    'lamproom:cli',
  );
  assert.equal(n.container, 'yes');
  assert.deepEqual(n.images, ['my:img']);
  assert.match(n.why.docker, /flow b runs in my:img/);
});

test('doctorNeeds: opencode follows openrouter/ollama flows; ollama also by an approved local model', () => {
  const n = doctorNeeds(setup({ projects: [proj('s', 'trusted')], flows: [flow('o', ['openrouter'])], localModelApproved: true }));
  assert.equal(n.opencode, 'yes');
  assert.equal(n.openrouter, 'yes');
  assert.equal(n.ollama, 'yes');
  assert.equal(n.claude, 'no');
});

test('doctorNeeds: uv only for a Trusted project with graphify or Serena on', () => {
  assert.equal(doctorNeeds(setup({ projects: [proj('s', 'trusted', { serena: false, graphify: false, rebuild: 'manual' })] })).uv, 'no');
  assert.equal(doctorNeeds(setup({ projects: [proj('s', 'trusted')] })).uv, 'yes');
});

test('doctorNeeds: opensandbox only when a flow uses it, with its images', () => {
  assert.equal(doctorNeeds(setup()).opensandbox, 'no');
  const n = doctorNeeds(setup({ flows: [flow('z', [], { runtime: 'opensandbox', image: 'lamproom:sandbox', egress: [], credentials: [] })] }));
  assert.equal(n.opensandbox, 'yes');
  assert.deepEqual(n.opensandboxImages, ['lamproom:sandbox']);
});

test('readSetup: missing data and flows folders are empty, not errors', () => {
  const s = readSetup('/no/such/data', '/no/such/flows');
  assert.deepEqual(s.projects, []);
  assert.deepEqual(s.flows, []);
  assert.deepEqual(s.unreadableFlows, []);
  assert.equal(s.newProject.trust, 'normal');
});

test('readSetup: a flow that does not load is listed, others still count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lr-doctor-flows-'));
  writeFileSync(join(dir, 'do.md'), 'Do it.\n');
  writeFileSync(join(dir, 'good.yaml'), 'budget_usd: 1\ndefaults: { adapter: claude-code, model: sonnet }\nsteps:\n  one: { prompt: do.md }\n');
  writeFileSync(join(dir, 'bad.yaml'), 'steps: [\n');
  const s = readSetup('/no/such/data', dir);
  assert.deepEqual(s.unreadableFlows, ['bad']);
  assert.deepEqual(
    s.flows.map((f) => [f.name, f.needs]),
    [['good', ['claude']]],
  );
});

test('readSetup: projects come with their resolved trust', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lr-doctor-data-'));
  const base = { slug: 'x', repoPath: '/r', defaultFlow: null, baseBranch: null, createdAt: '2026-11-17T00:00:00Z', source: { kind: 'local' } };
  writeFileSync(join(dir, 'projects.json'), JSON.stringify([{ ...base, id: 'p1', name: 'api', type: 'software', overrides: {} }, { ...base, id: 'p2', name: 'Scratch', type: 'software', overrides: { trust: 'trusted' } }]));
  const s = readSetup(dir, '/no/such/flows');
  assert.deepEqual(
    s.projects.map((p) => [p.name, p.trust]),
    [['api', 'normal'], ['Scratch', 'trusted']],
  );
});

// --- checks and the report ----------------------------------------------------------------------------------------

const pj = (name: string, trust: Trust) => ({
  id: name, name, slug: name, repoPath: `/r/${name}`, defaultFlow: null, baseBranch: null, createdAt: '2026-11-17T00:00:00Z',
  type: 'software', source: { kind: 'local' }, overrides: { trust },
});
/** A data folder holding these projects. */
const data = (projects: ReturnType<typeof pj>[] = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'lr-doctor-data-'));
  writeFileSync(join(dir, 'projects.json'), JSON.stringify(projects));
  return dir;
};
/** A flows folder with one flow `f` whose steps use these agents. */
const flows = (needs: ('claude' | 'openrouter')[] = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'lr-doctor-flows-'));
  if (!needs.length) return dir;
  writeFileSync(join(dir, 'do.md'), 'Do it.\n');
  const steps = needs.map((n, i) => `  s${i}: { prompt: do.md${n === 'openrouter' ? ', adapter: opencode, model: openrouter/qwen/qwen3-coder' : ''} }`);
  writeFileSync(join(dir, 'f.yaml'), `budget_usd: 1\ndefaults: { adapter: claude-code, model: sonnet }\nsteps:\n${steps.join('\n')}\n`);
  return dir;
};
const fakeProbes = (over: Partial<Probes> = {}): Probes => ({
  version: async () => ({ ok: true, version: '1.2.3' }),
  docker: async () => ({ up: true, memoryMb: 7800 }),
  image: async () => ({ created: '2026-11-16T10:00:00Z', sizeBytes: 2_110_000_000 }),
  gvisor: async () => true,
  harness: async (id) => ({ program: id === 'claude-code' ? 'claude' : 'opencode', installed: true, version: '2.3.1', signIn: { ok: true, text: 'logged in' } }),
  openrouter: async () => ({ ok: true, label: 'k', limitUsd: 10, usageUsd: 5.8, remainingUsd: 4.2 }),
  ollama: async () => ({ address: 'http://127.0.0.1:11434', version: '0.12.0', models: [] }),
  gh: async () => ({ state: 'connected', login: 'alex', accounts: ['alex'] }),
  slack: async () => ({ ok: true }),
  reach: async () => true,
  ...over,
});
const byId = (r: DoctorReport, id: string) => r.checks.find((c) => c.id === id)!;

test('runDoctor: every check id, in order, schema 1', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data(), flowsDir: flows(), env: {}, probes: fakeProbes() });
  assert.equal(r.schema, 1);
  assert.deepEqual(r.checks.map((c) => c.id), [...CHECK_IDS]);
  assert.equal(r.runner, 'terminal');
});

test('runDoctor: fresh machine is ready with warnings', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: '/no/such', flowsDir: '/no/such', env: {}, probes: fakeProbes({ docker: async () => ({ up: false, error: 'Docker is not running' }) }) });
  assert.equal(r.summary.ready, true);
  assert.equal(byId(r, 'docker').status, 'warn');
  assert.match(byId(r, 'docker').why, /new projects/);
  assert.equal(byId(r, 'data').status, 'warn');
});

test('runDoctor: needed and broken is fail, ready false', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data([pj('api', 'normal')]), flowsDir: flows(['claude']), env: {}, probes: fakeProbes({ image: async () => null }) });
  assert.equal(byId(r, 'docker.image').status, 'fail');
  assert.equal(byId(r, 'token.claude').status, 'fail');
  assert.match(byId(r, 'docker.image').fix!, /docker build -f docker\/Dockerfile -t lamproom:cli \./);
  assert.match(byId(r, 'token.claude').fix!, /claude setup-token/);
  assert.equal(byId(r, 'docker.image').needed, true);
  assert.equal(r.summary.ready, false);
  assert.equal(r.summary.fail, 2);
});

test('runDoctor: optional broken is warn, never fail', async () => {
  const r = await runDoctor({
    runner: 'terminal', dataDir: data(), flowsDir: flows(), env: {},
    probes: fakeProbes({ gh: async () => ({ state: 'missing' }), harness: async (id) => ({ program: id, installed: false }), ollama: async () => ({ address: 'x', version: null, models: null, error: 'Ollama does not answer' }) }),
  });
  assert.equal(byId(r, 'github').status, 'warn');
  assert.equal(byId(r, 'opencode').status, 'warn');
  assert.match(byId(r, 'opencode').detail, /optional/);
  assert.ok(r.checks.every((c) => c.status !== 'fail'));
});

test('runDoctor: skips with a reason when not needed', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data(), flowsDir: flows(), env: {}, probes: fakeProbes() });
  for (const id of ['docker.gvisor', 'token.claude', 'opensandbox', 'slack', 'openrouter']) {
    assert.equal(byId(r, id).status, 'skip', id);
    assert.ok(byId(r, id).detail, id);
  }
});

test('runDoctor: docker down skips the image and gVisor checks that depend on it', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data([pj('api', 'normal'), pj('x', 'untrusted')]), flowsDir: flows(), env: {}, probes: fakeProbes({ docker: async () => ({ up: false, error: 'Docker is not running' }) }) });
  assert.equal(byId(r, 'docker').status, 'fail');
  assert.match(byId(r, 'docker').fix!, /Start Docker/);
  assert.equal(byId(r, 'docker.image').status, 'skip');
  assert.match(byId(r, 'docker.image').detail, /Docker is not running/);
  assert.equal(byId(r, 'docker.gvisor').status, 'skip');
});

test('runDoctor: docker not installed says install it', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data([pj('api', 'normal')]), flowsDir: flows(), env: {}, probes: fakeProbes({ version: async (b) => (b === 'docker' ? { ok: false, missing: true, error: '' } : { ok: true, version: '1.2.3' }) }) });
  assert.equal(byId(r, 'docker').status, 'fail');
  assert.match(byId(r, 'docker').fix!, /install Docker/i);
});

test('runDoctor: node below 22.18 fails, below 24 warns', async () => {
  const at = async (v: string) => byId(await runDoctor({ runner: 'terminal', dataDir: data(), flowsDir: flows(), env: {}, nodeVersion: v, probes: fakeProbes() }), 'node').status;
  assert.equal(await at('v22.10.0'), 'fail');
  assert.equal(await at('v22.20.0'), 'warn');
  assert.equal(await at('v24.11.1'), 'ok');
});

test('runDoctor: opencode ok when installed even without opencode auth', async () => {
  const r = await runDoctor({
    runner: 'terminal', dataDir: data([pj('s', 'trusted')]), flowsDir: flows(['openrouter']), env: {},
    probes: fakeProbes({ harness: async (id) => ({ program: id, installed: true, version: '1.0', signIn: { ok: false, text: 'no credentials: run opencode auth login in a terminal' } }) }),
  });
  assert.equal(byId(r, 'opencode').status, 'ok');
  assert.match(byId(r, 'opencode').detail, /no credentials/);
});

test('runDoctor: token check notes the terminal', async () => {
  const env = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-abcdef' };
  const r = await runDoctor({ runner: 'terminal', dataDir: data([pj('api', 'normal')]), flowsDir: flows(['claude']), env, probes: fakeProbes() });
  assert.equal(byId(r, 'token.claude').status, 'ok');
  assert.match(byId(r, 'token.claude').detail, /this terminal/);
  assert.doesNotMatch(byId(r, 'token.claude').detail, /abcdef/);
});

test('runDoctor: openrouter shows source, last 4 and credit, never the key', async () => {
  const env = { OPENROUTER_API_KEY: 'sk-or-v1-SECRETSECRET9z9z' };
  const r = await runDoctor({ runner: 'terminal', dataDir: data(), flowsDir: flows(['openrouter']), env, probes: fakeProbes() });
  const c = byId(r, 'openrouter');
  assert.equal(c.status, 'ok');
  assert.match(c.detail, /env key …9z9z, \$4\.20 left/);
  assert.doesNotMatch(JSON.stringify(r), /SECRETSECRET/);
});

test('runDoctor: a corrupt projects.json fails the data check, the rest still report', async () => {
  const dir = data();
  writeFileSync(join(dir, 'projects.json'), '[{');
  const r = await runDoctor({ runner: 'terminal', dataDir: dir, flowsDir: flows(), env: {}, probes: fakeProbes() });
  assert.equal(byId(r, 'data').status, 'fail');
  assert.match(byId(r, 'data').detail, /projects\.json/);
  assert.equal(byId(r, 'git').status, 'ok');
});

test('runDoctor: a hung probe times out, the rest still report', async () => {
  const r = await runDoctor({ runner: 'terminal', dataDir: data([pj('api', 'normal')]), flowsDir: flows(), env: {}, timeoutMs: 50, probes: fakeProbes({ docker: () => new Promise(() => {}) }) });
  assert.equal(byId(r, 'docker').status, 'fail');
  assert.match(byId(r, 'docker').detail, /did not answer/);
  assert.equal(byId(r, 'git').status, 'ok');
});

test('runDoctor: slack with a bot token but no app token warns', async () => {
  const dir = data();
  writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ slackBot: 'xoxb-1234567890' }));
  const r = await runDoctor({ runner: 'terminal', dataDir: dir, flowsDir: flows(), env: {}, probes: fakeProbes() });
  assert.equal(byId(r, 'slack').status, 'warn');
  assert.doesNotMatch(JSON.stringify(r), /xoxb-1234567890/);
});
