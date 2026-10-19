import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../src/flow/fingerprint.ts';

test('noise does not change the fingerprint', () => {
  assert.equal(fingerprint('FAIL rotates token (12ms)\nat /Users/a/p/src/t.ts:3:5'), fingerprint('FAIL rotates token (340ms)\nat /home/ci/x/src/t.ts:9:1'));
  assert.equal(fingerprint('commit a3f9c2e1 broke it'), fingerprint('commit 77be01d9 broke it'));
  assert.equal(fingerprint('2026-10-19T10:00:00Z boom'), fingerprint('2026-11-02T23:59:59Z boom'));
  assert.equal(fingerprint(['changed', ...Array(20).fill('same')].join('\n')), fingerprint(['other', ...Array(20).fill('same')].join('\n')));
});

test('a different failure changes it', () => {
  assert.notEqual(fingerprint('FAIL rotates token\nFAIL revokes old token'), fingerprint('FAIL revokes old token'));
  assert.notEqual(fingerprint('at /p/src/a.ts'), fingerprint('at /p/src/b.ts'));
  assert.match(fingerprint('x'), /^[0-9a-f]{64}$/);
});
