/**
 * The settings pages' model, shared by the wizard, the project page and the app settings page: a draft of what is
 * typed (numbers as text, as the fields hold them), the rules the pages check, and the words they say. The server
 * checks the same rules again (`packages/cli/src/settings.ts`, `project.ts`).
 */
import type { Limits } from '../../packages/cli/src/project.ts';
import { type From, type Knowledge, type Overrides, type Resolved, type SettingKey, type Settings, type Trust, TRUST, trustText } from '../../packages/cli/src/settings.ts';

export type PageId = 'overview' | 'sandbox' | 'network' | 'budget' | 'escalation' | 'memory' | 'knowledge' | 'draft';
/** `key`: the setting the page's override switch sets; `errs`: the fields whose errors belong to it. */
export interface SettingPageDef { id: PageId; title: string; key?: SettingKey; errs?: Field[]; intro: string }

export const SETTING_PAGES: SettingPageDef[] = [
  { id: 'overview', title: 'Overview', intro: 'What the repository decides, and every setting at a glance. Pick one to change it.' },
  { id: 'sandbox', title: 'Sandbox', key: 'trust', errs: ['memMb', 'cpus'], intro: 'How far you trust this repo decides how its steps are boxed in.' },
  { id: 'network', title: 'Network', intro: 'What the sandbox may reach. Nothing else gets out.' },
  { id: 'budget', title: 'Budget', key: 'budget', errs: ['cap', 'alertAt'], intro: 'A ceiling on what the whole project spends, over every flow and run.' },
  { id: 'escalation', title: 'Escalation', key: 'escalation', errs: ['channel', 'nudge'], intro: 'Where and how soon a question nobody answered in FlowBoard is posted to chat.' },
  { id: 'memory', title: 'Memory', key: 'memory', intro: 'Whether runs remember facts about this codebase between them.' },
  { id: 'knowledge', title: 'Knowledge', key: 'knowledge', intro: 'Maps of the code that agents query instead of reading every file. FlowBoard rebuilds them from the repo; nobody edits them by hand.' },
  { id: 'draft', title: 'Draft mode', key: 'draft', intro: 'Every step on the cheapest model, while you are trying flows out on this project.' },
];

export const ON_LIMIT = { pause: 'pause new runs', ask: 'ask me first' } as const;
export const REBUILD = { push: 'when the base branch moves', daily: 'once a day', manual: 'only when I ask' } as const;
export const KNOWLEDGE = {
  serena: { name: 'Serena', what: 'a symbol index: agents find definitions and references and edit by symbol', cost: 'local, no AI calls, free', via: 'an MCP server every agent step can call' },
  graphify: { name: 'graphify', what: 'a graph of the modules, calls and concepts, with a written summary of each part', cost: 'uses the AI service', via: 'graphify-out/, readable by every step' },
} as const;

/** What a field holds as typed. */
export interface Values {
  trust: Trust;
  cap: string;
  alertAt: string;
  onLimit: 'pause' | 'ask';
  channel: string;
  nudge: string;
  memory: boolean;
  knowledge: Knowledge;
  draft: boolean;
  memMb: string;
  cpus: string;
}
export type Field = 'cap' | 'alertAt' | 'channel' | 'nudge' | 'memMb' | 'cpus';
/** `ov`: which settings this project overrides; `v`: their values, and the repo's limits. */
export interface Draft { ov: Record<SettingKey, boolean>; v: Values }
/**
 * `base`: each setting as it would be with no override (type, then app); `repo`: the repo's name, base branch and
 * size, for the knowledge warnings; `flows`: the type's.
 */
export interface Ctx { base: Resolved; os: string; typeName: string; flows: string[]; repo?: { name: string; branch: string | null; sizeKb?: number } }
export type Mode = 'project' | 'app';

const KEYS: SettingKey[] = ['trust', 'budget', 'escalation', 'memory', 'knowledge', 'draft'];
const text = (n: number | null | undefined) => (n == null ? '' : String(n));

/** One setting's value into the draft's fields. */
function fill<K extends SettingKey>(v: Values, k: K, value: Settings[K]) {
  if (k === 'budget') {
    const b = value as Settings['budget'];
    Object.assign(v, { cap: text(b.capUsd), alertAt: String(b.alertAt), onLimit: b.onLimit });
  } else if (k === 'escalation') {
    const e = value as Settings['escalation'];
    Object.assign(v, { channel: e.channel, nudge: String(e.nudgeMin) });
  } else if (k === 'knowledge') v.knowledge = { ...(value as Knowledge) };
  else Object.assign(v, { [k]: value });
}

