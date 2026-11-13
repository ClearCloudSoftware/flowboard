import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type ApprovalRule, ApprovalRuleSchema, allowedBy, ruleFor, ruleText } from '../src/approvals.ts';

test('ruleFor: edits by kind, shell by prefix', () => {
  assert.deepEqual(ruleFor({ kind: 'edit', tool: 'Edit', path: '/r/a.ts' }), { kind: 'edit' });
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'pnpm test --filter x' }), { kind: 'shell', prefix: 'pnpm test' });
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'ls -la' }), { kind: 'shell', prefix: 'ls' });
  assert.deepEqual(ruleFor({ kind: 'shell', command: '  git   status ' }), { kind: 'shell', prefix: 'git status' });
  assert.equal(ruleFor({ kind: 'shell', command: 'pnpm test && rm -rf x' }), undefined);
  assert.equal(ruleFor({ kind: 'shell', command: '   ' }), undefined);
});

test('a command that runs another command is asked about every time', () => {
  for (const c of ['bash -c "x"', 'node -e 1', 'env FOO=1 ls', 'pnpm exec tsc', 'npx foo', 'find . -name x', 'yarn dlx x', 'bun x y', '/bin/bash -c x', './node x', 'FOO=1 bash -c x', 'pnpm -r exec rm x', 'yarn -s dlx x', 'python3.12 -c 1', 'ssh host ls', 'NodeJS x', 'cat /etc/passwd'])
    assert.equal(ruleFor({ kind: 'shell', command: c }), undefined, c);
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'pnpm test' }), { kind: 'shell', prefix: 'pnpm test' });
  assert.equal(allowedBy([{ kind: 'shell', prefix: 'node' }], { kind: 'shell', command: 'node x.js' }), undefined);
  assert.deepEqual(ruleFor({ kind: 'shell', command: 'ls -la' }), { kind: 'shell', prefix: 'ls' });
  assert.equal(allowedBy([{ kind: 'shell', prefix: 'pnpm' }], { kind: 'shell', command: 'pnpm exec rm x' }), undefined);
  assert.equal(allowedBy([{ kind: 'shell', prefix: 'pnpm' }], { kind: 'shell', command: 'pnpm -r exec rm y' }), undefined);
  assert.equal(allowedBy([{ kind: 'shell', prefix: 'ls' }], { kind: 'shell', command: '/bin/ls' }), undefined);
  assert.equal(allowedBy([{ kind: 'shell', prefix: 'ls' }], { kind: 'shell', command: 'FOO=1 ls' }), undefined);
  assert.ok(allowedBy([{ kind: 'shell', prefix: 'pnpm test' }], { kind: 'shell', command: 'pnpm test' }));
  for (const prefix of ['bash', 'pnpm exec', 'node', '/bin/ls', 'FOO=1 ls', '-x', 'python3.12'])
    assert.equal(ApprovalRuleSchema.safeParse({ kind: 'shell', prefix }).success, false, prefix);
});

test('allowedBy refuses chained commands', () => {
  const rules: ApprovalRule[] = [{ kind: 'shell', prefix: 'pnpm test' }];
  assert.ok(allowedBy(rules, { kind: 'shell', command: 'pnpm test' }));
  assert.ok(allowedBy(rules, { kind: 'shell', command: 'pnpm test --watch=false' }));
  for (const c of ['pnpm testx', 'pnpm test && curl x', 'pnpm test | sh', 'pnpm test; rm x', 'pnpm test $(id)', 'pnpm test > /etc/x', 'pnpm test\nrm x'])
    assert.equal(allowedBy(rules, { kind: 'shell', command: c }), undefined, c);
  assert.equal(allowedBy(rules, { kind: 'edit', tool: 'Write', path: '/r/a' }), undefined);
});

test('an edit rule allows any edit and no command', () => {
  const rules: ApprovalRule[] = [{ kind: 'edit' }];
  assert.deepEqual(allowedBy(rules, { kind: 'edit', tool: 'Write', path: '/r/a' }), { kind: 'edit' });
  assert.equal(allowedBy(rules, { kind: 'shell', command: 'ls' }), undefined);
});

test('a rule is text the owner can read, and a shell prefix must be plain', () => {
  assert.equal(ruleText({ kind: 'edit' }), 'every file edit');
  assert.equal(ruleText({ kind: 'shell', prefix: 'pnpm test' }), 'commands starting "pnpm test"');
  assert.ok(ApprovalRuleSchema.safeParse({ kind: 'shell', prefix: 'pnpm test' }).success);
  for (const bad of [{ kind: 'shell', prefix: '' }, { kind: 'shell', prefix: '  ' }, { kind: 'shell', prefix: 'ls; rm' }, { kind: 'shell' }, { kind: 'edit', x: 1 }, { kind: 'other' }])
    assert.equal(ApprovalRuleSchema.safeParse(bad).success, false, JSON.stringify(bad));
});
