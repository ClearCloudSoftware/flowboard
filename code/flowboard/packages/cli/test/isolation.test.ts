import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
