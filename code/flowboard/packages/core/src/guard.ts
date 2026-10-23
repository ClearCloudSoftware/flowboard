import { readlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { GuardRules } from './ports/agent-provider.ts';

/** `git`, then any global options (`-C dir`, `-c k=v`, `--no-pager`) before its subcommand: a regex source. */
export const GIT = String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+`;

/**
 * PRD §7's destructive commands. The runner adds the base-branch `git checkout` rule, which needs the branch name.
 * A recursive `rm` is not here: it is checked against `writeRoots`, so it needs no list.
 */
export const DEFAULT_DENY_COMMANDS: string[] = [
  String.raw`${GIT}push\b`,
  String.raw`${GIT}reset\b[^;&|\n]*\s--hard\b`,
  String.raw`\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b`,
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

/** Where a write to `p` lands: links followed (a dangling one too), a missing tail kept as written. */
function landing(p: string, hops = 0): string {
  try {
    return realpathSync(p);
  } catch {}
  if (hops < 40) {
    try {
      return landing(path.resolve(path.dirname(p), readlinkSync(p)), hops + 1);
    } catch {}
  }
  const parent = path.dirname(p);
  return parent === p ? p : path.join(landing(parent, hops), path.basename(p));
}

/**
 * path.matchesGlob has no `dot` option, so its `*` and `**` skip names that start with a dot. Try again with a
 * NUL before each such name, in the path and in the glob: any wildcard matches it, and literals still line up.
 */
const nul = (s: string) => s.replace(/(^|\/)\./g, '$1\0.');
/** macOS and Windows disks ignore case, but matchesGlob ignores it only in wildcard parts: fold both sides there. */
const fold = process.platform === 'darwin' || process.platform === 'win32' ? (s: string) => s.toLowerCase() : (s: string) => s;
const matchesGlob = (rel: string, glob: string) => {
  const [r, g] = [fold(rel), fold(glob)];
  return path.matchesGlob(r, g) || path.matchesGlob(nul(r), nul(g));
};

const RM = /^\\?(?:\S*\/)?rm$/;
/** Words that may come before a command in its position: `if cd x`, `then cd x`. */
const LEADS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'command', 'builtin']);
/** A word the shell rewrites before rm sees it: $VAR, `cmd`, {a..b}, \x. */
const EXPANDS = /[$`{\\]/;

/** `a{b,c}d` -> `abd`, `acd`; any other brace is left for the shell (and refused). */
const braces = (t: string): string[] => {
  const m = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/.exec(t);
  return m ? m[2].split(',').flatMap((x) => braces(m[1] + x + m[3])) : [t];
};

/** Why a recursive `rm` in `command` reaches outside the roots, or targets a root itself; undefined if none does. */
// ponytail: words split on ; & | ( ) and newlines, quotes stripped, a literal cd followed; a script, eval or
// find -delete still gets around it.
function rmReason(command: string, roots: string[], cwd: string): string | undefined {
  // Join line continuations; find's `\;` ends an -exec, not the command.
  const text = command.replace(/\\\r?\n/g, ' ').replace(/\\;/g, ' ');
  // `cmd` runs too; $( ) is split below.
  const parts = [...text.split(/[;&|()\n]/), ...[...text.matchAll(/`([^`]*)`/g)].map((m) => m[1])];
  let here: string | undefined = cwd; // where the shell is; undefined after a cd the guard cannot follow
  for (const part of parts) {
    const words = part.trim().split(/\s+/).map((w) => w.replace(/^['"]+|['"]+$/g, ''));
    const cd = words.findIndex((w) => w === 'cd' || w === 'pushd');
    if (cd !== -1 && words.slice(0, cd).every((w) => LEADS.has(w))) {
      const to = words[cd + 1];
      // A bare cd goes home; an option (`-P`, `-`), $VAR or ~ is beyond the guard.
      here = here === undefined || !to || to.startsWith('-') || EXPANDS.test(to) || to.startsWith('~') ? undefined : path.resolve(here, to);
      continue;
    }
    const at = words.findIndex((w) => RM.test(w));
    if (at === -1 || words.slice(0, at).includes('git')) continue; // git rm stays inside its repository
    let recursive = false;
    let options = true;
    let redirect = false;
    const targets: string[] = [];
    for (const w of words.slice(at + 1)) {
      // A redirection (`> f`, `2>/dev/null`) is not an operand, nor is the file after a bare operator.
      if (redirect) redirect = false;
      else if (/^\d*[<>]/.test(w)) redirect = /^\d*[<>]+$/.test(w);
      else if (options && w === '--') options = false;
      else if (options && w.startsWith('-')) recursive ||= w === '--recursive' || /^-[a-zA-Z]*[rR]/.test(w);
      else if (w) targets.push(w);
    }
    if (!recursive) continue;
    if (words.slice(0, at).includes('xargs')) return 'Recursive rm through xargs: its paths come from stdin; use find … -exec rm -rf {} +';
    // find … -exec rm -rf {} +: the targets lie under find's starting points (`.` when it names none).
    const find = words.indexOf('find');
    const after = find !== -1 && find < at ? words.slice(find + 1, at) : undefined;
    const stop = after?.findIndex((w) => /^[-(!\\]/.test(w)) ?? -1;
    const starts = after && (stop === -1 ? after : after.slice(0, stop));
    for (const t of targets.flatMap((t) => (t === '{}' && starts ? (starts.length ? starts : ['.']) : braces(t)))) {
      // $VAR, `cmd`, {1..3}, \x and ~ expand in the shell; a dot glob such as .* can expand to ..
      if (EXPANDS.test(t) || t.startsWith('~') || /(^|\/)\.[^/]*[*?[]/.test(t)) return `Recursive rm of a path the shell expands: ${t}`;
      if (here === undefined && !path.isAbsolute(t)) return `Recursive rm after a cd the guard cannot follow: ${t}`;
      const abs = path.resolve(here ?? '/', t);
      // rm removes a link itself; only a trailing slash sends it into the link's target.
      const real = t.endsWith('/') ? landing(abs) : path.join(landing(path.dirname(abs)), path.basename(abs));
      // rm refuses a path ending in `.`, so `.` is not "the root itself".
      if (!roots.some((root) => inside(root, real) && (real !== root || path.basename(t) === '.'))) {
        return `Recursive rm outside the worktree: ${t}`;
      }
    }
  }
  return undefined;
}

/**
 * Check one tool call against the guard rules. Returns the denial reason the
 * agent sees, or `undefined` to allow. `cwd` is the run's folder: relative
 * write paths and `denyPaths` are taken from it. `shellCwd` is where a shell
 * command runs when that moved (Claude's `cd` persists between calls; OpenCode's
 * bash takes a `workdir`).
 */
// ponytail: regex command matching is bypassable (eval, base64, scripts); the sandbox tier is the floor.
export function checkToolCall(rules: GuardRules, tool: string, input: unknown, cwd: string, shellCwd = cwd): string | undefined {
  const args = (input ?? {}) as Record<string, unknown>;
  const roots = rules.writeRoots.map((r) => landing(r));
  const within = (p: string) => roots.some((root) => inside(root, p));

  const pathKey = WRITE_TOOLS[tool];
  const given = pathKey ? args[pathKey] : undefined;
  if (typeof given === 'string') {
    const p = path.resolve(cwd, given === '~' || given.startsWith('~/') ? path.join(homedir(), given.slice(1)) : given);
    const real = landing(p);
    if (!within(real)) return within(p) ? `Write through a link to outside the worktree: ${p} -> ${real}` : `Write outside the worktree: ${p}`;
    const rel = path.relative(landing(cwd), real);
    const glob = rules.denyPaths?.find((g) => matchesGlob(rel, g));
    if (glob) return `Path is a non-goal: ${glob}`;
  }

  if (tool === 'Bash' && typeof args.command === 'string') {
    const command = args.command;
    const rm = rmReason(command, roots, shellCwd);
    if (rm) return rm;
    const src = rules.denyCommands?.find((s) => new RegExp(s).test(command));
    if (src) return `Command blocked by policy: ${src}`;
  }

  return undefined;
}
