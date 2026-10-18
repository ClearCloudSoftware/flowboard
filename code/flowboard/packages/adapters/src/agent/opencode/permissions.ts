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
const ENV_FILES: PermissionRule[] = [
  { permission: 'read', pattern: '*.env', action: 'ask' },
  { permission: 'read', pattern: '*.env.*', action: 'ask' },
  { permission: 'read', pattern: '*.env.example', action: 'allow' },
];

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
  const allows = (spec.toolPolicy?.allow ?? []).map((e): PermissionRule => ({ ...parse(e), action: 'allow' }));
  return [
    ...base,
    // OpenCode's own default: ask before reading .env files (a headless run refuses the ask unless the mode
    // answers everything). After the plain allows, so allowing Read does not re-open them; before the specific
    // ones, so an explicit Read(.env) still does.
    ...allows.filter((r) => r.pattern === '*'),
    ...ENV_FILES,
    ...allows.filter((r) => r.pattern !== '*'),
    ...(spec.toolPolicy?.deny ?? []).map((e): PermissionRule => ({ ...parse(e), action: 'deny' })),
    // Injected tool servers (ask_user) are always allowed, so no policy can lock out HITL.
    ...(spec.tools ?? []).map((t): PermissionRule => ({ permission: `${t.name}_*`, pattern: '*', action: 'allow' })),
    // OpenCode's own `question` tool blocks until someone answers it; a headless run asks through ask_user instead.
    // A final deny hides the tool from the model entirely.
    { permission: 'question', pattern: '*', action: 'deny' },
  ];
}

/**
 * The same rules as config `permission`, which OpenCode applies to every agent, subagents included
 * (a child session only inherits its parent session's deny rules). Config is a key-ordered object,
 * so a repeated key moves to the end to keep the session ruleset's last-match order.
 */
// ponytail: approximate when a key's patterns interleave with other keys' rules; exact for the rules toPermissionRules emits.
export function rulesToConfig(
  rules: PermissionRule[],
): Record<string, PermissionRule['action'] | Record<string, PermissionRule['action']>> {
  const byKey: Record<string, Record<string, PermissionRule['action']>> = {};
  for (const { permission, pattern, action } of rules) {
    const patterns = byKey[permission] ?? {};
    delete byKey[permission];
    delete patterns[pattern];
    byKey[permission] = { ...patterns, [pattern]: action };
  }
  // A key whose only pattern is '*' becomes a plain action: some keys (todowrite, question) accept nothing else.
  return Object.fromEntries(
    Object.entries(byKey).map(([key, patterns]) => {
      const entries = Object.entries(patterns);
      return [key, entries.length === 1 && entries[0][0] === '*' ? entries[0][1] : patterns];
    }),
  );
}

export function replyFor(
  mode: PermissionMode | undefined,
  permission: string,
): { reply: 'once' } | { reply: 'reject'; message: string } {
  const allow = mode === 'bypassPermissions' || mode === 'auto' || (mode === 'acceptEdits' && permission === 'edit');
  return allow ? { reply: 'once' } : { reply: 'reject', message: REJECT_MESSAGE };
}
