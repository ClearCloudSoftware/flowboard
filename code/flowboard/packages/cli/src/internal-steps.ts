/**
 * The steps FlowBoard runs for itself: one-step flows in `internal/<id>/flow.yaml`, beside their skill. They are
 * never in the library and never copied into a project. The file fixes what each may touch; the app's `internal`
 * setting picks the agent CLI, model, effort and budget it runs on, for every project.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import type { InternalStep, InternalStepConfig } from './settings.ts';

export const INTERNAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../internal');

/** The step's flow with the app's settings applied, as YAML that runs from any folder: its skill path is absolute. */
export function internalFlowText(id: InternalStep, cfg: InternalStepConfig): string {
  const dir = join(INTERNAL_DIR, id);
  const flow = parse(readFileSync(join(dir, 'flow.yaml'), 'utf8'));
  for (const step of Object.values<{ skills?: string[] }>(flow.steps)) step.skills = [dir];
  const defaults = { adapter: cfg.adapter, model: cfg.model, ...(cfg.effort && { effort: cfg.effort }) };
  return stringify({ ...flow, budget_usd: cfg.budgetUsd, defaults });
}
