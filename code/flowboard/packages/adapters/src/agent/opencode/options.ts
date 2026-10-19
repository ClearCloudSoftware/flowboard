/**
 * RunSpec -> what one `opencode serve` run needs: the server's env (with the
 * run's whole config injected), the session's permission rules, and the
 * prompt. Pure: the provider supplies paths and secrets in `base`.
 */
import { pathToFileURL } from 'node:url';
import { renderPrompt } from '@flowboard/core';
import type { Effort, RunSpec } from '@flowboard/core';
import type { Config, PermissionRule } from '@opencode-ai/sdk/v2';
import { NO_TIME_LIMIT_MS } from '../claude/options.ts';
import { rulesToConfig, toPermissionRules } from './permissions.ts';

export interface LaunchBase {
  env: NodeJS.ProcessEnv;
  /** A fresh scratch dir: the server's XDG_CONFIG_HOME, so the owner's ~/.config/opencode stays out. */
  configHome: string;
  password: string;
  /** Absolute path of guard-plugin.ts. */
  guardPlugin: string;
}

export interface OpencodePrompt {
  model: { providerID: string; modelID: string };
  system?: string;
  parts: [{ type: 'text'; text: string }];
}

/** "providerID/modelID", split on the first slash: OpenRouter model ids contain slashes. */
export function splitModel(id: string): { providerID: string; modelID: string } {
  const slash = id.indexOf('/');
  if (slash < 1) throw new Error(`OpenCode model id must be "providerID/modelID", got '${id}'`);
  return { providerID: id.slice(0, slash), modelID: id.slice(slash + 1) };
}

/** Effort maps onto a model variant only when the model offers one of that name. */
export function pickVariant(effort: Effort | undefined, variants: string[]): string | undefined {
  return effort && variants.includes(effort) ? effort : undefined;
}

/** `spec.model` must already be resolved to "providerID/modelID". */
export function buildLaunch(
  spec: RunSpec,
  base: LaunchBase,
): { env: NodeJS.ProcessEnv; config: Config; permission: PermissionRule[]; prompt: OpencodePrompt } {
  const packs = spec.capabilities ?? [];
  const tools = spec.tools ?? [];
  const skills = packs.flatMap((p) => (p.mount.kind === 'plugin_dir' ? [`${p.mount.path}/skills`] : []));

  const permission = toPermissionRules(spec);
  const config: Config = {
    permission: rulesToConfig(permission),
    // A rejected permission ends the turn by default; keep the agent going so it can take another route.
    // A tool call may wait on a human (ask_user) for as long as they take.
    experimental: { continue_loop_on_deny: true, mcp_timeout: NO_TIME_LIMIT_MS },
  };
  if (tools.length) {
    config.mcp = Object.fromEntries(
      tools.map((t) => [
        t.name,
        {
          type: 'local' as const,
          command: [t.command, ...(t.args ?? [])],
          ...(t.env && { environment: t.env }),
          enabled: true,
          timeout: NO_TIME_LIMIT_MS,
        },
      ]),
    );
  }
  if (skills.length) config.skills = { paths: skills };
  if (spec.limits?.maxTurns) {
    // Every agent, so subagents (general, explore) cannot loop past the run's limit.
    const steps = spec.limits.maxTurns;
    config.agent = { build: { steps }, plan: { steps }, general: { steps }, explore: { steps } };
  }
  if (spec.guards) config.plugin = [pathToFileURL(base.guardPlugin).href];
  for (const p of packs) if (p.mount.kind === 'native') Object.assign(config, p.mount.config);

  // OpenCode has no Claude plugin namespace: a "/plugin:slug" invocation becomes an instruction to use the skill.
  const { invocation, ...parts } = spec.prompt;
  const slug = invocation?.replace(/^\//, '').split(':').pop();
  const text = renderPrompt({ ...parts, invocation: slug && `Use the "${slug}" skill.` });

  const system = [spec.systemPrompt, ...packs.map((p) => (p.mount.kind === 'system_prompt' ? p.mount.text : undefined))]
    .filter(Boolean)
    .join('\n\n');

  // OPENCODE_CONFIG / OPENCODE_CONFIG_DIR from the owner's shell would pull extra config into the run.
  const { OPENCODE_CONFIG: _config, OPENCODE_CONFIG_DIR: _configDir, ...inherited } = base.env;
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    XDG_CONFIG_HOME: base.configHome,
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_SERVER_PASSWORD: base.password,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
  };
  if (spec.guards) env.FLOWBOARD_GUARDS = JSON.stringify(spec.guards);

  return {
    env,
    config,
    permission,
    prompt: { model: splitModel(spec.model), ...(system && { system }), parts: [{ type: 'text', text }] },
  };
}