/** A draft of a project's settings as they stand: its overrides switched on, the rest showing what they inherit. */
export function draftFrom(resolved: Resolved, limits: Limits): Draft {
  const v = { memMb: text(limits.memoryMb), cpus: text(limits.cpus) } as Values;
  for (const k of KEYS) fill(v, k, resolved[k].value);
  return { ov: Object.fromEntries(KEYS.map((k) => [k, resolved[k].from === 'project'])) as Draft['ov'], v };
}

/** Turning an override on starts it from the inherited value, so nothing changes until you change it. */
export function toggle(d: Draft, k: SettingKey, on: boolean, base: Resolved): Draft {
  const next = { ov: { ...d.ov, [k]: on }, v: { ...d.v, knowledge: { ...d.v.knowledge } } };
  if (on) fill(next.v, k, base[k].value);
  return next;
}

/** The draft's value for one setting, as the server stores it. */
function valueOf<K extends SettingKey>(v: Values, k: K): Settings[K] {
  const out: Settings = {
    trust: v.trust,
    budget: { capUsd: v.cap.trim() === '' ? null : Number(v.cap), alertAt: Number(v.alertAt), onLimit: v.onLimit },
    escalation: { channel: v.channel.trim(), nudgeMin: Number(v.nudge) },
    memory: v.memory,
    knowledge: v.knowledge,
    draft: v.draft,
  };
  return out[k];
}
/** What the project sets, for the record. */
export const toOverrides = (d: Draft): Overrides => Object.fromEntries(KEYS.filter((k) => d.ov[k]).map((k) => [k, valueOf(d.v, k)]));
/** Every setting, for the app's own. */
export const toSettings = (d: Draft): Settings => Object.fromEntries(KEYS.map((k) => [k, valueOf(d.v, k)])) as unknown as Settings;
/** The repo's limits, for its `.flowboard.yaml`; an empty field is no limit. */
export const toLimits = (d: Draft): Limits => ({ ...(d.v.memMb.trim() && { memoryMb: Number(d.v.memMb) }), ...(d.v.cpus.trim() && { cpus: Number(d.v.cpus) }) });

/** Each setting's value in effect: the draft's where it is overridden (always, for the app's own page). */
export const effective = <K extends SettingKey>(d: Draft, ctx: Ctx, k: K, mode: Mode = 'project'): Settings[K] => (mode === 'app' || d.ov[k] ? valueOf(d.v, k) : ctx.base[k].value);

/** What graphify costs to map a repo this size, from GitHub's size; plan 5 meters the real figure. */
// ponytail: a guess from the repo's size, shown as "about"; replace with metered rebuild costs once graphify runs
export const graphifyCost = (sizeKb: number) => Math.max(0.05, (sizeKb / 1024) * 0.008).toFixed(2);

