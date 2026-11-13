import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Question } from '@flowboard/core';
import { type ApprovalRule, ApprovalRuleSchema, allowedBy, approver, ruleFor, ruleText } from '../src/approvals.ts';
import { readProjects } from '../src/projects.ts';
import { registerProject } from './fixtures/flow.ts';

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

/** An approver for project p-1 in a temp data folder; `answer` is the owner's choice, `asked` what they were asked. */
function approving(answer: string) {
  const base = mkdtempSync(join(tmpdir(), 'fb-approve-'));
  registerProject(base, join(base, 'proj'), 'trusted');
  const dataDir = join(base, 'data');
  const asked: Question[][] = [];
  const shown: string[] = [];
  const approve = approver({ dataDir, projectId: 'p-1', folder: join(base, 'proj'), step: 'build', show: (l) => shown.push(l), ask: async (qs) => (asked.push(qs), { approve: answer }) });
  return { approve, asked, shown, dataDir, base, signal: new AbortController().signal };
}

test('approver: the owner is asked, and once allows only this call', async () => {
  const a = approving('once');
  assert.equal(await a.approve({ kind: 'edit', tool: 'Write', path: join(a.base, 'proj', 'src', 'a.ts') }, a.signal), true);
  assert.deepEqual(a.asked[0], [{
    id: 'approve',
    kind: 'single_select',
    prompt: 'Edit src/a.ts?',
    options: [{ value: 'once', label: 'Allow' }, { value: 'always', label: 'Allow from now on: every file edit' }, { value: 'deny', label: 'Deny' }],
  }]);
  assert.equal(readProjects(a.dataDir)[0].approvals, undefined);
  assert.deepEqual(a.shown, ['-- build: allowed editing src/a.ts']);
  await a.approve({ kind: 'edit', tool: 'Write', path: '/elsewhere/b.ts' }, a.signal);
  assert.equal(a.asked[1][0].prompt, 'Edit /elsewhere/b.ts?');
});

test('approver: always saves the rule once, and a saved rule skips the question', async () => {
  const a = approving('always');
  const call = { kind: 'shell' as const, command: 'pnpm test --filter x' };
  assert.equal(await a.approve(call, a.signal), true);
  assert.equal(await a.approve({ kind: 'shell', command: 'pnpm test' }, a.signal), true);
  assert.equal(a.asked.length, 1);
  assert.equal(a.asked[0][0].prompt, 'Run pnpm test --filter x?');
  assert.deepEqual(readProjects(a.dataDir)[0].approvals, [{ kind: 'shell', prefix: 'pnpm test' }]);
  assert.deepEqual(a.shown, ['-- build: allowed pnpm test --filter x', '-- build: allowed by a saved rule (commands starting "pnpm test")']);
  // two questions open at once, both answered always: one rule
  const b = approving('always');
  await Promise.all([b.approve(call, b.signal), b.approve(call, b.signal)]);
  assert.deepEqual(readProjects(b.dataDir)[0].approvals, [{ kind: 'shell', prefix: 'pnpm test' }]);
});

test('approver: a command that runs other commands can only be allowed once', async () => {
  const a = approving('always'); // not offered: taken as no
  assert.equal(await a.approve({ kind: 'shell', command: 'pnpm test && rm -rf x' }, a.signal), false);
  const [q] = a.asked[0];
  assert.deepEqual(q.options?.map((o) => o.value), ['once', 'deny']);
  assert.equal(q.help, 'This command can run other commands, so it can only be allowed once.');
  assert.equal(readProjects(a.dataDir)[0].approvals, undefined);
});

test('approver: deny says no', async () => {
  const a = approving('deny');
  assert.equal(await a.approve({ kind: 'shell', command: 'ls' }, a.signal), false);
  assert.deepEqual(a.shown, ['-- build: denied ls']);
});
