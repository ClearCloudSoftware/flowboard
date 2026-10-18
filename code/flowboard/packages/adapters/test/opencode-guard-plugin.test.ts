import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlowboardGuard } from '../src/agent/opencode/guard-plugin.ts';

beforeEach(() => {
  process.env.FLOWBOARD_GUARDS = JSON.stringify({ writeRoots: ['/repo/wt'], denyCommands: ['\\bgit\\s+push\\b'] });
});

const before = async () => (await FlowboardGuard({ directory: '/repo/wt' }))['tool.execute.before'];

test('blocks a write outside the worktree', async () => {
  const hook = await before();
  await assert.rejects(hook({ tool: 'write' }, { args: { filePath: '/etc/x' } }), /Write outside the worktree: \/etc\/x/);
  await hook({ tool: 'edit' }, { args: { filePath: '/repo/wt/a.ts' } });
});

test('checks every path in an apply_patch', async () => {
  const hook = await before();
  const patchText = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** Add File: /etc/evil\n+x\n*** End Patch';
  await assert.rejects(hook({ tool: 'apply_patch' }, { args: { patchText } }), /Write outside the worktree: \/etc\/evil/);
  await hook({ tool: 'apply_patch' }, { args: { patchText: '*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch' } });
});

test('blocks a denied command', async () => {
  const hook = await before();
  await assert.rejects(hook({ tool: 'bash' }, { args: { command: 'git push origin main' } }), /Command blocked by policy/);
  await hook({ tool: 'bash' }, { args: { command: 'pnpm test' } });
});

test('is a no-op without FLOWBOARD_GUARDS', async () => {
  delete process.env.FLOWBOARD_GUARDS;
  const hook = await before();
  await hook({ tool: 'write' }, { args: { filePath: '/etc/x' } });
});

test('marks itself loaded in the run config home', async () => {
  const home = mkdtempSync(join(tmpdir(), 'fbtest-'));
  process.env.XDG_CONFIG_HOME = home;
  await FlowboardGuard({ directory: '/repo/wt' });
  assert.ok(existsSync(join(home, 'flowboard-guard.loaded')));
});