/** Every rule the pages check: errors block saving, warnings only say what will happen. */
export function problems(d: Draft, ctx: Ctx, mode: Mode = 'project') {
  const v = d.v;
  const on = (k: SettingKey) => mode === 'app' || d.ov[k];
  const whole = (s: string, min: number, max: number) => s.trim() !== '' && Number.isInteger(+s) && +s >= min && +s <= max;
  const errors: Partial<Record<Field, string>> = {};
  if (on('budget')) {
    if (!(mode === 'app' && v.cap.trim() === '') && !(+v.cap > 0)) errors.cap = 'a dollar amount above 0';
    else if (!whole(v.alertAt, 1, 100)) errors.alertAt = 'alert at 1 to 100 percent';
  }
  if (on('escalation')) {
    if (!/^#[a-z0-9][a-z0-9_-]*$/.test(v.channel.trim())) errors.channel = 'a Slack channel, like #billing-alerts';
    else if (!whole(v.nudge, 1, 120)) errors.nudge = '1 to 120 minutes';
  }
  if (v.memMb.trim() !== '' && !whole(v.memMb, 64, Infinity)) errors.memMb = 'a whole number of MB, 64 or more';
  else if (v.cpus.trim() !== '' && !(+v.cpus > 0)) errors.cpus = 'more than 0; 1.5 is a CPU and a half';

  const warns: { page: PageId; text: string; caution?: true }[] = [];
  const trust = effective(d, ctx, 'trust', mode);
  if (trust === 'trusted') warns.push({ page: 'sandbox', text: `With no sandbox, agents in ${ctx.flows.join(' and ') || 'flows'} stop before each file edit and shell command until you allow it.` });
  if (trust === 'untrusted' && ctx.os !== 'linux')
    warns.push({ page: 'sandbox', text: `gVisor runs on Linux only; on this ${ctx.os === 'darwin' ? 'Mac' : 'machine'}, every run of this project is refused.` });
  const kn = effective(d, ctx, 'knowledge', mode);
  if (kn.graphify) {
    const cap = effective(d, ctx, 'budget', mode).capUsd;
    const r = ctx.repo;
    const when = { push: `on every move of ${r?.branch ?? 'the base branch'}`, daily: 'once a day', manual: 'each time you ask' }[kn.rebuild];
    const cost = r?.sizeKb !== undefined ? `about $${graphifyCost(r.sizeKb)} a rebuild` : 'a charge on every rebuild';
    warns.push({
      page: 'knowledge',
      caution: true,
      text: `graphify sends ${r ? `${r.name}'s` : 'each project’s'} code to the AI service to describe it: ${cost}, ${when}, ${cap ? `counted against the $${cap} budget` : 'and the project has no budget cap to stop it'}. Turn it off, or rebuild less often, if the code must not leave this machine or the cost is too high.`,
    });
  }
  if (!kn.serena && !kn.graphify && on('knowledge')) warns.push({ page: 'knowledge', text: 'With no maps, agents find their way by reading files, which costs more tokens on a large repo.' });
  return { errors, warns, ok: Object.keys(errors).length === 0 };
}

export const knowledgeText = (kn: Knowledge) => {
  const on = (['serena', 'graphify'] as const).filter((id) => kn[id]).map((id) => KNOWLEDGE[id].name);
  return on.length ? `${on.join(' and ')}, rebuilt ${REBUILD[kn.rebuild]}` : 'none';
};
export const limitsText = (v: Values) => [v.memMb.trim() && `${v.memMb.trim()} MB`, v.cpus.trim() && `${v.cpus.trim()} CPUs`].filter(Boolean).join(' · ');

/** One setting's value in words. */
export function describe<K extends SettingKey>(k: K, value: Settings[K]): string {
  const x = value as Settings[SettingKey];
  switch (k) {
    case 'trust':
      return trustText(x as Trust);
    case 'budget': {
      const b = x as Settings['budget'];
      return b.capUsd ? `$${b.capUsd} a month · alert at ${b.alertAt}% · then ${ON_LIMIT[b.onLimit]}` : 'no cap: only each flow’s own budget';
    }
    case 'escalation': {
      const e = x as Settings['escalation'];
      return `${e.channel}, after ${e.nudgeMin} min`;
    }
    case 'memory':
      return x ? 'on: remembers facts about this codebase' : 'off: runs start without project memories';
    case 'knowledge':
      return knowledgeText(x as Knowledge);
    default:
      return x ? 'on: every step on the cheapest model' : 'off: steps use their own models';
  }
}

/** What each setting comes to, in the draft; the sandbox's with the repo's limits. */
export function summary(d: Draft, ctx: Ctx, mode: Mode = 'project'): Record<SettingKey, string> {
  const s = Object.fromEntries(KEYS.map((k) => [k, describe(k, effective(d, ctx, k, mode))])) as Record<SettingKey, string>;
  const lim = limitsText(d.v);
  if (lim) s.trust += ` · ${lim}`;
  return s;
}

/** Where a value comes from, as the pages label it. */
export const fromLabel = (from: From, typeName: string) => ({ app: 'app settings', type: `${typeName} type`, project: 'this project' })[from];

/** The few words beside an overridden setting in the rail; an empty mark already means inherited. */
export function note(d: Draft, k: SettingKey | undefined): string {
  if (!k || !d.ov[k]) return '';
  const v = d.v;
  return {
    trust: () => TRUST[v.trust].tier,
    budget: () => `$${v.cap || '?'}/mo`,
    escalation: () => v.channel,
    knowledge: () => `${[v.knowledge.serena, v.knowledge.graphify].filter(Boolean).length} on`,
    memory: () => (v.memory ? 'on' : 'off'),
    draft: () => (v.draft ? 'on' : 'off'),
  }[k]();
}
