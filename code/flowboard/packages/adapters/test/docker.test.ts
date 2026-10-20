import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { dockerArgs, dockerExecHost } from '../src/exec/docker.ts';

const PROFILE = { tier: 'container' as const, image: 'alpine:latest', egressAllow: [] };
const noDocker = spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0 && 'docker is not running';

test('dockerArgs: offline, no capabilities, non-root, cwd at the same path, env by name only', () => {
  const a = dockerArgs({ ...PROFILE, limits: { memoryMb: 512 } }, 'sh', ['-c', 'x'], '/w', ['TOKEN']).join(' ');
  for (const part of ['--network none', '--cap-drop ALL', 'no-new-privileges', '--read-only', '--user 1000:1000', '--memory 512m', '-v /w:/w -w /w', '-e TOKEN --entrypoint sh alpine:latest -c x']) {
    assert.ok(a.includes(part), part);
  }
  assert.ok(!dockerArgs({ ...PROFILE, nonRoot: false }, 'sh', [], '/w', []).includes('--user'));
});

test('dockerArgs refuses an egress allowlist: there is no proxy to enforce it', () => {
  assert.throws(() => dockerArgs({ ...PROFILE, egressAllow: ['api.anthropic.com'] }, 'sh', [], '/w', []), /egress proxy/);
  assert.throws(() => dockerArgs({ ...PROFILE, image: undefined }, 'sh', [], '/w', []), /no image/);
});

/** stdout and exit code of one spawn. */
function done(child: ChildProcessWithoutNullStreams): Promise<{ out: string; code: number | null }> {
  child.stdin.end();
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  return new Promise((r) => child.on('close', (code) => r({ out, code })));
}

test('a container sees the folder, runs as 1000, has no network, and gets only the env the caller added', { skip: noDocker }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fb-docker-')));
  writeFileSync(join(dir, 'f.txt'), 'hello');
  const host = dockerExecHost(PROFILE);
  const script = 'cat f.txt; echo; id -u; echo "[$ADDED][$PATH_FROM_HOST]"; wget -q -T 3 -O- http://example.com >/dev/null 2>&1 && echo online || echo offline';
  const { out, code } = await done(host.spawn('sh', ['-c', script], { cwd: dir, env: { ...process.env, ADDED: 'yes' } }));
  assert.equal(code, 0, out);
  assert.deepEqual(out.trim().split('\n'), ['hello', '1000', '[yes][]', 'offline']);
});

test('killing the docker client stops the container and what it started', { skip: noDocker }, async () => {
  const child = dockerExecHost(PROFILE).spawn('sh', ['-c', `sleep 300 & sleep 300`], { cwd: tmpdir() });
  const ended = done(child);
  await new Promise((r) => setTimeout(r, 1500));
  child.kill('SIGTERM');
  const { code } = await ended;
  assert.notEqual(code, 0);
  await new Promise((r) => setTimeout(r, 1000));
  const left = spawnSync('docker', ['ps', '-q', '--filter', 'ancestor=alpine:latest', '--filter', 'status=running'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(left, '', 'containers still running');
});
