/**
 * RunSpec -> Claude Agent SDK query input. Pure: the provider supplies the
 * process plumbing in `base`.
 *
 * See docs/FlowBoard/Agent Providers/Claude Code Adapter.md.
 */
import { checkToolCall, renderPrompt } from '@flowboard/core';
import type { RunSpec } from '@flowboard/core';
import type { HookCallback, Options, SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';

export interface QueryBase {
  claudePath: string;
  env: NodeJS.ProcessEnv;
  abortController: AbortController;
  spawnClaudeCodeProcess: (o: SpawnOptions) => SpawnedProcess;
}

/** `spec.model` must already be resolved by the caller. */
export function buildQuery(spec: RunSpec, base: QueryBase): { prompt: string; options: Options } {
  const { invocation, ...parts } = spec.prompt;
  const rest = renderPrompt(parts);
  // The CLI only treats a leading `/` as a slash command, so the skill goes first.
  const prompt = invocation ? `${invocation}\n\n${rest}` : rest;

  // Runs use the installed CLI's own login: an inherited API key would silently switch billing.
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...env } = base.env;

  const packs = spec.capabilities ?? [];
  const append = [
    spec.systemPrompt,
    ...packs.map((p) => (p.mount.kind === 'system_prompt' ? p.mount.text : undefined)),
  ]
    .filter(Boolean)
    .join('\n\n');

  const tools = spec.tools ?? [];
  const allow = spec.toolPolicy?.allow;
  const permissionMode = spec.permissionMode ?? 'dontAsk';

  const options: Options = {
    model: spec.model,
    effort: spec.effort,
    cwd: spec.cwd,
    pathToClaudeCodeExecutable: base.claudePath,
    abortController: base.abortController,
    spawnClaudeCodeProcess: base.spawnClaudeCodeProcess,
    env: { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    settingSources: [],
    strictMcpConfig: true,
    includePartialMessages: true,
    systemPrompt: append ? { type: 'preset', preset: 'claude_code', append } : { type: 'preset', preset: 'claude_code' },
    permissionMode,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
    // Injected tool servers (ask_user) are always pre-approved, or dontAsk would deny every HITL call.
    allowedTools: allow || tools.length ? [...(allow ?? []), ...tools.map((t) => `mcp__${t.name}__*`)] : undefined,
    disallowedTools: spec.toolPolicy?.deny,
    mcpServers: Object.fromEntries(
      tools.map((t) => [t.name, { type: 'stdio' as const, command: t.command, args: t.args, env: t.env }]),
    ),
    plugins: packs.flatMap((p) => (p.mount.kind === 'plugin_dir' ? [{ type: 'local' as const, path: p.mount.path }] : [])),
    resume: spec.resume?.sessionId,
    forkSession: spec.resume?.fork ?? false,
    maxTurns: spec.limits?.maxTurns,
    maxBudgetUsd: spec.limits?.maxBudgetUsd,
  };

  const guards = spec.guards;
  if (guards) {
    const guard: HookCallback = async (input) => {
      if (input.hook_event_name !== 'PreToolUse') return {};
      const reason = checkToolCall(guards, input.tool_name, input.tool_input, spec.cwd);
      return reason
        ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
        : {};
    };
    options.hooks = { PreToolUse: [{ hooks: [guard] }] };
  }

  return { prompt, options };
}
