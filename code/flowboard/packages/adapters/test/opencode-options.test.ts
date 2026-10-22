import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSpec } from '@flowboard/core';
import { buildLaunch, pickVariant, splitModel } from '../src/agent/opencode/options.ts';
import { rulesToConfig } from '../src/agent/opencode/permissions.ts';

const spec: RunSpec = {
  prompt: {
    preamble: 'Task: plan the login',
    inputs: [],
    outputs: [{ type: 'plan', path: '/repo/wt/plan.md' }],
    invocation: '/fbecho:echo',
    closing: 'Use ask_user for questions.',
  },
  model: 'openrouter/openai/gpt-4.1-mini',
  cwd: '/repo/wt',
  tools: [{ name: 'vibe', command: 'node', args: ['shim.js'] }],
  capabilities: [
    { id: 'fbecho', provider: 'opencode', mount: { kind: 'plugin_dir', path: '/plugins/fbecho' } },
    { id: 'terse', provider: 'opencode', mount: { kind: 'system_prompt', text: 'Be terse.' } },
  ],
  systemPrompt: 'You are the planner.',
  limits: { maxTurns: 5 },
  guards: { writeRoots: ['/repo/wt'] },
};

const base = {
  env: { PATH: '/bin', XDG_DATA_HOME: '/home/x/.local/share', OPENCODE_CONFIG: '/home/x/extra.json', OPENCODE_CONFIG_DIR: '/home/x/oc' },
  configHome: '/tmp/fb-oc-cfg',
  password: 'pw',
  guardPlugin: '/abs/guard-plugin.ts',
};

test('splits the model on the first slash', () => {
  assert.deepEqual(splitModel('openrouter/openai/gpt-4.1-mini'), { providerID: 'openrouter', modelID: 'openai/gpt-4.1-mini' });
  assert.throws(() => splitModel('haiku'));
});

test('isolates the server and injects the config', () => {
  const out = buildLaunch(spec, base);
  const { env } = out;
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/fb-oc-cfg');
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  assert.equal(env.OPENCODE_DISABLE_CLAUDE_CODE, '1');
  assert.equal(env.OPENCODE_DISABLE_AUTOUPDATE, '1');
  assert.equal(env.OPENCODE_SERVER_PASSWORD, 'pw');
  assert.equal(env.XDG_DATA_HOME, '/home/x/.local/share'); // credentials and sessions untouched
  assert.deepEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT!), out.config);
  assert.deepEqual(JSON.parse(env.FLOWBOARD_GUARDS!), { writeRoots: ['/repo/wt'] });
});

test('maps tools, skills, turns and guards into config', () => {
  const { config } = buildLaunch(spec, base);
  assert.deepEqual(config.mcp, { vibe: { type: 'local', command: ['node', 'shim.js'], enabled: true, timeout: 2147483647 } });
  assert.deepEqual(config.skills, { paths: ['/plugins/fbecho/skills'] });
  assert.deepEqual(config.agent, { build: { steps: 5 }, plan: { steps: 5 }, general: { steps: 5 }, explore: { steps: 5 } });
  assert.deepEqual(config.plugin, ['file:///abs/guard-plugin.ts']);
});

test("merges native packs under the adapter's own settings", () => {
  const pack = { instructions: ['RULES.md'], permission: { '*': 'allow' }, plugin: ['file:///evil.ts'], mcp: {}, agent: {}, experimental: {} };
  const { config, permission } = buildLaunch(
    { ...spec, capabilities: [{ id: 'n', provider: 'opencode', mount: { kind: 'native', config: pack } }] },
    base,
  );
  assert.deepEqual(config.instructions, ['RULES.md']);
  // A pack cannot drop the permission rules, the guard plugin, ask_user, the step limits or the MCP no-timeout.
  assert.deepEqual(config.permission, rulesToConfig(permission));
  assert.deepEqual(config.plugin, ['file:///abs/guard-plugin.ts']);
  assert.ok(config.mcp?.vibe);
  assert.equal((config.agent as Record<string, { steps?: number }>).build.steps, 5);
  assert.equal(config.experimental?.mcp_timeout, 2147483647);
});

