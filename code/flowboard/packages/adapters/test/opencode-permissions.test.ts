import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSpec } from '@flowboard/core';
import { replyFor, rulesToConfig, toPermissionRules } from '../src/agent/opencode/permissions.ts';

const base: RunSpec = { prompt: { preamble: '', inputs: [], outputs: [], closing: '' }, model: 'm', cwd: '/repo/wt' };
const REJECT = { reply: 'reject', message: 'Not permitted in this headless run.' };

test('asks by default and allows read-only tools', () => {
  const rules = toPermissionRules(base);
  assert.deepEqual(rules[0], { permission: '*', pattern: '*', action: 'ask' });
  assert.ok(rules.some((r) => r.permission === 'read' && r.action === 'allow'));
  assert.ok(!rules.some((r) => r.permission === 'edit' || r.permission === 'bash'));
});

test('maps the tool policy after the defaults', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { allow: ['Write', 'Bash(pnpm *)'], deny: ['WebFetch'] } });
  const at = (r: object) => rules.findIndex((x) => JSON.stringify(x) === JSON.stringify(r));
  const edit = at({ permission: 'edit', pattern: '*', action: 'allow' });
  const bash = at({ permission: 'bash', pattern: 'pnpm *', action: 'allow' });
  const web = at({ permission: 'webfetch', pattern: '*', action: 'deny' });
  // allow list, then the .env rules, then the deny list (last match wins)
  assert.ok(edit > 0 && bash === edit + 1 && web > bash, JSON.stringify(rules));
  assert.ok(at({ permission: 'read', pattern: '*.env', action: 'ask' }) > bash);
  assert.ok(at({ permission: 'read', pattern: '*.env', action: 'ask' }) < web);
});

test('pre-approves injected tool servers last', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { deny: ['*'] }, tools: [{ name: 'vibe', command: 'node' }] });
  assert.deepEqual(rules.at(-2), { permission: 'vibe_*', pattern: '*', action: 'allow' });
});

test('maps mcp tool globs to OpenCode names', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { allow: ['mcp__vibe__*'] } });
  assert.ok(rules.some((r) => r.permission === 'vibe_*' && r.pattern === '*' && r.action === 'allow'));
});

test('bypassPermissions allows everything but keeps denies', () => {
  const rules = toPermissionRules({ ...base, permissionMode: 'bypassPermissions', toolPolicy: { deny: ['Bash(git push *)'] } });
  assert.deepEqual(rules[0], { permission: '*', pattern: '*', action: 'allow' });
  assert.deepEqual(rules.at(-2), { permission: 'bash', pattern: 'git push *', action: 'deny' });
});

test('replyFor answers by mode', () => {
  assert.deepEqual(replyFor('bypassPermissions', 'bash'), { reply: 'once' });
  assert.deepEqual(replyFor('auto', 'bash'), { reply: 'once' });
  assert.deepEqual(replyFor('acceptEdits', 'edit'), { reply: 'once' });
  assert.deepEqual(replyFor('acceptEdits', 'bash'), REJECT);
  assert.deepEqual(replyFor(undefined, 'edit'), REJECT);
  assert.deepEqual(replyFor('dontAsk', 'read'), REJECT);
});

test('denies the question tool last in every mode', () => {
  const deny = { permission: 'question', pattern: '*', action: 'deny' };
  assert.deepEqual(toPermissionRules({ ...base, toolPolicy: { allow: ['*'] } }).at(-1), deny);
  assert.deepEqual(toPermissionRules({ ...base, permissionMode: 'bypassPermissions' }).at(-1), deny);
});

test('rulesToConfig keeps last-match order', () => {
  assert.deepEqual(
    rulesToConfig([
      { permission: '*', pattern: '*', action: 'ask' },
      { permission: 'read', pattern: '*', action: 'allow' },
      { permission: 'bash', pattern: 'pnpm *', action: 'allow' },
      { permission: 'bash', pattern: 'git push *', action: 'deny' },
      { permission: '*', pattern: '*', action: 'deny' },
    ]),
    // a key whose only pattern is '*' is a plain action: OpenCode's schema requires that for keys like todowrite and question
    { read: 'allow', bash: { 'pnpm *': 'allow', 'git push *': 'deny' }, '*': 'deny' },
  );
  // a repeated key moves to the end, so a later wildcard still wins as it does in the session ruleset
  assert.deepEqual(Object.keys(rulesToConfig([{ permission: '*', pattern: '*', action: 'ask' }, { permission: 'read', pattern: '*', action: 'allow' }])), ['*', 'read']);
});

test('reading .env files asks, .env.example stays allowed', () => {
  const rules = toPermissionRules({ ...base, toolPolicy: { allow: ['Read'], deny: ['Read(secret.env)'] } });
  const i = (p: string, pattern: string) => rules.findIndex((r) => r.permission === p && r.pattern === pattern);
  // after the allow list's read *, so allowing Read does not re-open .env; before the deny list, so it still applies
  const lastReadAll = rules.findLastIndex((r) => r.permission === 'read' && r.pattern === '*');
  assert.ok(lastReadAll < i('read', '*.env'), "after the allow list's read *");
  assert.ok(i('read', '*.env.example') < i('read', 'secret.env'), 'before the deny list');
  assert.equal(rules[i('read', '*.env')].action, 'ask');
  assert.equal(rules[i('read', '*.env.*')].action, 'ask');
  assert.equal(rules[i('read', '*.env.example')].action, 'allow');
  assert.ok(i('read', '*.env.*') < i('read', '*.env.example'), '.env.example wins over *.env.*');
});
