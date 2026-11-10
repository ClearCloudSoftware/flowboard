/**
 * One YAML file -> one validated RunSpec. See
 * docs/superpowers/specs/2026-10-18-yaml-run-config-design.md.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import type { $ZodIssue } from 'zod/v4/core';
import { z } from 'zod';
import { allowsAnyShell } from '@flowboard/adapters';
import { DEFAULT_DENY_COMMANDS } from '@flowboard/core';
import type { RunSpec } from '@flowboard/core';

export type Adapter = 'claude-code' | 'opencode';

export const CLOSING =
  'You cannot talk to the user directly. When you need their input, ask with the ask_user tool, or ask_user_batch for several questions at once, and wait for the answer. Do the task, then stop.';

/** Name of the plugin run-agent builds from `skills:` folders. */
export const SKILLS_PLUGIN = 'local';

export interface RunConfig {
  /** Absolute. */
  yamlPath: string;
  adapter: Adapter;
  spec: RunSpec;
  /** The YAML opted in to a setting that lets the agent run any shell command. */
  unrestrictedShell: boolean;
  /** Standalone skill folders to mount as the `local` plugin (absolute paths). */
  skills: { name: string; path: string }[];
}

export type LoadResult = { ok: true; config: RunConfig } | { ok: false; errors: string[] };

export const RunSchema = z.strictObject({
  adapter: z.enum(['claude-code', 'opencode']),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  folder: z.string().min(1),
  prompt: z.string().min(1),
  system_prompt: z.string().optional(),
  plugins: z.array(z.string().min(1)).optional(),
  skills: z.array(z.string().min(1)).optional(),
  skill: z.string().optional(),
  permissions: z
    .strictObject({
      mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'dontAsk', 'plan', 'auto']).optional(),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      allow_unrestricted_shell: z.boolean().optional(),
    })
    .optional(),
  guards: z
    .strictObject({
      deny_paths: z.array(z.string()).optional(),
      deny_commands: z.array(z.string()).optional(),
    })
    .optional(),
  limits: z
    .strictObject({
      budget_usd: z.number().positive().optional(),
      max_turns: z.number().int().positive().optional(),
    })
    .optional(),
});

/** `~` and `~/x` go to the home dir; other relative paths resolve against `baseDir`. */
export function toAbs(p: string, baseDir: string): string {
  if (p === '~' || p.startsWith('~/')) return join(homedir(), p.slice(1));
  return resolve(baseDir, p);
}

export const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
export const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

/**
 * Matches an allow entry that lets the agent run any shell command: `Bash`, or a pattern of only `*`, `:` and spaces.
 * That covers Claude, which names tools exactly in allow rules; OpenCode globs the name too, so its adapter decides.
 */
const ANY_SHELL = /^\s*bash\s*(\(\s*[*:\s]*\))?\s*$/i;
const SHELL_TAIL = 'lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it';

/** One `field: message` per zod issue; unknown keys get one line each, missing keys say `required`. */
export function issueLines(issue: $ZodIssue, raw: unknown): string[] {
  const path = issue.path.join('.');
  if (issue.code === 'unrecognized_keys') return issue.keys.map((k) => `${path ? `${path}.` : ''}${k}: unknown key`);
  const value = issue.path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown> | undefined)?.[k], raw);
  return [`${path || '(root)'}: ${value === undefined ? 'required' : issue.message}`];
}

/** Why a skills: folder cannot be used, or undefined. Its SKILL.md `name:` must match the folder: OpenCode may load skills by it. */
function checkSkill(path: string, earlier: { name: string }[]): string | undefined {
  if (!isDir(path)) return `not a directory: ${path}`;
  const file = join(path, 'SKILL.md');
  if (!isFile(file)) return `no SKILL.md in ${path}`;
  const name = skillName(file);
  const folder = basename(path);
  if (!name) return 'SKILL.md has no name';
  if (name !== folder) return `SKILL.md name "${name}" does not match folder "${folder}"`;
  if (earlier.some((s) => s.name === name)) return `duplicate skill name "${name}"`;
  return undefined;
}

/** The `name:` in a SKILL.md's front matter, or undefined. */
function skillName(file: string): string | undefined {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))?.[1];
  try {
    const name: unknown = front === undefined ? undefined : (parse(front) as { name?: unknown } | null)?.name;
    return typeof name === 'string' && name ? name : undefined;
  } catch {
    return undefined;
  }
}

const strings = (v: unknown) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
// ponytail: a manifest path that leaves the plugin folder is dropped, not reported; Claude Code wants ./ paths inside it.
const insideOf = (rel: string) => !isAbsolute(normalize(rel)) && normalize(rel) !== '..' && !normalize(rel).startsWith(`..${sep}`);

