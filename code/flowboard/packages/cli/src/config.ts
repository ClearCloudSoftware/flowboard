/**
 * One YAML file -> one validated RunSpec. See
 * docs/superpowers/specs/2026-10-18-yaml-run-config-design.md.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';
import type { $ZodIssue } from 'zod/v4/core';
import { z } from 'zod';
import { DEFAULT_DENY_COMMANDS } from '@flowboard/core';
import type { RunSpec } from '@flowboard/core';

export type Adapter = 'claude-code' | 'opencode';

export const CLOSING = 'This is a headless run: there is no terminal to ask into. Do the task, then stop.';

export interface RunConfig {
  /** Absolute. */
  yamlPath: string;
  adapter: Adapter;
  spec: RunSpec;
  /** The YAML opted in to a setting that lets the agent run any shell command. */
  unrestrictedShell: boolean;
}

export type LoadResult = { ok: true; config: RunConfig } | { ok: false; errors: string[] };

const Schema = z.strictObject({
  adapter: z.enum(['claude-code', 'opencode']),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  folder: z.string().min(1),
  prompt: z.string().min(1),
  system_prompt: z.string().optional(),
  plugins: z.array(z.string().min(1)).optional(),
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
function toAbs(p: string, baseDir: string): string {
  if (p === '~' || p.startsWith('~/')) return join(homedir(), p.slice(1));
  return resolve(baseDir, p);
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

/** Matches an allow entry that lets the agent run any shell command. */
const ANY_SHELL = /^bash(\(\*\))?$/i;
const SHELL_TAIL = 'lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it';

/** One `field: message` per zod issue; unknown keys get one line each, missing keys say `required`. */
function issueLines(issue: $ZodIssue, raw: unknown): string[] {
  const path = issue.path.join('.');
  if (issue.code === 'unrecognized_keys') return issue.keys.map((k) => `${path ? `${path}.` : ''}${k}: unknown key`);
  const value = issue.path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown> | undefined)?.[k], raw);
  return [`${path || '(root)'}: ${value === undefined ? 'required' : issue.message}`];
}

export function loadConfig(yamlPath: string, baseDir: string): LoadResult {
  const fail = (lines: string[]): LoadResult => ({ ok: false, errors: lines.map((l) => `${yamlPath}: ${l}`) });
  const abs = toAbs(yamlPath, baseDir);
  if (!isFile(abs)) return fail(['file: not found']);

  let raw: unknown;
  try {
    raw = parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    return fail([`syntax: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`]);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(['(root): must be a mapping']);

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues.flatMap((i) => issueLines(i, raw)));
  const y = parsed.data;

  // File-system and semantic checks; all failures are collected.
  const errors: string[] = [];
  const folder = toAbs(y.folder, baseDir);
  if (!isDir(folder)) errors.push(`folder: not a directory: ${folder}`);
  const pluginDirs = (y.plugins ?? []).map((p) => toAbs(p, baseDir));
  pluginDirs.forEach((d, i) => isDir(d) || errors.push(`plugins.${i}: not a directory: ${d}`));
  const promptPath = toAbs(y.prompt, baseDir);
  const preamble = isFile(promptPath) ? readFileSync(promptPath, 'utf8') : undefined;
  if (preamble === undefined) errors.push(`prompt: not a file: ${promptPath}`);
  else if (!preamble.trim() && !y.skill) errors.push('prompt: file is empty');
  if (y.skill !== undefined && !y.skill.startsWith('/')) errors.push('skill: must start with "/"');
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
    ...(y.permissions?.allow ?? []).filter((a) => ANY_SHELL.test(a)).map((a) => `permissions.allow: "${a}"`),
  ];
  if (!optIn) errors.push(...shellTriggers.map((t) => `${t} ${SHELL_TAIL}`));
  if (errors.length) return fail(errors);

  const spec: RunSpec = {
    model: y.model,
    cwd: folder,
    prompt: { preamble: preamble!, inputs: [], outputs: [], invocation: y.skill, closing: CLOSING },
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
    spec.capabilities = pluginDirs.map((path) => ({ id: basename(path), provider: y.adapter, mount: { kind: 'plugin_dir', path } }));
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

  return {
    ok: true,
    config: { yamlPath: abs, adapter: y.adapter, spec, unrestrictedShell: optIn && shellTriggers.length > 0 },
  };
}