test('renders the skill invocation as an instruction', () => {
  const { prompt } = buildLaunch(spec, base);
  assert.deepEqual(prompt.model, { providerID: 'openrouter', modelID: 'openai/gpt-4.1-mini' });
  assert.equal(
    prompt.parts[0].text,
    'Task: plan the login\n\nWrite your output to:\n- plan: /repo/wt/plan.md\n\nUse the "echo" skill.\n\nUse ask_user for questions.',
  );
});

test('passes effort as a variant only when the model has it', () => {
  assert.equal(pickVariant('high', ['low', 'high']), 'high');
  assert.equal(pickVariant('max', ['high']), undefined);
  assert.equal(pickVariant(undefined, ['high']), undefined);
});

test('joins system prompts and omits guards when unset', () => {
  const out = buildLaunch({ ...spec, guards: undefined }, base);
  assert.equal(out.prompt.system, 'You are the planner.\n\nBe terse.');
  assert.equal(out.config.plugin, undefined);
  assert.equal(out.env.FLOWBOARD_GUARDS, undefined);
});

test('omits the system prompt and empty config sections when unset', () => {
  const out = buildLaunch({ ...spec, systemPrompt: undefined, capabilities: [], tools: [], limits: undefined }, base);
  assert.equal(out.prompt.system, undefined);
  assert.deepEqual(Object.keys(out.config).sort(), ['experimental', 'permission', 'plugin']);
});

test('applies the run policy to every agent, subagents included', () => {
  const out = buildLaunch(spec, base);
  assert.deepEqual(out.config.permission, rulesToConfig(out.permission));
  assert.deepEqual(out.config.experimental, { continue_loop_on_deny: true, mcp_timeout: 2147483647 });
});

test("keeps the owner's OpenCode settings and Anthropic key out, but not OpenCode's credentials", () => {
  const owner = {
    ...base.env,
    OPENCODE_PERMISSION: '{"bash":"allow"}',
    OPENCODE_AUTO_SHARE: '1',
    OPENCODE_SERVER_USERNAME: 'me',
    OPENCODE_ENABLE_QUESTION_TOOL: '1',
    OPENCODE_EXPERIMENTAL: '1',
    ANTHROPIC_API_KEY: 'sk-ant',
    ANTHROPIC_AUTH_TOKEN: 'tok',
    OPENCODE_API_KEY: 'zen',
    OPENCODE_AUTH_CONTENT: '{}',
  };
  const { env } = buildLaunch(spec, { ...base, env: owner });
  for (const k of ['OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR', 'OPENCODE_PERMISSION', 'OPENCODE_AUTO_SHARE', 'OPENCODE_SERVER_USERNAME', 'OPENCODE_ENABLE_QUESTION_TOOL', 'OPENCODE_EXPERIMENTAL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) {
    assert.equal(env[k], undefined, k);
  }
  assert.equal(env.OPENCODE_API_KEY, 'zen');
  assert.equal(env.OPENCODE_AUTH_CONTENT, '{}');
  assert.equal(env.PATH, '/bin');
});

test('tool calls have no time limit', () => {
  const { config } = buildLaunch(spec, base);
  assert.equal((config.mcp?.vibe as { timeout?: number }).timeout, 2147483647);
  assert.equal(config.experimental?.mcp_timeout, 2147483647);
  assert.equal(config.experimental?.continue_loop_on_deny, true);
});

test('the step limit applies to every agent', () => {
  const { config } = buildLaunch(spec, base); // spec.limits.maxTurns === 5
  for (const a of ['build', 'plan', 'general', 'explore']) {
    assert.equal((config.agent as Record<string, { steps?: number }>)[a]?.steps, 5, a);
  }
});