/** A plugin folder as Claude Code reads it. */
export interface Plugin {
  /** What its skills are invoked under, `/<name>:<skill>`: plugin.json's `name`, else the folder's (a version, when installed). */
  name: string;
  /** Where its skills are, relative to the folder: `skills` plus plugin.json's `skills` paths, which add to it. */
  skillRoots: string[];
  /** Its skills by folder and by SKILL.md `name:`, and its commands, `commands/*.md` plus plugin.json's `commands`. */
  skills: string[];
  commands: string[];
}

export function readPlugin(dir: string): Plugin {
  let manifest: Record<string, unknown> = {};
  try {
    const m: unknown = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (m && typeof m === 'object' && !Array.isArray(m)) manifest = m as Record<string, unknown>;
  } catch {
    // none, or a broken one Claude Code reports itself: the folder names the plugin
  }
  const name = typeof manifest.name === 'string' && manifest.name ? manifest.name : basename(dir);
  const skillRoots = [...new Set(['skills', ...strings(manifest.skills).filter(insideOf).map(normalize)])];
  // A root is one skill (it holds SKILL.md) or a folder of them, one level down.
  const skillDirs = skillRoots.flatMap((root) => {
    const abs = join(dir, root);
    if (isFile(join(abs, 'SKILL.md'))) return [abs];
    return isDir(abs) ? readdirSync(abs).map((d) => join(abs, d)).filter((d) => isFile(join(d, 'SKILL.md'))) : [];
  });
  const skills = skillDirs.flatMap((d) => [basename(d), skillName(join(d, 'SKILL.md')) ?? []].flat());
  const commands = ['commands', ...strings(manifest.commands).filter(insideOf)].flatMap((c) => {
    const abs = join(dir, c);
    if (abs.endsWith('.md') && isFile(abs)) return [basename(abs, '.md')];
    return isDir(abs) ? readdirSync(abs).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')) : [];
  });
  return { name, skillRoots, skills, commands };
}

