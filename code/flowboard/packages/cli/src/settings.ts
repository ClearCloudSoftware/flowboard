/**
 * Settings, and where each one comes from: the app's own (`settings.json` in FlowBoard's data folder), then what a
 * project type sets over them, then the project's overrides (kept on its record, `projects.ts`). What is about the
 * code, the sandbox limits and the check command, is the repo's (`project.ts`); what is about trust, money or this
 * machine is FlowBoard's, here, so a cloned repo can never grant itself any of it. No Node imports: the pages use
 * this module too; `app-settings.ts` reads and writes the app's file.
 */
import { z } from 'zod';

/** What "Allow from now on" saves on a project (`approvals.ts` matches calls against it): every file edit, or commands starting with `prefix`. */
export type ApprovalRule = { kind: 'edit' } | { kind: 'shell'; prefix: string };
export const ruleText = (r: ApprovalRule) => (r.kind === 'edit' ? 'every file edit' : `commands starting "${r.prefix}"`);

export type Trust = 'trusted' | 'normal' | 'untrusted';
/** `capUsd`: the most the project's runs may spend in a month, null for no cap; `alertAt`: a percent of it. */
export interface Budget { capUsd: number | null; alertAt: number; onLimit: 'pause' | 'ask' }
/** A question nobody answered in FlowBoard goes to `channel` after `nudgeMin` minutes. */
export interface Escalation { channel: string; nudgeMin: number }
export interface Knowledge { serena: boolean; graphify: boolean; rebuild: 'push' | 'daily' | 'manual' }
export interface Settings { trust: Trust; budget: Budget; escalation: Escalation; memory: boolean; knowledge: Knowledge; draft: boolean }
export type SettingKey = keyof Settings;
/** The agent CLIs FlowBoard drives (Agent Providers). */
export type Harness = 'claude-code' | 'opencode';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
/** How to run one agent CLI: `path` null for the one on PATH; `model` and `effort` null for the CLI's own. */
export interface HarnessConfig { path: string | null; model: string | null; effort: Effort | null }
/**
 * `projectsFolder`: where new projects are cloned; null for FlowBoard's own, `DEFAULT_PROJECTS_FOLDER`.
 * `agents`: how each harness is run; app-wide, as it is about this machine, so no project overrides it.
 * `opencodeModels`: the only models an OpenCode step may run on; app-wide, as it is about money and privacy.
 */
export interface AppSettings extends Settings {
  projectsFolder: string | null;
  agents: Record<Harness, HarnessConfig>;
  internal: Record<InternalStep, InternalStepConfig>;
  opencodeModels: ApprovedModel[];
}

/**
 * A model approved for OpenCode, free or paid: `id` as a step names it (`openrouter/<OpenRouter's id>`); `free` and
 * `price` (dollars per million input and output tokens) as OpenRouter listed it when it was ticked.
 */
export interface ApprovedModel { id: string; free: boolean; price: { in: number; out: number }; approvedAt: string }
/** One model as OpenRouter lists it, prices in dollars per million tokens; `id` is OpenCode's, with `openrouter/`. */
export interface CatalogueModel { id: string; name: string; free: boolean; price: { in: number; out: number }; context: number | null }
export interface Catalogue { fetchedAt: string; models: CatalogueModel[] }

export const MODELS_PAGE = 'Settings → Agents → OpenCode models';
/** What a free model costs instead of money, as the pages and the flow check say it. */
export const FREE_WARNING = 'a free model: its provider may keep your prompts and train on them, and the prompts include the project’s code';

const perM = (n: number) => `$${Number(n.toFixed(4))}`;
/**
 * Why an OpenCode step may not run on `id`, or undefined when it may: it must be approved, still be listed, and
 * cost no more than when it was approved. Without a catalogue only the approval is checked.
 */
