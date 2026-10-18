import path from 'node:path';
import type { GuardRules } from './ports/agent-provider.ts';

/** PRD §7's destructive commands. The runner adds the base-branch `git checkout` rule, which needs the branch name. */
export const DEFAULT_DENY_COMMANDS: string[] = [
  String.raw`\bgit\s+push\b`,
  String.raw`\bgit\s+reset\s+--hard\b`,
  String.raw`\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b`,
  // Recursive rm of /, ~ or ..; option words may come before and after the recursive flag (`rm -f -r -- /`).
  String.raw`\brm\s+(?:-\S*\s+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\s+(?:-\S*\s+)*(?:\/|~|\.\.)`,
];

const WRITE_TOOLS: Record<string, string> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

const inside = (root: string, p: string) => {
  const rel = path.relative(root, p);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * Check one tool call against the guard rules. Returns the denial reason the
 * agent sees, or `undefined` to allow.
 */
// ponytail: regex command matching is bypassable (eval, base64, scripts); the sandbox tier is the floor. Symlinks are not resolved.
export function checkToolCall(rules: GuardRules, tool: string, input: unknown, cwd: string): string | undefined {
  const args = (input ?? {}) as Record<string, unknown>;

  const pathKey = WRITE_TOOLS[tool];
  if (pathKey && typeof args[pathKey] === 'string') {
    const p = path.resolve(cwd, args[pathKey]);
    if (!rules.writeRoots.some((root) => inside(root, p))) return `Write outside the worktree: ${p}`;
    const glob = rules.denyPaths?.find((g) => path.matchesGlob(path.relative(cwd, p), g));
    if (glob) return `Path is a non-goal: ${glob}`;
  }

  if (tool === 'Bash' && typeof args.command === 'string') {
    const command = args.command;
    const src = rules.denyCommands?.find((s) => new RegExp(s).test(command));
    if (src) return `Command blocked by policy: ${src}`;
  }

  return undefined;
}
