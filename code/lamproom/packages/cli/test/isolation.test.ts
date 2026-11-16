import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox } from '../src/flow-config.ts';
import { findProject, isolationFor } from '../src/isolation.ts';
import { dockerHasGvisor, dockerNotReady } from '../src/project.ts';

/** A stand-in `docker`: an executable that prints `runtimes` for `info`, and exits `info`/`inspect` as told. */
function fakeDocker(o: { runtimes?: string; info?: number; inspect?: number }): string {
  const file = join(realpathSync(mkdtempSync(join(tmpdir(), 'lr-docker-'))), 'docker');
  writeFileSync(file, `#!/bin/sh\ncase "$1" in\n  info) echo '${o.runtimes ?? '{}'}'; exit ${o.info ?? 0};;\n  image) exit ${o.inspect ?? 0};;\nesac\n`);
  chmodSync(file, 0o755);
  return file;
}

test('dockerHasGvisor: true when docker lists the runsc runtime', () => {
  assert.equal(dockerHasGvisor(fakeDocker({ runtimes: '{"runc":{},"runsc":{}}' })), true);
  assert.equal(dockerHasGvisor(fakeDocker({ runtimes: '{"runc":{}}' })), false);
  assert.equal(dockerHasGvisor(fakeDocker({ runtimes: '{"runsc":{}}', info: 1 })), false);
  assert.equal(dockerHasGvisor('/no/such/docker'), false);
});

test('dockerNotReady: undefined when the image is there; else says what is missing', () => {
  assert.equal(dockerNotReady('lamproom:cli', fakeDocker({})), undefined);
  assert.equal(
    dockerNotReady('lamproom:cli', fakeDocker({ inspect: 1 })),
    'no image lamproom:cli; build it from code/lamproom: docker build -f docker/Dockerfile -t lamproom:cli .',
  );
  assert.equal(dockerNotReady('lamproom:cli', fakeDocker({ info: 1, inspect: 1 })), 'Docker is not running');
  assert.equal(dockerNotReady('lamproom:cli', '/no/such/docker'), 'Docker is not running');
});

const NO_GVISOR = 'Untrusted runs need gVisor, and this machine\'s Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor';
const DOCKER: Sandbox = { runtime: 'docker', image: 'my-image', env: ['X'] };
const OPEN: Sandbox = { runtime: 'opensandbox', image: 'box', egress: [], credentials: [] };
const NEEDS = ['CLAUDE_CODE_OAUTH_TOKEN'];

test('isolationFor: trusted runs on this machine with approvals, or in the flow\'s sandbox without', () => {
  assert.deepEqual(isolationFor('trusted', undefined, NEEDS, false), { tier: 'host', approvals: true });
  assert.deepEqual(isolationFor('trusted', DOCKER, NEEDS, false), { sandbox: DOCKER, tier: 'container', approvals: false });
  assert.deepEqual(isolationFor('trusted', OPEN, NEEDS, false), { sandbox: OPEN, tier: 'opensandbox', approvals: false });
});

test('isolationFor: normal boxes a flow with no sandbox in lamproom:cli, with the credentials its agents need', () => {
  assert.deepEqual(isolationFor('normal', undefined, NEEDS, false), { sandbox: { runtime: 'docker', image: 'lamproom:cli', env: NEEDS }, tier: 'container', approvals: false });
});

test("isolationFor: normal keeps the flow's own sandbox", () => {
  assert.deepEqual(isolationFor('normal', DOCKER, NEEDS, false), { sandbox: DOCKER, tier: 'container', approvals: false });
  assert.deepEqual(isolationFor('normal', OPEN, NEEDS, false), { sandbox: OPEN, tier: 'opensandbox', approvals: false });
});

test("isolationFor: untrusted runs under gVisor, in the flow's image or lamproom:cli", () => {
  assert.deepEqual(isolationFor('untrusted', undefined, NEEDS, true), { sandbox: { runtime: 'docker', image: 'lamproom:cli', env: NEEDS, gvisor: true }, tier: 'gvisor', approvals: false });
  // the flow's image, but never its sandbox.env: only what the agents need
  assert.deepEqual(isolationFor('untrusted', DOCKER, NEEDS, true), { sandbox: { ...DOCKER, env: NEEDS, gvisor: true }, tier: 'gvisor', approvals: false });
});