export function modelProblem(id: string, approved: ApprovedModel[], catalogue: Catalogue | null): string | undefined {
  const a = approved.find((m) => m.id === id);
  if (!a) return `${id} is not an approved model; approve it in ${MODELS_PAGE}`;
  if (!catalogue || !id.startsWith('openrouter/')) return undefined;
  const now = catalogue.models.find((m) => m.id === id);
  if (!now) return `${id} is no longer listed by OpenRouter; pick another model`;
  const rose = (['in', 'out'] as const).filter((k) => now.price[k] > a.price[k] + 1e-9);
  if (rose.length) {
    const was = rose.map((k) => `${k}put ${perM(a.price[k])} → ${perM(now.price[k])}`).join(', ');
    return `${id} costs more than when you approved it (${was} per million tokens); approve it again in ${MODELS_PAGE}`;
  }
  return undefined;
}

/** Free as OpenRouter lists it now, else as it was when approved. */
export const isFree = (id: string, approved: ApprovedModel[], catalogue: Catalogue | null) =>
  catalogue?.models.find((m) => m.id === id)?.free ?? approved.find((m) => m.id === id)?.free ?? false;
/** The steps FlowBoard runs for itself, outside any flow (`internal/<id>/`, `internal-steps.ts`). */
export type InternalStep = 'repo-analyst' | 'backlog-importer';
/** How one internal step runs, for every project: `effort` null for the model's own; `budgetUsd` the most one run may spend. */
export interface InternalStepConfig { adapter: Harness; model: string; effort: Effort | null; budgetUsd: number }
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
  trusted: { label: 'Trusted', tier: 'on this machine', text: 'No sandbox. Agents ask before each file edit and shell command; “Allow from now on” keeps the answer for this project.' },
  normal: { label: 'Normal', tier: 'container', text: 'A throwaway container per step. Only the repo’s folder is writable. Agents can still reach the internet until the egress proxy is built.' },
  untrusted: { label: 'Untrusted', tier: 'gVisor', text: 'A container under gVisor, a stronger wall for code nobody has reviewed. Needs a Linux host with gVisor; anywhere else, runs are refused.' },
};
export const trustText = (t: Trust) => `${TRUST[t].label}: ${TRUST[t].tier}`;

export const DEFAULT_PROJECTS_FOLDER = '~/FlowBoard/projects';

/** Each harness as the pages name it. `login`: whose credentials it runs on; FlowBoard keeps only an OpenRouter key. */
export const HARNESSES: Record<Harness, { name: string; bin: string; text: string; login: string; model: string }> = {
  'claude-code': {
    name: 'Claude Code',
    bin: 'claude',
    text: 'Anthropic’s CLI, driven through the Agent SDK.',
    login: 'Runs on the installed claude login, your Claude subscription. An exported ANTHROPIC_API_KEY is not passed on.',
    model: 'an alias (haiku, sonnet, opus) or a full model id',
  },
  opencode: {
    name: 'OpenCode',
    bin: 'opencode',
    text: 'An open-source CLI that runs other providers’ models, one local server per run.',
    login: 'Runs on the OpenRouter key saved in Settings → Connections → OpenRouter, else on the credentials OpenCode stores itself (opencode auth login). It has no Claude subscription login, so its runs are billed by that provider.',
    model: 'providerID/modelID, like openrouter/deepseek/deepseek-v4.1-flash',
  },
};

/** Each internal step as the settings page names it; `fixed`: what it may touch, which no setting changes. */
export const INTERNAL_STEPS: Record<InternalStep, { name: string; text: string; fixed: string }> = {
  'repo-analyst': {
    name: 'Repo analyst',
    text: 'Reads a newly cloned project and proposes its stack, its check command and the package registries its sandbox must reach. Runs once per new project.',
    fixed: 'Reads the repo; writes only its proposal. No shell, no network.',
  },
  'backlog-importer': {
    name: 'Backlog importer',
    text: 'Turns a markdown backlog the parser cannot read into tasks. Runs when you import such a file.',
    fixed: 'Sees only the file’s text; writes only the task list. No other tools.',
  },
};

