/**
 * RunSpec tool policy and permission mode -> OpenCode permission rules, plus
 * the adapter's answer to each `permission.asked` (OpenCode waits forever on
 * an unanswered one).
 */
import type { PermissionMode, RunSpec } from '@flowboard/core';
import type { PermissionRule } from '@opencode-ai/sdk/v2';

/** Claude tool names (FlowBoard's tool-policy vocabulary) -> OpenCode permission keys. Unknown names are lowercased. */
export const TOOL_NAMES: Record<string, string> = {
  Read: 'read',
  Write: 'edit',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'list',
  WebFetch: 'webfetch',
  WebSearch: 'websearch',
  Task: 'task',
  Skill: 'skill',
  TodoWrite: 'todowrite',
};

const READ_ONLY = ['read', 'glob', 'grep', 'list', 'todowrite', 'skill', 'question', 'lsp'];
const REJECT_MESSAGE = 'Not permitted in this headless run.';

/** `Name`, `Name(pattern)` or `mcp__server__tool` -> an OpenCode permission and pattern. */
function parse(entry: string): { permission: string; pattern: string } {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(entry);
  if (mcp) return { permission: `${mcp[1]}_${mcp[2]}`, pattern: '*' };
  const call = /^([^(]+)\((.*)\)$/.exec(entry);
  const [name, pattern] = call ? [call[1], call[2]] : [entry, '*'];
  return { permission: TOOL_NAMES[name] ?? name.toLowerCase(), pattern };
}

/** Ordered rules; OpenCode applies the last match. */
export function toPermissionRules(spec: RunSpec): PermissionRule[] {
  const base: PermissionRule[] =
    spec.permissionMode === 'bypassPermissions'
      ? [{ permission: '*', pattern: '*', action: 'allow' }]
      : [
          { permission: '*', pattern: '*', action: 'ask' },
          ...READ_ONLY.map((permission): PermissionRule => ({ permission, pattern: '*', action: 'allow' })),
        ];
  return [
    ...base,
    ...(spec.toolPolicy?.allow ?? []).map((e): PermissionRule => ({ ...parse(e), action: 'allow' })),
    ...(spec.toolPolicy?.deny ?? []).map((e): PermissionRule => ({ ...parse(e), action: 'deny' })),
    // Injected tool servers (ask_user) are always allowed, so no policy can lock out HITL.
    ...(spec.tools ?? []).map((t): PermissionRule => ({ permission: `${t.name}_*`, pattern: '*', action: 'allow' })),
  ];
}

export function replyFor(
  mode: PermissionMode | undefined,
  permission: string,
): { reply: 'once' } | { reply: 'reject'; message: string } {
  const allow = mode === 'bypassPermissions' || mode === 'auto' || (mode === 'acceptEdits' && permission === 'edit');
  return allow ? { reply: 'once' } : { reply: 'reject', message: REJECT_MESSAGE };
}
