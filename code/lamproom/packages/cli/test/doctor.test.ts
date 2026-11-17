import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox } from '../src/flow-config.ts';
import type { Knowledge, Trust } from '../src/settings.ts';
import { doctorNeeds, readSetup, type FlowNeed, type Setup } from '../src/doctor-needs.ts';

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
