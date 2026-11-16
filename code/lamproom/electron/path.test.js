import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fallbackFolders, mergePath, shellPath } from './path.js';

test('mergePath keeps the first of each folder, in order, and drops blanks', () => {
  assert.equal(mergePath(['/a:/b', undefined, '/b::/c', '', '/a'], ':'), '/a:/b:/c');
  assert.equal(mergePath(['C:\\x;C:\\y', 'C:\\x'], ';'), 'C:\\x;C:\\y');
});

test('shellPath reads the PATH a profile sets, not what it prints', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'lr-shell-'));
  const shell = join(dir, 'shell');
  // Called as `shell -ilc <command>`: a profile that greets you and puts a folder on PATH.
  writeFileSync(shell, '#!/bin/sh\necho "welcome back"\nPATH=/from/profile:$PATH; export PATH\nexec /bin/sh -c "$2"\n');
  chmodSync(shell, 0o755);
  assert.match(shellPath('darwin', { SHELL: shell, PATH: '/usr/bin:/bin' }), /^\/from\/profile:\/usr\/bin:\/bin$/);
});

test('shellPath gives nothing, not an error, when the shell will not run', { skip: process.platform === 'win32' }, () => {
  assert.equal(shellPath('darwin', { SHELL: '/no/such/shell' }), '');
});

test('the Windows fallback folders follow ProgramFiles, APPDATA and the home folder', () => {
  const env = { ProgramFiles: 'D:\\Apps', APPDATA: 'C:\\Users\\a\\AppData\\Roaming', ProgramData: 'C:\\ProgramData' };
  const got = fallbackFolders('win32', env, 'C:\\Users\\a');
  for (const want of ['D:\\Apps\\nodejs', 'D:\\Apps\\Git\\cmd', 'D:\\Apps\\GitHub CLI', 'C:\\Users\\a\\.local\\bin', 'C:\\Users\\a\\AppData\\Roaming\\npm'])
    assert.ok(got.includes(want), `${want} in ${got.join(' ; ')}`);
});