test("isolationFor: untrusted refuses an OpenSandbox box, which is not gVisor", () => {
  assert.deepEqual(isolationFor('untrusted', OPEN, NEEDS, true), { refused: "Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor" });
});

test('isolationFor: untrusted refuses a machine without gVisor, whatever the flow asks for', () => {
  assert.deepEqual(isolationFor('untrusted', undefined, NEEDS, false), { refused: NO_GVISOR });
  assert.deepEqual(isolationFor('untrusted', DOCKER, NEEDS, false), { refused: NO_GVISOR });
});

test('isolationFor: a sandbox runtime neither docker nor opensandbox is refused at every trust', () => {
  const odd = { runtime: 'x', image: 'i', egress: [], credentials: [] } as unknown as Sandbox;
  for (const trust of ['trusted', 'normal', 'untrusted'] as const) {
    assert.deepEqual(isolationFor(trust, odd, NEEDS, true), { refused: 'sandbox: no runtime x; a run works in docker or opensandbox' }, trust);
  }
});

test('findProject follows links and owns worktrees', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lr-find-')));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.lamproom', 'worktrees', 'task-1'), { recursive: true });
  mkdirSync(join(base, 'repo-other'));
  symlinkSync(repo, join(base, 'link'));
  const data = join(base, 'data');
  mkdirSync(data);
  writeFileSync(join(data, 'projects.json'), JSON.stringify([{ id: 'p-1', name: 'repo', slug: 'repo', repoPath: repo, defaultFlow: null, baseBranch: null, createdAt: '', type: 'software', source: { kind: 'local' }, overrides: {} }]));
  assert.equal(findProject(data, repo)?.id, 'p-1');
  assert.equal(findProject(data, join(base, 'link'))?.id, 'p-1');
  assert.equal(findProject(data, join(repo, '.lamproom', 'worktrees', 'task-1'))?.id, 'p-1');
  assert.equal(findProject(data, join(base, 'repo-other')), undefined);
  assert.equal(findProject(data, join(base, 'gone')), undefined);
});

test('findProject: a repo inside another is its own project, whichever was registered first', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lr-find-')));
  const inner = join(base, 'outer', 'vendor', 'inner');
  mkdirSync(inner, { recursive: true });
  const data = join(base, 'data');
  mkdirSync(data);
  const p = (id: string, repoPath: string) => ({ id, name: id, slug: id, repoPath, defaultFlow: null, baseBranch: null, createdAt: '', type: 'software', source: { kind: 'local' }, overrides: {} });
  writeFileSync(join(data, 'projects.json'), JSON.stringify([p('outer', join(base, 'outer')), p('inner', inner)]));
  assert.equal(findProject(data, inner)?.id, 'inner');
  assert.equal(findProject(data, join(base, 'outer', 'vendor'))?.id, 'outer');
});

test("a project's network hosts join an OpenSandbox box's egress, once each; a docker box has none to join", () => {
  const box = { runtime: 'opensandbox' as const, image: 'i', egress: ['api.anthropic.com', 'pypi.org'], credentials: [] };
  const r = isolationFor('normal', box, [], false, ['pypi.org', 'registry.npmjs.org']);
  assert.ok(!('refused' in r));
  assert.deepEqual(r.sandbox, { ...box, egress: ['api.anthropic.com', 'pypi.org', 'registry.npmjs.org'] });
  const d = isolationFor('normal', undefined, [], false, ['pypi.org']);
  assert.ok(!('refused' in d) && d.sandbox?.runtime === 'docker' && !('egress' in d.sandbox));
});

test('the box image is LAMPROOM_IMAGE when set, else lamproom:cli', (t) => {
  const was = process.env.LAMPROOM_IMAGE;
  t.after(() => (was === undefined ? delete process.env.LAMPROOM_IMAGE : (process.env.LAMPROOM_IMAGE = was)));
  delete process.env.LAMPROOM_IMAGE;
  assert.deepEqual(isolationFor('normal', undefined, [], false), { sandbox: { runtime: 'docker', image: 'lamproom:cli', env: [] }, tier: 'container', approvals: false });
  process.env.LAMPROOM_IMAGE = 'lamproom:cli-knowledge';
  assert.equal((isolationFor('normal', undefined, [], false) as { sandbox: Sandbox }).sandbox.image, 'lamproom:cli-knowledge');
});
