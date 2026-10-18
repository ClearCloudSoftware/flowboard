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
  assert.deepEqual(config.mcp, { vibe: { type: 'local', command: ['node', 'shim.js'], enabled: true } });
  assert.deepEqual(config.skills, { paths: ['/plugins/fbecho/skills'] });
  assert.deepEqual(config.agent, { build: { steps: 5 } });
  assert.deepEqual(config.plugin, ['file:///abs/guard-plugin.ts']);
});

test('merges native packs last', () => {
  const { config } = buildLaunch(
    { ...spec, capabilities: [{ id: 'n', provider: 'opencode', mount: { kind: 'native', config: { instructions: ['RULES.md'] } } }] },
    base,
  );
  assert.deepEqual(config.instructions, ['RULES.md']);
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
  assert.deepEqual(out.config.experimental, { continue_loop_on_deny: true });
});

test("keeps the owner's extra OpenCode config out", () => {
  const { env } = buildLaunch(spec, base);
  assert.equal(env.OPENCODE_CONFIG, undefined);
  assert.equal(env.OPENCODE_CONFIG_DIR, undefined);
});
