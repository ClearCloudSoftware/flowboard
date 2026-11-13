import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PreToolUseHookInput, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type { ApprovalCall, RunSpec } from '@flowboard/core';
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

function hookInput(tool_name: string, tool_input: Record<string, unknown>): PreToolUseHookInput {
  return { hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 't', session_id: 's', transcript_path: '', cwd: '/repo/wt' } as PreToolUseHookInput;
}
const signal = new AbortController().signal;

test('approve hook asks for Bash and edits, not reads', async () => {
  const asked: ApprovalCall[] = [];
  const approve = async (c: ApprovalCall) => (asked.push(c), true);
  const cb = buildQuery({ ...spec, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  assert.deepEqual(await cb(hookInput('Bash', { command: 'ls' }), 't', { signal }), {});
  assert.deepEqual(await cb(hookInput('Read', { file_path: '/repo/wt/a' }), 't', { signal }), {});
  assert.deepEqual(await cb(hookInput('Edit', { file_path: '/repo/wt/a' }), 't', { signal }), {});
  assert.deepEqual(await cb(hookInput('NotebookEdit', { notebook_path: '/repo/wt/n.ipynb' }), 't', { signal }), {});
  assert.deepEqual(asked, [
    { kind: 'shell', command: 'ls' },
    { kind: 'edit', tool: 'Edit', path: '/repo/wt/a' },
    { kind: 'edit', tool: 'NotebookEdit', path: '/repo/wt/n.ipynb' },
  ]);
});

test('a denied approval denies the tool', async () => {
  const cb = buildQuery({ ...spec, approve: async () => false }, base).options.hooks!.PreToolUse![0].hooks[0];
  assert.deepEqual(await cb(hookInput('Bash', { command: 'ls' }), 't', { signal }), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'the project owner denied this' },
  });
});

test('a guard deny is not asked', async () => {
  let asked = 0;
  const approve = async () => (asked++, true);
  const cb = buildQuery({ ...spec, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  const out = (await cb(hookInput('Edit', { file_path: '/etc/x' }), 't', { signal })) as { hookSpecificOutput?: { permissionDecision?: string } };
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.equal(asked, 0);
});

test('a rejected approval denies the tool', async () => {
  const approve = async (): Promise<boolean> => { throw new Error('socket closed'); };
  const cb = buildQuery({ ...spec, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  assert.deepEqual(await cb(hookInput('Bash', { command: 'ls' }), 't', { signal }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: "the project owner's approval could not be asked: socket closed",
    },
  });
});

test('an asked tool with no usable target is denied', async () => {
  let asked = 0;
  const approve = async () => (asked++, true);
  const cb = buildQuery({ ...spec, guards: undefined, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  for (const [tool, input] of [['Bash', {}], ['Edit', { file_path: 3 }], ['NotebookEdit', { file_path: '/a' }], ['Monitor', {}]] as const) {
    const out = (await cb(hookInput(tool, input), 't', { signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
    assert.equal(out.hookSpecificOutput?.permissionDecisionReason, 'the project owner denied this', tool);
  }
  assert.equal(asked, 0);
});

test('Monitor is asked as a shell command', async () => {
  const asked: ApprovalCall[] = [];
  const approve = async (c: ApprovalCall) => (asked.push(c), true);
  const cb = buildQuery({ ...spec, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  assert.deepEqual(await cb(hookInput('Monitor', { command: 'tail -f log' }), 't', { signal }), {});
  assert.deepEqual(asked, [{ kind: 'shell', command: 'tail -f log' }]);
});

test('a passing guard still asks; a denied Bash is not asked', async () => {
  const asked: ApprovalCall[] = [];
  const approve = async (c: ApprovalCall) => (asked.push(c), true);
  const cb = buildQuery({ ...spec, approve }, base).options.hooks!.PreToolUse![0].hooks[0];
  assert.deepEqual(await cb(hookInput('Write', { file_path: '/repo/wt/a.ts' }), 't', { signal }), {});
  assert.deepEqual(asked, [{ kind: 'edit', tool: 'Write', path: '/repo/wt/a.ts' }]);
  const out = (await cb(hookInput('Bash', { command: 'rm -rf foo' }), 't', { signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
  assert.equal(out.hookSpecificOutput?.permissionDecisionReason, undefined);
  const moved = (await cb({ ...hookInput('Bash', { command: 'rm -rf foo' }), cwd: '/tmp' }, 't', { signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
  assert.equal(moved.hookSpecificOutput?.permissionDecisionReason, 'Recursive rm outside the worktree: foo');
  assert.equal(asked.length, 2); // the Write and the passing Bash; the denied one never
});

test('registers the hook for approve alone', () => {
  const { options } = buildQuery({ ...spec, guards: undefined, approve: async () => true }, base);
  assert.equal(options.hooks?.PreToolUse?.length, 1);
});

test('tool calls have no time limit', () => {
  const { options } = buildQuery(spec, base);
  assert.equal(options.env?.MCP_TOOL_TIMEOUT, '2147483647');
});