export const APP_DEFAULTS: AppSettings = {
  projectsFolder: null,
  trust: 'normal',
  budget: { capUsd: null, alertAt: 80, onLimit: 'pause' },
  escalation: { channel: '#flowboard', nudgeMin: 5 },
  memory: false,
  knowledge: { serena: false, graphify: false, rebuild: 'manual' },
  draft: false,
  // PRD §5's default model; the effort is the model's own.
  agents: { 'claude-code': { path: null, model: 'sonnet', effort: null }, opencode: { path: null, model: null, effort: null } },
  // The importer on haiku, as backlog Story 7.3 runs it.
  internal: {
    'repo-analyst': { adapter: 'claude-code', model: 'sonnet', effort: null, budgetUsd: 0.5 },
    'backlog-importer': { adapter: 'claude-code', model: 'haiku', effort: null, budgetUsd: 0.25 },
  },
  // None: an OpenCode step runs only on a model someone approved.
  opencodeModels: [],
};

const CAP = 'a dollar amount above 0';
const ALERT = 'alert at 1 to 100 percent';
const CHANNEL = 'a Slack channel, like #billing-alerts';
const NUDGE = '1 to 120 minutes';
export const FOLDER = 'a folder path: absolute, or starting with ~/';
/** An absolute path, or one from the home folder. */
export const FOLDER_RE = /^(~\/|\/)\S/;
const PROGRAM = 'a program path: absolute, or starting with ~/';
const CLAUDE_MODEL = `a Claude model: ${HARNESSES['claude-code'].model}`;

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

/** A model id each harness's CLI would take. */
const MODELS = {
  'claude-code': z.string().trim().regex(/^[\w.[\]-]+$/, { error: CLAUDE_MODEL }),
  // As run-agent checks it (`config.ts`): OpenCode's model ids are always providerID/modelID.
  opencode: z.string().trim().regex(/^[^\s/]+\/\S+$/, { error: HARNESSES.opencode.model }),
};
const harness = (h: Harness) => z.strictObject({ path: z.string().trim().regex(FOLDER_RE, { error: PROGRAM }).nullable(), model: MODELS[h].nullable(), effort: z.enum(EFFORTS).nullable() });

/** Each harness's settings, as the server checks them and the agents page checks each field. */
export const HARNESS_SCHEMAS = { 'claude-code': harness('claude-code'), opencode: harness('opencode') };

const internalOn = (h: Harness) => z.strictObject({ adapter: z.literal(h), model: MODELS[h], effort: z.enum(EFFORTS).nullable(), budgetUsd: cap });
/** One internal step's settings: the model must suit the harness it runs on. */
export const INTERNAL_STEP_SCHEMA = z.discriminatedUnion('adapter', [internalOn('claude-code'), internalOn('opencode')]);

const usd = z.number().nonnegative();
/** The approved models, each id once. */
export const APPROVED_MODELS_SCHEMA = z
  .array(z.strictObject({ id: z.string().regex(/^openrouter\/\S+$/, { error: 'an OpenRouter model, like openrouter/deepseek/deepseek-v4.1-flash' }), free: z.boolean(), price: z.strictObject({ in: usd, out: usd }), approvedAt: z.string() }))
  .refine((ms) => new Set(ms.map((m) => m.id)).size === ms.length, { error: 'each model once' });

export const OverridesSchema: z.ZodType<Overrides> = z.strictObject({ ...shape, budget: budget(cap) }).partial();
export const AppSettingsSchema = z.strictObject({
  ...shape,
  budget: budget(cap.nullable()),
  projectsFolder: z.string().trim().regex(FOLDER_RE, { error: FOLDER }).nullable(),
  agents: z.strictObject(HARNESS_SCHEMAS),
  internal: z.strictObject({ 'repo-analyst': INTERNAL_STEP_SCHEMA, 'backlog-importer': INTERNAL_STEP_SCHEMA }),
  opencodeModels: APPROVED_MODELS_SCHEMA,
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
