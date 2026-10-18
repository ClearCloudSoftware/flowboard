/**
 * One YAML file -> one validated RunSpec. See
 * docs/superpowers/specs/2026-10-18-yaml-run-config-design.md.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';
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

export function loadConfig(yamlPath: string, baseDir: string): LoadResult {
  const abs = toAbs(yamlPath, baseDir);
  const parsed = Schema.safeParse(parse(readFileSync(abs, 'utf8')));
  if (!parsed.success) return { ok: false, errors: [] };
  const y = parsed.data;

  const folder = toAbs(y.folder, baseDir);
  const spec: RunSpec = {
    model: y.model,
    cwd: folder,
    prompt: {
      preamble: readFileSync(toAbs(y.prompt, baseDir), 'utf8'),
      inputs: [],
      outputs: [],
      invocation: y.skill,
      closing: CLOSING,
    },
    permissionMode: y.permissions?.mode ?? 'acceptEdits',
    guards: {
      writeRoots: [folder],
      ...(y.guards?.deny_paths && { denyPaths: y.guards.deny_paths }),
      denyCommands: [...DEFAULT_DENY_COMMANDS, ...(y.guards?.deny_commands ?? [])],
    },
  };
  if (y.effort) spec.effort = y.effort;
  if (y.system_prompt !== undefined) spec.systemPrompt = y.system_prompt;
  if (y.plugins) {
    spec.capabilities = y.plugins.map((p) => {
      const path = toAbs(p, baseDir);
      return { id: basename(path), provider: y.adapter, mount: { kind: 'plugin_dir', path } };
    });
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

  return { ok: true, config: { yamlPath: abs, adapter: y.adapter, spec, unrestrictedShell: false } };
}