/** File, syntax and root-shape checks; error lines carry `yamlPath` as typed. `text`, when given, is read instead of the file. */
export function readYaml(
  yamlPath: string,
  baseDir: string,
  text?: string,
): { ok: true; abs: string; raw: Record<string, unknown> } | { ok: false; errors: string[] } {
  const fail = (line: string) => ({ ok: false as const, errors: [`${yamlPath}: ${line}`] });
  const abs = toAbs(yamlPath, baseDir);
  if (text === undefined && !isFile(abs)) return fail('file: not found');

  let raw: unknown;
  try {
    raw = parse(text ?? readFileSync(abs, 'utf8'));
  } catch (e) {
    return fail(`syntax: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('(root): must be a mapping');
  return { ok: true, abs, raw: raw as Record<string, unknown> };
}

export function loadConfig(yamlPath: string, baseDir: string): LoadResult {
  const read = readYaml(yamlPath, baseDir);
  if (!read.ok) return read;
  const r = configFromObject(read.raw, baseDir);
  if (!r.ok) return { ok: false, errors: r.errors.map((l) => `${yamlPath}: ${l}`) };
  return { ok: true, config: { yamlPath: read.abs, ...r.config } };
}

/** Every schema, file and semantic check of one run's settings; error lines are `field: message`. */
export function configFromObject(
  raw: Record<string, unknown>,
  baseDir: string,
): { ok: true; config: Omit<RunConfig, 'yamlPath'> } | { ok: false; errors: string[] } {
  const parsed = RunSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.flatMap((i) => issueLines(i, raw)) };
  const y = parsed.data;

  // File-system and semantic checks; all failures are collected.
  const errors: string[] = [];
  // Real paths: the write guard compares path text, and the agent's CLI works in the resolved folder
  // (on macOS /tmp is a link to /private/tmp, so writes there looked like writes outside the folder).
  const real = (p: string) => (isDir(p) ? realpathSync(p) : p);
  const folderPath = toAbs(y.folder, baseDir);
  if (!isDir(folderPath)) errors.push(`folder: not a directory: ${folderPath}`);
  const folder = real(folderPath);
  const pluginDirs = (y.plugins ?? []).map((p) => toAbs(p, baseDir));
  pluginDirs.forEach((d, i) => isDir(d) || errors.push(`plugins.${i}: not a directory: ${d}`));
  const plugins = pluginDirs.map((d) => (isDir(d) ? readPlugin(d) : undefined));
  const promptPath = toAbs(y.prompt, baseDir);
  let preamble: string | undefined;
  if (!isFile(promptPath)) errors.push(`prompt: not a file: ${promptPath}`);
  else {
    try {
      preamble = readFileSync(promptPath, 'utf8');
    } catch (e) {
      errors.push(`prompt: cannot read: ${(e as Error).message}`);
    }
  }
  if (preamble !== undefined && !preamble.trim() && !y.skill) errors.push('prompt: file is empty');
  const skills: { name: string; path: string }[] = [];
  (y.skills ?? []).forEach((p, i) => {
    const path = toAbs(p, baseDir);
    const problem = checkSkill(path, skills);
    if (problem) errors.push(`skills.${i}: ${problem}`);
    else skills.push({ name: basename(path), path });
  });
  if (y.skills?.length) {
    pluginDirs.forEach((d, i) => basename(d) === SKILLS_PLUGIN && errors.push(`plugins.${i}: plugin folder name "${SKILLS_PLUGIN}" is reserved for skills`));
  }
  let invocation = y.skill;
  if (y.skill !== undefined && !y.skill.startsWith('/')) errors.push('skill: must start with "/"');
  else if (y.skill !== undefined && !y.skill.includes(':')) {
    const name = y.skill.slice(1);
    // A skills: folder that failed its own check already has an error line.
    if (skills.some((s) => s.name === name)) invocation = `/${SKILLS_PLUGIN}:${name}`;
    else if (!(y.skills ?? []).some((p) => basename(toAbs(p, baseDir)) === name)) errors.push(`skill: no skill "${name}" in skills`);
  } else if (y.skill !== undefined) {
    // A plugin not in plugins: is the agent's own, and goes unchecked.
    const [plugin, name] = y.skill.slice(1).split(':');
    const p = plugins.find((x) => x?.name === plugin);
    if (p && !p.skills.includes(name)) {
      if (!p.commands.includes(name)) errors.push(`skill: plugin "${plugin}" has no skill or command "${name}"`);
      else if (y.adapter === 'opencode') errors.push(`skill: "${name}" is a command of plugin "${plugin}", and OpenCode loads only skills (SKILL.md)`);
    }
  }
  if (y.adapter === 'opencode' && !y.model.includes('/')) errors.push('model: opencode model must be "providerID/modelID"');
  (y.guards?.deny_commands ?? []).forEach((src, i) => {
    try {
      new RegExp(src);
    } catch (e) {
      errors.push(`guards.deny_commands.${i}: invalid regex: ${(e as Error).message}`);
    }
  });

  const mode = y.permissions?.mode ?? 'acceptEdits';
  const optIn = y.permissions?.allow_unrestricted_shell === true;
  const shellTriggers = [
    ...(mode === 'bypassPermissions' || mode === 'auto' ? [`permissions.mode: ${mode}`] : []),
    ...(y.permissions?.allow ?? [])
      .filter((a) => ANY_SHELL.test(a) || (y.adapter === 'opencode' && allowsAnyShell(a)))
      .map((a) => `permissions.allow: "${a}"`),
  ];
  if (!optIn) errors.push(...shellTriggers.map((t) => `${t} ${SHELL_TAIL}`));
  if (errors.length) return { ok: false, errors };

  const spec: RunSpec = {
    model: y.model,
    cwd: folder,
    prompt: { preamble: preamble!, inputs: [], outputs: [], invocation, closing: CLOSING },
    permissionMode: mode,
    guards: {
      writeRoots: [folder],
      ...(y.guards?.deny_paths && { denyPaths: y.guards.deny_paths }),
      denyCommands: [...DEFAULT_DENY_COMMANDS, ...(y.guards?.deny_commands ?? [])],
    },
  };
  if (y.effort) spec.effort = y.effort;
  if (y.system_prompt !== undefined) spec.systemPrompt = y.system_prompt;
  if (y.plugins) {
    spec.capabilities = pluginDirs.map((p, i) => ({ id: plugins[i]!.name, provider: y.adapter, mount: { kind: 'plugin_dir', path: real(p), skills: plugins[i]!.skillRoots } }));
  }
  if (y.permissions?.allow || y.permissions?.deny) {
    spec.toolPolicy = {
      ...(y.permissions.allow && { allow: y.permissions.allow }),
      ...(y.permissions.deny && { deny: y.permissions.deny }),
    };
  }
  if (y.limits) {
    spec.limits = {
      ...(y.limits.budget_usd !== undefined && { maxBudgetUsd: y.limits.budget_usd }),
      ...(y.limits.max_turns !== undefined && { maxTurns: y.limits.max_turns }),
    };
  }

  return { ok: true, config: { adapter: y.adapter, spec, unrestrictedShell: optIn && shellTriggers.length > 0, skills } };
}
