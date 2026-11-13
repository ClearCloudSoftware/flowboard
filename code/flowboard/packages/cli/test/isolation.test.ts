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
  const file = join(realpathSync(mkdtempSync(join(tmpdir(), 'fb-docker-'))), 'docker');
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
  assert.equal(dockerNotReady('flowboard-cli', fakeDocker({})), undefined);
  assert.equal(
    dockerNotReady('flowboard-cli', fakeDocker({ inspect: 1 })),
    'no image flowboard-cli; build it from code/flowboard: docker build -f docker/Dockerfile -t flowboard-cli .',
  );
  assert.equal(dockerNotReady('flowboard-cli', fakeDocker({ info: 1, inspect: 1 })), 'Docker is not running');
  assert.equal(dockerNotReady('flowboard-cli', '/no/such/docker'), 'Docker is not running');
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

test('isolationFor: normal boxes a flow with no sandbox in flowboard-cli, with the credentials its agents need', () => {
  assert.deepEqual(isolationFor('normal', undefined, NEEDS, false), { sandbox: { runtime: 'docker', image: 'flowboard-cli', env: NEEDS }, tier: 'container', approvals: false });
});

test("isolationFor: normal keeps the flow's own sandbox", () => {
  assert.deepEqual(isolationFor('normal', DOCKER, NEEDS, false), { sandbox: DOCKER, tier: 'container', approvals: false });
  assert.deepEqual(isolationFor('normal', OPEN, NEEDS, false), { sandbox: OPEN, tier: 'opensandbox', approvals: false });
});

test("isolationFor: untrusted runs under gVisor, in the flow's image or flowboard-cli", () => {
  assert.deepEqual(isolationFor('untrusted', undefined, NEEDS, true), { sandbox: { runtime: 'docker', image: 'flowboard-cli', env: NEEDS, gvisor: true }, tier: 'gvisor', approvals: false });
  assert.deepEqual(isolationFor('untrusted', DOCKER, NEEDS, true), { sandbox: { ...DOCKER, gvisor: true }, tier: 'gvisor', approvals: false });
});

test("isolationFor: untrusted refuses an OpenSandbox box, which is not gVisor", () => {
  assert.deepEqual(isolationFor('untrusted', OPEN, NEEDS, true), { refused: "Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor" });
});

test('isolationFor: untrusted refuses a machine without gVisor, whatever the flow asks for', () => {
  assert.deepEqual(isolationFor('untrusted', undefined, NEEDS, false), { refused: NO_GVISOR });
  assert.deepEqual(isolationFor('untrusted', DOCKER, NEEDS, false), { refused: NO_GVISOR });
});

test('findProject follows links and owns worktrees', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'fb-find-')));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.flowboard', 'worktrees', 'task-1'), { recursive: true });
  mkdirSync(join(base, 'repo-other'));
  symlinkSync(repo, join(base, 'link'));
  const data = join(base, 'data');
  mkdirSync(data);
  writeFileSync(join(data, 'projects.json'), JSON.stringify([{ id: 'p-1', name: 'repo', slug: 'repo', repoPath: repo, defaultFlow: null, baseBranch: null, createdAt: '', type: 'software', source: { kind: 'local' }, overrides: {} }]));
  assert.equal(findProject(data, repo)?.id, 'p-1');
  assert.equal(findProject(data, join(base, 'link'))?.id, 'p-1');
  assert.equal(findProject(data, join(repo, '.flowboard', 'worktrees', 'task-1'))?.id, 'p-1');
  assert.equal(findProject(data, join(base, 'repo-other')), undefined);
  assert.equal(findProject(data, join(base, 'gone')), undefined);
});
