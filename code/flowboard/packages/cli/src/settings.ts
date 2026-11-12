/**
 * Settings, and where each one comes from: the app's own (`settings.json` in FlowBoard's data folder), then what a
 * project type sets over them, then the project's overrides (kept on its record, `projects.ts`). What is about the
 * code, the sandbox limits and the check command, is the repo's (`project.ts`); what is about trust, money or this
 * machine is FlowBoard's, here, so a cloned repo can never grant itself any of it. No Node imports: the pages use
 * this module too; `app-settings.ts` reads and writes the app's file.
 */
import { z } from 'zod';

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

/** Each trust tier as the pages and the clone log name it. */
export const TRUST: Record<Trust, { label: string; tier: string; text: string }> = {
  trusted: { label: 'Trusted', tier: 'on this machine', text: 'No sandbox. Steps may not run unattended outside one, so each asks before it uses a tool.' },
  normal: { label: 'Normal', tier: 'container', text: 'A throwaway container per step. Only the repo’s folder is writable; only allowed hosts are reachable.' },
  untrusted: { label: 'Untrusted', tier: 'gVisor', text: 'A container under gVisor, a stronger wall for code nobody has reviewed. Needs a Linux host.' },
};
export const trustText = (t: Trust) => `${TRUST[t].label}: ${TRUST[t].tier}`;

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

export type From = 'app' | 'type' | 'project';
export type Resolved = { [K in SettingKey]: { value: Settings[K]; from: From } };

/** Each setting's value for a project, and where it came from: its override, else its type's, else the app's. */
export function resolveSettings(app: AppSettings, type: ProjectTypeId, ov: Overrides): Resolved {
  const typed = PROJECT_TYPES[type].defaults;
  const one = <K extends SettingKey>(k: K) =>
    ov[k] !== undefined ? { value: ov[k] as Settings[K], from: 'project' as const } : typed[k] !== undefined ? { value: typed[k] as Settings[K], from: 'type' as const } : { value: app[k], from: 'app' as const };
  return { trust: one('trust'), budget: one('budget'), escalation: one('escalation'), memory: one('memory'), knowledge: one('knowledge'), draft: one('draft') };
}
