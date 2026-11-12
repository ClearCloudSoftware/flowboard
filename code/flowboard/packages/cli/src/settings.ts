/**
 * Settings, and where each one comes from: the app's own (`settings.json` in FlowBoard's data folder), then what a
 * project type sets over them, then the project's overrides (kept on its record, `projects.ts`). What is about the
 * code, the sandbox limits and the check command, is the repo's (`project.ts`); what is about trust, money or this
 * machine is FlowBoard's, here, so a cloned repo can never grant itself any of it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { isFile, writeJsonFile } from './config.ts';
import type { Result } from './projects.ts';

export type Trust = 'trusted' | 'normal' | 'untrusted';
/** `capUsd`: the most the project's runs may spend in a month, null for no cap; `alertAt`: a percent of it. */
export interface Budget { capUsd: number | null; alertAt: number; onLimit: 'pause' | 'ask' }
/** A question nobody answered in FlowBoard goes to `channel` after `nudgeMin` minutes. */
export interface Escalation { channel: string; nudgeMin: number }
export interface Knowledge { serena: boolean; graphify: boolean; rebuild: 'push' | 'daily' | 'manual' }
export interface Settings { trust: Trust; budget: Budget; escalation: Escalation; memory: boolean; knowledge: Knowledge; draft: boolean }
export type SettingKey = keyof Settings;
/** `projectsFolder`: where new projects are cloned; null for FlowBoard's own, `DEFAULT_PROJECTS_FOLDER`. */
export interface AppSettings extends Settings { projectsFolder: string | null }
/** A project's own values; a key present is overridden. In an override, `budget.capUsd` is a number above 0. */
export type Overrides = Partial<Settings>;

export type ProjectTypeId = 'software' | 'research' | 'writing' | 'data';
/** `flows`: the library flows a project of the type runs; `defaults`: what the type sets over the app's settings. */
export interface ProjectType { id: ProjectTypeId; name: string; text: string; flows: string[]; defaults: Partial<Settings>; soon?: true }

export const PROJECT_TYPES: Record<ProjectTypeId, ProjectType> = {
  software: {
    id: 'software',
    name: 'Software',
    text: 'A codebase agents read, change and test. Flows run steps against a clone of the repo.',
    flows: ['delivery', 'review-loop'],
    defaults: { trust: 'normal', knowledge: { serena: true, graphify: true, rebuild: 'push' } },
  },
  research: { id: 'research', name: 'Research', text: 'Questions answered from sources, with citations kept as artifacts.', flows: [], defaults: {}, soon: true },
  writing: { id: 'writing', name: 'Writing', text: 'Docs and long-form text drafted, reviewed and edited by steps.', flows: [], defaults: {}, soon: true },
  data: { id: 'data', name: 'Data', text: 'Notebooks and pipelines, checked by running them.', flows: [], defaults: {}, soon: true },
};

export const DEFAULT_PROJECTS_FOLDER = '~/FlowBoard/projects';

export const APP_DEFAULTS: AppSettings = {
  projectsFolder: null,
  trust: 'normal',
  budget: { capUsd: null, alertAt: 80, onLimit: 'pause' },
  escalation: { channel: '#flowboard', nudgeMin: 5 },
  memory: false,
  knowledge: { serena: false, graphify: false, rebuild: 'manual' },
  draft: false,
};

const CAP = 'a dollar amount above 0';
const ALERT = 'alert at 1 to 100 percent';
const CHANNEL = 'a Slack channel, like #billing-alerts';
const NUDGE = '1 to 120 minutes';
export const FOLDER = 'a folder path: absolute, or starting with ~/';
/** An absolute path, or one from the home folder. */
export const FOLDER_RE = /^(~\/|\/)\S/;

const cap = z.number({ error: CAP }).positive({ error: CAP });
const budget = (capUsd: z.ZodType<number | null>) =>
  z.strictObject({
    capUsd,
    alertAt: z.number({ error: ALERT }).int({ error: ALERT }).min(1, { error: ALERT }).max(100, { error: ALERT }),
    onLimit: z.enum(['pause', 'ask']),
  });
const shape = {
  trust: z.enum(['trusted', 'normal', 'untrusted']),
  escalation: z.strictObject({
    channel: z.string().regex(/^#[a-z0-9][a-z0-9_-]*$/, { error: CHANNEL }),
    nudgeMin: z.number({ error: NUDGE }).int({ error: NUDGE }).min(1, { error: NUDGE }).max(120, { error: NUDGE }),
  }),
  memory: z.boolean(),
  knowledge: z.strictObject({ serena: z.boolean(), graphify: z.boolean(), rebuild: z.enum(['push', 'daily', 'manual']) }),
  draft: z.boolean(),
};

export const OverridesSchema: z.ZodType<Overrides> = z.strictObject({ ...shape, budget: budget(cap) }).partial();
export const AppSettingsSchema = z.strictObject({
  ...shape,
  budget: budget(cap.nullable()),
  projectsFolder: z.string().trim().regex(FOLDER_RE, { error: FOLDER }).nullable(),
});

const fileOf = (dataDir: string) => join(dataDir, 'settings.json');

/** The app's settings: the defaults, with what `settings.json` sets over them. */
export function readAppSettings(dataDir: string): AppSettings {
  const file = fileOf(dataDir);
  if (!isFile(file)) return APP_DEFAULTS;
  // ponytail: a file that does not pass is ignored, as only this module writes it; say so on /settings if hand edits appear
  const r = AppSettingsSchema.partial().safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return r.success ? { ...APP_DEFAULTS, ...r.data } : APP_DEFAULTS;
}

/** Sets the keys given; a key holding an object is replaced whole. 400 with the first rule broken. */
export function updateAppSettings(dataDir: string, edit: Partial<AppSettings>): Result<AppSettings> {
  const r = AppSettingsSchema.partial().safeParse(edit);
  if (!r.success) return { ok: false, status: 400, error: r.error.issues[0].message };
  const next = { ...readAppSettings(dataDir), ...r.data };
  writeJsonFile(fileOf(dataDir), next);
  return { ok: true, value: next };
}

export type From = 'app' | 'type' | 'project';
export type Resolved = { [K in SettingKey]: { value: Settings[K]; from: From } };

/** Each setting's value for a project, and where it came from: its override, else its type's, else the app's. */
export function resolveSettings(app: AppSettings, type: ProjectTypeId, ov: Overrides): Resolved {
  const typed = PROJECT_TYPES[type].defaults;
  const one = <K extends SettingKey>(k: K) =>
    ov[k] !== undefined ? { value: ov[k] as Settings[K], from: 'project' as const } : typed[k] !== undefined ? { value: typed[k] as Settings[K], from: 'type' as const } : { value: app[k], from: 'app' as const };
  return { trust: one('trust'), budget: one('budget'), escalation: one('escalation'), memory: one('memory'), knowledge: one('knowledge'), draft: one('draft') };
}
