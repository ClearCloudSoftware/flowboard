import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PreToolUseHookInput, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type { RunSpec } from '@flowboard/core';
import { buildQuery } from '../src/agent/claude/options.ts';

const spec: RunSpec = {
  prompt: {
    preamble: 'Task: plan the login',
    inputs: [],
    outputs: [{ type: 'plan', path: '/repo/wt/plan.md' }],
    invocation: '/fbecho:echo',
    closing: 'Use ask_user for questions.',
  },
  model: 'sonnet',
  effort: 'high',
  cwd: '/repo/wt',
  toolPolicy: { allow: ['Read'], deny: ['WebFetch'] },
  tools: [{ name: 'vibe', command: 'node', args: ['shim.js'] }],
  capabilities: [
    { id: 'fbecho', provider: 'claude-code', mount: { kind: 'plugin_dir', path: '/plugins/fbecho' } },
    { id: 'terse', provider: 'claude-code', mount: { kind: 'system_prompt', text: 'Be terse.' } },
  ],
  systemPrompt: 'You are the planner.',
  resume: { sessionId: 's1', fork: true },
  limits: { maxTurns: 5, maxBudgetUsd: 2 },
  guards: { writeRoots: ['/repo/wt'] },
};

const base = {
  claudePath: 'claude',
  env: { PATH: '/bin' },
  abortController: new AbortController(),
  spawnClaudeCodeProcess: () => ({}) as SpawnedProcess,
};

test('maps a full RunSpec', () => {
  const { options: o } = buildQuery(spec, base);
  assert.equal(o.model, 'sonnet');
  assert.equal(o.effort, 'high');
  assert.equal(o.cwd, '/repo/wt');
  assert.equal(o.pathToClaudeCodeExecutable, 'claude');
  assert.equal(o.abortController, base.abortController);
  assert.equal(o.spawnClaudeCodeProcess, base.spawnClaudeCodeProcess);
  assert.equal(o.includePartialMessages, true);
  assert.deepEqual(o.allowedTools, ['Read', 'mcp__vibe__*']);
  assert.deepEqual(o.disallowedTools, ['WebFetch']);
  assert.deepEqual(o.mcpServers, { vibe: { type: 'stdio', command: 'node', args: ['shim.js'], env: undefined } });
  assert.deepEqual(o.plugins, [{ type: 'local', path: '/plugins/fbecho' }]);
  assert.deepEqual(o.systemPrompt, { type: 'preset', preset: 'claude_code', append: 'You are the planner.\n\nBe terse.' });
  assert.equal(o.resume, 's1');
  assert.equal(o.forkSession, true);
  assert.equal(o.maxTurns, 5);
  assert.equal(o.maxBudgetUsd, 2);
});

test('puts the skill invocation first', () => {
  const { prompt } = buildQuery(spec, base);
  assert.equal(
    prompt,
    '/fbecho:echo\n\nTask: plan the login\n\nWrite your output to:\n- plan: /repo/wt/plan.md\n\nUse ask_user for questions.',
  );
});

test('strips API keys and isolates config', () => {
  const { options: o } = buildQuery(spec, {
    ...base,
    env: { PATH: '/bin', ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't' },
  });
  assert.deepEqual(o.env, { PATH: '/bin', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', MCP_TOOL_TIMEOUT: '2147483647' });
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.strictMcpConfig, true);
});

test('defaults to dontAsk and only bypass skips permissions', () => {
  const { options: dflt } = buildQuery({ ...spec, permissionMode: undefined }, base);
  assert.equal(dflt.permissionMode, 'dontAsk');
  assert.ok(!dflt.allowDangerouslySkipPermissions);
  const { options: bypass } = buildQuery({ ...spec, permissionMode: 'bypassPermissions' }, base);
  assert.equal(bypass.permissionMode, 'bypassPermissions');
  assert.equal(bypass.allowDangerouslySkipPermissions, true);
});

test('leaves allowedTools unset without an allow list or tools', () => {
  assert.equal(buildQuery({ ...spec, toolPolicy: undefined, tools: undefined }, base).options.allowedTools, undefined);
});

test('pre-approves injected tool servers without an allow list', () => {
  assert.deepEqual(buildQuery({ ...spec, toolPolicy: undefined }, base).options.allowedTools, ['mcp__vibe__*']);
});

test('uses the bare preset without a system prompt', () => {
  const { options: o } = buildQuery({ ...spec, systemPrompt: undefined, capabilities: [] }, base);
  assert.deepEqual(o.systemPrompt, { type: 'preset', preset: 'claude_code' });
});

test('guard hook denies with a reason', async () => {
  const cb = buildQuery(spec, base).options.hooks!.PreToolUse![0].hooks[0];
  const input = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/etc/x' },
    tool_use_id: 't',
    session_id: 's',
    transcript_path: '',
    cwd: '/repo/wt',
  } as PreToolUseHookInput;
  const signal = new AbortController().signal;
  assert.deepEqual(await cb(input, 't', { signal }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Write outside the worktree: /etc/x',
    },
  });
  assert.deepEqual(await cb({ ...input, tool_input: { file_path: '/repo/wt/a.ts' } }, 't', { signal }), {});
  // A cd persists between Bash calls: the hook's cwd says where the shell is now.
  const bash = { ...input, tool_name: 'Bash', tool_input: { command: 'rm -rf foo' } };
  assert.deepEqual(await cb(bash, 't', { signal }), {});
  const moved = (await cb({ ...bash, cwd: '/tmp' }, 't', { signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
  assert.equal(moved.hookSpecificOutput?.permissionDecisionReason, 'Recursive rm outside the worktree: foo');
});

test('registers no hooks without guards', () => {
  assert.equal(buildQuery({ ...spec, guards: undefined }, base).options.hooks, undefined);
});

test('tool calls have no time limit', () => {
  const { options } = buildQuery(spec, base);
  assert.equal(options.env?.MCP_TOOL_TIMEOUT, '2147483647');
});
