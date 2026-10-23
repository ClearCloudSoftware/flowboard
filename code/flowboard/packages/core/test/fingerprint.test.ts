import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../src/flow/fingerprint.ts';

test('noise does not change the fingerprint', () => {
  assert.equal(fingerprint('FAIL rotates token (12ms)\nat /Users/a/p/src/t.ts:3:5'), fingerprint('FAIL rotates token (340ms)\nat /home/ci/x/src/t.ts:9:1'));
  assert.equal(fingerprint('commit a3f9c2e1 broke it'), fingerprint('commit 77be01d9 broke it'));
  assert.equal(fingerprint('2026-10-19T10:00:00Z boom'), fingerprint('2026-11-02T23:59:59Z boom'));
  assert.equal(fingerprint(['changed', ...Array(20).fill('same')].join('\n')), fingerprint(['other', ...Array(20).fill('same')].join('\n')));
  assert.equal(fingerprint('run 0b9f2c1e-4d3a-4e5f-9a8b-7c6d5e4f3a2b failed'), fingerprint('run deadbeef-abcd-4bcd-8bcd-fedcbafedcba failed'));
  assert.equal(fingerprint('Mon Oct 19 10:00:01 UTC 2026: boom'), fingerprint('Tue Nov 20 09:59:59 UTC 2026: boom'));
  assert.equal(fingerprint('timed out after 980ms'), fingerprint('timed out after 1.02s'));
});

test('a different failure changes it', () => {
  assert.notEqual(fingerprint('FAIL rotates token\nFAIL revokes old token'), fingerprint('FAIL revokes old token'));
  assert.notEqual(fingerprint('at /p/src/a.ts'), fingerprint('at /p/src/b.ts'));
  assert.match(fingerprint('x'), /^[0-9a-f]{64}$/);
});
