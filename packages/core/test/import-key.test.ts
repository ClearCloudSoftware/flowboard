import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveImportKey, slugify } from '../src/import-key.ts';

test('slugify lowercases and dashes ASCII', () => {
  assert.equal(slugify('Rotate refresh tokens on every use'), 'rotate-refresh-tokens-on-every-use');
});

test('slugify strips non-ASCII and collapses', () => {
  assert.equal(slugify('日本語 title'), 'title');
  assert.equal(slugify('   —  '), 'untitled');
  assert.equal(slugify('Hello!!! world??'), 'hello-world');
});

test('slugify trims leading and trailing dashes', () => {
  assert.equal(slugify('---hello---'), 'hello');
  assert.equal(slugify('!!!'), 'untitled');
});

test('slugify folds decomposable accents and drops the rest', () => {
  // NFKD-decomposable: é → e, Å → A, á → a
  assert.equal(slugify('Café résumé'), 'cafe-resume');
  assert.equal(slugify('Åland 123'), 'aland-123');
  // Ø has no canonical decomposition in Unicode, so it's dropped — documented behaviour.
  assert.equal(slugify('Ø 123'), '123');
});

test('policy never → always titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('markdown', { upstream: '42', titleSlug: 'fix-login' }, { trust: 'never' }, seen),
    'fix-login',
  );
});

test('policy numeric with integer upstream → sourceId-upstream', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('github', { upstream: '42', titleSlug: 'fix-login' }, { trust: 'numeric' }, seen),
    'github-42',
  );
});

test('policy numeric with non-integer upstream → falls back to titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('github', { upstream: 'abc', titleSlug: 'fix-login' }, { trust: 'numeric' }, seen),
    'fix-login',
  );
});

test('policy numeric with missing upstream → falls back to titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey('github', { titleSlug: 'fix-login' }, { trust: 'numeric' }, seen),
    'fix-login',
  );
});

test('policy prefix with matching key → upstream, sanitised', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey(
      'jira',
      { upstream: 'PROJ-123', titleSlug: 'x' },
      { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ },
      seen,
    ),
    'proj-123',
  );
});

test('policy prefix with non-matching key → falls back to titleSlug', () => {
  const seen = new Set<string>();
  assert.equal(
    deriveImportKey(
      'jira',
      { upstream: 'lowercase-123', titleSlug: 'fix-login' },
      { trust: 'prefix', validPrefix: /^[A-Z][A-Z0-9]+-\d+$/ },
      seen,
    ),
    'fix-login',
  );
});

test('duplicate within batch gets -2 then -3', () => {
  const seen = new Set<string>();
  const a = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  const b = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  const c = deriveImportKey('markdown', { titleSlug: 'same' }, { trust: 'never' }, seen);
  assert.equal(a, 'same');
  assert.equal(b, 'same-2');
  assert.equal(c, 'same-3');
});

test('duplicate across policies counted together', () => {
  // Rare but possible: a github-42 fallback collides with a markdown title "github 42".
  const seen = new Set<string>();
  const a = deriveImportKey('github', { upstream: '42', titleSlug: 'x' }, { trust: 'numeric' }, seen);
  const b = deriveImportKey('markdown', { titleSlug: 'github-42' }, { trust: 'never' }, seen);
  assert.equal(a, 'github-42');
  assert.equal(b, 'github-42-2');
});

test('uses upstream when policy allows and upstream matches (Review Focus #1)', () => {
  // Title edit: same hint.upstream, different titleSlug — key stays the same.
  const seen1 = new Set<string>();
  const first = deriveImportKey('github', { upstream: '42', titleSlug: 'fix-login' }, { trust: 'numeric' }, seen1);
  const seen2 = new Set<string>();
  const second = deriveImportKey(
    'github',
    { upstream: '42', titleSlug: 'fix-the-login-bug' },
    { trust: 'numeric' },
    seen2,
  );
  assert.equal(first, second);
});
