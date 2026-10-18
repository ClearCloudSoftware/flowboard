/**
 * An OpenCode plugin that enforces `RunSpec.guards` (the `tool_hooks`
 * capability). The adapter lists this file in the run's config `plugin` and
 * puts the rules in the server's FLOWBOARD_GUARDS env. A thrown error blocks
 * the tool call, and the model sees its message.
 *
 * OpenCode loads every exported function of a plugin file as a plugin, so
 * this file exports nothing else.
 */
import { checkToolCall } from '@flowboard/core';
import type { GuardRules } from '@flowboard/core';

const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

export const FlowboardGuard = async ({ directory }: { directory: string }) => {
  const env = process.env.FLOWBOARD_GUARDS;
  const rules: GuardRules | undefined = env ? JSON.parse(env) : undefined;

  return {
    'tool.execute.before': async ({ tool }: { tool: string }, { args }: { args: Record<string, unknown> }) => {
      if (!rules) return;
      const reasons =
        tool === 'write' || tool === 'edit'
          ? [checkToolCall(rules, 'Write', { file_path: args.filePath }, directory)]
          : tool === 'apply_patch'
            ? [...String(args.patchText ?? '').matchAll(PATCH_PATH)].map((m) =>
                checkToolCall(rules, 'Write', { file_path: m[1].trim() }, directory),
              )
            : tool === 'bash'
              ? [checkToolCall(rules, 'Bash', { command: args.command }, directory)]
              : [];
      const reason = reasons.find(Boolean);
      if (reason) throw new Error(reason);
    },
  };
};
