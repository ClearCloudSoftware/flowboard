import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch } from './diff-lines.ts';

test('a patch reads into lines numbered on each side, hunk by hunk', () => {
  const rows = parsePatch('@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n@@ -10,1 +10,2 @@ fn()\n ten\n+eleven\n\\ No newline at end of file\n');
  assert.deepEqual(rows.map((r) => [r.kind, r.old ?? null, r.new ?? null, r.text]), [
    ['hunk', null, null, '@@ -1,3 +1,3 @@'],
    ['ctx', 1, 1, 'one'],
    ['del', 2, null, 'two'],
    ['add', null, 2, 'TWO'],
    ['ctx', 3, 3, 'three'],
    ['hunk', null, null, '@@ -10,1 +10,2 @@ fn()'],
    ['ctx', 10, 10, 'ten'],
    ['add', null, 11, 'eleven'],
    ['note', null, null, 'No newline at end of file'],
  ]);
  assert.deepEqual(parsePatch(''), []);
});
